/* =======================================================
   js/chatbot.js
   Khuwaja Surgical — Inventory Chatbot
   -------------------------------------------------------
   Offline chatbot using IndexedDB only.
   No external libraries. Vanilla JS + Regex parsing.
   Supports English + Roman Urdu commands.

   DEPENDS ON : db.js (must load first)
   USAGE      : Add to any page that has the chatbot UI
   ======================================================= */

/* =======================================================
   INTENT KEYWORDS
   Covers English + Roman Urdu variations
   ======================================================= */
const INTENT = {

    addItem: [
        'add item', 'add product', 'naya item', 'item add karo',
        'add karo', 'nayi cheez', 'add', 'new item', 'item daalo',
        'daalo', 'register item', 'item likho'
    ],

    updateStock: [
        'update stock', 'stock update', 'stock barhaao', 'quantity update',
        'stock add', 'aur daalo', 'stock badao', 'increase stock',
        'quantity barhaao', 'stock change', 'stock update karo'
    ],

    createBill: [
        'create bill', 'bill banao', 'bill banaao', 'new bill',
        'naya bill', 'invoice banao', 'bill karo', 'bill do',
        'sale karo', 'bill', 'invoice', 'sell'
    ],

    searchItem: [
        'find item', 'search item', 'item dhundo', 'dhundo',
        'item hai', 'check item', 'item check karo', 'show item',
        'item dekho', 'kya hai', 'item batao'
    ],

    showStock: [
        'show stock', 'stock dekho', 'stock batao', 'kitna stock',
        'inventory dekho', 'all items', 'sab items', 'list',
        'show all', 'inventory list', 'stock list'
    ],

    help: [
        'help', 'madad', 'kya kar sakta', 'commands', 'kya likhu',
        'guide', 'how to', 'kaise', 'instructions', 'batao'
    ]

};

/* =======================================================
   DETECT INTENT
   ======================================================= */

/**
 * detectIntent(input)
 * Matches user input against intent keywords.
 * @param {string} input - Raw user message
 * @returns {string} intent name or 'unknown'
 */
function detectIntent(input) {
    const text = input.toLowerCase().trim();

    for (const [intent, keywords] of Object.entries(INTENT)) {
        if (keywords.some(kw => text.includes(kw))) {
            return intent;
        }
    }
    return 'unknown';
}

/* =======================================================
   PARSERS — extract data from natural language
   ======================================================= */

/**
 * parseAddItem(input)
 * Extracts item details from text.
 *
 * Supported formats:
 *   add item Surgical Gloves category PPE rate 500 stock 100
 *   add karo Bandage category Dressings rate 70 stock 50
 *   add item Syringe 5ml rate 20 stock 200 category Syringes
 *
 * @param {string} input
 * @returns {object|null} { itemName, category, sellingRate, currentStock } or null
 */
function parseAddItem(input) {
    const text = input.toLowerCase();

    // Extract item name — text after 'add item/karo/daalo' until next keyword
    const nameMatch = input.match(
        /(?:add item|add karo|item add karo|naya item|daalo|new item)\s+([a-zA-Z0-9\s\-\.]+?)(?:\s+(?:category|rate|stock|selling|buying)|$)/i
    );

    if (!nameMatch || !nameMatch[1].trim()) {
        return { error: 'Item name nahi mila. Example: add item Gloves category PPE rate 500 stock 100' };
    }

    const itemName = nameMatch[1].trim();

    // Auto-generate item code from name
    const itemCode = itemName.toUpperCase().replace(/\s+/g, '-').substring(0, 10)
        + '-' + Date.now().toString().slice(-4);

    // Extract category
    const categoryMatch = input.match(/category\s+([a-zA-Z]+)/i);
    const category = categoryMatch ? categoryMatch[1].trim() : 'Other';

    // Extract selling rate
    const rateMatch = input.match(/(?:rate|selling rate|price)\s+([\d.]+)/i);
    if (!rateMatch) {
        return { error: 'Rate nahi mila. Example: rate 500' };
    }
    const sellingRate = parseFloat(rateMatch[1]);
    if (isNaN(sellingRate) || sellingRate <= 0) {
        return { error: 'Rate galat hai. Positive number likhein. Example: rate 500' };
    }

    // Extract buying rate (optional)
    const buyingMatch = input.match(/(?:buying rate|buying|cost)\s+([\d.]+)/i);
    const buyingRate = buyingMatch ? parseFloat(buyingMatch[1]) : 0;

    // Extract stock
    const stockMatch = input.match(/stock\s+([\d]+)/i);
    if (!stockMatch) {
        return { error: 'Stock quantity nahi mili. Example: stock 100' };
    }
    const currentStock = parseInt(stockMatch[1]);
    if (isNaN(currentStock) || currentStock < 0) {
        return { error: 'Stock galat hai. 0 ya positive number likhein.' };
    }

    // Extract supplier (optional)
    const supplierMatch = input.match(/supplier\s+([a-zA-Z0-9\s]+?)(?:\s+(?:category|rate|stock)|$)/i);
    const supplier = supplierMatch ? supplierMatch[1].trim() : '';

    return { itemName, itemCode, category, sellingRate, buyingRate, currentStock, supplier };
}

