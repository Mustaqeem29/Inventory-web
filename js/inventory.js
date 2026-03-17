/* =======================================================
   js/inventory.js
   Khuwaja Surgical — Inventory Management
   Features: Add / Edit / Delete / Search items
   Depends on: db.js, auth.js, ui.js
   Add <script src="js/inventory.js"></script> to inventory.html
   ======================================================= */

/* -------------------------------------------------------
   STATE
   editingItemId  — holds the DB id of the item being
                    edited, or null when adding a new one.
   allItems       — in-memory cache of all items from DB.
------------------------------------------------------- */
let editingItemId = null;
let allItems = [];

/* =======================================================
   RENDER — draw the items table from an array
   ======================================================= */

/* -------------------------------------------------------
   renderItemsTable(items)
   Clears and redraws the inventory table.
   Called after every add / edit / delete / search.
   @param {Array} items - Array of item objects to display
------------------------------------------------------- */
function renderItemsTable(items) {
    const tbody = document.getElementById('items-tbody');
    if (!tbody) return;

    // Empty state message
    if (!items || items.length === 0) {
        tbody.innerHTML = `
      <tr>
        <td colspan="10" style="text-align:center;padding:24px;color:#94a3b8;">
          No items found. Add your first item above.
        </td>
      </tr>`;
        return;
    }

    // Build one row per item
    tbody.innerHTML = items.map((item, index) => {

        // Stock status badge
        const lowLimit = parseInt(localStorage.getItem('ksLowStockLimit') || '10');
        const stockNum = parseInt(item.currentStock) || 0;
        let stockBadge;
        if (stockNum <= 0) {
            stockBadge = `<span class="badge badge-red">Out</span>`;
        } else if (stockNum <= lowLimit) {
            stockBadge = `<span class="badge badge-red">Low</span>`;
        } else if (stockNum <= lowLimit * 2) {
            stockBadge = `<span class="badge badge-yellow">Mid</span>`;
        } else {
            stockBadge = `<span class="badge badge-green">OK</span>`;
        }

        return `
      <tr>
        <td>${index + 1}</td>
        <td><strong>${escHtml(item.itemCode)}</strong></td>
        <td>${escHtml(item.itemName)}</td>
        <td>${escHtml(item.category)}</td>
        <td>${escHtml(item.supplier || '---')}</td>
        <td>${formatCurrency(item.buyingRate)}</td>
        <td>${formatCurrency(item.sellingRate)}</td>
        <td>${stockNum}</td>
        <td>${stockBadge}</td>
        <td class="action-btns">
          <button class="btn-icon btn-edit"
            onclick="startEditItem(${item.id})" title="Edit">✏️</button>
          <button class="btn-icon btn-delete"
            onclick="confirmDeleteItem(${item.id})" title="Delete">🗑️</button>
        </td>
      </tr>`;
    }).join('');
}

/* =======================================================
   LOAD — fetch all items from DB and render
   ======================================================= */

/* -------------------------------------------------------
   loadItems()
   Reads all items from IndexedDB, saves to allItems cache,
   then renders the table.
------------------------------------------------------- */
async function loadItems() {
    try {
        showLoader();
        allItems = await getAllData('items');
        // Sort by newest first (by createdAt)
        allItems.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        renderItemsTable(allItems);
    } catch (err) {
        showToast('Failed to load items: ' + err.message, 'error');
    } finally {
        hideLoader();
    }
}

/* =======================================================
   ADD / EDIT — form submit handler
   ======================================================= */

