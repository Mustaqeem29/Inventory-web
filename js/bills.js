/* =======================================================
   js/bills.js
   Khuwaja Surgical — Bills History
   Features: List all bills, search, view details, reprint.
   Depends on: db.js, auth.js, ui.js
   Add <script src="js/bills.js"></script> to bills.html
   ======================================================= */

/* -------------------------------------------------------
   STATE
   allBills — in-memory cache of all saved bills from DB
------------------------------------------------------- */
let allBills = [];
let billsSettings = {};

function getBillsCurrency() {
    return billsSettings.currency || 'PKR';
}

/* =======================================================
   LOAD BILLS
   ======================================================= */

/* -------------------------------------------------------
   loadAllBills()
   Fetches all bills from IndexedDB, caches in allBills,
   then renders the bills table.
------------------------------------------------------- */
async function loadAllBills() {
    try {
        showLoader();

        // Load settings for invoice prefix
        const settingsArr = await getAllData('settings');
        if (settingsArr.length > 0) billsSettings = settingsArr[0];

        // Load all bills
        allBills = await getAllData('bills');

        // Sort newest first by invoice number
        allBills.sort((a, b) => b.invoiceNumber - a.invoiceNumber);

        renderBillsTable(allBills);
        updateBillsSummary(allBills);

    } catch (err) {
        showToast('Failed to load bills: ' + err.message, 'error');
    } finally {
        hideLoader();
    }
}

/* =======================================================
   RENDER BILLS TABLE
   ======================================================= */

/* -------------------------------------------------------
   renderBillsTable(bills)
   Clears and redraws the bills list table.
   @param {Array} bills - Array of bill objects to display
------------------------------------------------------- */
function renderBillsTable(bills) {
    const tbody = document.getElementById('bills-tbody');
    if (!tbody) return;

    if (!bills || bills.length === 0) {
        tbody.innerHTML = `
      <tr>
        <td colspan="8"
          style="text-align:center;padding:28px;color:#94a3b8;">
          No bills found. Create your first bill on the
          <a href="billing.html" style="color:#0ea5e9;">billing page</a>.
        </td>
      </tr>`;
        return;
    }

    const prefix = billsSettings.invoicePrefix || '#';

    tbody.innerHTML = bills.map((bill, i) => `
    <tr>
      <td><strong>${prefix}${bill.invoiceNumber}</strong></td>
      <td>${escHtmlBl(bill.customerName || 'Walk-in Customer')}</td>
      <td>${escHtmlBl(bill.customerPhone || '---')}</td>
      <td>${escHtmlBl(bill.sellerName || '---')}</td>
      <td>${formatDate(bill.date)}</td>
      <td>${(bill.items || []).length}</td>
      <td><strong>${formatCurrency(bill.grandTotal, getBillsCurrency())}</strong></td>
      <td class="action-btns">
        <button class="btn btn-sm btn-outline"
          onclick="viewBillDetails(${bill.id})"
          title="View Details">👁️ View</button>
        <button class="btn btn-sm btn-outline"
          onclick="reprintBill(${bill.id})"
          title="Reprint">🖨️ Print</button>
        <button class="btn-icon btn-delete"
          onclick="confirmDeleteBill(${bill.id})"
          title="Delete">🗑️</button>
      </td>
    </tr>`
    ).join('');
}

/* -------------------------------------------------------
   updateBillsSummary(bills)
   Updates the summary pills at the bottom of the table.
------------------------------------------------------- */
function updateBillsSummary(bills) {
    const totalBills = bills.length;
    const totalRevenue = bills.reduce((sum, b) => sum + (b.grandTotal || 0), 0);

    const countEl = document.getElementById('summary-count');
    const revenueEl = document.getElementById('summary-revenue');
    if (countEl) countEl.textContent = totalBills;
    if (revenueEl) revenueEl.textContent = formatCurrency(totalRevenue, getBillsCurrency());
}

/* =======================================================
   SEARCH
   ======================================================= */