/**
 * parseUpdateStock(input)
 * Extracts item name and quantity to add from text.
 *
 * Supported formats:
 *   update stock Gloves quantity 50
 *   stock barhaao Bandage 30
 *   add stock Syringe 5ml 100
 *
 * @param {string} input
 * @returns {object|null}
 */
function parseUpdateStock(input) {

    // Extract quantity
    const qtyMatch = input.match(/(?:quantity|qty|stock|amount|add)\s+([\d]+)/i)
        || input.match(/([\d]+)\s*(?:units?|pcs?|pieces?)?$/i);

    if (!qtyMatch) {
        return { error: 'Quantity nahi mili. Example: update stock Gloves quantity 50' };
    }

    const quantity = parseInt(qtyMatch[1]);
    if (isNaN(quantity) || quantity <= 0) {
        return { error: 'Quantity galat hai. Positive number likhein. Example: quantity 50' };
    }

    // Extract item name — remove intent keywords + quantity to get name
    let nameText = input
        .replace(/update stock|stock update|stock barhaao|stock badao|aur daalo|increase stock/gi, '')
        .replace(/quantity\s+[\d]+|qty\s+[\d]+|stock\s+[\d]+|[\d]+\s*(?:units?|pcs?)/gi, '')
        .trim();

    if (!nameText) {
        return { error: 'Item ka naam nahi mila. Example: update stock Surgical Gloves quantity 50' };
    }

    return { itemName: nameText, quantity };
}

/**
 * parseCreateBill(input)
 * Extracts bill details from text.
 *
 * Supported formats:
 *   create bill customer Ahmed item Gloves qty 5
 *   bill banao customer Rehman Medical item Syringe qty 10 item Bandage qty 20
 *   bill customer Ahmed item Gloves 5
 *
 * @param {string} input
 * @returns {object|null}
 */
function parseCreateBill(input) {

    // Extract customer name
    const customerMatch = input.match(/customer\s+([a-zA-Z0-9\s]+?)(?:\s+item|\s+qty|$)/i);
    const customerName = customerMatch ? customerMatch[1].trim() : 'Walk-in Customer';

    // Extract all items — pattern: item <name> qty <number>
    const itemPattern = /item\s+([a-zA-Z0-9\s\-\.]+?)\s+(?:qty|quantity)\s+([\d]+)/gi;
    const billItems = [];
    let match;

    while ((match = itemPattern.exec(input)) !== null) {
        const name = match[1].trim();
        const qty = parseInt(match[2]);
        if (name && qty > 0) {
            billItems.push({ searchName: name, qty });
        }
    }

    // Also support: item <name> <number> (without qty keyword)
    if (billItems.length === 0) {
        const simplePattern = /item\s+([a-zA-Z0-9\s\-\.]+?)\s+([\d]+)(?:\s|$)/gi;
        while ((match = simplePattern.exec(input)) !== null) {
            const name = match[1].trim();
            const qty = parseInt(match[2]);
            if (name && qty > 0) {
                billItems.push({ searchName: name, qty });
            }
        }
    }

    if (billItems.length === 0) {
        return {
            error: 'Items nahi mile. Example: bill banao customer Ahmed item Gloves qty 5'
        };
    }

    return { customerName, billItems };
}

/**
 * parseSearchItem(input)
 * Extracts item name to search.
 */
function parseSearchItem(input) {
    const nameText = input
        .replace(/find item|search item|item dhundo|dhundo|item hai|check item|show item|item dekho|kya hai|item batao/gi, '')
        .trim();

    if (!nameText) {
        return { error: 'Item ka naam likhein. Example: find item Gloves' };
    }

    return { searchName: nameText };
}

