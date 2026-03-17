/* =======================================================
   js/db.js
   Khuwaja Surgical — IndexedDB Database Handler
   Handles all offline data storage for the application.
   Include this file in ALL HTML pages before other scripts.
   ======================================================= */

// ---- Database Configuration ----
const DB_NAME = 'khuwajaInventoryDB'; // Database name
const DB_VERSION = 1;                    // Increment to upgrade schema

// ---- Global DB instance (set after openDatabase()) ----
let db = null;

/* -------------------------------------------------------
   openDatabase()
   Opens (or creates) the IndexedDB database.
   Creates all object stores (tables) on first run.
   Returns a Promise that resolves with the db instance.
------------------------------------------------------- */
function openDatabase() {
    return new Promise((resolve, reject) => {

        // Open the database — will create it if it doesn't exist
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        /* onupgradeneeded fires when:
           - Database is created for the first time
           - DB_VERSION is incremented (schema changes) */
        request.onupgradeneeded = function (event) {
            const database = event.target.result;

            // ---- Create 'users' store ----
            // Stores registered user accounts
            if (!database.objectStoreNames.contains('users')) {
                const usersStore = database.createObjectStore('users', {
                    keyPath: 'id',          // Primary key field
                    autoIncrement: true     // Auto-generate IDs
                });
                // Index on email for fast login lookups
                usersStore.createIndex('email', 'email', { unique: true });
                console.log('[DB] Created store: users');
            }

            // ---- Create 'items' store ----
            // Stores inventory/product records
            if (!database.objectStoreNames.contains('items')) {
                const itemsStore = database.createObjectStore('items', {
                    keyPath: 'id',
                    autoIncrement: true
                });
                // Index on itemCode for quick searches
                itemsStore.createIndex('itemCode', 'itemCode', { unique: true });
                itemsStore.createIndex('category', 'category', { unique: false });
                console.log('[DB] Created store: items');
            }

            // ---- Create 'bills' store ----
            // Stores invoice/billing records
            if (!database.objectStoreNames.contains('bills')) {
                const billsStore = database.createObjectStore('bills', {
                    keyPath: 'id',
                    autoIncrement: true
                });
                // Index on invoiceNumber for quick bill lookup
                billsStore.createIndex('invoiceNumber', 'invoiceNumber', { unique: true });
                billsStore.createIndex('date', 'date', { unique: false });
                console.log('[DB] Created store: bills');
            }

            // ---- Create 'settings' store ----
            // Stores business configuration (single record)
            if (!database.objectStoreNames.contains('settings')) {
                database.createObjectStore('settings', {
                    keyPath: 'id',
                    autoIncrement: true
                });
                console.log('[DB] Created store: settings');
            }
        };

        // ---- Success: DB opened ----
        request.onsuccess = function (event) {
            db = event.target.result;
            console.log('[DB] Database opened successfully:', DB_NAME);
            resolve(db);
        };

        // ---- Error: DB failed to open ----
        request.onerror = function (event) {
            console.error('[DB] Error opening database:', event.target.error);
            reject(event.target.error);
        };
    });
}

/* -------------------------------------------------------
   addData(storeName, data)
   Adds a new record to the specified object store.
   @param {string} storeName - e.g. 'items', 'bills'
   @param {object} data      - The record object to save
   Returns a Promise that resolves with the new record ID.
------------------------------------------------------- */
function addData(storeName, data) {
    return new Promise((resolve, reject) => {

        // All writes use a 'readwrite' transaction
        const transaction = db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);

        // Add a createdAt timestamp automatically
        data.createdAt = data.createdAt || new Date().toISOString();

        const request = store.add(data);

        request.onsuccess = function (event) {
            console.log(`[DB] Added to '${storeName}', ID:`, event.target.result);
            resolve(event.target.result); // Returns the new auto-generated ID
        };

        request.onerror = function (event) {
            console.error(`[DB] Error adding to '${storeName}':`, event.target.error);
            reject(event.target.error);
        };
    });
}

/* -------------------------------------------------------
   getAllData(storeName)
   Fetches all records from an object store.
   @param {string} storeName - Store to read from
   Returns a Promise that resolves with an array of records.
------------------------------------------------------- */
function getAllData(storeName) {
    return new Promise((resolve, reject) => {

        // Read-only transaction is faster
        const transaction = db.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);

        const request = store.getAll(); // Fetch all records

        request.onsuccess = function (event) {
            console.log(`[DB] Got ${event.target.result.length} records from '${storeName}'`);
            resolve(event.target.result);
        };

        request.onerror = function (event) {
            console.error(`[DB] Error reading '${storeName}':`, event.target.error);
            reject(event.target.error);
        };
    });
}

