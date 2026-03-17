/* =======================================================
   js/print.js
   Khuwaja Surgical — Print Engine
   -------------------------------------------------------
   Handles all printing for the application:
     • printInvoice(billId)        — print a saved bill
     • createPrintableInvoiceHTML  — build receipt HTML
     • printInventoryList(items)   — print stock report

   DEPENDS ON : db.js, helpers.js
   USAGE      : <script src="js/print.js"></script>
                on billing.html, bills.html, inventory.html
   ======================================================= */

/* =======================================================
   1. PRINT A SAVED BILL BY ID
   ======================================================= */

/**
 * printInvoice(billId)
 * Loads a bill from IndexedDB by its ID, fetches the
 * business settings, builds a printable HTML receipt,
 * injects it into a hidden iframe, then triggers print.
 *
 * @param {number} billId - The IndexedDB primary key of the bill
 */
async function printInvoice(billId) {
    try {
        /* Show loading indicator */
        if (typeof showLoader === 'function') showLoader();

        /* ---- Fetch bill and settings from DB in parallel ---- */
        const [bill, settingsArr] = await Promise.all([
            getDataById('bills', billId),
            getAllData('settings')
        ]);

        if (!bill) {
            if (typeof showToast === 'function')
                showToast('Bill not found. Cannot print.', 'error');
            return;
        }

        const settings = settingsArr[0] || {};

        /* ---- Build the printable HTML ---- */
        const html = createPrintableInvoiceHTML(bill, settings);

        /* ---- Print via hidden iframe ---- */
        triggerPrintFromHTML(html, `Invoice-${bill.billNumber || bill.id}`);

    } catch (err) {
        console.error('[Print] printInvoice error:', err);
        if (typeof showToast === 'function')
            showToast('Could not print invoice: ' + err.message, 'error');
    } finally {
        if (typeof hideLoader === 'function') hideLoader();
    }
}

/* =======================================================
   2. BUILD PRINTABLE INVOICE HTML
   ======================================================= */

/**
 * createPrintableInvoiceHTML(billData, settings)
 * Generates a complete, self-contained HTML string for
 * a POS-style receipt / invoice.
 * The HTML includes inline CSS so it prints correctly
 * regardless of the page's stylesheet.
 *
 * @param {object} billData - Full bill record from IndexedDB
 * @param {object} settings - Business settings record
 * @returns {string} Complete HTML document string
 */