/* =======================================================
   ACTION HANDLERS
   ======================================================= */

/**
 * handleAddItem(parsed)
 * Calls addData() from db.js to save new item.
 */
async function handleAddItem(parsed) {
    if (parsed.error) return botReply(parsed.error, 'error');

    try {
        // Check for duplicate item code
        const existing = await getDataByIndex('items', 'itemCode', parsed.itemCode);
        if (existing) {
            parsed.itemCode = parsed.itemCode + '-' + Date.now().toString().slice(-3);
        }

        await addData('items', {
            itemCode: parsed.itemCode,
            itemName: parsed.itemName,
            category: parsed.category,
            supplier: parsed.supplier || '',
            buyingRate: parsed.buyingRate || 0,
            sellingRate: parsed.sellingRate,
            currentStock: parsed.currentStock,
            dateAdded: new Date().toISOString().split('T')[0]
        });

        botReply(
            `✅ Item added!\n` +
            `Name: ${parsed.itemName}\n` +
            `Code: ${parsed.itemCode}\n` +
            `Rate: Rs. ${parsed.sellingRate}\n` +
            `Stock: ${parsed.currentStock} units`,
            'success'
        );

        // Refresh inventory table if on inventory page
        if (typeof loadItems === 'function') loadItems();

    } catch (err) {
        if (err.name === 'ConstraintError') {
            botReply('❌ Item code already exists. Dobara try karein.', 'error');
        } else {
            botReply('❌ Item save nahi hua: ' + err.message, 'error');
        }
    }
}

/**
 * handleUpdateStock(parsed)
 * Finds item by name and increases its stock.
 */
async function handleUpdateStock(parsed) {
    if (parsed.error) return botReply(parsed.error, 'error');

    try {
        // Search item by name (case-insensitive)
        const allItems = await getAllData('items');
        const item = allItems.find(i =>
            (i.itemName || '').toLowerCase().includes(parsed.itemName.toLowerCase()) ||
            (i.itemCode || '').toLowerCase().includes(parsed.itemName.toLowerCase())
        );

        if (!item) {
            botReply(
                `❌ Item "${parsed.itemName}" nahi mila.\n` +
                `Sahi naam likhein ya "show stock" type karein.`,
                'error'
            );
            return;
        }

        const oldStock = parseInt(item.currentStock) || 0;
        const newStock = oldStock + parsed.quantity;

        await updateData('items', { ...item, currentStock: newStock });

        botReply(
            `✅ Stock updated!\n` +
            `Item: ${item.itemName}\n` +
            `Old stock: ${oldStock}\n` +
            `Added: ${parsed.quantity}\n` +
            `New stock: ${newStock}`,
            'success'
        );

        if (typeof loadItems === 'function') loadItems();

    } catch (err) {
        botReply('❌ Stock update nahi hua: ' + err.message, 'error');
    }
}

/**
 * handleCreateBill(parsed)
 * Matches items, checks stock, creates and saves bill.
 */
