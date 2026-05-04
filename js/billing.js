/* =======================================================
   js/billing.js - Khuwaja Surgical — Billing System
   FIXED VERSION — Full bill creation, save, stock reduce
   ======================================================= */

let currentBillItems = [];
let billSettings = {};
let nextInvoiceNum = 1001;

/* =======================================================
   LOAD SETTINGS & INVENTORY DROPDOWN
   ======================================================= */
async function loadBillSettings() {
  try {
    const allSettings = await getAllData('settings');
    if (allSettings.length > 0) billSettings = allSettings[0];

    // Calculate next invoice number
    const allBills = await getAllData('bills');
    if (allBills.length > 0) {
      const maxNum = Math.max(...allBills.map(b => parseInt(b.invoiceNumber) || 0));
      nextInvoiceNum = maxNum + 1;
    } else {
      nextInvoiceNum = parseInt(billSettings.invoiceStart) || 1001;
    }

    // Update header display
    const prefix = billSettings.invoicePrefix || '#';
    setT('inv-number', prefix + nextInvoiceNum);
    setT('inv-date', getTodayString ? getTodayString() : new Date().toLocaleDateString());

    const shopEl = document.getElementById('invoice-shop-name');
    if (shopEl) shopEl.textContent = '🏥 ' + (billSettings.businessName || 'Khuwaja Surgical');

    const addrEl = document.getElementById('invoice-address');
    if (addrEl) addrEl.textContent =
      (billSettings.address || '') + ' | Ph: ' + (billSettings.phone || '');

  } catch (err) {
    console.error('[Billing] loadBillSettings error:', err);
  }
}

async function loadInventoryDropdown() {
  try {
    const items = await getAllData('items');
    const select = document.getElementById('item-select');
    if (!select) return;

    select.innerHTML = '<option value="">-- Choose Item --</option>';

    // Sort by name
    items.sort((a, b) => (a.itemName || '').localeCompare(b.itemName || ''));

    items.forEach(item => {
      const stock = parseInt(item.currentStock) || 0;
      const opt = document.createElement('option');
      opt.value = item.id;
      opt.dataset.rate = item.sellingRate || 0;
      opt.dataset.name = item.itemName || '';
      opt.dataset.stock = stock;
      opt.dataset.code = item.itemCode || '';

      if (stock <= 0) {
        opt.textContent = `[OUT] ${item.itemName} (${item.itemCode})`;
        opt.disabled = true;
        opt.style.color = '#dc2626';
      } else {
        opt.textContent = `${item.itemName} (${item.itemCode}) — Rs.${parseFloat(item.sellingRate || 0).toFixed(2)} | Stock: ${stock}`;
      }

      select.appendChild(opt);
    });

  } catch (err) {
    showToast('Could not load inventory items.', 'error');
  }
}

/* =======================================================
   ITEM SELECTION — auto fill rate
   ======================================================= */
function onItemSelect() {
  const select = document.getElementById('item-select');
  const rateInput = document.getElementById('item-rate');
  const qtyInput = document.getElementById('item-qty');
  if (!select || !rateInput) return;

  const selected = select.options[select.selectedIndex];
  if (selected && selected.dataset.rate) {
    rateInput.value = parseFloat(selected.dataset.rate).toFixed(2);
    if (qtyInput) qtyInput.value = 1;
    qtyInput?.focus();
  } else {
    rateInput.value = '';
  }
}

/* =======================================================
   ADD ITEM TO BILL
   ======================================================= */
function addItemToBill() {
  const select = document.getElementById('item-select');
  const qtyInput = document.getElementById('item-qty');
  const rateInput = document.getElementById('item-rate');

  if (!select?.value) {
    showToast('Please select an item first.', 'warning');
    select?.focus();
    return;
  }

  const qty = parseInt(qtyInput?.value) || 0;
  const rate = parseFloat(rateInput?.value) || 0;

  if (qty <= 0) { showToast('Quantity must be at least 1.', 'warning'); qtyInput?.focus(); return; }
  if (rate <= 0) { showToast('Rate must be greater than zero.', 'warning'); rateInput?.focus(); return; }

  const selected = select.options[select.selectedIndex];
  const itemId = parseInt(select.value);
  const itemName = selected.dataset.name || '';
  const maxStock = parseInt(selected.dataset.stock) || 0;
  const itemCode = selected.dataset.code || '';

  // Check if already in bill — combine quantities
  const existing = currentBillItems.find(i => i.itemId === itemId);

  if (existing) {
    const newQty = existing.qty + qty;
    if (newQty > maxStock) {
      showToast(
        `Only ${maxStock} in stock. You already have ${existing.qty} in the bill.`,
        'warning'
      );
      return;
    }
    existing.qty = newQty;
    existing.amount = parseFloat((newQty * existing.rate).toFixed(2));
    showToast(`Updated quantity for "${itemName}" to ${newQty}.`, 'info');
  } else {
    if (qty > maxStock) {
      showToast(`Only ${maxStock} units available in stock.`, 'warning');
      return;
    }
    currentBillItems.push({
      itemId,
      itemName,
      itemCode,
      rate: parseFloat(rate.toFixed(2)),
      qty,
      amount: parseFloat((qty * rate).toFixed(2)),
      maxStock
    });
    showToast(`"${itemName}" added to bill.`, 'success');
  }

  renderBillTable();
  recalculateTotals();

  // Reset inputs
  select.value = '';
  if (qtyInput) qtyInput.value = '1';
  if (rateInput) rateInput.value = '';
  select.focus();
}