function createPrintableInvoiceHTML(billData, settings = {}) {

    /* ---- Destructure bill fields with safe defaults ---- */
    const {
        billNumber = billData.invoiceNumber || '---',
        date = getTodayISO(),
        sellerName = 'Admin',
        customerName = 'Walk-in Customer',
        customerPhone = '',
        items = [],
        subtotal = 0,
        taxRate = settings.taxRate || 17,
        taxAmount = 0,
        discount = 0,
        grandTotal = 0,
        cashPaid = billData.amountPaid || 0,
        balance = 0
    } = billData;

    /* ---- Business info from settings ---- */
    const bizName = escapeHtml(settings.businessName || 'Khuwaja Surgical');
    const bizAddress = escapeHtml(settings.address || 'Main Bazar, Sukkur, Sindh');
    const bizPhone = escapeHtml(settings.phone || '');
    const footerMsg = escapeHtml(settings.footerMsg || 'Thank you for your business!');
    const currency = settings.currency || 'PKR';
    const showTax = settings.showTax !== false;
    const showFooter = settings.showFooter !== false;

    /* ---- Build items table rows ---- */
    const itemRows = (Array.isArray(items) ? items : []).map((item, i) => {
        const rate = safeParseFloat(item.rate);
        const qty = safeParseInt(item.qty);
        const amount = safeParseFloat(item.amount || (rate * qty));
        return `
      <tr>
        <td class="tc">${i + 1}</td>
        <td>${escapeHtml(item.itemName || '')}</td>
        <td class="tr">${formatCurrency(rate, currency)}</td>
        <td class="tc">${qty}</td>
        <td class="tr"><strong>${formatCurrency(amount, currency)}</strong></td>
      </tr>`;
    }).join('');

    /* ---- Build totals section ---- */
    const taxRow = showTax ? `
    <tr>
      <td colspan="2" class="tl">Tax (${taxRate}%)</td>
      <td class="tr">${formatCurrency(taxAmount, currency)}</td>
    </tr>` : '';

    const discountRow = (parseFloat(discount) > 0) ? `
    <tr>
      <td colspan="2" class="tl">Discount</td>
      <td class="tr">- ${formatCurrency(discount, currency)}</td>
    </tr>` : '';

    const footerRow = showFooter
        ? `<p class="footer-msg">${footerMsg}</p>`
        : '';

    /* ---- Assemble complete HTML document ---- */
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invoice ${escapeHtml(String(billNumber))}</title>
  <style>
    /* ===== RECEIPT PRINT STYLES ===== */
    @page {
      size: 80mm auto;   /* POS receipt width */
      margin: 4mm 3mm;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: 11px;
      line-height: 1.45;
      color: #000;
      background: #fff;
      width: 80mm;
    }

    /* ---- Header ---- */
    .header {
      text-align: center;
      border-bottom: 2px dashed #000;
      padding-bottom: 6px;
      margin-bottom: 6px;
    }
    .shop-name {
      font-size: 16px;
      font-weight: 900;
      letter-spacing: 0.5px;
      margin-bottom: 3px;
    }
    .shop-address, .shop-phone {
      font-size: 10px;
      color: #333;
    }

    /* ---- Invoice meta ---- */
    .meta-table {
      width: 100%;
      font-size: 10.5px;
      margin: 5px 0;
      border-collapse: collapse;
    }
    .meta-table td { padding: 1px 0; }
    .meta-label { font-weight: bold; width: 45%; }

    /* ---- Divider ---- */
    .divider {
      border: none;
      border-top: 1px dashed #666;
      margin: 5px 0;
    }
    .divider-solid {
      border: none;
      border-top: 2px solid #000;
      margin: 5px 0;
    }

    /* ---- Items table ---- */
    .items-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10.5px;
      margin: 4px 0;
    }
    .items-table thead tr {
      background: #000;
      color: #fff;
    }
    .items-table th {
      padding: 4px 3px;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    .items-table td {
      padding: 3px 3px;
      border-bottom: 1px dotted #ccc;
      vertical-align: top;
    }
    .items-table tbody tr:last-child td {
      border-bottom: none;
    }

    /* ---- Totals table ---- */
    .totals-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11px;
      margin-top: 4px;
    }
    .totals-table td { padding: 2px 3px; }
    .totals-table .tl { text-align: left; }
    .totals-table .tr { text-align: right; font-weight: bold; }

    /* ---- Grand Total row ---- */
    .grand-row td {
      background: #000;
      color: #fff;
      padding: 5px 3px;
      font-size: 13px;
      font-weight: 900;
    }

    /* ---- Balance row ---- */
    .balance-row td {
      font-size: 12px;
      font-weight: bold;
      padding: 3px;
      border-top: 1px solid #000;
    }

    /* ---- Alignment helpers ---- */
    .tl { text-align: left; }
    .tc { text-align: center; }
    .tr { text-align: right; }

    /* ---- Footer ---- */
    .footer {
      text-align: center;
      margin-top: 8px;
      padding-top: 6px;
      border-top: 2px dashed #000;
      font-size: 10px;
      color: #444;
    }
    .footer-msg { margin-bottom: 2px; }
    .footer-shop { font-weight: bold; font-size: 11px; }
  </style>
