/* =======================================================
   js/helpers.js
   Khuwaja Surgical — Global Helper / Utility Functions
   -------------------------------------------------------
   Pure utility functions with no side effects.
   No DOM access, no DB calls — just clean calculations
   and formatting used across all other modules.

   USED BY : inventory.js, billing.js, bills.js,
             print.js, backup.js, dashboard.js
   ======================================================= */

/* =======================================================
   1. BILL / INVOICE NUMBER GENERATOR
   ======================================================= */

/**
 * generateBillNumber(existingBills)
 * Generates a unique invoice number in the format:
 *   BILL-YYYYMMDD-001
 *   BILL-YYYYMMDD-002  (increments per day)
 *
 * @param {Array} existingBills - All bills from IndexedDB
 *                                (pass [] if none yet)
 * @returns {string} e.g. "BILL-20260311-007"
 */
function generateBillNumber(existingBills = []) {

    /* Build today's date stamp: YYYYMMDD */
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const datePart = `${yyyy}${mm}${dd}`;               // e.g. "20260311"

    /* Find bills created today and get the highest sequence */
    const prefix = `BILL-${datePart}-`;
    const todayBills = existingBills.filter(
        b => b.billNumber && b.billNumber.startsWith(prefix)
    );

    let nextSeq = 1;
    if (todayBills.length > 0) {
        /* Extract the numeric suffix and find the maximum */
        const seqNums = todayBills.map(b => {
            const parts = b.billNumber.split('-');
            return parseInt(parts[parts.length - 1]) || 0;
        });
        nextSeq = Math.max(...seqNums) + 1;
    }

    /* Zero-pad the sequence to 3 digits: 1 → "001" */
    const seqPart = String(nextSeq).padStart(3, '0');

    return `${prefix}${seqPart}`;   // e.g. "BILL-20260311-007"
}

/* =======================================================
   2. CURRENCY FORMATTER
   ======================================================= */

/**
 * formatCurrency(value, currency)
 * Formats a number as a currency string.
 *
 * @param {number|string} value    - The amount to format
 * @param {string}        currency - Currency code: 'PKR' | 'USD'
 *                                   Defaults to 'PKR'
 * @returns {string} e.g. "Rs. 1,250.00" or "$ 12.50"
 */
function formatCurrency(value, currency = 'PKR') {
    const num = parseFloat(value) || 0;

    /* Format with comma separators and 2 decimal places */
    const formatted = num.toLocaleString('en-PK', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });

    /* Prepend the correct symbol */
    const symbols = {
        PKR: 'Rs. ',
        USD: '$ ',
        GBP: '£ ',
        EUR: '€ ',
        AED: 'AED '
    };

    const symbol = symbols[currency] || (currency + ' ');
    return symbol + formatted;
}

/* =======================================================
   3. DATE FORMATTER
   ======================================================= */

/**
 * formatDate(date)
 * Converts any date value into a readable display string.
 *
 * @param {string|Date|number} date - ISO string, Date object,
 *                                    or timestamp
 * @returns {string} e.g. "11 Mar 2026"
 *          Returns "---" for null / invalid dates.
 */
function formatDate(date) {
    if (!date) return '---';

    const d = new Date(date);

    /* Check for invalid date */
    if (isNaN(d.getTime())) return '---';

    return d.toLocaleDateString('en-PK', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    });
}

/**
 * formatDateTime(date)
 * Like formatDate but also includes the time.
 *
 * @param {string|Date} date
 * @returns {string} e.g. "11 Mar 2026, 02:45 PM"
 */
function formatDateTime(date) {
    if (!date) return '---';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '---';

    return d.toLocaleDateString('en-PK', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });
}

/* =======================================================
   4. SUBTOTAL CALCULATOR
   ======================================================= */