/* -------------------------------------------------------
   handleBillsSearch(e)
   Filters allBills by customer name OR invoice number.
------------------------------------------------------- */
function handleBillsSearch(e) {
    const term = e.target.value.trim().toLowerCase();

    if (!term) {
        renderBillsTable(allBills);
        updateBillsSummary(allBills);
        return;
    }

    const prefix = billsSettings.invoicePrefix || '#';

    const filtered = allBills.filter(bill => {
        const invNum = String(bill.invoiceNumber || '');
        const invFull = (prefix + invNum).toLowerCase();
        const custName = (bill.customerName || '').toLowerCase();
        const custPhone = (bill.customerPhone || '').toLowerCase();
        const seller = (bill.sellerName || '').toLowerCase();

        return (
            invNum.includes(term) ||
            invFull.includes(term) ||
            custName.includes(term) ||
            custPhone.includes(term) ||
            seller.includes(term)
        );
    });

    renderBillsTable(filtered);
    updateBillsSummary(filtered);
}

/* -------------------------------------------------------
   handleDateFilter()
   Filters bills between from-date and to-date inputs.
------------------------------------------------------- */
function handleDateFilter() {
    const fromVal = document.getElementById('filter-from')?.value;
    const toVal = document.getElementById('filter-to')?.value;

    if (!fromVal && !toVal) {
        renderBillsTable(allBills);
        updateBillsSummary(allBills);
        return;
    }

    const from = fromVal ? new Date(fromVal) : null;
    const to = toVal ? new Date(toVal) : null;

    const filtered = allBills.filter(bill => {
        const billDate = new Date(bill.date);
        if (from && billDate < from) return false;
        if (to && billDate > to) return false;
        return true;
    });

    renderBillsTable(filtered);
    updateBillsSummary(filtered);
}

/* -------------------------------------------------------
   clearFilters()
   Resets search and date inputs, re-renders all bills.
------------------------------------------------------- */
function clearFilters() {
    const search = document.getElementById('bills-search');
    const from = document.getElementById('filter-from');
    const to = document.getElementById('filter-to');
    if (search) search.value = '';
    if (from) from.value = '';
    if (to) to.value = '';
    renderBillsTable(allBills);
    updateBillsSummary(allBills);
}

/* =======================================================
   VIEW BILL DETAILS (Modal)
   ======================================================= */