</head>
<body>

  <!-- ===== SHOP HEADER ===== -->
  <div class="header">
    <div class="shop-name">🏥 ${bizName}</div>
    ${bizAddress ? `<div class="shop-address">${bizAddress}</div>` : ''}
    ${bizPhone ? `<div class="shop-phone">Ph: ${bizPhone}</div>` : ''}
  </div>

  <!-- ===== INVOICE META ===== -->
  <table class="meta-table">
    <tr>
      <td class="meta-label">Invoice #:</td>
      <td>${escapeHtml(String(billNumber))}</td>
    </tr>
    <tr>
      <td class="meta-label">Date:</td>
      <td>${formatDate(date)}</td>
    </tr>
    <tr>
      <td class="meta-label">Seller:</td>
      <td>${escapeHtml(sellerName)}</td>
    </tr>
  </table>

  <hr class="divider">

  <!-- ===== CUSTOMER INFO ===== -->
  <table class="meta-table">
    <tr>
      <td class="meta-label">Customer:</td>
      <td>${escapeHtml(customerName)}</td>
    </tr>
    ${customerPhone ? `
    <tr>
      <td class="meta-label">Phone:</td>
      <td>${escapeHtml(customerPhone)}</td>
    </tr>` : ''}
  </table>

  <hr class="divider-solid">

  <!-- ===== ITEMS TABLE ===== -->
  <table class="items-table">
    <thead>
      <tr>
        <th class="tc">#</th>
        <th class="tl">Item</th>
        <th class="tr">Rate</th>
        <th class="tc">Qty</th>
        <th class="tr">Amt</th>
      </tr>
    </thead>
    <tbody>
      ${itemRows || `<tr><td colspan="5" class="tc">No items.</td></tr>`}
    </tbody>
  </table>

  <hr class="divider-solid">

  <!-- ===== TOTALS ===== -->
  <table class="totals-table">
    <tr>
      <td colspan="2" class="tl">Subtotal</td>
      <td class="tr">${formatCurrency(subtotal, currency)}</td>
    </tr>
    ${taxRow}
    ${discountRow}
  </table>

  <hr class="divider">

  <!-- Grand Total -->
  <table class="totals-table">
    <tr class="grand-row">
      <td colspan="2" class="tl">GRAND TOTAL</td>
      <td class="tr">${formatCurrency(grandTotal, currency)}</td>
    </tr>
  </table>

  <table class="totals-table" style="margin-top:3px;">
    <tr>
      <td colspan="2" class="tl">Cash Received</td>
      <td class="tr">${formatCurrency(cashPaid, currency)}</td>
    </tr>
    <tr class="balance-row">
      <td colspan="2" class="tl">Balance</td>
      <td class="tr">${formatCurrency(Math.abs(balance), currency)}
        ${parseFloat(balance) < 0 ? ' (Due)' : ' (Change)'}
      </td>
    </tr>
  </table>

  <!-- ===== FOOTER ===== -->
  ${showFooter ? `
  <div class="footer">
    ${footerRow}
    <div class="footer-shop">${bizName}</div>
    ${bizPhone ? `<div>${bizPhone}</div>` : ''}
  </div>` : ''}

  <!-- Auto-print when iframe loads -->
  <script>
    window.onload = function() { window.print(); };
  <\/script>