/* -------------------------------------------------------
   handleItemFormSubmit(e)
   Called when the add-item form is submitted.
   Decides whether to add a new item or update existing.
------------------------------------------------------- */
async function handleItemFormSubmit(e) {
    e.preventDefault();

    // ---- Read form values ----
    const itemCode = document.getElementById('item-code').value.trim().toUpperCase();
    const itemName = document.getElementById('item-name').value.trim();
    const category = document.getElementById('category').value;
    const supplier = document.getElementById('supplier').value.trim();
    const buyingRate = parseFloat(document.getElementById('buying-rate').value) || 0;
    const sellingRate = parseFloat(document.getElementById('selling-rate').value) || 0;
    const currentStock = parseInt(document.getElementById('stock').value) || 0;

    // ---- Basic validation ----
    if (!itemCode) { showToast('Item code is required.', 'warning'); return; }
    if (!itemName) { showToast('Item name is required.', 'warning'); return; }
    if (!category) { showToast('Please select a category.', 'warning'); return; }
    if (sellingRate <= 0) { showToast('Selling rate must be greater than 0.', 'warning'); return; }

    // ---- Build item object ----
    const itemData = {
        itemCode,
        itemName,
        category,
        supplier,
        buyingRate,
        sellingRate,
        currentStock,
        dateAdded: editingItemId ? undefined : getTodayISO() // Only set on new items
    };

    try {
        showLoader();

        if (editingItemId) {
            // ---- UPDATE existing item ----

            // Duplicate itemCode check (allow same code for same item)
            const duplicate = allItems.find(
                i => i.itemCode === itemCode && i.id !== editingItemId
            );
            if (duplicate) {
                showToast('Another item already uses this item code.', 'error');
                return;
            }

            // Merge with existing record to keep fields like createdAt
            const existing = await getDataById('items', editingItemId);
            const updatedItem = { ...existing, ...itemData };
            await updateData('items', updatedItem);
            showToast(`"${itemName}" updated successfully.`, 'success');
            cancelEdit();

        } else {
            // ---- ADD new item ----

            // Check for duplicate itemCode
            const duplicate = allItems.find(i => i.itemCode === itemCode);
            if (duplicate) {
                showToast('An item with this code already exists.', 'error');
                return;
            }

            itemData.dateAdded = getTodayISO();
            await addData('items', itemData);
            showToast(`"${itemName}" added to inventory.`, 'success');
        }

        // Reload and reset form
        await loadItems();
        resetItemForm();

    } catch (err) {
        console.error('[Inventory] Save error:', err);
        if (err.name === 'ConstraintError') {
            showToast('Item code already exists. Use a unique code.', 'error');
        } else {
            showToast('Could not save item. Please try again.', 'error');
        }
    } finally {
        hideLoader();
    }
}

/* =======================================================
   EDIT — populate form with existing item data
   ======================================================= */

/* -------------------------------------------------------
   startEditItem(id)
   Fetches the item by ID, fills the form fields,
   and switches the submit button to "Update Item".
   @param {number} id - IndexedDB item ID
------------------------------------------------------- */
async function startEditItem(id) {
    try {
        const item = await getDataById('items', id);
        if (!item) { showToast('Item not found.', 'error'); return; }

        // ---- Fill form fields ----
        document.getElementById('item-code').value = item.itemCode || '';
        document.getElementById('item-name').value = item.itemName || '';
        document.getElementById('category').value = item.category || '';
        document.getElementById('supplier').value = item.supplier || '';
        document.getElementById('buying-rate').value = item.buyingRate || '';
        document.getElementById('selling-rate').value = item.sellingRate || '';
        document.getElementById('stock').value = item.currentStock || '';

        // ---- Update UI state ----
        editingItemId = id;

        const submitBtn = document.getElementById('item-submit-btn');
        if (submitBtn) submitBtn.textContent = '💾 Update Item';

        const cancelBtn = document.getElementById('item-cancel-btn');
        if (cancelBtn) cancelBtn.style.display = 'inline-flex';

        const formTitle = document.getElementById('form-title');
        if (formTitle) formTitle.textContent = `Edit Item: ${item.itemName}`;

        // Scroll to form smoothly
        document.getElementById('item-form')?.scrollIntoView({ behavior: 'smooth' });

    } catch (err) {
        showToast('Could not load item for editing.', 'error');
    }
}

/* -------------------------------------------------------
   cancelEdit()
   Resets edit state and clears the form.
------------------------------------------------------- */
function cancelEdit() {
    editingItemId = null;
    resetItemForm();

    const submitBtn = document.getElementById('item-submit-btn');
    if (submitBtn) submitBtn.textContent = '➕ Add Item';

    const cancelBtn = document.getElementById('item-cancel-btn');
    if (cancelBtn) cancelBtn.style.display = 'none';

    const formTitle = document.getElementById('form-title');
    if (formTitle) formTitle.textContent = 'Add New Item';
}

/* -------------------------------------------------------
   resetItemForm()
   Clears all form input fields.
------------------------------------------------------- */
function resetItemForm() {
    const form = document.getElementById('item-form');
    if (form) form.reset();
}

/* =======================================================
   DELETE
   ======================================================= */

/* -------------------------------------------------------
   confirmDeleteItem(id)
   Shows a confirmation dialog, then deletes if confirmed.
   @param {number} id - IndexedDB item ID
------------------------------------------------------- */
async function confirmDeleteItem(id) {
    const item = allItems.find(i => i.id === id);
    const name = item ? item.itemName : 'this item';

    const confirmed = await showConfirm(
        `Delete "${name}" from inventory? This cannot be undone.`
    );
    if (!confirmed) return;

    try {
        showLoader();
        await deleteData('items', id);
        showToast(`"${name}" deleted.`, 'success');
        await loadItems();
    } catch (err) {
        showToast('Could not delete item.', 'error');
    } finally {
        hideLoader();
    }
}

