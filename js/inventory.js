/* =======================================================
   js/inventory.js - Khuwaja Surgical — Inventory Management
   FIXED VERSION — Handles 20+ items, full CRUD, search
   ======================================================= */

let editingItemId = null;
let allItems = [];
let currentPage = 1;
const ITEMS_PER_PAGE = 10;

/* =======================================================
   1. REPLACE renderItemsTable() with this version
   ======================================================= */
function renderItemsTable(items) {
  const tbody = document.getElementById('items-tbody');
  if (!tbody) return;

  if (!items || items.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="10"
          style="text-align:center;padding:32px;color:#94a3b8;">
          📦 No items found. Add your first item above.
        </td>
      </tr>`;
    updateItemsCount(0, 0, 0);
    renderPagination(0);
    return;
  }

  const totalItems = items.length;
  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
  currentPage = Math.min(currentPage, Math.max(1, totalPages));
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, totalItems);
  const pageItems = items.slice(startIndex, endIndex);

  updateItemsCount(startIndex + 1, endIndex, totalItems);
  renderPagination(totalPages, items);

  const lowLimit = parseInt(localStorage.getItem('ksLowStockLimit') || '10');

  tbody.innerHTML = pageItems.map((item, index) => {
    const stockNum = parseInt(item.currentStock) || 0;

    /* Stock badge */
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
        <td>${startIndex + index + 1}</td>
        <td><strong>${esc(item.itemCode)}</strong></td>
        <td>${esc(item.itemName)}</td>
        <td>${esc(item.category)}</td>
        <td>${esc(item.supplier || '---')}</td>
        <td>Rs. ${parseFloat(item.buyingRate || 0).toFixed(2)}</td>
        <td>Rs. ${parseFloat(item.sellingRate || 0).toFixed(2)}</td>
        <td><strong>${stockNum}</strong></td>
        <td>${stockBadge}</td>
        <td class="action-btns">
          <button class="btn-edit-item"
            onclick="startEditItem(${item.id})"
            title="Edit">✏️ Edit</button>
          <button class="btn-delete-item"
            onclick="confirmDeleteItem(${item.id})"
            title="Delete">🗑️ Delete</button>
        </td>
      </tr>`;
  }).join('');
}

/* -------------------------------------------------------
   updateItemsCount(from, to, total)
------------------------------------------------------- */
function updateItemsCount(from, to, total) {
  const el = document.getElementById('items-count');
  if (el) {
    el.textContent = total > 0
      ? `Showing ${from}–${to} of ${total} items`
      : 'No items';
  }
}

/* -------------------------------------------------------
   renderPagination(totalPages, items)
------------------------------------------------------- */
function renderPagination(totalPages, items) {
  const container = document.getElementById('inventory-pagination');
  if (!container) return;

  if (totalPages <= 1) {
    container.innerHTML = '';
    return;
  }

  let html = '';

  // Previous button
  html += `<button class="page-btn" ${currentPage === 1 ? 'disabled' : ''}
    onclick="goToPage(${currentPage - 1}, currentFilteredItems)">‹ Prev</button>`;

  // Page numbers
  for (let i = 1; i <= totalPages; i++) {
    html += `<button class="page-btn ${i === currentPage ? 'active' : ''}"
      onclick="goToPage(${i}, currentFilteredItems)">${i}</button>`;
  }

  // Next button
  html += `<button class="page-btn" ${currentPage === totalPages ? 'disabled' : ''}
    onclick="goToPage(${currentPage + 1}, currentFilteredItems)">Next ›</button>`;

  container.innerHTML = html;
}

// Keep track of filtered items for pagination
let currentFilteredItems = [];

/* -------------------------------------------------------
   goToPage(page, items)
------------------------------------------------------- */
function goToPage(page, items) {
  currentPage = page;
  renderItemsTable(items || allItems);
}

/* =======================================================
   LOAD ITEMS FROM DB
   ======================================================= */
async function loadItems() {
  try {
    showLoader();
    allItems = await getAllData('items');

    // Sort newest first
    allItems.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    currentFilteredItems = [...allItems];
    renderItemsTable(currentFilteredItems);

  } catch (err) {
    console.error('[Inventory] loadItems error:', err);
    showToast('Failed to load items. Please refresh.', 'error');
  } finally {
    hideLoader();
  }
}

/* =======================================================
   ADD / EDIT FORM SUBMIT
   ======================================================= */
