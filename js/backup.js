/* =======================================================
   js/backup.js
   Khuwaja Surgical — Data Backup & Restore Engine
   -------------------------------------------------------
   Exports all IndexedDB data to a JSON file and restores
   it back from an uploaded JSON backup.

   FUNCTIONS:
     exportDatabaseToJSON()
     importDatabaseFromJSON(file)
     downloadBackupFile(data)
     restoreBackup(data)

   DEPENDS ON : db.js, helpers.js, ui.js
   USAGE      : <script src="js/backup.js"></script>
                on settings.html
   ======================================================= */

/* =======================================================
   1. EXPORT — Read all IndexedDB stores → JSON file
   ======================================================= */

/**
 * exportDatabaseToJSON()
 * Reads every store from IndexedDB (users, items, bills,
 * settings), packages it into a structured JSON backup
 * object, and triggers a file download.
 *
 * Passwords are stripped from the users export for
 * security. The backup is still fully restorable because
 * restoreBackup() handles missing passwords gracefully.
 */
async function exportDatabaseToJSON() {
    try {
        if (typeof showLoader === 'function') showLoader();
        if (typeof showToast === 'function') showToast('Preparing backup…', 'info');

        /* ---- Read all four stores simultaneously ---- */
        const [users, items, bills, settings] = await Promise.all([
            getAllData('users'),
            getAllData('items'),
            getAllData('bills'),
            getAllData('settings')
        ]);

        /* ---- Strip passwords from user records ---- */
        const safeUsers = users.map(u => {
            const { password, ...rest } = u;   // remove password key
            return rest;
        });

        /* ---- Build the backup envelope ---- */
        const backupPayload = {
            _meta: {
                appName: 'Khuwaja Surgical',
                appVersion: '1.0.0',
                exportedAt: new Date().toISOString(),
                exportedBy: (typeof getCurrentUser === 'function')
                    ? (getCurrentUser()?.sellerName || 'Unknown')
                    : 'Unknown',
                recordCounts: {
                    users: users.length,
                    items: items.length,
                    bills: bills.length,
                    settings: settings.length
                }
            },
            users: safeUsers,
            items,
            bills,
            settings
        };

        /* ---- Trigger the download ---- */
        downloadBackupFile(backupPayload);

        /* ---- Save last backup timestamp ---- */
        lsSet('ksLastBackup', new Date().toISOString());
        refreshBackupStats();

        if (typeof showToast === 'function') {
            showToast(
                `Backup downloaded: ${items.length} items, ${bills.length} bills.`,
                'success'
            );
        }

        console.log('[Backup] Export complete:', backupPayload._meta);

    } catch (err) {
        console.error('[Backup] exportDatabaseToJSON error:', err);
        if (typeof showToast === 'function')
            showToast('Export failed: ' + err.message, 'error');
    } finally {
        if (typeof hideLoader === 'function') hideLoader();
    }
}

/* =======================================================
   2. DOWNLOAD — create and trigger a .json file download
   ======================================================= */

/**
 * downloadBackupFile(data)
 * Serialises the backup object to pretty-printed JSON and
 * triggers a browser file download.
 *
 * @param {object} data - The full backup payload object
 */
function downloadBackupFile(data) {

    /* ---- Serialise to JSON string (2-space indent) ---- */
    const jsonString = JSON.stringify(data, null, 2);

    /* ---- Create a Blob and a temporary object URL ---- */
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    /* ---- Build the filename: khuwaja-backup-YYYY-MM-DD.json ---- */
    const today = getTodayISO();          // from helpers.js
    const filename = `khuwaja-backup-${today}.json`;

    /* ---- Create a temporary <a> and click it ---- */
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);

    /* ---- Release the object URL after download starts ---- */
    setTimeout(() => URL.revokeObjectURL(url), 2000);

    console.log('[Backup] Download triggered:', filename);
}

/* =======================================================
   3. IMPORT — read an uploaded .json file
   ======================================================= */

/**
 * importDatabaseFromJSON(file)
 * Reads the user-selected File object (from a file input),
 * validates it as a Khuwaja backup, prompts for confirmation,
 * then calls restoreBackup() to write data to IndexedDB.
 *
 * @param {File} file - The File object from <input type="file">
 */