/* =======================================================
   REMOVE ITEM FROM BILL
   ======================================================= */
function removeItemFromBill(index) {
  const removed = currentBillItems.splice(index, 1);
  if (removed.length) showToast(`"${removed[0].itemName}" removed from bill.`, 'info');
  renderBillTable();
  recalculateTotals();
}

/* -------------------------------------------------------
   updateItemQty(index, newQty)
   Allows inline quantity editing in the bill table.
------------------------------------------------------- */
function updateItemQty(index, newQty) {
  const item = currentBillItems[index];
  if (!item) return;

  const qty = parseInt(newQty) || 0;
  if (qty <= 0) {
    showToast('Quantity must be at least 1.', 'warning');
    return;
  }
  if (qty > item.maxStock) {
    showToast(`Only ${item.maxStock} units available in stock.`, 'warning');
    return;
  }

  item.qty = qty;
  item.amount = parseFloat((qty * item.rate).toFixed(2));
  renderBillTable();
  recalculateTotals();
}

/* =======================================================
   RENDER BILL TABLE
   ======================================================= */
function renderBillTable() {
  const tbody = document.getElementById('invoice-items-body');
  if (!tbody) return;

  if (currentBillItems.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align:center;padding:24px;color:#94a3b8;">
          No items added yet. Use the form above to add items.
        </td>
      </tr>`;
    return;
  }

  tbody.innerHTML = currentBillItems.map((item, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${escB(item.itemName)}</td>
      <td>Rs. ${item.rate.toFixed(2)}</td>
      <td>
        <input type="number" value="${item.qty}" min="1" max="${item.maxStock}"
          style="width:60px;padding:4px;border:1px solid var(--border);
            border-radius:4px;background:var(--bg-input);color:var(--text-primary);
            text-align:center;"
          onchange="updateItemQty(${i}, this.value)"
          title="Max: ${item.maxStock}">
      </td>
      <td><strong>Rs. ${item.amount.toFixed(2)}</strong></td>
      <td class="no-print">
        <button class="btn-icon" onclick="removeItemFromBill(${i})" title="Remove">🗑️</button>
      </td>
    </tr>`
  ).join('');
}

/* =======================================================
   2. REPLACE recalculateTotals() in billing.js
      with this version (adds CSS balance classes)
   ======================================================= */
function recalculateTotals() {
  const subtotal = currentBillItems.reduce((sum, i) => sum + i.amount, 0);
  const taxRate = parseFloat(billSettings?.taxRate || 17);
  const taxAmount = parseFloat((subtotal * taxRate / 100).toFixed(2));
  const discount = parseFloat(document.getElementById('discount')?.value || '0') || 0;
  const grandTotal = parseFloat(Math.max(0, subtotal + taxAmount - discount).toFixed(2));
  const cashPaid = parseFloat(document.getElementById('cash-received')?.value || '0') || 0;
  const balance = parseFloat((cashPaid - grandTotal).toFixed(2));

  /* Update text values */
  setT('total-subtotal', subtotal.toFixed(2));
  setT('total-tax', taxAmount.toFixed(2));
  setT('total-discount', discount.toFixed(2));
  setT('total-grand', grandTotal.toFixed(2));
  setT('total-cash', cashPaid.toFixed(2));
  setT('total-balance', balance.toFixed(2));

  /* Apply CSS class for balance color — no inline styles */
  const balSpan = document.getElementById('total-balance');
  if (balSpan) {
    balSpan.classList.remove('balance-positive', 'balance-negative');
    balSpan.classList.add(balance < 0 ? 'balance-negative' : 'balance-positive');
  }

  /* Update tax label to show actual rate */
  const taxLabel = document.querySelector('.invoice-tax-label');
  if (taxLabel) taxLabel.textContent = `Tax (${taxRate}%):`;
}