async function handleItemFormSubmit(e) {
  e.preventDefault();

  const submitBtn = document.getElementById('item-submit-btn');
  const originalTxt = submitBtn?.textContent || 'Add Item';

  // Read values
  const itemCode = document.getElementById('item-code')?.value.trim().toUpperCase() || '';
  const itemName = document.getElementById('item-name')?.value.trim() || '';
  const category = document.getElementById('category')?.value || '';
  const supplier = document.getElementById('supplier')?.value.trim() || '';
  const buyingRate = parseFloat(document.getElementById('buying-rate')?.value) || 0;
  const sellingRate = parseFloat(document.getElementById('selling-rate')?.value) || 0;
  const currentStock = parseInt(document.getElementById('stock')?.value) || 0;

  // ---- Validation ----
  if (!itemCode) { showToast('Item code is required.', 'warning'); return; }
  if (!itemName) { showToast('Item name is required.', 'warning'); return; }
  if (!category) { showToast('Please select a category.', 'warning'); return; }
  if (sellingRate <= 0) { showToast('Selling rate must be greater than 0.', 'warning'); return; }
  if (currentStock < 0) { showToast('Stock cannot be negative.', 'warning'); return; }

  // ---- Disable button ----
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = editingItemId ? 'Updating...' : 'Adding...';
  }

  try {
    showLoader();

    if (editingItemId) {
      // ---- UPDATE ----

      // Check duplicate itemCode (allow same item)
      const duplicate = allItems.find(i => i.itemCode === itemCode && i.id !== editingItemId);
      if (duplicate) {
        showToast('Another item already uses this item code.', 'error');
        return;
      }

      const existing = await getDataById('items', editingItemId);
      if (!existing) {
        showToast('Item not found. Please refresh.', 'error');
        return;
      }

      const updated = {
        ...existing,
        itemCode,
        itemName,
        category,
        supplier,
        buyingRate,
        sellingRate,
        currentStock
      };

      await updateData('items', updated);
      showToast(`"${itemName}" updated successfully.`, 'success');
      cancelEdit();

    } else {
      // ---- ADD NEW ----

      // Check duplicate itemCode
      const duplicate = allItems.find(i => i.itemCode === itemCode);
      if (duplicate) {
        showToast(`Item code "${itemCode}" already exists. Use a unique code.`, 'error');
        return;
      }

      await addData('items', {
        itemCode,
        itemName,
        category,
        supplier,
        buyingRate,
        sellingRate,
        currentStock,
        dateAdded: new Date().toISOString().split('T')[0]
      });

      showToast(`"${itemName}" added to inventory ✅`, 'success');
    }

    // Reset page to 1 after add/edit
    currentPage = 1;
    await loadItems();
    resetItemForm();

  } catch (err) {
    console.error('[Inventory] handleItemFormSubmit error:', err);
    if (err.name === 'ConstraintError') {
      showToast('Item code already exists. Use a unique code.', 'error');
    } else {
      showToast('Could not save item: ' + err.message, 'error');
    }
  } finally {
    hideLoader();
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = originalTxt;
    }
  }
}

/* =======================================================
   EDIT
   ======================================================= */