function importDatabaseFromJSON(file) {

    /* ---- Validate file type ---- */
    if (!file) {
        if (typeof showToast === 'function')
            showToast('No file selected.', 'warning');
        return;
    }

    if (!file.name.toLowerCase().endsWith('.json')) {
        if (typeof showToast === 'function')
            showToast('Please select a .json backup file.', 'error');
        return;
    }

    /* ---- Use FileReader to read the file as text ---- */
    const reader = new FileReader();

    reader.onload = async function (e) {

        let parsed;

        /* ---- Parse JSON ---- */
        try {
            parsed = JSON.parse(e.target.result);
        } catch (jsonErr) {
            if (typeof showToast === 'function')
                showToast('Invalid JSON file. Could not parse.', 'error');
            console.error('[Backup] JSON parse error:', jsonErr);
            return;
        }

        /* ---- Validate backup structure ---- */
        const validation = validateBackupFile(parsed);
        if (!validation.valid) {
            if (typeof showToast === 'function')
                showToast('Invalid backup: ' + validation.reason, 'error');
            return;
        }

        /* ---- Show confirmation dialog ---- */
        const meta = parsed._meta || {};
        const exported = meta.exportedAt
            ? formatDateTime(meta.exportedAt)
            : 'Unknown date';

        const counts = meta.recordCounts || {};
        const msg =
            `Restore backup from ${exported}?\n\n` +
            `This will REPLACE your current data:\n` +
            `• ${counts.items || parsed.items?.length || 0} items\n` +
            `• ${counts.bills || parsed.bills?.length || 0} bills\n` +
            `• ${counts.settings || parsed.settings?.length || 0} settings\n\n` +
            `⚠️ Your current data will be overwritten.\n` +
            `Make sure you have exported a backup first!`;

        /* Use custom confirm dialog if available, else native */
        let confirmed;
        if (typeof showConfirm === 'function') {
            confirmed = await showConfirm(msg);
        } else {
            confirmed = window.confirm(msg);
        }

        if (!confirmed) {
            if (typeof showToast === 'function')
                showToast('Restore cancelled.', 'info');
            return;
        }

        /* ---- Proceed with restore ---- */
        await restoreBackup(parsed);
    };

    reader.onerror = function () {
        if (typeof showToast === 'function')
            showToast('Could not read the file. Please try again.', 'error');
        console.error('[Backup] FileReader error');
    };

    reader.readAsText(file);
}

/* =======================================================
   4. RESTORE — write backup data back to IndexedDB
   ======================================================= */

/**
 * restoreBackup(data)
 * Clears each IndexedDB store and re-populates it from
 * the backup data. IDs are stripped so IndexedDB assigns
 * fresh auto-increment IDs.
 *
 * Restore order: settings → items → bills
 * Users are only restored if the backup includes passwords.
 *
 * @param {object} data - Parsed backup JSON object
 */
