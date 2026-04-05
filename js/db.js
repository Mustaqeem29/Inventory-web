/* =======================================================
   js/db.js - Khuwaja Surgical — IndexedDB Database Handler
   FIXED VERSION — Production Ready
   ======================================================= */

const DB_NAME = 'khuwajaInventoryDB';
const DB_VERSION = 1;
let db = null;

// ---- Promise that resolves when DB is ready ----
// All other scripts wait for this before doing anything
let dbReadyResolve;
const dbReady = new Promise(resolve => { dbReadyResolve = resolve; });

/* -------------------------------------------------------
   openDatabase()
------------------------------------------------------- */
function openDatabase() {
    return new Promise((resolve, reject) => {
        if (db) { resolve(db); return; } // already open

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = function (event) {
            const database = event.target.result;

            if (!database.objectStoreNames.contains('users')) {
                const usersStore = database.createObjectStore('users', {
                    keyPath: 'id', autoIncrement: true
                });
                usersStore.createIndex('email', 'email', { unique: true });
            }

            if (!database.objectStoreNames.contains('items')) {
                const itemsStore = database.createObjectStore('items', {
                    keyPath: 'id', autoIncrement: true
                });
                itemsStore.createIndex('itemCode', 'itemCode', { unique: true });
                itemsStore.createIndex('category', 'category', { unique: false });
            }

            if (!database.objectStoreNames.contains('bills')) {
                const billsStore = database.createObjectStore('bills', {
                    keyPath: 'id', autoIncrement: true
                });
                billsStore.createIndex('invoiceNumber', 'invoiceNumber', { unique: false });
                billsStore.createIndex('date', 'date', { unique: false });
            }

            if (!database.objectStoreNames.contains('settings')) {
                database.createObjectStore('settings', {
                    keyPath: 'id', autoIncrement: true
                });
            }
        };

        request.onsuccess = function (event) {
            db = event.target.result;

            // Handle DB connection closing unexpectedly
            db.onclose = function () {
                db = null;
                console.warn('[DB] Connection closed unexpectedly. Reopening...');
                initDatabase();
            };

            db.onerror = function (event) {
                console.error('[DB] Database error:', event.target.error);
            };

            console.log('[DB] Opened:', DB_NAME);
            resolve(db);
        };

        request.onerror = function (event) {
            console.error('[DB] Failed to open:', event.target.error);
            reject(event.target.error);
        };

        request.onblocked = function () {
            console.warn('[DB] Database blocked. Close other tabs and retry.');
            alert('Please close other tabs of this app and refresh.');
        };
    });
}

/* -------------------------------------------------------
   addData(storeName, data)
------------------------------------------------------- */
function addData(storeName, data) {
    return new Promise((resolve, reject) => {
        if (!db) { reject(new Error('DB not ready')); return; }

        const tx = db.transaction([storeName], 'readwrite');
        const store = tx.objectStore(storeName);
        const record = { ...data };
        record.createdAt = record.createdAt || new Date().toISOString();

        const request = store.add(record);

        request.onsuccess = function (event) {
            resolve(event.target.result);
        };

        request.onerror = function (event) {
            console.error(`[DB] addData error in '${storeName}':`, event.target.error);
            reject(event.target.error);
        };

        tx.onerror = function (event) {
            console.error(`[DB] Transaction error in '${storeName}':`, event.target.error);
            reject(event.target.error);
        };
    });
}

/* -------------------------------------------------------
   getAllData(storeName)
------------------------------------------------------- */
function getAllData(storeName) {
    return new Promise((resolve, reject) => {
        if (!db) { reject(new Error('DB not ready')); return; }

        const tx = db.transaction([storeName], 'readonly');
        const store = tx.objectStore(storeName);
        const request = store.getAll();

        request.onsuccess = function (event) {
            resolve(event.target.result || []);
        };

        request.onerror = function (event) {
            console.error(`[DB] getAllData error in '${storeName}':`, event.target.error);
            reject(event.target.error);
        };
    });
}

/* -------------------------------------------------------
   getDataById(storeName, id)
------------------------------------------------------- */
function getDataById(storeName, id) {
    return new Promise((resolve, reject) => {
        if (!db) { reject(new Error('DB not ready')); return; }

        const tx = db.transaction([storeName], 'readonly');
        const store = tx.objectStore(storeName);
        const request = store.get(Number(id));

        request.onsuccess = function (event) {
            resolve(event.target.result);
        };

        request.onerror = function (event) {
            console.error(`[DB] getDataById error in '${storeName}':`, event.target.error);
            reject(event.target.error);
        };
    });
}