/* =======================================================
   SAVE BILL
   ======================================================= */
async function saveBill() {
  if (currentBillItems.length === 0) {
    showToast('Add at least one item to the bill.', 'warning');
    return;
  }

  const saveBtn = document.getElementById('save-bill-btn');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '💾 Saving...'; }

  const customerName = document.getElementById('cust-name')?.value.trim() || 'Walk-in Customer';
  const customerPhone = document.getElementById('cust-phone')?.value.trim() || '';
  const sellerName = document.getElementById('seller-name')?.value.trim()
    || getCurrentUser()?.sellerName || 'Admin';
  const discount = parseFloat(document.getElementById('discount')?.value || '0') || 0;
  const cashPaid = parseFloat(document.getElementById('cash-received')?.value || '0') || 0;

  const subtotal = currentBillItems.reduce((sum, i) => sum + i.amount, 0);
  const taxRate = parseFloat(billSettings.taxRate || 17);
  const taxAmount = parseFloat((subtotal * taxRate / 100).toFixed(2));
  const grandTotal = parseFloat(Math.max(0, subtotal + taxAmount - discount).toFixed(2));
  const balance = parseFloat((cashPaid - grandTotal).toFixed(2));

  const bill = {
    invoiceNumber: nextInvoiceNum,
    billNumber: (billSettings.invoicePrefix || '#') + nextInvoiceNum,
    date: new Date().toISOString().split('T')[0],
    sellerName,
    customerName,
    customerPhone,
    items: currentBillItems.map(i => ({
      itemId: i.itemId,
      itemName: i.itemName,
      itemCode: i.itemCode,
      rate: i.rate,
      qty: i.qty,
      amount: i.amount
    })),
    subtotal,
    taxRate,
    taxAmount,
    discount,
    grandTotal,
    cashPaid,
    balance,
    amountPaid: cashPaid
  };

  try {
    showLoader();

    // 1. Save bill
    await addData('bills', bill);
    console.log('[Billing] Bill saved:', bill.billNumber);

    // 2. Reduce stock for each item
    for (const lineItem of currentBillItems) {
      try {
        const dbItem = await getDataById('items', lineItem.itemId);
        if (dbItem) {
          const newStock = Math.max(0, (parseInt(dbItem.currentStock) || 0) - lineItem.qty);
          await updateData('items', { ...dbItem, currentStock: newStock });
          console.log(`[Billing] Stock reduced: "${dbItem.itemName}" → ${newStock}`);
        }
      } catch (stockErr) {
        console.warn('[Billing] Could not reduce stock for item:', lineItem.itemName, stockErr);
      }
    }

    showToast(`Bill ${bill.billNumber} saved successfully! ✅`, 'success');

    // 3. Increment invoice number
    nextInvoiceNum++;

    // 4. Reset bill
    clearBill();

    // 5. Reload dropdown (stock changed)
    await loadInventoryDropdown();
    await loadBillSettings();

  } catch (err) {
    console.error('[Billing] saveBill error:', err);
    showToast('Could not save bill: ' + err.message, 'error');
  } finally {
    hideLoader();
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '💾 Save Bill'; }
  }
}

/* =======================================================
   CLEAR BILL
   ======================================================= */
function clearBill() {
  currentBillItems = [];
  renderBillTable();
  recalculateTotals();

  ['cust-name', 'cust-phone', 'discount', 'cash-received'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });

  updatePrintPartyRow();
}

/* =======================================================
   PRINT BILL
   ======================================================= */
function printBill() {
  if (currentBillItems.length === 0) {
    showToast('Add items to the bill before printing.', 'warning');
    return;
  }
  updatePrintPartyRow();
  setTimeout(() => window.print(), 100);
}

/* =======================================================
   UTILITY
   ======================================================= */