async function restoreBackup(data) {

    const results = { items: 0, bills: 0, settings: 0, users: 0 };

    try {
        if (typeof showLoader === 'function') showLoader();
        if (typeof showToast === 'function') showToast('Restoring… please wait.', 'info');

        /* ---- 1. Restore SETTINGS ---- */
        if (Array.isArray(data.settings) && data.settings.length > 0) {
            await clearStore('settings');
            for (const record of data.settings) {
                const { id, createdAt, updatedAt, ...clean } = record;
                await addData('settings', clean);
                results.settings++;
            }
            console.log('[Backup] Settings restored:', results.settings);
        }

        /* ---- 2. Restore ITEMS ---- */
        if (Array.isArray(data.items) && data.items.length > 0) {
            await clearStore('items');
            for (const record of data.items) {
                const { id, updatedAt, ...clean } = record;
                await addData('items', clean);
                results.items++;
            }
            console.log('[Backup] Items restored:', results.items);
        }

        /* ---- 3. Restore BILLS ---- */
        if (Array.isArray(data.bills) && data.bills.length > 0) {
            await clearStore('bills');
            for (const record of data.bills) {
                const { id, updatedAt, ...clean } = record;
                await addData('bills', clean);
                results.bills++;
            }
            console.log('[Backup] Bills restored:', results.bills);
        }

        /* ---- 4. Restore USERS (only if passwords are present) ---- */
        if (Array.isArray(data.users) && data.users.length > 0) {
            const hasPasswords = data.users.some(u => u.password);

            if (hasPasswords) {
                await clearStore('users');
                for (const record of data.users) {
                    const { id, updatedAt, ...clean } = record;
                    await addData('users', clean);
                    results.users++;
                }
                console.log('[Backup] Users restored:', results.users);
            } else {
                /* Passwords were stripped at export — keep existing users */
                if (typeof showToast === 'function') {
                    showToast(
                        'User accounts were not restored (passwords not included in backup). ' +
                        'Your existing login still works.',
                        'info'
                    );
                }
            }
        }

        /* ---- 5. Re-seed default settings if none were restored ---- */
        if (results.settings === 0) {
            await seedDefaultSettings();
        }

        /* ---- Success ---- */
        const summary =
            `Restore complete! ` +
            `${results.items} items, ${results.bills} bills restored.`;

        if (typeof showToast === 'function') showToast(summary, 'success');
        console.log('[Backup] Restore complete:', results);

        /* Update the backup stats panel */
        refreshBackupStats();

        /* Reload the page after a short pause to reflect new data */
        setTimeout(() => window.location.reload(), 1800);

    } catch (err) {
        console.error('[Backup] restoreBackup error:', err);
        if (typeof showToast === 'function')
            showToast('Restore failed: ' + err.message, 'error');
    } finally {
        if (typeof hideLoader === 'function') hideLoader();
    }
}

/* =======================================================
   5. VALIDATION HELPER
   ======================================================= */

/**
 * validateBackupFile(data)
 * Checks that the parsed JSON has the expected structure.
 *
 * @param {*} data - Parsed JSON object
 * @returns {{ valid: boolean, reason: string }}
 */
function validateBackupFile(data) {
    if (!data || typeof data !== 'object') {
        return { valid: false, reason: 'File is not a valid JSON object.' };
    }

    /* Must have at least one of the main data arrays */
    if (!data.items && !data.bills && !data.settings) {
        return {
            valid: false,
            reason: 'File does not contain items, bills, or settings. ' +
                'Is this a Khuwaja Surgical backup file?'
        };
    }

    /* Each present key must be an array */
    for (const key of ['users', 'items', 'bills', 'settings']) {
        if (data[key] !== undefined && !Array.isArray(data[key])) {
            return { valid: false, reason: `"${key}" field is not an array.` };
        }
    }

    return { valid: true, reason: '' };
}

/* =======================================================
   6. CLEAR INDIVIDUAL STORES (Danger Zone)
   ======================================================= */

/**
 * confirmAndClearStore(storeName)
 * Shows a confirmation dialog, then wipes the chosen store.
 *
 * @param {string} storeName - 'items' | 'bills' | 'settings'
 */
async function confirmAndClearStore(storeName) {
    const label = capitalize(storeName);  // from helpers.js

    let confirmed;
    if (typeof showConfirm === 'function') {
        confirmed = await showConfirm(
            `Clear ALL ${label}? Every record in the ${storeName} store will be permanently deleted.`
        );
    } else {
        confirmed = window.confirm(
            `Clear all ${label}? This cannot be undone.`
        );
    }

    if (!confirmed) return;

    try {
        if (typeof showLoader === 'function') showLoader();
        await clearStore(storeName);
        if (typeof showToast === 'function')
            showToast(`All ${label} cleared successfully.`, 'success');
        refreshBackupStats();
    } catch (err) {
        if (typeof showToast === 'function')
            showToast('Could not clear ' + storeName + ': ' + err.message, 'error');
    } finally {
        if (typeof hideLoader === 'function') hideLoader();
    }
}

/**
 * confirmAndClearAllData()
 * Double-confirmed full data wipe (items + bills + settings).
 * Does NOT wipe users — preserves the admin login.
 */