</body>
</html>`;
}

/* =======================================================
   3. PRINT INVENTORY LIST
   ======================================================= */

/**
 * printInventoryList(items)
 * Generates and prints a formatted stock / inventory
 * report for all items passed in.
 *
 * @param {Array}  items    - Array of item objects from DB
 * @param {object} settings - Business settings (optional)
 */
function printInventoryList(items = [], settings = {}) {
    if (!items || items.length === 0) {
        if (typeof showToast === 'function')
            showToast('No items to print.', 'warning');
        return;
    }

    const bizName = escapeHtml(settings.businessName || 'Khuwaja Surgical');
    const currency = settings.currency || 'PKR';
    const today = getTodayDate();

    /* ---- Build table rows ---- */
    const rows = items.map((item, i) => {
        const stock = safeParseInt(item.currentStock);
        const lowLimit = safeParseInt(settings.lowStockLimit || 10);
        const status = stock <= 0
            ? 'OUT'
            : stock <= lowLimit
                ? 'LOW'
                : 'OK';
        const statusStyle = stock <= 0
            ? 'color:#dc2626;font-weight:bold;'
            : stock <= lowLimit
                ? 'color:#d97706;font-weight:bold;'
                : 'color:#16a34a;';

        return `
      <tr>
        <td>${i + 1}</td>
        <td>${escapeHtml(item.itemCode || '')}</td>
        <td>${escapeHtml(item.itemName || '')}</td>
        <td>${escapeHtml(item.category || '')}</td>
        <td style="text-align:right;">${formatCurrency(item.buyingRate, currency)}</td>
        <td style="text-align:right;">${formatCurrency(item.sellingRate, currency)}</td>
        <td style="text-align:center;">${stock}</td>
        <td style="text-align:center;${statusStyle}">${status}</td>
      </tr>`;
    }).join('');

    /* ---- Build full HTML ---- */
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Inventory Report — ${bizName}</title>
  <style>
    @page { size: A4 landscape; margin: 12mm 10mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI', Arial, sans-serif;
      font-size: 11px;
      color: #000;
      background: #fff;
    }
    .report-header {
      text-align: center;
      padding-bottom: 10px;
      border-bottom: 2px solid #000;
      margin-bottom: 10px;
    }
    .report-header h1 { font-size: 18px; margin-bottom: 3px; }
    .report-header p  { font-size: 11px; color: #555; }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11px;
    }
    thead tr { background: #1e293b; color: #fff; }
    th { padding: 6px 8px; text-align: left; white-space: nowrap; }
    td { padding: 5px 8px; border-bottom: 1px solid #e2e8f0; }
    tbody tr:nth-child(even) { background: #f8fafc; }
    .summary {
      margin-top: 12px;
      font-size: 11px;
      color: #444;
      border-top: 1px solid #ccc;
      padding-top: 6px;
    }
  </style>
</head>
<body>
  <div class="report-header">
    <h1>🏥 ${bizName} — Inventory Report</h1>
    <p>Generated: ${today} | Total Items: ${items.length}</p>
  </div>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Code</th>
        <th>Item Name</th>
        <th>Category</th>
        <th>Buy Rate</th>
        <th>Sell Rate</th>
        <th>Stock</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="summary">
    Total items: <strong>${items.length}</strong> |
    Low/Out of stock: <strong>
      ${items.filter(i => safeParseInt(i.currentStock) <= safeParseInt(settings.lowStockLimit || 10)).length}
    </strong>
  </div>
  <script>window.onload = function(){ window.print(); };<\/script>
</body>
</html>`;

    triggerPrintFromHTML(html, 'Inventory-Report');
}

/* =======================================================
   4. PRINT CURRENT BILLING PAGE (live bill)
   ======================================================= */

/**
 * printCurrentBill()
 * Prints the bill currently being created on billing.html.
 * Reads live state from billing.js (currentBillItems etc.)
 * and builds a fresh receipt from the current form values.
 */
async function printCurrentBill() {
    /* Guard: billing.js must be loaded */
    if (typeof currentBillItems === 'undefined' || currentBillItems.length === 0) {
        if (typeof showToast === 'function')
            showToast('Add items to the bill before printing.', 'warning');
        return;
    }

    try {
        if (typeof showLoader === 'function') showLoader();

        /* Load settings for business info */
        const settingsArr = await getAllData('settings');
        const settings = settingsArr[0] || {};
        const currency = settings.currency || 'PKR';

        /* Read form values */
        const sellerName = getElValue('seller-name', 'Admin');
        const customerName = getElValue('cust-name', 'Walk-in Customer');
        const customerPhone = getElValue('cust-phone', '');
        const invNumber = document.getElementById('inv-number')?.textContent || '---';
        const invDate = document.getElementById('inv-date')?.textContent
            || getTodayISO();
        const discount = safeParseFloat(getElValue('discount', '0'));
        const cashPaid = safeParseFloat(getElValue('cash-received', '0'));

        /* Calculate totals */
        const subtotal = calculateSubtotal(currentBillItems);
        const totals = calculateGrandTotal(subtotal, settings.taxRate || 17, discount);
        const balance = calculateBalance(totals.grandTotal, cashPaid);

        /* Build a bill data object (same shape as a saved bill) */
        const billData = {
            billNumber: invNumber,
            date: getTodayISO(),
            sellerName,
            customerName,
            customerPhone,
            items: currentBillItems,
            subtotal: totals.subtotal,
            taxRate: totals.taxRate,
            taxAmount: totals.taxAmount,
            discount: totals.discount,
            grandTotal: totals.grandTotal,
            cashPaid,
            balance
        };

        const html = createPrintableInvoiceHTML(billData, settings);
        triggerPrintFromHTML(html, `Invoice-${invNumber}`);

    } catch (err) {
        console.error('[Print] printCurrentBill error:', err);
        if (typeof showToast === 'function')
            showToast('Print failed: ' + err.message, 'error');
    } finally {
        if (typeof hideLoader === 'function') hideLoader();
    }
}