async function handleCreateBill(parsed) {
    if (parsed.error) return botReply(parsed.error, 'error');

    try {
        const allItems = await getAllData('items');
        const allBills = await getAllData('bills');
        const settingsArr = await getAllData('settings');
        const settings = settingsArr[0] || {};

        const resolvedItems = [];
        const errors = [];

        // Match each bill item to a DB item
        for (const billItem of parsed.billItems) {
            const found = allItems.find(i =>
                (i.itemName || '').toLowerCase().includes(billItem.searchName.toLowerCase()) ||
                (i.itemCode || '').toLowerCase().includes(billItem.searchName.toLowerCase())
            );

            if (!found) {
                errors.push(`"${billItem.searchName}" inventory mein nahi mila.`);
                continue;
            }

            if ((parseInt(found.currentStock) || 0) < billItem.qty) {
                errors.push(
                    `"${found.itemName}" ka stock kam hai. ` +
                    `Available: ${found.currentStock}, Requested: ${billItem.qty}`
                );
                continue;
            }

            resolvedItems.push({
                itemId: found.id,
                itemName: found.itemName,
                itemCode: found.itemCode,
                rate: parseFloat(found.sellingRate) || 0,
                qty: billItem.qty,
                amount: parseFloat(((parseFloat(found.sellingRate) || 0) * billItem.qty).toFixed(2))
            });
        }

        if (errors.length > 0) {
            botReply('❌ Kuch errors hain:\n' + errors.join('\n'), 'error');
            return;
        }

        if (resolvedItems.length === 0) {
            botReply('❌ Koi bhi item bill mein add nahi hua.', 'error');
            return;
        }

        // Calculate totals
        const subtotal = resolvedItems.reduce((s, i) => s + i.amount, 0);
        const taxRate = parseFloat(settings.taxRate || 17);
        const taxAmount = parseFloat((subtotal * taxRate / 100).toFixed(2));
        const grandTotal = parseFloat((subtotal + taxAmount).toFixed(2));

        // Generate invoice number
        const maxNum = allBills.length > 0
            ? Math.max(...allBills.map(b => parseInt(b.invoiceNumber) || 0))
            : (parseInt(settings.invoiceStart) || 1001) - 1;
        const invoiceNum = maxNum + 1;
        const billNumber = (settings.invoicePrefix || '#') + invoiceNum;

        // Save bill
        await addData('bills', {
            invoiceNumber: invoiceNum,
            billNumber,
            date: new Date().toISOString().split('T')[0],
            sellerName: getCurrentUser ? (getCurrentUser()?.sellerName || 'Admin') : 'Admin',
            customerName: parsed.customerName,
            customerPhone: '',
            items: resolvedItems,
            subtotal,
            taxRate,
            taxAmount,
            discount: 0,
            grandTotal,
            cashPaid: 0,
            balance: -grandTotal,
            amountPaid: 0
        });

        // Reduce stock for each item
        for (const ri of resolvedItems) {
            const dbItem = allItems.find(i => i.id === ri.itemId);
            if (dbItem) {
                await updateData('items', {
                    ...dbItem,
                    currentStock: Math.max(0, (parseInt(dbItem.currentStock) || 0) - ri.qty)
                });
            }
        }

        // Build reply
        const itemLines = resolvedItems
            .map(i => `  • ${i.itemName} x${i.qty} = Rs.${i.amount.toFixed(2)}`)
            .join('\n');

        botReply(
            `✅ Bill created!\n` +
            `Bill No: ${billNumber}\n` +
            `Customer: ${parsed.customerName}\n` +
            `─────────────────\n` +
            `${itemLines}\n` +
            `─────────────────\n` +
            `Subtotal: Rs.${subtotal.toFixed(2)}\n` +
            `Tax (${taxRate}%): Rs.${taxAmount.toFixed(2)}\n` +
            `Grand Total: Rs.${grandTotal.toFixed(2)}`,
            'success'
        );

        // Refresh pages if open
        if (typeof loadItems === 'function') loadItems();
        if (typeof loadAllBills === 'function') loadAllBills();

    } catch (err) {
        botReply('❌ Bill create nahi hua: ' + err.message, 'error');
    }
}

/**
 * handleSearchItem(parsed)
 * Finds and shows matching items from inventory.
 */
async function handleSearchItem(parsed) {
    if (parsed.error) return botReply(parsed.error, 'error');

    try {
        const allItems = await getAllData('items');
        const results = allItems.filter(i =>
            (i.itemName || '').toLowerCase().includes(parsed.searchName.toLowerCase()) ||
            (i.itemCode || '').toLowerCase().includes(parsed.searchName.toLowerCase())
        );

        if (results.length === 0) {
            botReply(`❌ "${parsed.searchName}" nahi mila inventory mein.`, 'error');
            return;
        }

        const lines = results.slice(0, 5).map(i =>
            `• ${i.itemName} (${i.itemCode})\n  Rate: Rs.${i.sellingRate} | Stock: ${i.currentStock}`
        ).join('\n');

        botReply(
            `🔍 ${results.length} item(s) mile:\n${lines}` +
            (results.length > 5 ? `\n...aur ${results.length - 5} aur` : ''),
            'info'
        );

    } catch (err) {
        botReply('❌ Search nahi hua: ' + err.message, 'error');
    }
}

/**
 * handleShowStock()
 * Shows summary of all inventory items.
 */