async function confirmAndClearAllData() {
    /* First confirmation */
    let first;
    if (typeof showConfirm === 'function') {
        first = await showConfirm(
            'Clear ALL data? This will permanently delete all inventory, bills, and settings. Continue?'
        );
    } else {
        first = window.confirm('Clear ALL data? This cannot be undone!');
    }
    if (!first) return;

    /* Second confirmation — extra safety */
    let second;
    if (typeof showConfirm === 'function') {
        second = await showConfirm(
            'FINAL WARNING: All inventory and billing data will be lost forever. ' +
            'Are you absolutely sure you want to continue?'
        );
    } else {
        second = window.confirm('FINAL WARNING: This is irreversible. Are you sure?');
    }
    if (!second) return;

    try {
        if (typeof showLoader === 'function') showLoader();

        await clearStore('items');
        await clearStore('bills');
        await clearStore('settings');

        /* Re-seed minimal default settings so app still works */
        await seedDefaultSettings();

        if (typeof showToast === 'function')
            showToast('All data cleared. Default settings restored.', 'success');

        refreshBackupStats();
        setTimeout(() => window.location.reload(), 1500);

    } catch (err) {
        if (typeof showToast === 'function')
            showToast('Could not clear data: ' + err.message, 'error');
    } finally {
        if (typeof hideLoader === 'function') hideLoader();
    }
}

/* =======================================================
   7. SEED DEFAULT SETTINGS (called after clear-all)
   ======================================================= */

/**
 * seedDefaultSettings()
 * Inserts a minimal default settings record so the app
 * remains functional after a data wipe.
 */
async function seedDefaultSettings() {
    try {
        await addData('settings', {
            businessName: 'Khuwaja Surgical',
            address: 'Main Bazar, Sukkur, Sindh, Pakistan',
            phone: '0300-1234567',
            email: '',
            taxRate: 17,
            currency: 'PKR',
            lowStockLimit: 10,
            invoicePrefix: '#',
            invoiceStart: 1001,
            printWidth: '80mm',
            showLogo: true,
            showTax: true,
            showFooter: true,
            footerMsg: 'Thank you for your business! | Khuwaja Surgical'
        });
        console.log('[Backup] Default settings re-seeded.');
    } catch (err) {
        console.warn('[Backup] Could not seed default settings:', err.message);
    }
}

/* =======================================================
   8. BACKUP STATS PANEL
   ======================================================= */

/**
 * refreshBackupStats()
 * Updates the record-count badges in the backup UI panel.
 * Reads live counts from IndexedDB.
 */
async function refreshBackupStats() {
    try {
        const [items, bills, users, settings] = await Promise.all([
            getAllData('items'),
            getAllData('bills'),
            getAllData('users'),
            getAllData('settings')
        ]);

        setElText('stat-items', items.length + ' items');
        setElText('stat-bills', bills.length + ' bills');
        setElText('stat-users', users.length + ' users');
        setElText('stat-settings', settings.length + ' settings');

        const last = lsGet('ksLastBackup');
        setElText('stat-last-backup',
            last ? 'Last backup: ' + formatDateTime(last) : 'No backup yet'
        );

    } catch (err) {
        console.warn('[Backup] refreshBackupStats error:', err.message);
    }
}

/* =======================================================
   9. BUILD BACKUP UI — injected into settings.html
   ======================================================= */

/**
 * buildBackupUI()
 * Appends the Backup & Restore section to the settings
 * page content area. Wires all buttons and the file input.
 */