/* -------------------------------------------------------
   getDataById(storeName, id)
   Fetches a single record by its primary key (id).
   @param {string} storeName - Store to read from
   @param {number} id        - The record's primary key
   Returns a Promise that resolves with the record object.
------------------------------------------------------- */
function getDataById(storeName, id) {
    return new Promise((resolve, reject) => {

        const transaction = db.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);

        const request = store.get(id);

        request.onsuccess = function (event) {
            resolve(event.target.result); // undefined if not found
        };

        request.onerror = function (event) {
            console.error(`[DB] Error getting ID ${id} from '${storeName}':`, event.target.error);
            reject(event.target.error);
        };
    });
}

/* -------------------------------------------------------
   getDataByIndex(storeName, indexName, value)
   Finds a record using an index (e.g. find user by email).
   @param {string} storeName  - Store to search
   @param {string} indexName  - Index name (e.g. 'email')
   @param {*}      value      - Value to search for
   Returns a Promise that resolves with the matching record.
------------------------------------------------------- */
function getDataByIndex(storeName, indexName, value) {
    return new Promise((resolve, reject) => {

        const transaction = db.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);
        const index = store.index(indexName);

        const request = index.get(value);

        request.onsuccess = function (event) {
            resolve(event.target.result); // undefined if not found
        };

        request.onerror = function (event) {
            console.error(`[DB] Index lookup error in '${storeName}':`, event.target.error);
            reject(event.target.error);
        };
    });
}

/* -------------------------------------------------------
   updateData(storeName, data)
   Updates an existing record. The data object MUST include
   the 'id' field so IndexedDB knows which record to update.
   @param {string} storeName - Store containing the record
   @param {object} data      - Updated record (must have id)
   Returns a Promise that resolves when update is complete.
------------------------------------------------------- */
function updateData(storeName, data) {
    return new Promise((resolve, reject) => {

        const transaction = db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);

        // Add an updatedAt timestamp
        data.updatedAt = new Date().toISOString();

        // put() replaces the record with matching keyPath (id)
        const request = store.put(data);

        request.onsuccess = function (event) {
            console.log(`[DB] Updated record in '${storeName}', ID:`, event.target.result);
            resolve(event.target.result);
        };

        request.onerror = function (event) {
            console.error(`[DB] Error updating '${storeName}':`, event.target.error);
            reject(event.target.error);
        };
    });
}

/* -------------------------------------------------------
   deleteData(storeName, id)
   Permanently deletes a record by its ID.
   @param {string} storeName - Store to delete from
   @param {number} id        - ID of the record to delete
   Returns a Promise that resolves when deletion is done.
------------------------------------------------------- */
function deleteData(storeName, id) {
    return new Promise((resolve, reject) => {

        const transaction = db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);

        const request = store.delete(id);

        request.onsuccess = function () {
            console.log(`[DB] Deleted ID ${id} from '${storeName}'`);
            resolve(true);
        };

        request.onerror = function (event) {
            console.error(`[DB] Error deleting from '${storeName}':`, event.target.error);
            reject(event.target.error);
        };
    });
}

/* -------------------------------------------------------
   clearStore(storeName)
   Deletes ALL records in a store. Use with caution!
   Returns a Promise that resolves when store is cleared.
------------------------------------------------------- */
function clearStore(storeName) {
    return new Promise((resolve, reject) => {

        const transaction = db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);

        const request = store.clear();

        request.onsuccess = function () {
            console.log(`[DB] Cleared all records from '${storeName}'`);
            resolve(true);
        };

        request.onerror = function (event) {
            reject(event.target.error);
        };
    });
}

/* -------------------------------------------------------
   initDatabase()
   Opens the DB and seeds the default admin user and
   default settings if they don't already exist.
   Call this once on page load: initDatabase()
------------------------------------------------------- */
async function initDatabase() {
    try {
        await openDatabase();

        // ---- Seed default admin user ----
        const existing = await getDataByIndex('users', 'email', 'admin@demo.com');
        if (!existing) {
            await addData('users', {
                sellerName: 'Admin',
                email: 'admin@demo.com',
                password: 'Admin123',   // Plain text for demo; use hashing in production
                role: 'admin',
                createdAt: new Date().toISOString()
            });
            console.log('[DB] Demo admin user seeded.');
        }

        // ---- Seed default business settings ----
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

        console.log('[DB] initDatabase() complete.');

    } catch (err) {
        console.error('[DB] initDatabase() failed:', err);
    }
}

// ---- Auto-initialize when this script loads ----
initDatabase();