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
   GEMINI AI INTEGRATION CONFIG
   ======================================================= */

// The API Key is now loaded from js/config.js (which is hidden from GitHub)
const API_KEY = typeof CONFIG !== 'undefined' ? CONFIG.GEMINI_API_KEY : "";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${API_KEY}`;

const SYSTEM_PROMPT = `You are a logical AI Inventory Chatbot. You do not have direct access to a live database. Instead, you reason step by step based on:

1. The user's question
2. Any inventory information the user provides in the conversation
3. Logical deduction and common sense about inventory management

## YOUR THINKING PROCESS (internal)
For every question, follow these logical steps:

Step 1 – Understand what the user is asking (availability, quantity, price, supplier, low stock, adding, updating, removing, searching)

Step 2 – Check if the needed information exists in the current conversation history

Step 3 – If information is missing, ask the user logically:
   "To answer that, I need [specific missing info]. Can you provide it?"

Step 4 – If user asks to add/update/remove items, confirm the action logically before responding

Step 5 – If quantity <= 5, flag as low stock logically
   "Based on my reasoning, [product] has low stock (X units). Suggest reordering."

Step 6 – If question is outside inventory (politics, weather, general chat), respond:
   "I am an inventory logic bot. I can only help with stock, products, suppliers, and quantities."

## OUTPUT FORMAT
- Be clear, logical, and conversational
- Show your reasoning briefly if needed
- Never invent fake inventory data
- Match user language (English / Roman Urdu)

## EXAMPLE LOGICAL RESPONSES

User: "Do we have apples?"
Bot: "I don't see apples mentioned yet. Could you tell me the current quantity of apples in stock?"

User: "We have 10 apples"
Bot: "Got it. Based on the information you provided: Apples – Quantity: 10. Price and supplier unknown. Would you like to add price?"

User: "What is low stock?"
Bot: "Based on inventory logic, low stock is typically when quantity <= 5. Currently, apples (10 units) are not low stock. Need me to check another product?"

User: "Add 50 chairs from SteelMart"
Bot: "Confirming: Add product 'Chairs' – Quantity: 50 – Supplier: SteelMart. Category and price not provided. Should I add with default values or ask for them?"

User: "Remove apples"
Bot: "Please confirm: Remove 'apples' from inventory? (Yes/No)"

User: "Roman Urdu mein batao kya stock hai"
Bot: "Aap ne abhi tak koi product ki quantity nahi batayi. Pehle bataen kis cheez ka stock dekhna hai?"

## GOAL
Think like a smart inventory clerk. Ask, confirm, deduce, and never guess missing data.`;

// Stores conversation history for Gemini API context
let chatHistory = [];

/**
 * processMessage(input)
 * Entry point — Sends user message to Gemini AI and displays response.
 * @param {string} input - User message
 */
async function processMessage(input) {
    const text = input.trim();
    if (!text) return;

    // Add user message to history
    chatHistory.push({
        role: "user",
        parts: [{ text: text }]
    });

    try {
        const response = await fetch(GEMINI_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                systemInstruction: {
                    parts: [{ text: SYSTEM_PROMPT }]
                },
                contents: chatHistory,
                generationConfig: {
                    temperature: 0.2,
                }
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`API error: ${response.status} - ${errorData.error?.message || response.statusText}`);
        }

        const data = await response.json();
        
        if (data.candidates && data.candidates.length > 0) {
            let botText = data.candidates[0].content.parts[0].text;
            
            // Add bot response to history
            chatHistory.push({
                role: "model",
                parts: [{ text: botText }]
            });
            
            botReply(botText, 'info');
        } else {
            botReply('Sorry, the AI response was empty.', 'error');
        }
    } catch (error) {
        console.error("Gemini API Request failed:", error);
        if (error.message.includes('429')) {
            botReply('Too many requests. Please wait a few seconds and try again.', 'warning');
        } else {
            botReply('❌ Connection lost. Please check your internet or try again later.', 'error');
        }
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
        animation:fadeIn 0.2s ease;
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
        background:${isUser ? '#0ea5e9' : (type === 'error' ? '#fee2e2' : (type === 'success' ? '#dcfce7' : (type === 'warning' ? '#fef3c7' : '#f1f5f9')))};
        color:${isUser ? '#ffffff' : (type === 'error' ? '#991b1b' : (type === 'success' ? '#166534' : (type === 'warning' ? '#92400e' : '#1e293b')))};
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
    <div style="padding:10px 16px;background:#f1f5f9;border-radius:16px 16px 16px 4px;border:1px solid #e2e8f0;display:flex;flex-direction:column;gap:4px;">
      <div style="font-size:10px;color:#64748b;font-weight:600;">Assistant is thinking...</div>
      <span style="display:inline-flex;gap:4px;align-items:center;">
        <span style="width:6px;height:6px;background:#94a3b8;border-radius:50%;animation:bounce 1s infinite 0s;display:inline-block;"></span>
        <span style="width:6px;height:6px;background:#94a3b8;border-radius:50%;animation:bounce 1s infinite 0.2s;display:inline-block;"></span>
        <span style="width:6px;height:6px;background:#94a3b8;border-radius:50%;animation:bounce 1s infinite 0.4s;display:inline-block;"></span>
      </span>
    </div>`;

    container.appendChild(wrap);
    container.scrollTop = container.scrollHeight;
}

function hideTypingIndicator() {
    const el = document.getElementById('typing-indicator');
    if (el) el.remove();
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

    // Process (typing indicator will be hidden inside or after processMessage)
    try {
        await processMessage(text);
    } finally {
        hideTypingIndicator();
    }
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
            'Assalamu Alaikum! \n' +
            'Main KS Assistant hoon. Main inventory ke hawale se aapke sawalaat ka jawab de sakta hoon.\n' +
            'Aap kisi item ke stock, price, ya supplier ke baare mein pooch sakte hain.',
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
        const input = document.getElementById('chatbot-input');
        if (input) input.focus();
    }
}

/* =======================================================
   AUTO-INIT
   ======================================================= */
function initChatbot() {
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
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initChatbot);
} else {
    initChatbot();
}