function buildBackupUI() {
    const main = document.querySelector('.page-content');
    if (!main || document.getElementById('backup-section')) return;

    const section = document.createElement('div');
    section.id = 'backup-section';
    section.className = 'section-block';
    section.innerHTML = `

    <h3 class="section-title">💾 Data Backup & Restore</h3>

    <!-- Stats Row -->
    <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:20px;">
      <div class="summary-pill">📦 <span id="stat-items">…</span></div>
      <div class="summary-pill">🧾 <span id="stat-bills">…</span></div>
      <div class="summary-pill">👤 <span id="stat-users">…</span></div>
      <div class="summary-pill">⚙️ <span id="stat-settings">…</span></div>
      <div class="summary-pill">🕐 <span id="stat-last-backup">…</span></div>
    </div>

    <!-- Export -->
    <div style="background:var(--bg-body);border:1px solid var(--border);
      border-radius:8px;padding:18px;margin-bottom:12px;">
      <h4 style="margin-bottom:6px;">📤 Export Backup</h4>
      <p style="font-size:13px;color:var(--text-secondary);margin-bottom:12px;">
        Download all inventory, bills, and settings as a single JSON file.
        Store this file safely — it is your complete data backup.
      </p>
      <button class="btn btn-primary" onclick="exportDatabaseToJSON()">
        ⬇️ Download Backup (.json)
      </button>
    </div>

    <!-- Import -->
    <div style="background:var(--bg-body);border:1px solid var(--border);
      border-radius:8px;padding:18px;margin-bottom:12px;">
      <h4 style="margin-bottom:6px;">📥 Restore Backup</h4>
      <p style="font-size:13px;color:var(--text-secondary);margin-bottom:6px;">
        Restore data from a previously exported .json backup file.
      </p>
      <p style="font-size:12px;color:#dc2626;font-weight:600;margin-bottom:12px;">
        ⚠️ Warning: This will overwrite your current data. Export a backup first!
      </p>
      <button class="btn btn-outline" onclick="document.getElementById('backup-file-input').click()">
        ⬆️ Select Backup File (.json)
      </button>
      <!-- Hidden file input -->
      <input type="file" id="backup-file-input" accept=".json"
        style="display:none;"
        onchange="importDatabaseFromJSON(this.files[0]); this.value='';">
    </div>

    <!-- Danger Zone -->
    <div style="background:#fff5f5;border:1.5px solid #fca5a5;
      border-radius:8px;padding:18px;">
      <h4 style="margin-bottom:6px;color:#dc2626;">⚠️ Danger Zone</h4>
      <p style="font-size:13px;color:#64748b;margin-bottom:14px;">
        Permanently delete data. Export a backup before doing this.
      </p>
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <button class="btn btn-sm btn-outline"
          style="border-color:#fca5a5;color:#dc2626;"
          onclick="confirmAndClearStore('items')">
          🗑️ Clear Inventory
        </button>
        <button class="btn btn-sm btn-outline"
          style="border-color:#fca5a5;color:#dc2626;"
          onclick="confirmAndClearStore('bills')">
          🗑️ Clear Bills
        </button>
        <button class="btn btn-sm btn-outline"
          style="border-color:#dc2626;color:#dc2626;font-weight:700;"
          onclick="confirmAndClearAllData()">
          💣 Clear ALL Data
        </button>
      </div>
    </div>`;

    main.appendChild(section);

    /* Load live stats immediately */
    refreshBackupStats();
}

/* =======================================================
   10. SERVICE WORKER REGISTRATION & ONLINE MONITOR
   ======================================================= */

/**
 * registerServiceWorker()
 * Registers the offline service worker.
 * Also listens for SW updates and notifies the user.
 */
function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) {
        console.log('[SW] Not supported in this browser.');
        return;
    }

    navigator.serviceWorker.register('./js/service-worker.js')
        .then(reg => {
            console.log('[SW] Registered. Scope:', reg.scope);

            /* Notify when a new version is available */
            reg.addEventListener('updatefound', () => {
                const newSW = reg.installing;
                newSW?.addEventListener('statechange', () => {
                    if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
                        if (typeof showToast === 'function')
                            showToast('App updated! Reload for the latest version.', 'info');
                    }
                });
            });
        })
        .catch(err => console.error('[SW] Registration failed:', err));
}

/**
 * monitorOnlineStatus()
 * Shows a toast whenever the browser goes online or offline.
 */
function monitorOnlineStatus() {
    window.addEventListener('online', () => {
        if (typeof showToast === 'function')
            showToast('✅ Back online. Your data is stored locally.', 'success');
    });
    window.addEventListener('offline', () => {
        if (typeof showToast === 'function')
            showToast('📵 Offline. App works normally — data is safe.', 'warning');
    });
}

/* =======================================================
   AUTO-INIT
   ======================================================= */
document.addEventListener('DOMContentLoaded', function () {

    /* Register SW on every page */
    registerServiceWorker();

    /* Monitor connectivity on every page */
    monitorOnlineStatus();

    /* Build backup UI only on settings page */
    const isSettings = window.location.pathname.includes('settings');
    if (isSettings) {
        const wait = setInterval(() => {
            if (typeof db !== 'undefined' && db !== null) {
                clearInterval(wait);
                buildBackupUI();
            }
        }, 50);
    }

    console.log('[Backup] backup.js loaded ✓');
});