/* -------------------------------------------------------
   viewBillDetails(id)
   Fetches a bill by ID and shows its full details
   in a modal overlay.
   @param {number} id - Bill ID in IndexedDB
------------------------------------------------------- */
async function viewBillDetails(id) {
    try {
        const bill = await getDataById('bills', id);
        if (!bill) { showToast('Bill not found.', 'error'); return; }

        const prefix = billsSettings.invoicePrefix || '#';
        const settings = billsSettings;

        // Build items rows
        const itemRows = (bill.items || []).map((item, i) => `
      <tr>
        <td style="padding:8px;color:#1e293b;border-bottom:1px solid #e2e8f0;vertical-align:middle;">${i + 1}</td>
        <td style="padding:8px;color:#1e293b;border-bottom:1px solid #e2e8f0;vertical-align:middle;font-weight:500;">${escHtmlBl(item.itemName)}</td>
        <td style="padding:8px;color:#1e293b;border-bottom:1px solid #e2e8f0;vertical-align:middle;">${item.rate?.toFixed(2)}</td>
        <td style="padding:8px;color:#1e293b;border-bottom:1px solid #e2e8f0;vertical-align:middle;">${item.qty}</td>
        <td style="padding:8px;color:#1e293b;border-bottom:1px solid #e2e8f0;vertical-align:middle;"><strong style="color:#0f172a;">${item.amount?.toFixed(2)}</strong></td>
      </tr>`
        ).join('');

        // Build modal HTML
        const modalHTML = `
      <div id="bill-modal-overlay" style="
        position:fixed;inset:0;background:rgba(0,0,0,0.6);
        display:flex;align-items:center;justify-content:center;
        z-index:10000;padding:16px;font-family:'Segoe UI',sans-serif;">

        <div style="
          background:#ffffff;border-radius:12px;width:100%;max-width:600px;
          max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.4);">

          <!-- Modal Header -->
          <div style="
            background:#1e293b;color:#fff;padding:16px 20px;
            border-radius:12px 12px 0 0;display:flex;
            justify-content:space-between;align-items:center;">
            <h3 style="margin:0;font-size:15px;">
              🧾 Invoice ${prefix}${bill.invoiceNumber}
            </h3>
            <button onclick="closeBillModal()"
              style="background:none;border:none;color:#fff;
                font-size:20px;cursor:pointer;padding:0 4px;">✕</button>
          </div>

          <!-- Modal Body -->
          <div style="padding:20px;">

            <!-- Shop Info -->
            <div style="text-align:center;margin-bottom:16px;
              padding-bottom:12px;border-bottom:2px dashed #e2e8f0;">
              <h2 style="font-size:18px;font-weight:800;color:#0ea5e9;margin:0;">
                🏥 ${escHtmlBl(settings.businessName || 'Khuwaja Surgical')}
              </h2>
              <p style="font-size:12px;color:#64748b;margin:4px 0 0;">
                ${escHtmlBl(settings.address || '')} |
                Ph: ${escHtmlBl(settings.phone || '')}
              </p>
            </div>

            <!-- Bill Info -->
            <div style="display:flex;justify-content:space-between;
              flex-wrap:wrap;gap:12px;margin-bottom:16px;font-size:13px;color:#1e293b;">
              <div style="line-height:1.8;">
                <p style="margin:0 0 4px 0;color:#1e293b;"><strong style="color:#334155;">Invoice:</strong> ${prefix}${bill.invoiceNumber}</p>
                <p style="margin:0 0 4px 0;color:#1e293b;"><strong style="color:#334155;">Date:</strong> ${formatDate(bill.date)}</p>
                <p style="margin:0;color:#1e293b;"><strong style="color:#334155;">Seller:</strong> ${escHtmlBl(bill.sellerName || '---')}</p>
              </div>
              <div style="line-height:1.8;">
                <p style="margin:0 0 4px 0;color:#1e293b;"><strong style="color:#334155;">Customer:</strong>
                  ${escHtmlBl(bill.customerName || 'Walk-in Customer')}</p>
                <p style="margin:0;color:#1e293b;"><strong style="color:#334155;">Phone:</strong>
                  ${escHtmlBl(bill.customerPhone || '---')}</p>
              </div>
            </div>

            <!-- Items Table -->
            <table style="width:100%;border-collapse:collapse;font-size:13px;
              margin-bottom:16px;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;">
              <thead>
                <tr style="background:#f1f5f9;">
                  <th style="padding:10px 8px;text-align:left;border-bottom:2px solid #e2e8f0;color:#334155;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.4px;">#</th>
                  <th style="padding:10px 8px;text-align:left;border-bottom:2px solid #e2e8f0;color:#334155;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.4px;">Item</th>
                  <th style="padding:10px 8px;text-align:left;border-bottom:2px solid #e2e8f0;color:#334155;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.4px;">Rate</th>
                  <th style="padding:10px 8px;text-align:left;border-bottom:2px solid #e2e8f0;color:#334155;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.4px;">Qty</th>
                  <th style="padding:10px 8px;text-align:left;border-bottom:2px solid #e2e8f0;color:#334155;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.4px;">Amount</th>
                </tr>
              </thead>
              <tbody>${itemRows}</tbody>
            </table>

            <!-- Totals -->
            <table style="width:100%;font-size:13px;border-collapse:collapse;border-top:2px dashed #e2e8f0;margin-top:4px;">
              <tr>
                <td style="padding:7px 12px;color:#64748b;font-weight:600;
                  text-align:right;width:60%;">Subtotal:</td>
                <td style="padding:7px 12px;text-align:right;color:#1e293b;font-weight:500;">
                  ${formatCurrency(bill.subtotal, getBillsCurrency())}</td>
              </tr>
              <tr>
                <td style="padding:7px 12px;color:#64748b;font-weight:600;
                  text-align:right;">Tax (${bill.taxRate || 17}%):</td>
                <td style="padding:7px 12px;text-align:right;color:#1e293b;font-weight:500;">
                  ${formatCurrency(bill.taxAmount, getBillsCurrency())}</td>
              </tr>
              <tr>
                <td style="padding:7px 12px;color:#64748b;font-weight:600;
                  text-align:right;">Discount:</td>
                <td style="padding:7px 12px;text-align:right;color:#1e293b;font-weight:500;">
                  ${formatCurrency(bill.discount, getBillsCurrency())}</td>
              </tr>
              <tr style="background:#f0fdf4;border-radius:6px;">
                <td style="padding:10px 12px;font-size:15px;font-weight:800;
                  text-align:right;color:#0f172a;">Grand Total:</td>
                <td style="padding:10px 12px;font-size:15px;font-weight:800;
                  text-align:right;color:#16a34a;">
                  ${formatCurrency(bill.grandTotal, getBillsCurrency())}</td>
              </tr>
              <tr>
                <td style="padding:7px 12px;color:#64748b;font-weight:600;
                  text-align:right;">Cash Received:</td>
                <td style="padding:7px 12px;text-align:right;color:#1e293b;font-weight:500;">
                  ${formatCurrency(bill.cashPaid, getBillsCurrency())}</td>
              </tr>
              <tr>
                <td style="padding:7px 12px;color:#64748b;font-weight:600;
                  text-align:right;">Balance:</td>
                <td style="padding:7px 12px;text-align:right;font-weight:600;
                  color:${bill.balance < 0 ? '#dc2626' : '#16a34a'}">
                  ${formatCurrency(bill.balance, getBillsCurrency())}</td>
              </tr>
            </table>

            <!-- Footer Note -->
            <p style="text-align:center;margin-top:16px;font-size:12px;
              color:#94a3b8;border-top:1px dashed #e2e8f0;padding-top:10px;">
              ${escHtmlBl(settings.footerMsg || 'Thank you for your business!')}
            </p>

          </div><!-- /modal body -->

          <!-- Modal Buttons -->
          <div style="padding:12px 20px 16px;display:flex;gap:10px;
            border-top:1px solid #e2e8f0;flex-wrap:wrap;">
            <button onclick="reprintBill(${bill.id})"
              class="btn btn-primary">🖨️ Reprint</button>
            <button onclick="closeBillModal()"
              class="btn btn-outline">✕ Close</button>
          </div>

        </div><!-- /dialog -->
      </div>`;

        // Inject modal into body
        const modalEl = document.createElement('div');
        modalEl.id = 'bill-modal-container';
        modalEl.innerHTML = modalHTML;
        document.body.appendChild(modalEl);

        // Close on overlay click
        document.getElementById('bill-modal-overlay')
            ?.addEventListener('click', function (e) {
                if (e.target === this) closeBillModal();
            });

    } catch (err) {
        console.error('[Bills] viewBillDetails error:', err);
        showToast('Could not load bill details.', 'error');
    }
}

