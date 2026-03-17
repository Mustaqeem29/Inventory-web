/* =======================================================
   js/billing.js
   Khuwaja Surgical — Billing / Invoice System
   Features: Select items, add to bill, calculate totals,
             save bill, reduce stock automatically.
   Depends on: db.js, auth.js, ui.js
   Add <script src="js/billing.js"></script> to billing.html
   ======================================================= */

/* -------------------------------------------------------
   BILL STATE
   currentBillItems — array of line items on the current bill
   settings         — business settings loaded from DB
   invoiceNumber    — auto-generated next invoice number
------------------------------------------------------- */
let currentBillItems = [];
let billSettings = {};
let nextInvoiceNum = 1001;

/* =======================================================
   LOAD SETTINGS & INVENTORY
   ======================================================= */

/* -------------------------------------------------------
   loadBillSettings()
   Reads business settings from DB (tax rate, invoice
   numbering, shop name etc.) and caches in billSettings.
------------------------------------------------------- */
async function loadBillSettings() {
    try {
        const allSettings = await getAllData('settings');
        if (allSettings.length > 0) {
            billSettings = allSettings[0];

            // Calculate the next invoice number based on saved bills
            const allBills = await getAllData('bills');
            if (allBills.length > 0) {
                const maxNum = Math.max(...allBills.map(b => b.invoiceNumber || 0));
                nextInvoiceNum = maxNum + 1;
            } else {
                nextInvoiceNum = parseInt(billSettings.invoiceStart) || 1001;
            }
        }

        // Update invoice number display
        const invEl = document.getElementById('inv-number');
        if (invEl) invEl.textContent = (billSettings.invoicePrefix || '#') + nextInvoiceNum;

        // Update invoice date
        const dateEl = document.getElementById('inv-date');
        if (dateEl) dateEl.textContent = getTodayString();

        // Update shop name on invoice header
        const shopEl = document.getElementById('invoice-shop-name');
        if (shopEl) shopEl.textContent = '🏥 ' + (billSettings.businessName || 'Khuwaja Surgical');

        const addrEl = document.getElementById('invoice-address');
        if (addrEl) addrEl.textContent =
            (billSettings.address || '') + ' | Ph: ' + (billSettings.phone || '');

    } catch (err) {
        console.error('[Billing] loadBillSettings error:', err);
    }
}

/* -------------------------------------------------------
   loadInventoryDropdown()
   Populates the item-select dropdown with all items
   that have stock > 0.
------------------------------------------------------- */
async function loadInventoryDropdown() {
    try {
        const items = await getAllData('items');
        const select = document.getElementById('item-select');
        if (!select) return;

        // Clear existing options (keep placeholder)
        select.innerHTML = '<option value="">-- Choose Item --</option>';

        // Add each item with stock
        items.forEach(item => {
            const opt = document.createElement('option');
            opt.value = item.id; // Store DB id as value
            opt.dataset.rate = item.sellingRate;
            opt.dataset.name = item.itemName;
            opt.dataset.stock = item.currentStock;
            opt.textContent =
                `${item.itemName} (${item.itemCode}) — Rs.${item.sellingRate} | Stock: ${item.currentStock}`;
            if (item.currentStock <= 0) {
                opt.textContent += ' [OUT OF STOCK]';
                opt.disabled = true; // Cannot select out-of-stock
            }
            select.appendChild(opt);
        });

    } catch (err) {
        showToast('Could not load inventory items.', 'error');
    }
}

/* =======================================================
   ITEM SELECTION — auto-fill rate when item chosen
   ======================================================= */

/* -------------------------------------------------------
   onItemSelect()
   When user picks an item from the dropdown, auto-fills
   the rate field with the item's selling rate.
------------------------------------------------------- */
function onItemSelect() {
    const select = document.getElementById('item-select');
    const rateInput = document.getElementById('item-rate');
    if (!select || !rateInput) return;

    const selected = select.options[select.selectedIndex];
    if (selected && selected.dataset.rate) {
        rateInput.value = selected.dataset.rate;
    } else {
        rateInput.value = '';
    }
}

/* =======================================================
   ADD ITEM TO BILL
   ======================================================= */

