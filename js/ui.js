/* =======================================================
   js/ui.js
   Khuwaja Surgical — UI & Interface Handler
   Handles: dark mode, sidebar toggle, mobile nav,
   helper utilities, and general page interactions.

   DEPENDENCIES: db.js and auth.js must load first.
   ======================================================= */

// ---- localStorage keys ----
const THEME_KEY = 'ksTheme';       // Saved value: 'dark' or 'light'
const SIDEBAR_KEY = 'ksSidebarOpen'; // Saved value: 'true' or 'false'

/* =======================================================
   DARK MODE
   ======================================================= */

/* -------------------------------------------------------
   applyTheme(theme)
   Enables or disables the dark-mode.css stylesheet,
   updates the toggle button icon, saves to localStorage.
   @param {string} theme - 'dark' or 'light'
------------------------------------------------------- */
function applyTheme(theme) {
    const darkStylesheet = document.getElementById('dark-mode-css');
    const toggleBtn = document.getElementById('dark-toggle');

    if (theme === 'dark') {
        // Enable dark mode stylesheet
        if (darkStylesheet) darkStylesheet.disabled = false;
        document.body.classList.add('dark-mode-on');
        if (toggleBtn) toggleBtn.textContent = '☀️'; // Sun icon = click to go light
        localStorage.setItem(THEME_KEY, 'dark');
        console.log('[UI] Dark mode ON');

    } else {
        // Disable dark mode stylesheet (back to light)
        if (darkStylesheet) darkStylesheet.disabled = true;
        document.body.classList.remove('dark-mode-on');
        if (toggleBtn) toggleBtn.textContent = '🌙'; // Moon icon = click to go dark
        localStorage.setItem(THEME_KEY, 'light');
        console.log('[UI] Light mode ON');
    }
}

/* -------------------------------------------------------
   toggleDarkMode()
   Reads current saved theme and switches to opposite.
   Called when the dark mode button is clicked.
------------------------------------------------------- */
function toggleDarkMode() {
    const current = localStorage.getItem(THEME_KEY) || 'light';
    applyTheme(current === 'dark' ? 'light' : 'dark');
}

/* -------------------------------------------------------
   loadSavedTheme()
   Reads theme preference from localStorage and applies it.
   Called once on every page load to restore user preference.
------------------------------------------------------- */
function loadSavedTheme() {
    const saved = localStorage.getItem(THEME_KEY) || 'light';
    applyTheme(saved);
}

/* =======================================================
   SIDEBAR TOGGLE (Mobile)
   ======================================================= */

/* -------------------------------------------------------
   openSidebar() / closeSidebar() / toggleSidebar()
   Controls the mobile sidebar open/close state
   by adding or removing the CSS class 'open'.
------------------------------------------------------- */
function openSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.classList.add('open');
}

function closeSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.classList.remove('open');
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;
    sidebar.classList.contains('open') ? closeSidebar() : openSidebar();
}

/* -------------------------------------------------------
   initClickOutsideCloseSidebar()
   Closes the sidebar when user clicks outside of it
   on mobile screens. Called once during page init.
------------------------------------------------------- */
function initClickOutsideCloseSidebar() {
    document.addEventListener('click', function (e) {
        const sidebar = document.getElementById('sidebar');
        const menuToggle = document.getElementById('menu-toggle');
        if (!sidebar) return;

        // Close if sidebar is open and click was outside it
        if (
            sidebar.classList.contains('open') &&
            !sidebar.contains(e.target) &&
            e.target !== menuToggle
        ) {
            closeSidebar();
        }
    });
}

/* =======================================================
   ACTIVE NAV LINK HIGHLIGHTER
   ======================================================= */

/* -------------------------------------------------------
   setActiveNavLink()
   Compares the current page filename to sidebar nav hrefs
   and marks the matching link as 'active'.
   Runs automatically on every page load.
------------------------------------------------------- */
function setActiveNavLink() {
    // Get just the filename (e.g. 'inventory.html')
    const currentPage = window.location.pathname.split('/').pop() || 'dashboard.html';

    document.querySelectorAll('.sidebar-nav .nav-link').forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('href') === currentPage) {
            link.classList.add('active');
        }
    });
}