/**
 * calculateSubtotal(items)
 * Sums the 'amount' field of every line item in a bill.
 * Each item must have: { rate, qty } or { amount }
 *
 * @param {Array} items - Array of bill line-item objects
 * @returns {number} Subtotal rounded to 2 decimal places
 *
 * Example item: { itemName:'Gloves', rate:500, qty:10, amount:5000 }
 */
function calculateSubtotal(items = []) {
    if (!Array.isArray(items) || items.length === 0) return 0;

    const total = items.reduce((sum, item) => {
        /* Use pre-calculated amount if present, otherwise compute */
        const amount = (item.amount !== undefined)
            ? parseFloat(item.amount)
            : (parseFloat(item.rate) || 0) * (parseInt(item.qty) || 0);

        return sum + (isNaN(amount) ? 0 : amount);
    }, 0);

    return parseFloat(total.toFixed(2));
}

/* =======================================================
   5. GRAND TOTAL CALCULATOR
   ======================================================= */

/**
 * calculateGrandTotal(subtotal, taxRate, discount)
 * Computes the final payable amount after tax and discount.
 *
 * Formula: grandTotal = subtotal + taxAmount - discount
 * Where:   taxAmount  = subtotal × (taxRate / 100)
 *
 * @param {number} subtotal - Net subtotal before tax/discount
 * @param {number} taxRate  - Tax percentage e.g. 17 (for 17%)
 * @param {number} discount - Flat discount amount in currency
 * @returns {object} {
 *   taxAmount   : number,
 *   grandTotal  : number,
 *   subtotal    : number,
 *   discount    : number,
 *   taxRate     : number
 * }
 */
function calculateGrandTotal(subtotal = 0, taxRate = 0, discount = 0) {
    const sub = parseFloat(subtotal) || 0;
    const rate = parseFloat(taxRate) || 0;
    const dis = parseFloat(discount) || 0;

    const taxAmount = parseFloat((sub * (rate / 100)).toFixed(2));
    const grandTotal = parseFloat((sub + taxAmount - dis).toFixed(2));

    return {
        subtotal: sub,
        taxRate: rate,
        taxAmount,
        discount: dis,
        grandTotal: Math.max(0, grandTotal) /* Never go below zero */
    };
}

/* =======================================================
   6. FORM VALIDATION
   ======================================================= */

/**
 * validateRequiredFields(formId)
 * Checks every input/select/textarea inside the given
 * form that has the HTML 'required' attribute.
 * Highlights empty fields with a red border.
 *
 * @param {string} formId - The id="" of the <form> element
 * @returns {object} { valid: boolean, errors: string[] }
 *
 * Example:
 *   const { valid, errors } = validateRequiredFields('item-form');
 *   if (!valid) { showToast(errors[0], 'warning'); return; }
 */
function validateRequiredFields(formId) {
    const form = document.getElementById(formId);
    if (!form) {
        return { valid: false, errors: [`Form #${formId} not found.`] };
    }

    const errors = [];
    const fields = form.querySelectorAll(
        'input[required], select[required], textarea[required]'
    );

    /* Reset all borders first */
    fields.forEach(f => f.style.borderColor = '');

    fields.forEach(field => {
        const value = field.value.trim();
        const label = field.labels?.[0]?.textContent?.trim()
            || field.placeholder
            || field.name
            || field.id
            || 'Field';

        if (!value) {
            /* Highlight the empty field */
            field.style.borderColor = '#dc2626';
            field.style.borderWidth = '2px';
            errors.push(`${label} is required.`);

            /* Auto-clear highlight when user starts typing */
            field.addEventListener('input', function clearError() {
                field.style.borderColor = '';
                field.removeEventListener('input', clearError);
            }, { once: true });
        }
    });

    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * validateEmail(email)
 * Basic email format check.
 *
 * @param {string} email
 * @returns {boolean}
 */
function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim());
}

/**
 * validatePositiveNumber(value)
 * Returns true if value is a finite number greater than 0.
 *
 * @param {*} value
 * @returns {boolean}
 */
