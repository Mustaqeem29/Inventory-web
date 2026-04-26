/* =======================================================
   js/dashboard.js
   Khuwaja Surgical — Dashboard Data Loader
   Reads REAL data from IndexedDB (db.js) and populates:
     - Today's date display
     - Summary cards (Total Items, Low Stock, Sales, Bills)
     - Recent Bills table
     - Low Stock Alert table
   ======================================================= */

window.addEventListener('dbReady', async function () {

    // ── 1. Today's date ────────────────────────────────
    const dateEl = document.getElementById('dashboard-date');
    if (dateEl) {
        dateEl.textContent = new Date().toLocaleDateString('en-PK', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });
    }

    try {
        // ── 2. Load all data stores in parallel ────────
        const [items, bills, settings] = await Promise.all([
            getAllData('items'),
            getAllData('bills'),
            getAllData('settings')
        ]);

        const cfg = settings[0] || {};
        const lowLimit = cfg.lowStockLimit || 10;
        const currency = cfg.currency || 'PKR';

        // ── 3. Summary Cards ───────────────────────────

        // Total Items
        const totalEl = document.getElementById('card-total-items');
        if (totalEl) totalEl.textContent = items.length;

        // Low Stock Items count
        const lowItems = items.filter(it =>
            (parseInt(it.currentStock) || 0) <= lowLimit
        );
        const lowEl = document.getElementById('card-low-stock');
        if (lowEl) lowEl.textContent = lowItems.length;

        // Today's Sales (sum of bills created today)
        const todayISO = new Date().toISOString().split('T')[0];
        const todayBills = bills.filter(b =>
            b.createdAt && b.createdAt.startsWith(todayISO)
        );
        const todaySales = todayBills.reduce((sum, b) =>
            sum + (parseFloat(b.grandTotal) || 0), 0
        );
        const salesEl = document.getElementById('card-todays-sales');
        if (salesEl) salesEl.textContent = formatCurrency(todaySales, currency);

        // Total Bills (all time)
        const billsEl = document.getElementById('card-total-bills');
        if (billsEl) billsEl.textContent = bills.length.toLocaleString('en-PK');

        // ── 4. Recent Bills Table ──────────────────────
        const recentTbody = document.querySelector('#recent-bills-tbody') ||
            document.querySelector('.data-table tbody');

        // Find the Recent Bills section specifically
        const allTbodies = document.querySelectorAll('.data-table tbody');
        const recentBillsTbody = allTbodies[0]; // first table = Recent Bills

        if (recentBillsTbody) {
            recentBillsTbody.innerHTML = '';

            if (bills.length === 0) {
                recentBillsTbody.innerHTML = `
                    <tr>
                        <td colspan="5" style="text-align:center;color:#94a3b8;padding:20px;">
                            No bills yet. <a href="billing.html">Create your first bill →</a>
                        </td>
                    </tr>`;
            } else {
                // Show last 5 bills, newest first
                const recent = [...bills]
                    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
                    .slice(0, 5);

                recent.forEach(bill => {
                    const status = bill.paymentStatus || 'paid';
                    const badgeClass = status === 'paid' ? 'badge-green' :
                        status === 'pending' ? 'badge-yellow' : 'badge-red';
                    const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);

                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td>${escapeHtml(bill.billNumber || bill.invoiceNumber || ('#' + bill.id))}</td>
                        <td>${escapeHtml(bill.customerName || '—')}</td>
                        <td>${formatDate(bill.createdAt)}</td>
                        <td>${formatCurrency(bill.grandTotal || 0, currency)}</td>
                        <td><span class="badge ${badgeClass}">${statusLabel}</span></td>
                    `;
                    recentBillsTbody.appendChild(tr);
                });
            }
        }

        // ── 5. Low Stock Alert Table ───────────────────
        const lowStockTbody = document.getElementById('low-stock-tbody');

        if (lowStockTbody) {
            lowStockTbody.innerHTML = '';

            if (lowItems.length === 0) {
                lowStockTbody.innerHTML = `
                    <tr>
                        <td colspan="4" style="text-align:center;color:#16a34a;padding:20px;">
                            ✅ All items are well-stocked.
                        </td>
                    </tr>`;
            } else {
                // Sort: most critical (lowest stock) first
                const sorted = [...lowItems].sort((a, b) =>
                    (parseInt(a.currentStock) || 0) - (parseInt(b.currentStock) || 0)
                );

                sorted.forEach(item => {
                    const stock = parseInt(item.currentStock) || 0;
                    const badgeClass = stock <= 5 ? 'badge-red' : 'badge-yellow';
                    const unit = item.unit || 'pcs';

                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td>${escapeHtml(item.itemCode || '—')}</td>
                        <td>${escapeHtml(item.itemName || '—')}</td>
                        <td>${escapeHtml(item.category || '—')}</td>
                        <td><span class="badge ${badgeClass}">${stock} ${escapeHtml(unit)}</span></td>
                    `;
                    lowStockTbody.appendChild(tr);
                });
            }
        }

    } catch (err) {
        console.error('[Dashboard] Error loading dashboard data:', err);
    }
});