/* -------------------------------------------------------
   addItemToBill()
   Reads selected item, quantity, and rate.
   Validates stock availability, then adds to bill table.
------------------------------------------------------- */
function addItemToBill() {
    const select = document.getElementById('item-select');
    const qtyInput = document.getElementById('item-qty');
    const rateInput = document.getElementById('item-rate');

    if (!select.value) {
        showToast('Please select an item first.', 'warning');
        return;
    }

    const qty = parseInt(qtyInput.value) || 0;
    const rate = parseFloat(rateInput.value) || 0;

    if (qty <= 0) { showToast('Quantity must be at least 1.', 'warning'); return; }
    if (rate <= 0) { showToast('Rate must be greater than zero.', 'warning'); return; }

    // Get item details from the selected option
    const selected = select.options[select.selectedIndex];
    const itemId = parseInt(select.value);
    const itemName = selected.dataset.name;
    const maxStock = parseInt(selected.dataset.stock) || 0;

    // ---- Check if already in bill — add quantities ----
    const existing = currentBillItems.find(i => i.itemId === itemId);

    if (existing) {
        // Check combined quantity does not exceed stock
        const newQty = existing.qty + qty;
        if (newQty > maxStock) {
            showToast(
                `Only ${maxStock} units available. You already have ${existing.qty} in the bill.`,
                'warning'
            );
            return;
        }
        existing.qty = newQty;
        existing.amount = +(newQty * existing.rate).toFixed(2);
    } else {
        // Check stock availability
        if (qty > maxStock) {
            showToast(`Only ${maxStock} units available in stock.`, 'warning');
            return;
        }
        // Add as new line item
        currentBillItems.push({
            itemId,
            itemName,
            rate: +rate.toFixed(2),
            qty,
            amount: +(qty * rate).toFixed(2),
            maxStock
        });
    }

    // Refresh bill table and totals
    renderBillTable();
    recalculateTotals();

    // Reset add-item inputs
    select.value = '';
    qtyInput.value = '1';
    rateInput.value = '';
}

/* =======================================================
   REMOVE ITEM FROM BILL
   ======================================================= */

/* -------------------------------------------------------
   removeItemFromBill(index)
   Removes a line item from currentBillItems by its index.
   @param {number} index - Array index of the item
------------------------------------------------------- */
function removeItemFromBill(index) {
    currentBillItems.splice(index, 1);
    renderBillTable();
    recalculateTotals();
}

/* =======================================================
   RENDER BILL TABLE
   ======================================================= */