/* -------------------------------------------------------
   getDataByIndex(storeName, indexName, value)
------------------------------------------------------- */
function getDataByIndex(storeName, indexName, value) {
    return new Promise((resolve, reject) => {
        if (!db) { reject(new Error('DB not ready')); return; }

        const tx = db.transaction([storeName], 'readonly');
        const store = tx.objectStore(storeName);
        const index = store.index(indexName);
        const request = index.get(value);

        request.onsuccess = function (event) {
            resolve(event.target.result);
        };

        request.onerror = function (event) {
            console.error(`[DB] getDataByIndex error in '${storeName}':`, event.target.error);
            reject(event.target.error);
        };
    });
}

/* -------------------------------------------------------
   updateData(storeName, data)
------------------------------------------------------- */
function updateData(storeName, data) {
    return new Promise((resolve, reject) => {
        if (!db) { reject(new Error('DB not ready')); return; }

        const tx = db.transaction([storeName], 'readwrite');
        const store = tx.objectStore(storeName);
        const record = { ...data };
        record.updatedAt = new Date().toISOString();

        const request = store.put(record);

        request.onsuccess = function (event) {
            resolve(event.target.result);
        };

        request.onerror = function (event) {
            console.error(`[DB] updateData error in '${storeName}':`, event.target.error);
            reject(event.target.error);
        };

        tx.onerror = function (event) {
            console.error(`[DB] Transaction error updating '${storeName}':`, event.target.error);
            reject(event.target.error);
        };
    });
}

/* -------------------------------------------------------
   deleteData(storeName, id)
------------------------------------------------------- */
function deleteData(storeName, id) {
    return new Promise((resolve, reject) => {
        if (!db) { reject(new Error('DB not ready')); return; }

        const tx = db.transaction([storeName], 'readwrite');
        const store = tx.objectStore(storeName);
        const request = store.delete(Number(id));

        request.onsuccess = function () {
            resolve(true);
        };

        request.onerror = function (event) {
            console.error(`[DB] deleteData error in '${storeName}':`, event.target.error);
            reject(event.target.error);
        };
    });
}

/* -------------------------------------------------------
   clearStore(storeName)
------------------------------------------------------- */
function clearStore(storeName) {
    return new Promise((resolve, reject) => {
        if (!db) { reject(new Error('DB not ready')); return; }

        const tx = db.transaction([storeName], 'readwrite');
        const store = tx.objectStore(storeName);
        const request = store.clear();

        request.onsuccess = function () {
            resolve(true);
        };

        request.onerror = function (event) {
            reject(event.target.error);
        };
    });
}

/* -------------------------------------------------------
   initDatabase()
   Opens DB, seeds admin user and default settings.
   Fires a global 'dbReady' event when done so all
   other scripts know they can safely use the DB.
------------------------------------------------------- */
async function initDatabase() {
    try {
        await openDatabase();

        // ---- Seed admin user ----
        try {
            const existing = await getDataByIndex('users', 'email', 'admin@demo.com');
            if (!existing) {
                await addData('users', {
                    sellerName: 'Admin',
                    email: 'admin@demo.com',
                    password: 'Admin123',
                    role: 'admin'
                });
                console.log('[DB] Admin user seeded.');
            }
        } catch (e) {
            console.warn('[DB] Could not seed admin user:', e.message);
        }

        // ---- Seed default settings ----
        try {
            const allSettings = await getAllData('settings');
            if (allSettings.length === 0) {
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
                console.log('[DB] Default settings seeded.');
            }
        } catch (e) {
            console.warn('[DB] Could not seed settings:', e.message);
        }

        console.log('[DB] initDatabase() complete.');

        // ---- Signal all scripts that DB is ready ----
        dbReadyResolve(db);

        // ---- Fire a DOM event so page scripts can listen ----
        window.dispatchEvent(new CustomEvent('dbReady', { detail: db }));

    } catch (err) {
        console.error('[DB] initDatabase() failed:', err);
        // Retry after 1 second
        setTimeout(initDatabase, 1000);
    }
}

// ---- Start immediately ----
initDatabase();