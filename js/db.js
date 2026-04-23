/* =======================================================
   js/db.js - Khuwaja Surgical — IndexedDB Database Handler
   FIXED VERSION — Production Ready
   ======================================================= */

const DB_NAME = 'khuwajaInventoryDB';
const DB_VERSION = 1;
let db = null;
const DB_SESSION_KEY = 'ksLoggedUser';
const USER_LOCAL_STORES = {
    items: { primary: 'products', aliases: ['inventory'] },
    bills: { primary: 'bills', aliases: [] },
    settings: { primary: 'settings', aliases: [] }
};

// ---- Promise that resolves when DB is ready ----
// All other scripts wait for this before doing anything
let dbReadyResolve;
const dbReady = new Promise(resolve => { dbReadyResolve = resolve; });

function isUserLocalStore(storeName) {
    return Object.prototype.hasOwnProperty.call(USER_LOCAL_STORES, storeName);
}

function getSessionUserEmail() {
    try {
        const raw = sessionStorage.getItem(DB_SESSION_KEY);
        if (!raw) return null;
        const user = JSON.parse(raw);
        return String(user?.email || '').trim().toLowerCase() || null;
    } catch (err) {
        console.warn('[DB] Could not read session user:', err.message);
        return null;
    }
}

function getScopedStorageKey(suffix, email = getSessionUserEmail()) {
    if (!email) return null;
    return `${email}_${suffix}`;
}

function getStoreStorageKeys(storeName, email = getSessionUserEmail()) {
    const config = USER_LOCAL_STORES[storeName];
    if (!config || !email) return [];
    return [config.primary, ...(config.aliases || [])].map(alias => getScopedStorageKey(alias, email));
}

function readJSON(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch (err) {
        console.warn('[DB] Could not parse localStorage key:', key, err.message);
        return fallback;
    }
}

function writeJSON(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
}

function getLocalStoreData(storeName, email = getSessionUserEmail()) {
    const keys = getStoreStorageKeys(storeName, email);
    if (keys.length === 0) return [];
    return readJSON(keys[0], []);
}

function syncDerivedCustomers(email, bills = []) {
    const customerKey = getScopedStorageKey('customers', email);
    if (!customerKey) return;

    const customers = bills
        .filter(bill => (bill.customerName || '').trim())
        .reduce((list, bill) => {
            const customerName = String(bill.customerName || '').trim();
            const customerPhone = String(bill.customerPhone || '').trim();
            const exists = list.some(c =>
                c.name.toLowerCase() === customerName.toLowerCase() &&
                (c.phone || '') === customerPhone
            );

            if (!exists) {
                list.push({
                    id: list.length + 1,
                    name: customerName,
                    phone: customerPhone,
                    lastBillDate: bill.date || bill.createdAt || ''
                });
            }

            return list;
        }, []);

    writeJSON(customerKey, customers);
}

function saveLocalStoreData(storeName, records, email = getSessionUserEmail()) {
    const keys = getStoreStorageKeys(storeName, email);
    if (keys.length === 0) {
        throw new Error(`No logged-in user found for ${storeName} storage.`);
    }

    keys.forEach(key => writeJSON(key, records));

    if (storeName === 'bills') {
        syncDerivedCustomers(email, records);
    }

    if (storeName === 'settings') {
        const settings = records[0] || {};
        const lowStockKey = getScopedStorageKey('lowStockLimit', email);
        if (lowStockKey) {
            localStorage.setItem(lowStockKey, String(settings.lowStockLimit ?? 10));
        }
    }
}

function getNextLocalId(records) {
    const maxId = records.reduce((max, record) => Math.max(max, Number(record.id) || 0), 0);
    return maxId + 1;
}

function getDefaultSettingsRecord() {
    return {
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
    };
}

function ensureCurrentUserScopedData() {
    const email = getSessionUserEmail();
    if (!email) return Promise.resolve();

    const settings = getLocalStoreData('settings', email);
    if (settings.length === 0) {
        saveLocalStoreData('settings', [{
            id: 1,
            ...getDefaultSettingsRecord(),
            userEmail: email,
            createdAt: new Date().toISOString()
        }], email);
    }

    if (getLocalStoreData('items', email).length === 0) {
        saveLocalStoreData('items', [], email);
    }

    if (getLocalStoreData('bills', email).length === 0) {
        saveLocalStoreData('bills', [], email);
    }

    const customersKey = getScopedStorageKey('customers', email);
    if (customersKey && localStorage.getItem(customersKey) === null) {
        writeJSON(customersKey, []);
    }

    return Promise.resolve();
}

function getCurrentLowStockLimit() {
    const email = getSessionUserEmail();
    const settings = getLocalStoreData('settings', email);
    const fromSettings = settings[0]?.lowStockLimit;
    const scopedKey = getScopedStorageKey('lowStockLimit', email);
    const scopedValue = scopedKey ? localStorage.getItem(scopedKey) : null;
    return parseInt(fromSettings || scopedValue || localStorage.getItem('ksLowStockLimit') || '10', 10);
}

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
        if (isUserLocalStore(storeName)) {
            try {
                const email = getSessionUserEmail();
                if (!email) throw new Error('Please log in first.');

                const records = getLocalStoreData(storeName, email);
                const record = {
                    ...data,
                    id: data.id ?? getNextLocalId(records),
                    userEmail: email,
                    createdAt: data.createdAt || new Date().toISOString()
                };

                records.push(record);
                saveLocalStoreData(storeName, records, email);
                resolve(record.id);
            } catch (err) {
                reject(err);
            }
            return;
        }

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
        if (isUserLocalStore(storeName)) {
            try {
                resolve(getLocalStoreData(storeName));
            } catch (err) {
                reject(err);
            }
            return;
        }

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
        if (isUserLocalStore(storeName)) {
            try {
                const record = getLocalStoreData(storeName)
                    .find(item => Number(item.id) === Number(id)) || null;
                resolve(record);
            } catch (err) {
                reject(err);
            }
            return;
        }

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
        if (isUserLocalStore(storeName)) {
            try {
                const email = getSessionUserEmail();
                if (!email) throw new Error('Please log in first.');

                const records = getLocalStoreData(storeName, email);
                const index = records.findIndex(item => Number(item.id) === Number(data.id));
                if (index === -1) throw new Error(`${storeName} record not found.`);

                records[index] = {
                    ...records[index],
                    ...data,
                    userEmail: email,
                    updatedAt: new Date().toISOString()
                };

                saveLocalStoreData(storeName, records, email);
                resolve(records[index].id);
            } catch (err) {
                reject(err);
            }
            return;
        }

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
        if (isUserLocalStore(storeName)) {
            try {
                const email = getSessionUserEmail();
                if (!email) throw new Error('Please log in first.');

                const records = getLocalStoreData(storeName, email)
                    .filter(item => Number(item.id) !== Number(id));

                saveLocalStoreData(storeName, records, email);
                resolve(true);
            } catch (err) {
                reject(err);
            }
            return;
        }

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
        if (isUserLocalStore(storeName)) {
            try {
                const email = getSessionUserEmail();
                if (!email) throw new Error('Please log in first.');
                saveLocalStoreData(storeName, [], email);
                resolve(true);
            } catch (err) {
                reject(err);
            }
            return;
        }

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

        // ---- Seed current user's scoped settings when a session exists ----
        try {
            await ensureCurrentUserScopedData();
        } catch (e) {
            console.warn('[DB] Could not seed user-scoped settings:', e.message);
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