/* -------------------------------------------------------
   renderBillTable()
   Redraws the invoice items table from currentBillItems.
------------------------------------------------------- */
function renderBillTable() {
    const tbody = document.getElementById('invoice-items-body');
    if (!tbody) return;

    if (currentBillItems.length === 0) {
        tbody.innerHTML = `
      <tr id="empty-bill-row">
        <td colspan="6" style="text-align:center;padding:20px;color:#94a3b8;">
          No items added yet. Use the form above to add items.
        </td>
      </tr>`;
        return;
    }

    tbody.innerHTML = currentBillItems.map((item, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${escHtmlB(item.itemName)}</td>
      <td>${item.rate.toFixed(2)}</td>
      <td>${item.qty}</td>
      <td><strong>${item.amount.toFixed(2)}</strong></td>
      <td class="no-print">
        <button class="btn-icon btn-delete"
          onclick="removeItemFromBill(${i})" title="Remove">🗑️</button>
      </td>
    </tr>`
    ).join('');
}

/* =======================================================
   CALCULATE TOTALS
   ======================================================= */

/* -------------------------------------------------------
   recalculateTotals()
   Reads currentBillItems + discount input to compute:
   Subtotal → Tax → Discount → Grand Total → Balance Due
   Updates all total display elements on the page.
------------------------------------------------------- */
function recalculateTotals() {
    // Subtotal = sum of all line amounts
    const subtotal = currentBillItems.reduce((sum, i) => sum + i.amount, 0);

    // Tax rate from settings (default 17%)
    const taxRate = parseFloat(billSettings.taxRate || 17) / 100;
    const taxAmount = +(subtotal * taxRate).toFixed(2);

    // Discount — read from input
    const discount = parseFloat(document.getElementById('discount')?.value || '0') || 0;

    // Grand total
    const grandTotal = +(subtotal + taxAmount - discount).toFixed(2);

    // Cash received
    const cashPaid = parseFloat(document.getElementById('cash-received')?.value || '0') || 0;

    // Balance due (negative means change to return)
    const balance = +(cashPaid - grandTotal).toFixed(2);

    // ---- Update display elements ----
    setText('total-subtotal', subtotal.toFixed(2));
    setText('total-tax', taxAmount.toFixed(2));
    setText('total-discount', discount.toFixed(2));
    setText('total-grand', grandTotal.toFixed(2));
    setText('total-cash', cashPaid.toFixed(2));
    setText('total-balance', balance.toFixed(2));

    // Also update the print-visible grand total (if separate element)
    setText('grand-total-val', 'Rs. ' + grandTotal.toFixed(2));
    setText('balance-val', 'Rs. ' + balance.toFixed(2));

    // Highlight balance in red if customer owes money
    const balEl = document.getElementById('total-balance');
    if (balEl) balEl.style.color = balance < 0 ? '#dc2626' : '#16a34a';
}

/* =======================================================
   SAVE BILL
   ======================================================= */

/* -------------------------------------------------------
   saveBill()
   1. Validates the bill has items
   2. Builds the bill object
   3. Saves to 'bills' store in IndexedDB
   4. Reduces stock for each item sold
   5. Resets the bill form
------------------------------------------------------- */
async function saveBill() {
    // ---- Validate ----
    if (currentBillItems.length === 0) {
        showToast('Add at least one item to the bill.', 'warning');
        return;
    }

    const customerName = document.getElementById('cust-name')?.value.trim() || 'Walk-in Customer';
    const customerPhone = document.getElementById('cust-phone')?.value.trim() || '';
    const sellerName = document.getElementById('seller-name')?.value.trim() || getCurrentUser()?.sellerName || 'Admin';

    // ---- Recalculate totals fresh ----
    const subtotal = currentBillItems.reduce((sum, i) => sum + i.amount, 0);
    const taxRate = parseFloat(billSettings.taxRate || 17) / 100;
    const taxAmount = +(subtotal * taxRate).toFixed(2);
    const discount = parseFloat(document.getElementById('discount')?.value || '0') || 0;
    const grandTotal = +(subtotal + taxAmount - discount).toFixed(2);
    const cashPaid = parseFloat(document.getElementById('cash-received')?.value || '0') || 0;
    const balance = +(cashPaid - grandTotal).toFixed(2);

    // ---- Build bill record ----
    const bill = {
        invoiceNumber: nextInvoiceNum,
        date: getTodayISO(),
        sellerName,
        customerName,
        customerPhone,
        items: currentBillItems.map(i => ({  // Snapshot of items
            itemId: i.itemId,
            itemName: i.itemName,
            rate: i.rate,
            qty: i.qty,
            amount: i.amount
        })),
        subtotal,
        taxRate: billSettings.taxRate || 17,
        taxAmount,
        discount,
        grandTotal,
        cashPaid,
        balance,
        createdAt: new Date().toISOString()
    };

    try {
        showLoader();

        // ---- 1. Save bill to IndexedDB ----
        await addData('bills', bill);
        console.log('[Billing] Bill saved:', bill.invoiceNumber);

        // ---- 2. Reduce stock for each sold item ----
        for (const lineItem of currentBillItems) {
            const dbItem = await getDataById('items', lineItem.itemId);
            if (dbItem) {
                dbItem.currentStock = Math.max(0, (dbItem.currentStock || 0) - lineItem.qty);
                await updateData('items', dbItem);
                console.log(`[Billing] Stock reduced for "${dbItem.itemName}": -${lineItem.qty}`);
            }
        }

        showToast(`Bill #${nextInvoiceNum} saved successfully!`, 'success');

        // ---- 3. Increment invoice number ----
        nextInvoiceNum++;

        // ---- 4. Reset bill ----
        clearBill();

        // ---- 5. Reload dropdown (stock changed) ----
        await loadInventoryDropdown();
        await loadBillSettings(); // Refresh invoice number

    } catch (err) {
        console.error('[Billing] saveBill error:', err);
        showToast('Could not save bill. Please try again.', 'error');
    } finally {
        hideLoader();
    }
}

/* -------------------------------------------------------
   clearBill()
   Resets the entire bill — items, inputs, and totals.
------------------------------------------------------- */
function clearBill() {
    currentBillItems = [];
    renderBillTable();
    recalculateTotals();

    // Clear customer info fields
    const fields = ['cust-name', 'cust-phone', 'discount', 'cash-received'];
    fields.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
}

/* =======================================================
   PRINT BILL
   ======================================================= */

/* -------------------------------------------------------
   printBill()
   Validates bill has items, then triggers window.print().
   The print CSS (print.css) hides sidebar/header etc.
------------------------------------------------------- */
function printBill() {
    if (currentBillItems.length === 0) {
        showToast('Nothing to print. Add items to the bill first.', 'warning');
        return;
    }
    window.print();
}

/* =======================================================
   UTILITY
   ======================================================= */

/* setText(id, value) — safely sets textContent of an element */
function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

/* escHtmlB(str) — escape HTML (local copy for billing) */
function escHtmlB(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/* =======================================================
   BUILD BILLING PAGE — inject HTML & wire events
   ======================================================= */

/* -------------------------------------------------------
   buildBillingPage()
   Injects the full billing interface HTML into .page-content
   and wires all event listeners.
------------------------------------------------------- */
function buildBillingPage() {
    const main = document.querySelector('.page-content');
    if (!main) return;

    main.innerHTML = `

  <!-- ===== INVOICE AREA (also printed) ===== -->
  <div class="invoice-wrapper" id="invoice-print-area">

    <!-- INVOICE HEADER -->
    <div class="invoice-header">
      <div class="invoice-brand">
        <h2 class="invoice-shop-name" id="invoice-shop-name">🏥 Khuwaja Surgical</h2>
        <p class="invoice-address" id="invoice-address">Loading...</p>
      </div>
      <div class="invoice-meta">
        <div class="meta-row">
          <span class="meta-label">Invoice No:</span>
          <span class="meta-value" id="inv-number">#----</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">Date:</span>
          <span class="meta-value" id="inv-date">--</span>
        </div>
      </div>
    </div>

    <!-- SELLER & CUSTOMER (screen only) -->
    <div class="invoice-parties no-print">
      <div class="party-block">
        <h4 class="party-label">Seller</h4>
        <div class="form-group">
          <label for="seller-name">Seller Name</label>
          <input type="text" id="seller-name" placeholder="Staff name">
        </div>
      </div>
      <div class="party-block">
        <h4 class="party-label">Customer</h4>
        <div class="form-row">
          <div class="form-group">
            <label for="cust-name">Customer Name</label>
            <input type="text" id="cust-name" placeholder="Customer / Shop Name">
          </div>
          <div class="form-group">
            <label for="cust-phone">Phone</label>
            <input type="text" id="cust-phone" placeholder="0300-0000000">
          </div>
        </div>
      </div>
    </div>

    <!-- PRINT-ONLY: party info row -->
    <div class="print-only party-print-row" id="print-party-row">
      <div><strong>Seller:</strong> <span id="print-seller">---</span>
           &nbsp;&nbsp;
           <strong>Customer:</strong> <span id="print-customer">---</span>
      </div>
      <div><strong>Phone:</strong> <span id="print-phone">---</span></div>
    </div>

    <!-- ADD ITEM ROW (screen only) -->
    <div class="add-item-row no-print">
      <h4 class="party-label">Add Item to Bill</h4>
      <div class="form-row item-add-form">
        <div class="form-group" style="flex:2;min-width:200px;">
          <label for="item-select">Select Item</label>
          <select id="item-select" onchange="onItemSelect()">
            <option value="">-- Choose Item --</option>
          </select>
        </div>
        <div class="form-group" style="flex:0.5;min-width:90px;">
          <label for="item-qty">Quantity</label>
          <input type="number" id="item-qty" value="1" min="1">
        </div>
        <div class="form-group" style="flex:0.7;min-width:110px;">
          <label for="item-rate">Rate (Rs.)</label>
          <input type="number" id="item-rate" placeholder="0.00" step="0.01">
        </div>
        <div class="form-group" style="flex:0;min-width:120px;">
          <label>&nbsp;</label>
          <button type="button" class="btn btn-primary" onclick="addItemToBill()">
            ➕ Add Item
          </button>
        </div>
      </div>
    </div>

    <!-- ITEMS TABLE -->
    <div class="invoice-items">
      <table class="data-table invoice-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Item Name</th>
            <th>Rate (Rs.)</th>
            <th>Quantity</th>
            <th>Amount (Rs.)</th>
            <th class="no-print">Remove</th>
          </tr>
        </thead>
        <tbody id="invoice-items-body">
          <tr id="empty-bill-row">
            <td colspan="6"
              style="text-align:center;padding:20px;color:#94a3b8;">
              No items added yet.
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- TOTALS SECTION -->
    <div class="invoice-totals">

      <!-- Cash received input (screen only) -->
      <div class="totals-left no-print">
        <div class="form-group">
          <label for="discount">Discount (Rs.)</label>
          <input type="number" id="discount" placeholder="0.00"
            step="0.01" min="0" oninput="recalculateTotals()">
        </div>
        <div class="form-group">
          <label for="cash-received">Cash Received (Rs.)</label>
          <input type="number" id="cash-received" placeholder="0.00"
            step="0.01" min="0" oninput="recalculateTotals()">
        </div>
      </div>

      <!-- Totals table (screen + print) -->
      <div class="totals-right">
        <table class="totals-table">
          <tr>
            <td class="totals-label">Subtotal:</td>
            <td class="totals-value">Rs. <span id="total-subtotal">0.00</span></td>
          </tr>
          <tr>
            <td class="totals-label">Tax (17%):</td>
            <td class="totals-value">Rs. <span id="total-tax">0.00</span></td>
          </tr>
          <tr>
            <td class="totals-label">Discount:</td>
            <td class="totals-value">Rs. <span id="total-discount">0.00</span></td>
          </tr>
          <tr class="grand-total-row">
            <td class="totals-label">Grand Total:</td>
            <td class="totals-value grand-total-val">
              Rs. <span id="total-grand">0.00</span>
            </td>
          </tr>
          <tr>
            <td class="totals-label">Cash Received:</td>
            <td class="totals-value">Rs. <span id="total-cash">0.00</span></td>
          </tr>
          <tr>
            <td class="totals-label">Balance:</td>
            <td class="totals-value balance-val">
              Rs. <span id="total-balance">0.00</span>
            </td>
          </tr>
        </table>
      </div>
    </div>

    <!-- PRINT FOOTER -->
    <div class="invoice-footer print-only">
      <p id="print-footer-msg">Thank you for your business!</p>
      <p id="print-footer-shop">Khuwaja Surgical</p>
    </div>

  </div><!-- /#invoice-print-area -->

  <!-- ACTION BUTTONS (screen only) -->
  <div class="invoice-actions no-print">
    <button type="button" class="btn btn-primary" onclick="printBill()">
      🖨️ Print Bill
    </button>
    <button type="button" class="btn btn-green" onclick="saveBill()">
      💾 Save Bill
    </button>
    <button type="button" class="btn btn-outline" onclick="clearBill()">
      🔄 Clear Bill
    </button>
    <a href="bills.html" class="btn btn-outline">📋 View All Bills</a>
  </div>`;

    // ---- Auto-fill seller name from session ----
    const user = getCurrentUser();
    const sellerEl = document.getElementById('seller-name');
    if (sellerEl && user) sellerEl.value = user.sellerName || 'Admin';

    // ---- Update print party row on input change ----
    document.getElementById('seller-name')?.addEventListener('input', updatePrintPartyRow);
    document.getElementById('cust-name')?.addEventListener('input', updatePrintPartyRow);
    document.getElementById('cust-phone')?.addEventListener('input', updatePrintPartyRow);

    updatePrintPartyRow();
}

/* -------------------------------------------------------
   updatePrintPartyRow()
   Keeps the print-only party row in sync with
   the seller/customer input fields.
------------------------------------------------------- */
function updatePrintPartyRow() {
    setText('print-seller', document.getElementById('seller-name')?.value || '---');
    setText('print-customer', document.getElementById('cust-name')?.value || 'Walk-in Customer');
    setText('print-phone', document.getElementById('cust-phone')?.value || '---');
}

/* =======================================================
   AUTO-INIT on DOM ready (billing.html only)
   ======================================================= */
document.addEventListener('DOMContentLoaded', function () {
    if (!window.location.pathname.includes('billing')) return;

    const wait = setInterval(async () => {
        if (db !== null) {
            clearInterval(wait);
            buildBillingPage();
            await loadBillSettings();
            await loadInventoryDropdown();
        }
    }, 50);
});