/* -------------------------------------------------------
   closeBillModal()
   Removes the bill details modal from the DOM.
------------------------------------------------------- */
function closeBillModal() {
    document.getElementById('bill-modal-container')?.remove();
}

/* =======================================================
   REPRINT BILL
   ======================================================= */

/* -------------------------------------------------------
   reprintBill(id)
   Opens the billing page with the bill pre-loaded for
   printing. Stores the bill ID in sessionStorage and
   billing.js will pick it up to render a print preview.
   @param {number} id - Bill ID in IndexedDB
------------------------------------------------------- */
async function reprintBill(id) {
    try {
        const bill = await getDataById('bills', id);
        if (!bill) { showToast('Bill not found.', 'error'); return; }

        // Store bill data in sessionStorage for billing.js to read
        sessionStorage.setItem('ks_reprint_bill', JSON.stringify(bill));

        // Open billing page in new tab for printing
        window.open('billing.html?reprint=1', '_blank');

    } catch (err) {
        showToast('Could not open bill for reprinting.', 'error');
    }
}

/* =======================================================
   DELETE BILL
   ======================================================= */

/* -------------------------------------------------------
   confirmDeleteBill(id)
   Shows confirmation dialog, then deletes the bill.
   Note: Deleting a bill does NOT restore stock.
   @param {number} id - Bill ID to delete
------------------------------------------------------- */
async function confirmDeleteBill(id) {
    const bill = allBills.find(b => b.id === id);
    const prefix = billsSettings.invoicePrefix || '#';
    const label = bill ? `Invoice ${prefix}${bill.invoiceNumber}` : 'this bill';

    const confirmed = await showConfirm(
        `Delete ${label}? This only removes the record — it does not restore stock.`
    );
    if (!confirmed) return;

    try {
        showLoader();
        await deleteData('bills', id);
        showToast(`${label} deleted.`, 'success');
        await loadAllBills();
    } catch (err) {
        showToast('Could not delete bill.', 'error');
    } finally {
        hideLoader();
    }
}