function setT(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function escB(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function updatePrintPartyRow() {
  setT('print-seller', document.getElementById('seller-name')?.value || 'Admin');
  setT('print-customer', document.getElementById('cust-name')?.value || 'Walk-in Customer');
  setT('print-phone', document.getElementById('cust-phone')?.value || '---');
}

/* =======================================================
   BUILD BILLING PAGE
   ======================================================= */
function buildBillingPage() {
  const main = document.querySelector('.page-content');
  if (!main) return;

  main.innerHTML = `
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

    <!-- SELLER & CUSTOMER -->
    <div class="invoice-parties no-print">
      <div class="party-block">
        <h4 class="party-label">Seller</h4>
        <div class="form-group">
          <label for="seller-name">Seller Name</label>
          <input type="text" id="seller-name" placeholder="Staff name"
            autocomplete="off" oninput="updatePrintPartyRow()">
        </div>
      </div>
      <div class="party-block">
        <h4 class="party-label">Customer</h4>
        <div class="form-row">
          <div class="form-group">
            <label for="cust-name">Customer Name</label>
            <input type="text" id="cust-name" placeholder="Customer / Shop Name"
              autocomplete="off" oninput="updatePrintPartyRow()">
          </div>
          <div class="form-group">
            <label for="cust-phone">Phone</label>
            <input type="text" id="cust-phone" placeholder="0300-0000000"
              autocomplete="off" oninput="updatePrintPartyRow()">
          </div>
        </div>
      </div>
    </div>

    <!-- PRINT-ONLY party row -->
    <div class="print-only party-print-row">
      <div>
        <strong>Seller:</strong> <span id="print-seller">Admin</span>
        &nbsp;&nbsp;
        <strong>Customer:</strong> <span id="print-customer">Walk-in Customer</span>
      </div>
      <div><strong>Phone:</strong> <span id="print-phone">---</span></div>
    </div>

    <!-- ADD ITEM ROW -->
    <div class="add-item-row no-print">
      <h4 class="party-label">Add Item to Bill</h4>
      <div class="form-row item-add-form">
        <div class="form-group" style="flex:2;min-width:200px;">
          <label for="item-select">Select Item</label>
          <select id="item-select" onchange="onItemSelect()">
            <option value="">-- Choose Item --</option>
          </select>
        </div>
        <div class="form-group" style="min-width:90px;">
          <label for="item-qty">Quantity</label>
          <input type="number" id="item-qty" value="1" min="1" autocomplete="off">
        </div>
        <div class="form-group" style="min-width:110px;">
          <label for="item-rate">Rate (Rs.)</label>
          <input type="number" id="item-rate" placeholder="0.00"
            step="0.01" autocomplete="off">
        </div>
        <div class="form-group" style="min-width:120px;">
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
          <tr>
            <td colspan="6" style="text-align:center;padding:24px;color:#94a3b8;">
              No items added yet.
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- TOTALS -->
    <div class="invoice-totals">
      <div class="totals-left no-print">
        <div class="form-group">
          <label for="discount">Discount (Rs.)</label>
          <input type="number" id="discount" placeholder="0.00"
            step="0.01" min="0" oninput="recalculateTotals()" autocomplete="off">
        </div>
        <div class="form-group">
          <label for="cash-received">Cash Received (Rs.)</label>
          <input type="number" id="cash-received" placeholder="0.00"
            step="0.01" min="0" oninput="recalculateTotals()" autocomplete="off">
        </div>
      </div>
      <div class="totals-right">
        <table class="totals-table">
          <tr>
            <td class="totals-label">Subtotal:</td>
            <td class="totals-value">Rs. <span id="total-subtotal">0.00</span></td>
          </tr>
          <tr>
            <td class="totals-label">Tax (${billSettings.taxRate || 17}%):</td>
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

  <!-- ACTION BUTTONS -->
  <div class="invoice-actions no-print">
    <button type="button" class="btn btn-primary" onclick="printBill()">
      🖨️ Print Bill
    </button>
    <button type="button" class="btn btn-green" id="save-bill-btn" onclick="saveBill()">
      💾 Save Bill
    </button>
    <button type="button" class="btn btn-outline" onclick="clearBill()">
      🔄 Clear Bill
    </button>
    <a href="bills.html" class="btn btn-outline">📋 View All Bills</a>
  </div>`;

  // Auto fill seller name
  const user = getCurrentUser ? getCurrentUser() : null;
  const sellerEl = document.getElementById('seller-name');
  if (sellerEl && user) sellerEl.value = user.sellerName || 'Admin';

  updatePrintPartyRow();
}

/* =======================================================
   AUTO-INIT
   ======================================================= */
document.addEventListener('DOMContentLoaded', function () {
  const isBilling = window.location.pathname.includes('billing');
  if (!isBilling) return;

  window.addEventListener('dbReady', async function () {
    buildBillingPage();
    await loadBillSettings();
    await loadInventoryDropdown();
  });

  if (db !== null) {
    buildBillingPage();
    loadBillSettings().then(() => loadInventoryDropdown());
  }
});