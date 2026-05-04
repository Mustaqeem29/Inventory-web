# 📦 Khuwaja Surgical — Inventory Management System

A modern, redesigned web-based inventory management system tailored for Khuwaja Surgical. This application features a robust local database, real-time analytics, a professional billing system, and an integrated **Gemini AI Chatbot**.

## 🚀 Key Features

*   **📊 Dynamic Dashboard**: View real-time stock levels, recent bills, and critical low-stock alerts at a glance.
*   **🤖 AI Inventory Assistant**: Powered by **Google Gemini AI**. Ask the chatbot about stock levels, logical deductions, or inventory advice in English or Roman Urdu.
*   **🧾 Professional Billing**: Generate, manage, and print professional bills directly from the browser.
*   **📦 Inventory Control**: Full CRUD support for products with categories, suppliers, and quantity tracking.
*   **🌙 Dark Mode**: Sleek, modern interface with a premium dark mode toggle.
*   **📴 Offline Ready**: Uses **IndexedDB** for local storage, allowing you to manage your business even without an internet connection.
*   **📱 Responsive Design**: Fully optimized for desktops, tablets, and mobile devices.

## 🛠️ Tech Stack

*   **Frontend**: HTML5, Vanilla JavaScript, CSS3
*   **Database**: IndexedDB (Browser-native local storage)
*   **AI Engine**: Google Gemini API (2.0 Flash)
*   **Styling**: Modern CSS with Glassmorphism and smooth animations.

## ⚙️ Setup & Installation

1.  **Clone the Repository**:
    ```bash
    git clone https://github.com/Mustaqeem29/Inventory-web.git
    ```

2.  **Configure API Key**:
    The AI Chatbot requires a Gemini API Key. For security, create a file at `js/config.js` and add your key:
    ```javascript
    const CONFIG = {
        GEMINI_API_KEY: "YOUR_API_KEY_HERE"
    };
    ```

3.  **Run the App**:
    Simply open `index.html` in any modern web browser. No server required!

## 🔒 Security Note

The `js/config.js` file is included in `.gitignore` to prevent your private API keys from being leaked to GitHub. Always keep your keys secret!

## 📄 License

This project is developed for Khuwaja Surgical. All rights reserved.