async function handleShowStock() {
    try {
        const allItems = await getAllData('items');

        if (allItems.length === 0) {
            botReply('📦 Inventory khali hai. Pehle item add karein.', 'info');
            return;
        }

        const lowLimit = parseInt(localStorage.getItem('ksLowStockLimit') || '10');
        const lowItems = allItems.filter(i => (parseInt(i.currentStock) || 0) <= lowLimit);

        const lines = allItems.slice(0, 8).map(i => {
            const stock = parseInt(i.currentStock) || 0;
            const flag = stock <= 0 ? ' ⛔' : stock <= lowLimit ? ' ⚠️' : ' ✅';
            return `• ${i.itemName}: ${stock} units${flag}`;
        }).join('\n');

        botReply(
            `📦 Inventory (${allItems.length} items):\n${lines}` +
            (allItems.length > 8 ? `\n...aur ${allItems.length - 8} aur items` : '') +
            (lowItems.length > 0 ? `\n\n⚠️ ${lowItems.length} item(s) low stock mein!` : ''),
            'info'
        );

    } catch (err) {
        botReply('❌ Stock show nahi hua: ' + err.message, 'error');
    }
}

/**
 * handleHelp()
 * Shows available commands.
 */
function handleHelp() {
    botReply(
        `🤖 Main yeh kar sakta hoon:\n\n` +
        `➕ Item Add:\n  add item Gloves category PPE rate 500 stock 100\n\n` +
        `📦 Stock Update:\n  update stock Gloves quantity 50\n\n` +
        `🧾 Bill Banao:\n  bill banao customer Ahmed item Gloves qty 5\n\n` +
        `🔍 Item Dhundo:\n  find item Gloves\n\n` +
        `📋 Sab Items Dekho:\n  show stock`,
        'info'
    );
}

/* =======================================================
   MAIN MESSAGE PROCESSOR
   ======================================================= */

/**
 * processMessage(input)
 * Entry point — detects intent and calls correct handler.
 * @param {string} input - User message
 */
async function processMessage(input) {
    const text = input.trim();
    if (!text) return;

    const intent = detectIntent(text);

    switch (intent) {
        case 'addItem':
            await handleAddItem(parseAddItem(text));
            break;

        case 'updateStock':
            await handleUpdateStock(parseUpdateStock(text));
            break;

        case 'createBill':
            await handleCreateBill(parseCreateBill(text));
            break;

        case 'searchItem':
            await handleSearchItem(parseSearchItem(text));
            break;

        case 'showStock':
            await handleShowStock();
            break;

        case 'help':
            handleHelp();
            break;

        default:
            botReply(
                `🤔 Samajh nahi aaya.\n` +
                `"help" type karein commands dekhne ke liye.`,
                'warning'
            );
    }
}

/* =======================================================
   CHATBOT UI
   ======================================================= */

/**
 * botReply(message, type)
 * Adds a bot message to the chat window.
 * @param {string} message
 * @param {string} type - 'success' | 'error' | 'info' | 'warning'
 */
function botReply(message, type = 'info') {
    addMessage(message, 'bot', type);
}

/**
 * addMessage(message, sender, type)
 * Creates and appends a message bubble to the chat.
 * @param {string} message
 * @param {string} sender - 'user' | 'bot'
 * @param {string} type
 */
function addMessage(message, sender, type = 'info') {
    const container = document.getElementById('chatbot-messages');
    if (!container) return;

    const colors = {
        success: '#16a34a',
        error: '#dc2626',
        warning: '#d97706',
        info: '#0ea5e9'
    };

    const isUser = sender === 'user';
    const wrap = document.createElement('div');
    wrap.style.cssText = `
    display:flex;
    justify-content:${isUser ? 'flex-end' : 'flex-start'};
    margin-bottom:10px;
    animation: fadeIn 0.2s ease;
  `;

    const bubble = document.createElement('div');
    bubble.style.cssText = `
    max-width:85%;
    padding:10px 14px;
    border-radius:${isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px'};
    font-size:13px;
    line-height:1.6;
    white-space:pre-wrap;
    word-break:break-word;
    background:${isUser
            ? '#0ea5e9'
            : type === 'error' ? '#fee2e2'
                : type === 'success' ? '#dcfce7'
                    : type === 'warning' ? '#fef3c7'
                        : '#f1f5f9'
        };
    color:${isUser
            ? '#ffffff'
            : type === 'error' ? '#991b1b'
                : type === 'success' ? '#166534'
                    : type === 'warning' ? '#92400e'
                        : '#1e293b'
        };
    border:1px solid ${isUser ? 'transparent' : colors[type] || '#e2e8f0'};
    box-shadow:0 1px 3px rgba(0,0,0,0.08);
  `;

    bubble.textContent = message;
    wrap.appendChild(bubble);
    container.appendChild(wrap);

    // Scroll to bottom
    container.scrollTop = container.scrollHeight;
}