/* =======================================================
   SEARCH
   ======================================================= */

/* -------------------------------------------------------
   handleSearch(e)
   Filters the in-memory allItems cache using the search
   term and re-renders the table. No DB calls needed.
------------------------------------------------------- */
function handleSearch(e) {
    const term = e.target.value.trim();
    const filtered = filterData(allItems, term, [
        'itemCode', 'itemName', 'category', 'supplier'
    ]);
    renderItemsTable(filtered);
}

/* =======================================================
   UTILITY
   ======================================================= */

/* escHtml(str) — escape HTML to prevent XSS */
function escHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/* =======================================================
   PAGE INIT — inject dynamic HTML & wire events
   ======================================================= */

/* -------------------------------------------------------
   buildInventoryPage()
   Injects the add-item form and items table HTML into
   the page content area, then wires all event listeners.
   Called once on DOMContentLoaded.
------------------------------------------------------- */
function buildInventoryPage() {
    const main = document.querySelector('.page-content');
    if (!main) return;

    main.innerHTML = `

    <!-- ===== ADD / EDIT ITEM FORM ===== -->
    <div class="section-block">
      <h3 class="section-title" id="form-title">Add New Item</h3>
      <form id="item-form">

        <div class="form-row">
          <div class="form-group">
            <label for="item-code">Item Code *</label>
            <input type="text" id="item-code" placeholder="e.g. SRG-001" required>
          </div>
          <div class="form-group">
            <label for="item-name">Item Name *</label>
            <input type="text" id="item-name" placeholder="e.g. Surgical Gloves" required>
          </div>
          <div class="form-group">
            <label for="category">Category *</label>
            <select id="category" required>
              <option value="">-- Select --</option>
              <option>PPE</option>
              <option>Syringes</option>
              <option>Dressings</option>
              <option>Instruments</option>
              <option>Consumables</option>
              <option>Medicines</option>
              <option>Other</option>
            </select>
          </div>
          <div class="form-group">
            <label for="supplier">Supplier</label>
            <input type="text" id="supplier" placeholder="Supplier name">
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label for="buying-rate">Buying Rate (Rs.) *</label>
            <input type="number" id="buying-rate" placeholder="0.00"
              step="0.01" min="0">
          </div>
          <div class="form-group">
            <label for="selling-rate">Selling Rate (Rs.) *</label>
            <input type="number" id="selling-rate" placeholder="0.00"
              step="0.01" min="0" required>
          </div>
          <div class="form-group">
            <label for="stock">Stock Quantity *</label>
            <input type="number" id="stock" placeholder="0" min="0" required>
          </div>
        </div>

        <div class="form-actions">
          <button type="submit" class="btn btn-primary" id="item-submit-btn">
            ➕ Add Item
          </button>
          <button type="button" class="btn btn-outline" id="item-cancel-btn"
            style="display:none;" onclick="cancelEdit()">
            ✖ Cancel Edit
          </button>
          <button type="reset" class="btn btn-outline" onclick="cancelEdit()">
            🔄 Reset
          </button>
        </div>

      </form>
    </div>

    <!-- ===== ITEMS TABLE ===== -->
    <div class="section-block">
      <div class="section-header-row">
        <h3 class="section-title">All Inventory Items</h3>
        <div class="search-bar">
          <input type="text" id="inventory-search"
            placeholder="🔍 Search by name, code, category..."
            class="search-input">
        </div>
      </div>

      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Item Code</th>
              <th>Item Name</th>
              <th>Category</th>
              <th>Supplier</th>
              <th>Buying Rate</th>
              <th>Selling Rate</th>
              <th>Stock</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="items-tbody">
            <tr>
              <td colspan="10" style="text-align:center;padding:24px;color:#94a3b8;">
                Loading inventory...
              </td>
            </tr>
          </tbody>
        </table>
      </div>

    </div>`;

    // ---- Wire events ----
    document.getElementById('item-form')
        .addEventListener('submit', handleItemFormSubmit);

    document.getElementById('inventory-search')
        .addEventListener('input', handleSearch);
}

/* =======================================================
   AUTO-INIT on DOM ready (inventory.html only)
   ======================================================= */
document.addEventListener('DOMContentLoaded', function () {
    // Only run on inventory page
    if (!window.location.pathname.includes('inventory')) return;

    // Wait for DB to be ready
    const wait = setInterval(() => {
        if (db !== null) {
            clearInterval(wait);
            buildInventoryPage();
            loadItems();
        }
    }, 50);
});