/* =======================================================
   TOAST NOTIFICATION
   ======================================================= */

/* -------------------------------------------------------
   showToast(message, type)
   Shows a small auto-dismissing popup at the bottom right.
   @param {string} message - Text to show
   @param {string} type    - 'success' | 'error' | 'warning' | 'info'
------------------------------------------------------- */
function showToast(message, type = 'info') {

    // Remove any existing toast first
    const existing = document.getElementById('ks-toast');
    if (existing) existing.remove();

    // Background color per type
    const colors = {
        success: '#16a34a',
        error: '#dc2626',
        warning: '#d97706',
        info: '#0ea5e9'
    };

    // Build toast element
    const toast = document.createElement('div');
    toast.id = 'ks-toast';
    toast.textContent = message;
    toast.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    background: ${colors[type] || colors.info};
    color: #ffffff;
    padding: 12px 20px;
    border-radius: 6px;
    font-size: 13.5px;
    font-weight: 600;
    font-family: 'Segoe UI', sans-serif;
    box-shadow: 0 4px 16px rgba(0,0,0,0.25);
    z-index: 9999;
    max-width: 320px;
    animation: slideInToast 0.3s ease;
  `;

    // Add slide-in animation (only once)
    if (!document.getElementById('toast-style')) {
        const style = document.createElement('style');
        style.id = 'toast-style';
        style.textContent = `
      @keyframes slideInToast {
        from { transform: translateY(20px); opacity: 0; }
        to   { transform: translateY(0);   opacity: 1; }
      }
    `;
        document.head.appendChild(style);
    }

    document.body.appendChild(toast);

    // Auto-dismiss after 3 seconds
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

/* =======================================================
   CONFIRM DIALOG
   ======================================================= */

/* -------------------------------------------------------
   showConfirm(message)
   A styled replacement for window.confirm().
   Returns a Promise: resolves true (Yes) or false (No).
   @param {string} message - Question to ask the user
------------------------------------------------------- */
function showConfirm(message) {
    return new Promise((resolve) => {

        // Dark overlay behind the dialog
        const overlay = document.createElement('div');
        overlay.style.cssText = `
      position: fixed; inset: 0;
      background: rgba(0,0,0,0.5);
      display: flex; align-items: center; justify-content: center;
      z-index: 10000; font-family: 'Segoe UI', sans-serif;
    `;

        // Dialog box
        const box = document.createElement('div');
        box.style.cssText = `
      background: #ffffff; border-radius: 10px;
      padding: 28px 32px; max-width: 340px; width: 90%;
      text-align: center; box-shadow: 0 10px 40px rgba(0,0,0,0.3);
    `;

        box.innerHTML = `
      <div style="font-size:32px;margin-bottom:12px;">⚠️</div>
      <p style="font-size:14px;color:#1e293b;margin-bottom:24px;line-height:1.5;">
        ${message}
      </p>
      <div style="display:flex;gap:10px;justify-content:center;">
        <button id="confirm-yes" style="
          background:#dc2626;color:#fff;border:none;
          padding:9px 24px;border-radius:5px;font-size:13px;
          font-weight:700;cursor:pointer;">
          Yes, Delete
        </button>
        <button id="confirm-no" style="
          background:#f1f5f9;color:#1e293b;border:1.5px solid #e2e8f0;
          padding:9px 24px;border-radius:5px;font-size:13px;
          font-weight:600;cursor:pointer;">
          Cancel
        </button>
      </div>
    `;

        overlay.appendChild(box);
        document.body.appendChild(overlay);

        document.getElementById('confirm-yes').onclick = () => { overlay.remove(); resolve(true); };
        document.getElementById('confirm-no').onclick = () => { overlay.remove(); resolve(false); };
    });
}

/* =======================================================
   FORMAT HELPERS
   Reusable utilities used across inventory, billing, etc.
   ======================================================= */

/* formatCurrency(amount)
   Formats a number into Pakistani Rupees display format.
   @param {number} amount
   Returns: "Rs. 1,234.00"
*/
function formatCurrency(amount) {
    const num = parseFloat(amount) || 0;
    return 'Rs. ' + num.toLocaleString('en-PK', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

/* formatDate(dateString)
   Converts an ISO date string to a readable date.
   @param {string} dateString
   Returns: "11 Mar 2026"
*/
function formatDate(dateString) {
    if (!dateString) return '---';
    const d = new Date(dateString);
    return d.toLocaleDateString('en-PK', {
        day: '2-digit', month: 'short', year: 'numeric'
    });
}

/* getTodayString()
   Returns today's date as "DD-MM-YYYY".
   Used to pre-fill invoice date display fields.
*/
function getTodayString() {
    const d = new Date();
    const day = String(d.getDate()).padStart(2, '0');
    const mon = String(d.getMonth() + 1).padStart(2, '0');
    return `${day}-${mon}-${d.getFullYear()}`;
}

/* getTodayISO()
   Returns today's date as "YYYY-MM-DD".
   Used for <input type="date"> default values.
*/
function getTodayISO() {
    return new Date().toISOString().split('T')[0];
}

/* =======================================================
   SEARCH / FILTER HELPER
   ======================================================= */

/* -------------------------------------------------------
   filterData(data, term, fields)
   Filters an array of objects by a search term across
   multiple specified fields.
   @param {Array}  data   - Array of record objects
   @param {string} term   - User's search query
   @param {Array}  fields - Field names to search in
   Returns a filtered array of matching records.
------------------------------------------------------- */
function filterData(data, term, fields) {
    if (!term || term.trim() === '') return data; // No filter — return all
    const q = term.trim().toLowerCase();
    return data.filter(item =>
        fields.some(field => {
            const val = item[field];
            return val && String(val).toLowerCase().includes(q);
        })
    );
}

/* =======================================================
   LOADING SPINNER
   ======================================================= */

/* showLoader() / hideLoader()
   Full-page loading overlay for async operations.
   Show before a DB call, hide after it completes.
*/
function showLoader() {
    let loader = document.getElementById('ks-loader');
    if (!loader) {
        loader = document.createElement('div');
        loader.id = 'ks-loader';
        loader.style.cssText = `
      position: fixed; inset: 0;
      background: rgba(15,23,42,0.6);
      display: flex; align-items: center; justify-content: center;
      z-index: 9998; font-family: 'Segoe UI', sans-serif;
    `;
        loader.innerHTML = `
      <div style="text-align:center;color:#ffffff;">
        <div style="font-size:36px;margin-bottom:12px;
          animation:spin 1s linear infinite;display:inline-block;">⏳</div>
        <div style="font-size:14px;opacity:0.8;">Loading...</div>
      </div>
    `;
        // Add spin animation (only once)
        if (!document.getElementById('loader-style')) {
            const s = document.createElement('style');
            s.id = 'loader-style';
            s.textContent = `@keyframes spin {
        from { transform: rotate(0deg); }
        to   { transform: rotate(360deg); }
      }`;
            document.head.appendChild(s);
        }
        document.body.appendChild(loader);
    }
    loader.style.display = 'flex';
}

function hideLoader() {
    const loader = document.getElementById('ks-loader');
    if (loader) loader.style.display = 'none';
}

/* =======================================================
   INIT — RUNS ON EVERY PAGE LOAD
   ======================================================= */
document.addEventListener('DOMContentLoaded', function () {

    // 1. Restore saved dark/light theme immediately
    loadSavedTheme();

    // 2. Wire the dark mode toggle button
    const darkBtn = document.getElementById('dark-toggle');
    if (darkBtn) darkBtn.addEventListener('click', toggleDarkMode);

    // 3. Wire the hamburger sidebar toggle (mobile)
    const menuBtn = document.getElementById('menu-toggle');
    if (menuBtn) menuBtn.addEventListener('click', toggleSidebar);

    // 4. Highlight the correct nav link for current page
    setActiveNavLink();

    // 5. Close sidebar when clicking outside on mobile
    initClickOutsideCloseSidebar();

    // 6. Auto-fill any elements with class 'today-date' with readable date
    document.querySelectorAll('.today-date').forEach(el => {
        el.textContent = getTodayString();
    });

    // 7. Auto-fill date inputs that have the data-today attribute
    document.querySelectorAll('input[data-today]').forEach(el => {
        el.value = getTodayISO();
    });

    console.log('[UI] Interface initialized.');
});