/**
 * showTypingIndicator() / hideTypingIndicator()
 * Shows a "..." indicator while bot is processing.
 */
function showTypingIndicator() {
    const container = document.getElementById('chatbot-messages');
    if (!container) return;

    const wrap = document.createElement('div');
    wrap.id = 'typing-indicator';
    wrap.style.cssText = 'display:flex;justify-content:flex-start;margin-bottom:10px;';

    wrap.innerHTML = `
    <div style="
      padding:10px 16px;
      background:#f1f5f9;
      border-radius:16px 16px 16px 4px;
      border:1px solid #e2e8f0;
    ">
      <span style="
        display:inline-flex;gap:4px;align-items:center;
      ">
        <span style="width:6px;height:6px;background:#94a3b8;border-radius:50%;
          animation:bounce 1s infinite 0s;display:inline-block;"></span>
        <span style="width:6px;height:6px;background:#94a3b8;border-radius:50%;
          animation:bounce 1s infinite 0.2s;display:inline-block;"></span>
        <span style="width:6px;height:6px;background:#94a3b8;border-radius:50%;
          animation:bounce 1s infinite 0.4s;display:inline-block;"></span>
      </span>
    </div>`;

    container.appendChild(wrap);
    container.scrollTop = container.scrollHeight;
}

function hideTypingIndicator() {
    document.getElementById('typing-indicator')?.remove();
}

/**
 * handleUserInput()
 * Called when user sends a message.
 * Reads input, shows user bubble, processes, shows reply.
 */
async function handleUserInput() {
    const input = document.getElementById('chatbot-input');
    if (!input) return;

    const text = input.value.trim();
    if (!text) return;

    // Show user message
    addMessage(text, 'user');
    input.value = '';

    // Show typing
    showTypingIndicator();

    // Small delay to feel natural
    await new Promise(r => setTimeout(r, 400));

    hideTypingIndicator();

    // Process
    await processMessage(text);
}

/* =======================================================
   BUILD CHATBOT UI
   ======================================================= */

/**
 * buildChatbotUI()
 * Injects the chatbot widget into the page.
 * Can be placed anywhere — floats at bottom right.
 */