function validatePositiveNumber(value) {
    const n = parseFloat(value);
    return !isNaN(n) && isFinite(n) && n > 0;
}

/* =======================================================
   7. TODAY'S DATE HELPERS
   ======================================================= */

/**
 * getTodayDate()
 * Returns today's date as a formatted display string.
 *
 * @returns {string} e.g. "11 Mar 2026"
 */
function getTodayDate() {
    return formatDate(new Date());
}

/**
 * getTodayISO()
 * Returns today's date in ISO format for DB storage
 * and <input type="date"> values.
 *
 * @returns {string} e.g. "2026-03-11"
 */
function getTodayISO() {
    return new Date().toISOString().split('T')[0];
}

/**
 * getTodayDisplayString()
 * Returns today's full display string with weekday.
 *
 * @returns {string} e.g. "Wednesday, 11 March 2026"
 */
function getTodayDisplayString() {
    return new Date().toLocaleDateString('en-PK', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });
}

/* =======================================================
   8. STRING UTILITIES
   ======================================================= */

/**
 * escapeHtml(str)
 * Escapes special HTML characters to prevent XSS.
 * Use on any user-supplied text rendered into innerHTML.
 *
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * truncateText(text, maxLength)
 * Shortens a string and appends "…" if it exceeds maxLength.
 *
 * @param {string} text
 * @param {number} maxLength - Default 30
 * @returns {string}
 */
function truncateText(text, maxLength = 30) {
    if (!text) return '';
    const str = String(text);
    return str.length > maxLength
        ? str.substring(0, maxLength) + '…'
        : str;
}

/**
 * capitalize(str)
 * Capitalizes the first letter of each word.
 *
 * @param {string} str
 * @returns {string} e.g. "surgical gloves" → "Surgical Gloves"
 */
function capitalize(str) {
    if (!str) return '';
    return String(str)
        .toLowerCase()
        .replace(/\b\w/g, c => c.toUpperCase());
}

/* =======================================================
   9. NUMBER UTILITIES
   ======================================================= */

/**
 * roundTo(value, decimals)
 * Rounds a number to the specified decimal places.
 *
 * @param {number} value
 * @param {number} decimals - Default 2
 * @returns {number}
 */
function roundTo(value, decimals = 2) {
    const factor = Math.pow(10, decimals);
    return Math.round((parseFloat(value) || 0) * factor) / factor;
}

/**
 * safeParseFloat(value, fallback)
 * Safely parses a float; returns fallback if invalid.
 *
 * @param {*}      value
 * @param {number} fallback - Default 0
 * @returns {number}
 */
function safeParseFloat(value, fallback = 0) {
    const n = parseFloat(value);
    return isNaN(n) ? fallback : n;
}

/**
 * safeParseInt(value, fallback)
 * Safely parses an integer; returns fallback if invalid.
 *
 * @param {*}      value
 * @param {number} fallback - Default 0
 * @returns {number}
 */
function safeParseInt(value, fallback = 0) {
    const n = parseInt(value, 10);
    return isNaN(n) ? fallback : n;
}

/* =======================================================
   10. SEARCH / FILTER HELPER
   ======================================================= */

/**
 * filterBySearchTerm(dataArray, searchTerm, fields)
 * Filters an array of objects by a search term across
 * multiple specified field names (case-insensitive).
 *
 * @param {Array}  dataArray  - The full data array
 * @param {string} searchTerm - User's search input
 * @param {Array}  fields     - Field names to search in
 * @returns {Array} Filtered array
 *
 * Example:
 *   filterBySearchTerm(items, 'glove', ['itemName','itemCode'])
 */
function filterBySearchTerm(dataArray, searchTerm, fields = []) {
    if (!Array.isArray(dataArray)) return [];
    if (!searchTerm || searchTerm.trim() === '') return dataArray;

    const q = searchTerm.trim().toLowerCase();

    return dataArray.filter(obj =>
        fields.some(field => {
            const val = obj[field];
            return val !== undefined
                && val !== null
                && String(val).toLowerCase().includes(q);
        })
    );
}