/* =======================================================
   5. CORE PRINT ENGINE — iframe-based printing
   ======================================================= */

/**
 * triggerPrintFromHTML(htmlString, title)
 * The core print mechanism.
 * Creates a hidden <iframe>, writes the HTML into it,
 * and triggers window.print() inside it.
 * This avoids altering the main page's DOM at all.
 *
 * @param {string} htmlString - Full HTML document to print
 * @param {string} title      - Used for iframe ID
 */
function triggerPrintFromHTML(htmlString, title = 'print') {

    /* Remove any previous print iframe */
    const existingFrame = document.getElementById('ks-print-frame');
    if (existingFrame) existingFrame.remove();

    /* Create a new hidden iframe */
    const iframe = document.createElement('iframe');
    iframe.id = 'ks-print-frame';
    iframe.name = title;
    iframe.style.cssText = `
    position: fixed;
    top: -9999px;
    left: -9999px;
    width: 1px;
    height: 1px;
    border: none;
    visibility: hidden;
  `;

    document.body.appendChild(iframe);

    /* Write HTML into the iframe */
    const doc = iframe.contentWindow?.document
        || iframe.contentDocument;

    if (!doc) {
        console.error('[Print] Could not access iframe document.');
        return;
    }

    doc.open();
    doc.write(htmlString);
    doc.close();

    /* The HTML itself calls window.print() via onload.
       We also set a fallback timeout here. */
    setTimeout(() => {
        try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
        } catch (e) {
            console.warn('[Print] iframe.print() fallback failed:', e);
        }
    }, 400);

    /* Clean up the iframe after printing */
    iframe.contentWindow?.addEventListener('afterprint', function () {
        setTimeout(() => iframe.remove(), 500);
    });
}

/* =======================================================
   6. KEYBOARD SHORTCUT — Ctrl+P / Cmd+P
   ======================================================= */

/**
 * Overrides the browser's default Ctrl+P on billing.html
 * to use our custom printCurrentBill() instead.
 */
document.addEventListener('keydown', function (e) {
    const onBillingPage = window.location.pathname.includes('billing');
    if (onBillingPage && (e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault();
        printCurrentBill();
    }
});

/* =======================================================
   7. AUTO-WIRE PRINT BUTTONS
   ======================================================= */

/**
 * wirePrintButtons()
 * Finds all elements with data-print-action attributes
 * and wires them automatically.
 *
 * data-print-action="current-bill"   → printCurrentBill()
 * data-print-action="inventory"      → printInventoryList()
 * data-print-action="invoice"
 *   data-bill-id="123"               → printInvoice(123)
 */
function wirePrintButtons() {
    document.querySelectorAll('[data-print-action]').forEach(btn => {
        btn.addEventListener('click', async function () {
            const action = this.dataset.printAction;

            if (action === 'current-bill') {
                await printCurrentBill();

            } else if (action === 'invoice') {
                const billId = parseInt(this.dataset.billId);
                if (billId) await printInvoice(billId);

            } else if (action === 'inventory') {
                const items = await getAllData('items');
                const settingsArr = await getAllData('settings');
                printInventoryList(items, settingsArr[0] || {});
            }
        });
    });
}

/* AUTO-INIT */
document.addEventListener('DOMContentLoaded', function () {
    wirePrintButtons();
    console.log('[Print] print.js loaded ✓');
});