function buildChatbotUI() {
    if (document.getElementById('chatbot-widget')) return;

    // Inject animation styles
    const style = document.createElement('style');
    style.textContent = `
    @keyframes fadeIn {
      from { opacity:0; transform:translateY(6px); }
      to   { opacity:1; transform:translateY(0); }
    }
    @keyframes bounce {
      0%,80%,100% { transform:translateY(0); }
      40%         { transform:translateY(-5px); }
    }
    @keyframes slideUp {
      from { opacity:0; transform:translateY(20px); }
      to   { opacity:1; transform:translateY(0); }
    }
    #chatbot-widget {
      position:fixed;
      bottom:24px;
      right:24px;
      z-index:9999;
      font-family:'Segoe UI',sans-serif;
    }
    #chatbot-panel {
      display:none;
      flex-direction:column;
      width:320px;
      height:440px;
      background:#ffffff;
      border-radius:16px;
      box-shadow:0 8px 32px rgba(0,0,0,0.18);
      overflow:hidden;
      animation:slideUp 0.3s ease;
      border:1px solid #e2e8f0;
    }
    #chatbot-panel.open { display:flex; }
    .dark-mode-on #chatbot-panel {
      background:#1e293b;
      border-color:#334155;
    }
    .dark-mode-on #chatbot-messages {
      background:#0f172a;
    }
    .dark-mode-on #chatbot-input {
      background:#0f172a;
      color:#e2e8f0;
      border-color:#334155;
    }
  `;
    document.head.appendChild(style);

    // Widget HTML
    const widget = document.createElement('div');
    widget.id = 'chatbot-widget';
    widget.innerHTML = `

    <!-- Chat Panel -->
    <div id="chatbot-panel">

      <!-- Header -->
      <div style="
        background:linear-gradient(135deg,#0ea5e9,#0284c7);
        padding:14px 16px;
        display:flex;
        align-items:center;
        justify-content:space-between;
        flex-shrink:0;
      ">
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="
            width:36px;height:36px;
            background:rgba(255,255,255,0.2);
            border-radius:50%;
            display:flex;align-items:center;justify-content:center;
            font-size:18px;
          ">🤖</div>
          <div>
            <div style="color:#fff;font-weight:700;font-size:14px;">
              KS Assistant
            </div>
            <div style="color:rgba(255,255,255,0.8);font-size:11px;">
              Online • Offline ready
            </div>
          </div>
        </div>
        <button onclick="toggleChatbot()" style="
          background:rgba(255,255,255,0.2);
          border:none;color:#fff;
          width:28px;height:28px;
          border-radius:50%;cursor:pointer;
          font-size:14px;display:flex;
          align-items:center;justify-content:center;
        ">✕</button>
      </div>

      <!-- Messages -->
      <div id="chatbot-messages" style="
        flex:1;
        overflow-y:auto;
        padding:14px;
        background:#f8fafc;
        scroll-behavior:smooth;
      "></div>

      <!-- Input -->
      <div style="
        padding:10px 12px;
        background:#ffffff;
        border-top:1px solid #e2e8f0;
        display:flex;
        gap:8px;
        flex-shrink:0;
      ">
        <input
          id="chatbot-input"
          type="text"
          placeholder="Type a command..."
          autocomplete="off"
          style="
            flex:1;
            padding:9px 12px;
            border:1.5px solid #e2e8f0;
            border-radius:20px;
            font-size:13px;
            outline:none;
            font-family:inherit;
            background:#f8fafc;
            color:#1e293b;
            transition:border-color 0.2s;
          "
          onfocus="this.style.borderColor='#0ea5e9'"
          onblur="this.style.borderColor='#e2e8f0'"
          onkeydown="if(event.key==='Enter') handleUserInput()"
        >
        <button onclick="handleUserInput()" style="
          background:#0ea5e9;
          color:#fff;
          border:none;
          width:36px;height:36px;
          border-radius:50%;
          cursor:pointer;
          font-size:16px;
          display:flex;
          align-items:center;
          justify-content:center;
          flex-shrink:0;
          transition:background 0.2s;
        "
        onmouseover="this.style.background='#0284c7'"
        onmouseout="this.style.background='#0ea5e9'"
        >➤</button>
      </div>

    </div>

    <!-- Toggle Button -->
    <button id="chatbot-toggle-btn" onclick="toggleChatbot()" style="
      width:54px;height:54px;
      background:linear-gradient(135deg,#0ea5e9,#0284c7);
      border:none;
      border-radius:50%;
      cursor:pointer;
      font-size:24px;
      box-shadow:0 4px 16px rgba(14,165,233,0.4);
      display:flex;
      align-items:center;
      justify-content:center;
      margin-top:10px;
      margin-left:auto;
      transition:transform 0.2s;
    "
    onmouseover="this.style.transform='scale(1.08)'"
    onmouseout="this.style.transform='scale(1)'"
    title="Open KS Assistant"
    >🤖</button>
  `;

    document.body.appendChild(widget);

    // Welcome message
    setTimeout(() => {
        botReply(
            `Assalamu Alaikum! 👋\n` +
            `Main KS Assistant hoon.\n` +
            `"help" type karein commands dekhne ke liye.`,
            'info'
        );
    }, 300);
}

/**
 * toggleChatbot()
 * Opens or closes the chat panel.
 */
function toggleChatbot() {
    const panel = document.getElementById('chatbot-panel');
    const btn = document.getElementById('chatbot-toggle-btn');
    if (!panel) return;

    const isOpen = panel.classList.contains('open');
    panel.classList.toggle('open', !isOpen);
    if (btn) btn.style.display = isOpen ? 'flex' : 'none';

    if (!isOpen) {
        document.getElementById('chatbot-input')?.focus();
    }
}

/* =======================================================
   AUTO-INIT
   ======================================================= */
document.addEventListener('DOMContentLoaded', function () {
    // Build UI immediately
    buildChatbotUI();

    // Wait for DB to be ready before accepting commands
    window.addEventListener('dbReady', function () {
        console.log('[Chatbot] Ready ✓');
    });

    // Fallback if DB already open
    if (typeof db !== 'undefined' && db !== null) {
        console.log('[Chatbot] DB already ready ✓');
    }
});