/* =======================================================
   11. BALANCE / PAYMENT HELPERS
   ======================================================= */

/**
 * calculateBalance(grandTotal, amountPaid)
 * Computes the balance (change to return or amount owed).
 * Positive = change to return to customer.
 * Negative = customer still owes money.
 *
 * @param {number} grandTotal
 * @param {number} amountPaid
 * @returns {number}
 */
function calculateBalance(grandTotal, amountPaid) {
    const total = safeParseFloat(grandTotal);
    const paid = safeParseFloat(amountPaid);
    return roundTo(paid - total, 2);
}

/* =======================================================
   12. LOCAL STORAGE HELPERS
   ======================================================= */

/**
 * lsSet(key, value)
 * Safely saves a value to localStorage (JSON-serialized).
 *
 * @param {string} key
 * @param {*}      value
 */
function lsSet(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
        console.warn('[Helpers] lsSet failed for key:', key, e);
    }
}

/**
 * lsGet(key, fallback)
 * Safely reads and JSON-parses a value from localStorage.
 *
 * @param {string} key
 * @param {*}      fallback - Returned if key not found
 * @returns {*}
 */
function lsGet(key, fallback = null) {
    try {
        const raw = localStorage.getItem(key);
        return raw !== null ? JSON.parse(raw) : fallback;
    } catch (e) {
        return fallback;
    }
}

/**
 * lsRemove(key)
 * Removes a key from localStorage.
 *
 * @param {string} key
 */
function lsRemove(key) {
    try {
        localStorage.removeItem(key);
    } catch (e) {
        console.warn('[Helpers] lsRemove failed for key:', key, e);
    }
}

/* =======================================================
   13. DOM HELPERS (light wrappers for common operations)
   ======================================================= */

/**
 * getEl(id)
 * Short alias for document.getElementById(id).
 *
 * @param {string} id
 * @returns {HTMLElement|null}
 */
function getEl(id) {
    return document.getElementById(id);
}

/**
 * setElText(id, text)
 * Safely sets textContent on an element by ID.
 *
 * @param {string} id
 * @param {string} text
 */
function setElText(id, text) {
    const el = getEl(id);
    if (el) el.textContent = text;
}

/**
 * setElValue(id, value)
 * Safely sets the .value property of an input/select.
 *
 * @param {string} id
 * @param {*}      value
 */
function setElValue(id, value) {
    const el = getEl(id);
    if (el) el.value = value;
}

/**
 * getElValue(id, fallback)
 * Safely reads .value from an input/select by ID.
 *
 * @param {string} id
 * @param {string} fallback - Returned if element missing
 * @returns {string}
 */
function getElValue(id, fallback = '') {
    const el = getEl(id);
    return el ? el.value : fallback;
}

/**
 * showEl(id)  /  hideEl(id)
 * Show or hide an element by setting display style.
 *
 * @param {string} id
 */
function showEl(id) {
    const el = getEl(id);
    if (el) el.style.display = '';
}
function hideEl(id) {
    const el = getEl(id);
    if (el) el.style.display = 'none';
}

/* =======================================================
   14. DEBOUNCE — for search inputs
   ======================================================= */

/**
 * debounce(fn, delay)
 * Returns a debounced version of fn that only fires
 * after 'delay' ms of inactivity.
 * Perfect for live search inputs.
 *
 * @param {Function} fn    - The function to debounce
 * @param {number}   delay - Milliseconds (default 300)
 * @returns {Function}
 *
 * Example:
 *   searchInput.addEventListener('input',
 *     debounce(handleSearch, 300));
 */
function debounce(fn, delay = 300) {
    let timer;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

console.log('[Helpers] helpers.js loaded ✓');