/* =======================================================
   UTILITY
   ======================================================= */

/* escHtmlBl(str) — escape HTML special characters */
function escHtmlBl(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/* =======================================================
   BUILD BILLS PAGE — inject HTML & wire events
   ======================================================= */

/* -------------------------------------------------------
   buildBillsPage()
   Injects the bills history interface into .page-content
   and wires all event listeners.
------------------------------------------------------- */
function buildBillsPage() {
    const main = document.querySelector('.page-content');
    if (!main) return;

    main.innerHTML = `
    <div class="section-block">

      <!-- Header row -->
      <div class="section-header-row">
        <h3 class="section-title">📋 Invoice History</h3>
        <a href="billing.html" class="btn btn-primary btn-sm">➕ New Bill</a>
      </div>

      <!-- Search & Filter Bar -->
      <div class="filter-bar" style="margin-bottom:14px;">
        <input type="text" id="bills-search"
          placeholder="🔍 Search by customer, bill number..."
          class="search-input"
          style="flex:1;min-width:200px;">
        <input type="date" id="filter-from"
          class="filter-date" title="From Date">
        <input type="date" id="filter-to"
          class="filter-date" title="To Date">
        <button class="btn btn-outline btn-sm"
          onclick="handleDateFilter()">Filter</button>
        <button class="btn btn-outline btn-sm"
          onclick="clearFilters()">Clear</button>
      </div>

      <!-- Bills Table -->
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Bill #</th>
              <th>Customer</th>
              <th>Phone</th>
              <th>Seller</th>
              <th>Date</th>
              <th>Items</th>
              <th>Total Amount</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="bills-tbody">
            <tr>
              <td colspan="8"
                style="text-align:center;padding:24px;color:#94a3b8;">
                Loading bills...
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Summary Row -->
      <div class="bills-summary" style="margin-top:14px;">
        <div class="summary-pill">
          Total Bills: <strong id="summary-count">0</strong>
        </div>
        <div class="summary-pill">
          Total Revenue: <strong id="summary-revenue">Rs. 0.00</strong>
        </div>
      </div>

    </div>`;

    // ---- Wire search input ----
    document.getElementById('bills-search')
        ?.addEventListener('input', handleBillsSearch);
}

/* =======================================================
   AUTO-INIT on DOM ready (bills.html only)
   ======================================================= */
document.addEventListener('DOMContentLoaded', function () {
    if (!window.location.pathname.includes('bills')) return;

    // Wait for DB to be ready
    const wait = setInterval(() => {
        if (db !== null) {
            clearInterval(wait);
            buildBillsPage();
            loadAllBills();
        }
    }, 50);
});