async function startEditItem(id) {
  try {
    const item = await getDataById('items', Number(id));
    if (!item) { showToast('Item not found.', 'error'); return; }

    document.getElementById('item-code').value = item.itemCode || '';
    document.getElementById('item-name').value = item.itemName || '';
    document.getElementById('category').value = item.category || '';
    document.getElementById('supplier').value = item.supplier || '';
    document.getElementById('buying-rate').value = item.buyingRate || '';
    document.getElementById('selling-rate').value = item.sellingRate || '';
    document.getElementById('stock').value = item.currentStock || '';

    editingItemId = id;

    const submitBtn = document.getElementById('item-submit-btn');
    if (submitBtn) submitBtn.textContent = '💾 Update Item';

    const cancelBtn = document.getElementById('item-cancel-btn');
    if (cancelBtn) cancelBtn.style.display = 'inline-flex';

    const formTitle = document.getElementById('form-title');
    if (formTitle) formTitle.textContent = `✏️ Edit Item: ${item.itemName}`;

    // Scroll to form
    document.getElementById('item-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  } catch (err) {
    showToast('Could not load item for editing.', 'error');
  }
}

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

function resetItemForm() {
  document.getElementById('item-form')?.reset();
}

/* =======================================================
     REPLACE confirmDeleteItem() with this version
      (better confirmation dialog + error handling)
   ======================================================= */
async function confirmDeleteItem(id) {
  /* Find item name for the confirmation message */
  const item = allItems.find(i => i.id === id)
    || await getDataById('items', Number(id)).catch(() => null);

  const name = item ? item.itemName : 'this item';

  /* Show confirmation */
  let confirmed;
  if (typeof showConfirm === 'function') {
    confirmed = await showConfirm(
      `Delete "${name}" from inventory?\n\nYeh action undo nahi ho sakta.`
    );
  } else {
    confirmed = window.confirm(`Delete "${name}"? This cannot be undone.`);
  }

  if (!confirmed) return;

  try {
    showLoader();
    await deleteData('items', Number(id));

    if (typeof showToast === 'function') {
      showToast(`"${name}" deleted successfully.`, 'success');
    }

    /* Adjust page if last item on current page was deleted */
    const remaining = allItems.filter(i => i.id !== id);
    const totalPages = Math.ceil(remaining.length / ITEMS_PER_PAGE);
    if (currentPage > totalPages && currentPage > 1) currentPage--;

    await loadItems();

  } catch (err) {
    if (typeof showToast === 'function') {
      showToast('Delete nahi hua: ' + err.message, 'error');
    }
    console.error('[Inventory] confirmDeleteItem error:', err);
  } finally {
    hideLoader();
  }
}

/* =======================================================
   SEARCH
   ======================================================= */
function handleSearch(e) {
  const term = e.target.value.trim().toLowerCase();
  currentPage = 1; // reset to first page on search

  if (!term) {
    currentFilteredItems = [...allItems];
  } else {
    currentFilteredItems = allItems.filter(item =>
      (item.itemCode || '').toLowerCase().includes(term) ||
      (item.itemName || '').toLowerCase().includes(term) ||
      (item.category || '').toLowerCase().includes(term) ||
      (item.supplier || '').toLowerCase().includes(term)
    );
  }

  renderItemsTable(currentFilteredItems);
}

/* =======================================================
   BUILD PAGE HTML
   ======================================================= */
function buildInventoryPage() {
  const main = document.querySelector('.page-content');
  if (!main) return;

  main.innerHTML = `

    <!-- ADD / EDIT FORM -->
    <div class="section-block">
      <h3 class="section-title" id="form-title">Add New Item</h3>
      <form id="item-form" autocomplete="off">

        <div class="form-row">
          <div class="form-group">
            <label for="item-code">Item Code *</label>
            <input type="text" id="item-code" placeholder="e.g. SRG-001"
              autocomplete="off" required>
          </div>
          <div class="form-group">
            <label for="item-name">Item Name *</label>
            <input type="text" id="item-name" placeholder="e.g. Surgical Gloves"
              autocomplete="off" required>
          </div>
          <div class="form-group">
            <label for="category">Category *</label>
            <select id="category" required>
              <option value="">-- Select Category --</option>
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
            <input type="text" id="supplier" placeholder="Supplier name"
              autocomplete="off">
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label for="buying-rate">Buying Rate (Rs.)</label>
            <input type="number" id="buying-rate" placeholder="0.00"
              step="0.01" min="0">
          </div>
          <div class="form-group">
            <label for="selling-rate">Selling Rate (Rs.) *</label>
            <input type="number" id="selling-rate" placeholder="0.00"
              step="0.01" min="0.01" required>
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

    <!-- ITEMS TABLE -->
    <div class="section-block">
      <div class="section-header-row">
        <h3 class="section-title">
          All Inventory Items
          <span id="items-count" style="font-size:12px;color:#94a3b8;
            font-weight:400;margin-left:8px;"></span>
        </h3>
        <div class="search-bar">
          <input type="text" id="inventory-search"
            placeholder="🔍 Search by name, code, category, supplier..."
            class="search-input" autocomplete="off">
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
              <td colspan="10" style="text-align:center;padding:32px;color:#94a3b8;">
                Loading inventory...
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Pagination -->
      <div class="pagination" id="inventory-pagination"></div>

    </div>`;

  // Wire events
  document.getElementById('item-form')
    ?.addEventListener('submit', handleItemFormSubmit);

  document.getElementById('inventory-search')
    ?.addEventListener('input', handleSearch);
}

/* =======================================================
   UTILITY
   ======================================================= */
function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/* =======================================================
   AUTO-INIT — wait for dbReady event
   ======================================================= */
document.addEventListener('DOMContentLoaded', function () {
  const isInventory = window.location.pathname.includes('inventory');
  if (!isInventory) return;

  // Wait for DB ready event fired by db.js
  window.addEventListener('dbReady', function () {
    buildInventoryPage();
    loadItems();
  });

  // Fallback: if dbReady already fired before this script ran
  if (db !== null) {
    buildInventoryPage();
    loadItems();
  }
});

/* =======================================================
     ADD this new function to inventory.js
      (paste at the bottom of inventory.js)
   ======================================================= */

/**
 * deleteItemByName(name)
 * Finds an item in IndexedDB by name (case-insensitive)
 * and permanently deletes it.
 * Called by chatbot.js for voice-style delete commands.
 *
 * @param {string} name - Item name or partial name to match
 * @returns {Promise<{success:boolean, message:string, item?:object}>}
 */
async function deleteItemByName(name) {

  /* Validate input */
  if (!name || !name.trim()) {
    return {
      success: false,
      message: 'Item ka naam nahi diya. Example: delete Panadol'
    };
  }

  const searchName = name.trim().toLowerCase();

  try {
    /* Load all items */
    const allItems = await getAllData('items');

    /* Find matching item — exact first, then partial */
    let found = allItems.find(
      i => (i.itemName || '').toLowerCase() === searchName
    );

    if (!found) {
      found = allItems.find(
        i => (i.itemName || '').toLowerCase().includes(searchName) ||
          (i.itemCode || '').toLowerCase().includes(searchName)
      );
    }

    /* Item not found */
    if (!found) {
      return {
        success: false,
        message: `"${name}" inventory mein nahi mila. Sahi naam likhein.`
      };
    }

    /* Delete from IndexedDB */
    await deleteData('items', Number(found.id));

    /* Refresh table if on inventory page */
    if (typeof loadItems === 'function') {
      await loadItems();
    }

    return {
      success: true,
      message: `✅ "${found.itemName}" delete ho gaya.`,
      item: found
    };

  } catch (err) {
    console.error('[Inventory] deleteItemByName error:', err);
    return {
      success: false,
      message: 'Delete nahi hua: ' + err.message
    };
  }
}