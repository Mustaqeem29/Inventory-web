/* =======================================================
   js/settings.js
   Khuwaja Surgical - Settings Page Logic
   Prevents raw form POSTs and saves settings locally.
   ======================================================= */

let currentSettingsRecord = null;

function getSettingsForms() {
    const forms = document.querySelectorAll('.settings-form');
    return {
        businessForm: forms[0] || null,
        taxForm: forms[1] || null,
        printForm: forms[2] || null,
        passwordForm: forms[3] || null
    };
}

function fillSettingsForm(settings) {
    document.getElementById('biz-name').value = settings.businessName || '';
    document.getElementById('biz-phone').value = settings.phone || '';
    document.getElementById('biz-address').value = settings.address || '';
    document.getElementById('biz-email').value = settings.email || '';

    document.getElementById('tax-rate').value = settings.taxRate ?? 17;
    document.getElementById('currency').value = settings.currency || 'PKR';
    document.getElementById('low-stock-threshold').value = settings.lowStockLimit ?? 10;
    document.getElementById('invoice-prefix').value = settings.invoicePrefix || '#';
    document.getElementById('invoice-start').value = settings.invoiceStart ?? 1001;

    document.getElementById('print-width').value = settings.printWidth || '80mm';
    document.querySelector('input[name="show_logo"]').checked = Boolean(settings.showLogo);
    document.querySelector('input[name="show_tax"]').checked = Boolean(settings.showTax);
    document.querySelector('input[name="show_footer"]').checked = Boolean(settings.showFooter);
    document.getElementById('footer-msg').value = settings.footerMsg || '';
}

async function loadSettingsPageData() {
    const records = await getAllData('settings');
    currentSettingsRecord = records[0] || {
        id: 1,
        ...getDefaultSettingsRecord()
    };

    fillSettingsForm(currentSettingsRecord);
}

function collectSettingsPayload() {
    return {
        ...currentSettingsRecord,
        businessName: document.getElementById('biz-name').value.trim(),
        phone: document.getElementById('biz-phone').value.trim(),
        address: document.getElementById('biz-address').value.trim(),
        email: document.getElementById('biz-email').value.trim(),
        taxRate: parseFloat(document.getElementById('tax-rate').value) || 0,
        currency: document.getElementById('currency').value,
        lowStockLimit: parseInt(document.getElementById('low-stock-threshold').value, 10) || 10,
        invoicePrefix: document.getElementById('invoice-prefix').value.trim() || '#',
        invoiceStart: parseInt(document.getElementById('invoice-start').value, 10) || 1001,
        printWidth: document.getElementById('print-width').value,
        showLogo: document.querySelector('input[name="show_logo"]').checked,
        showTax: document.querySelector('input[name="show_tax"]').checked,
        showFooter: document.querySelector('input[name="show_footer"]').checked,
        footerMsg: document.getElementById('footer-msg').value.trim()
    };
}

async function saveSettingsSection(message) {
    const payload = collectSettingsPayload();

    if (!payload.businessName) {
        showToast('Business name is required.', 'warning');
        document.getElementById('biz-name').focus();
        return;
    }

    if (currentSettingsRecord?.id) {
        await updateData('settings', payload);
    } else {
        const newId = await addData('settings', payload);
        payload.id = newId;
    }

    currentSettingsRecord = payload;
    showToast(message, 'success');
}

async function updatePassword(currentPassword, newPassword, confirmPassword) {
    const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
    if (!user?.id) {
        throw new Error('Please log in again and retry.');
    }

    const fullUser = await getDataById('users', user.id);
    if (!fullUser) {
        throw new Error('User account not found.');
    }

    if (fullUser.password !== currentPassword) {
        throw new Error('Current password is incorrect.');
    }

    if (newPassword.length < 6) {
        throw new Error('New password must be at least 6 characters.');
    }

    if (newPassword !== confirmPassword) {
        throw new Error('New password and confirm password do not match.');
    }

    await updateData('users', {
        ...fullUser,
        password: newPassword
    });
}

function wireSettingsForms() {
    const { businessForm, taxForm, printForm, passwordForm } = getSettingsForms();

    [businessForm, taxForm, printForm, passwordForm].forEach(form => {
        if (!form) return;
        form.addEventListener('submit', event => event.preventDefault());
    });

    businessForm?.addEventListener('submit', async () => {
        try {
            await saveSettingsSection('Business info saved successfully.');
        } catch (err) {
            console.error('[Settings] Business save failed:', err);
            showToast('Could not save business info: ' + err.message, 'error');
        }
    });

    taxForm?.addEventListener('submit', async () => {
        try {
            await saveSettingsSection('Tax settings saved successfully.');
        } catch (err) {
            console.error('[Settings] Tax save failed:', err);
            showToast('Could not save tax settings: ' + err.message, 'error');
        }
    });

    printForm?.addEventListener('submit', async () => {
        try {
            await saveSettingsSection('Print settings saved successfully.');
        } catch (err) {
            console.error('[Settings] Print save failed:', err);
            showToast('Could not save print settings: ' + err.message, 'error');
        }
    });

    passwordForm?.addEventListener('submit', async () => {
        const currentPassword = document.getElementById('current-pass').value;
        const newPassword = document.getElementById('new-pass').value;
        const confirmPassword = document.getElementById('confirm-pass').value;

        try {
            await updatePassword(currentPassword, newPassword, confirmPassword);
            passwordForm.reset();
            showToast('Password updated successfully.', 'success');
        } catch (err) {
            console.error('[Settings] Password update failed:', err);
            showToast(err.message || 'Could not update password.', 'error');
        }
    });
}

async function initSettingsPage() {
    if (!document.querySelector('.settings-form')) return;

    try {
        if (typeof dbReady !== 'undefined') {
            await dbReady;
        }

        await loadSettingsPageData();
        wireSettingsForms();
    } catch (err) {
        console.error('[Settings] init failed:', err);
        showToast('Could not load settings. Please refresh.', 'error');
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSettingsPage);
} else {
    initSettingsPage();
}
