/* =======================================================
   js/auth.js
   Khuwaja Surgical — Authentication Handler
   Manages login, registration, session, and logout.

   DEPENDENCIES: js/db.js must be loaded first.

   HOW TO USE:
   - login.html    → handles login & register forms
   - Other pages   → calls requireLogin() to protect them
   ======================================================= */

// ---- Session key used in sessionStorage ----
const SESSION_KEY = 'ksLoggedUser';

/* -------------------------------------------------------
   getCurrentUser()
   Returns the currently logged-in user object, or null.
   Parses from sessionStorage (survives page reload,
   cleared when browser tab/window is closed).
------------------------------------------------------- */
function getCurrentUser() {
  const raw = sessionStorage.getItem(SESSION_KEY);
  return raw ? JSON.parse(raw) : null;
}

/* -------------------------------------------------------
   setCurrentUser(user)
   Saves the logged-in user to sessionStorage.
   Strips the password before saving for security.
   @param {object} user - The user record from DB
------------------------------------------------------- */
function setCurrentUser(user) {
  // Never store the password in session
  const safeUser = {
    id: user.id,
    sellerName: user.sellerName,
    email: user.email,
    role: user.role || 'staff',
    loginTime: new Date().toISOString()
  };
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(safeUser));
}

/* -------------------------------------------------------
   requireLogin()
   Call this at the top of every protected page.
   If no user is logged in, redirects to login.html.
   Also populates the header with the user's name.
------------------------------------------------------- */
function requireLogin() {
  const user = getCurrentUser();
  if (!user) {
    // Not logged in — redirect to login page
    window.location.href = 'login.html';
    return;
  }

  if (typeof ensureCurrentUserScopedData === 'function') {
    ensureCurrentUserScopedData().catch(err => {
      console.warn('[Auth] Could not initialize user-scoped data:', err.message);
    });
  }

  // Show user name in header badge (if element exists)
  const badge = document.querySelector('.user-badge');
  if (badge) badge.textContent = user.sellerName || 'Admin';
}

/* -------------------------------------------------------
   loginUser(email, password)
   Looks up the user by email, validates password.
   On success: saves session → redirects to dashboard.
   On failure: returns an error message string.
   @param {string} email
   @param {string} password
   Returns a Promise that resolves with null (ok) or
   an error message string.
------------------------------------------------------- */
async function loginUser(email, password) {
  try {
    // Find user by email using the index
    const user = await getDataByIndex('users', 'email', email.trim().toLowerCase());

    if (!user) {
      return 'No account found with this email address.';
    }

    // Compare password (plain text — add hashing in production)
    if (user.password !== password) {
      return 'Incorrect password. Please try again.';
    }

    // ---- Login success ----
    setCurrentUser(user);
    if (typeof ensureCurrentUserScopedData === 'function') {
      await ensureCurrentUserScopedData();
    }
    console.log('[Auth] Logged in as:', user.email);

    // Redirect to dashboard
    window.location.href = 'dashboard.html';
    return null; // null means no error

  } catch (err) {
    console.error('[Auth] loginUser error:', err);
    return 'Login failed. Please try again.';
  }
}

/* -------------------------------------------------------
   registerUser(sellerName, email, password)
   Creates a new user account.
   Checks for duplicate email before inserting.
   On success: saves session → redirects to dashboard.
   @param {string} sellerName
   @param {string} email
   @param {string} password
   Returns a Promise resolving with null or error string.
------------------------------------------------------- */
async function registerUser(sellerName, email, password) {
  try {
    const cleanEmail = email.trim().toLowerCase();

    // ---- Validate inputs ----
    if (!sellerName.trim()) return 'Please enter your full name.';
    if (!cleanEmail) return 'Please enter your email address.';
    if (password.length < 6) return 'Password must be at least 6 characters.';

    // ---- Check for duplicate email ----
    const existing = await getDataByIndex('users', 'email', cleanEmail);
    if (existing) {
      return 'An account with this email already exists.';
    }

    // ---- Save new user ----
    const newUser = {
      sellerName: sellerName.trim(),
      email: cleanEmail,
      password: password,   // Hash in production!
      role: 'staff',
      createdAt: new Date().toISOString()
    };

    const newId = await addData('users', newUser);
    newUser.id = newId;

    // Auto-login after registration
    setCurrentUser(newUser);
    if (typeof ensureCurrentUserScopedData === 'function') {
      await ensureCurrentUserScopedData();
    }
    console.log('[Auth] Registered and logged in:', cleanEmail);

    // Redirect to dashboard
    window.location.href = 'dashboard.html';
    return null;

  } catch (err) {
    console.error('[Auth] registerUser error:', err);
    // IndexedDB throws ConstraintError on duplicate unique index
    if (err.name === 'ConstraintError') {
      return 'An account with this email already exists.';
    }
    return 'Registration failed. Please try again.';
  }
}

/* -------------------------------------------------------
   logoutUser()
   Clears the session and redirects to login page.
   Attach to logout button's onclick or call directly.
------------------------------------------------------- */
function logoutUser() {
  sessionStorage.removeItem(SESSION_KEY);
  console.log('[Auth] User logged out.');
  window.location.href = 'login.html';
}

/* -------------------------------------------------------
   showAuthError(elementId, message)
   Displays an error message inside a given element.
   @param {string} elementId - ID of the error <div>
   @param {string} message   - Error text to display
------------------------------------------------------- */
function showAuthError(elementId, message) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.textContent = message;
  el.style.display = message ? 'block' : 'none';
}

/* -------------------------------------------------------
   hideAuthError(elementId)
   Clears and hides an error message element.
------------------------------------------------------- */
function hideAuthError(elementId) {
  showAuthError(elementId, '');
}

/* =======================================================
   LOGIN PAGE INIT
   Runs only on login.html — wires up forms & tab switching
   ======================================================= */
function initLoginPage() {

  // ---- Elements ----
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const loginTab = document.getElementById('login-tab');
  const registerTab = document.getElementById('register-tab');
  const goRegister = document.getElementById('go-register');
  const goLogin = document.getElementById('go-login');

  if (!loginForm) return; // Not on login page — exit

  // If already logged in, go straight to dashboard
  if (getCurrentUser()) {
    window.location.href = 'dashboard.html';
    return;
  }

  // ---- Inject error message divs into each form ----
  injectErrorDiv('login-error', loginForm);
  injectErrorDiv('register-error', registerForm);

  /* --- Tab Switching Functions --- */
  function switchToLogin() {
    loginForm.classList.remove('hidden');
    registerForm.classList.add('hidden');
    loginTab.classList.add('active');
    registerTab.classList.remove('active');
    hideAuthError('login-error');
  }

  function switchToRegister() {
    registerForm.classList.remove('hidden');
    loginForm.classList.add('hidden');
    registerTab.classList.add('active');
    loginTab.classList.remove('active');
    hideAuthError('register-error');
  }

  // Wire tab buttons
  loginTab.addEventListener('click', switchToLogin);
  registerTab.addEventListener('click', switchToRegister);

  // Wire inline links inside the forms
  if (goRegister) goRegister.addEventListener('click', (e) => { e.preventDefault(); switchToRegister(); });
  if (goLogin) goLogin.addEventListener('click', (e) => { e.preventDefault(); switchToLogin(); });

  /* --- Login Form Submit --- */
  loginForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    hideAuthError('login-error');

    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const btn = loginForm.querySelector('button[type="submit"]');

    // Show loading state on button
    btn.textContent = 'Logging in...';
    btn.disabled = true;

    const error = await loginUser(email, password);

    if (error) {
      // Show error and re-enable button
      showAuthError('login-error', error);
      btn.textContent = 'Login to Dashboard';
      btn.disabled = false;
    }
    // If no error, loginUser() already redirected
  });

  /* --- Register Form Submit --- */
  registerForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    hideAuthError('register-error');

    const name = document.getElementById('reg-name').value;
    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-password').value;
    const confirm = document.getElementById('reg-confirm').value;
    const btn = registerForm.querySelector('button[type="submit"]');

    // Client-side check: passwords must match
    if (password !== confirm) {
      showAuthError('register-error', 'Passwords do not match.');
      return;
    }

    btn.textContent = 'Creating Account...';
    btn.disabled = true;

    const error = await registerUser(name, email, password);

    if (error) {
      showAuthError('register-error', error);
      btn.textContent = 'Create Account';
      btn.disabled = false;
    }
    // If no error, registerUser() already redirected
  });
}

/* -------------------------------------------------------
   injectErrorDiv(id, form)
   Dynamically creates a styled error <div> inside a form,
   inserted just before the submit button.
------------------------------------------------------- */
function injectErrorDiv(id, form) {
  if (document.getElementById(id)) return; // Already exists

  const div = document.createElement('div');
  div.id = id;
  div.style.cssText = `
    display: none;
    background: #fee2e2;
    color: #991b1b;
    border: 1px solid #fca5a5;
    border-radius: 4px;
    padding: 8px 12px;
    font-size: 13px;
    margin-bottom: 12px;
  `;

  // Insert before the submit button
  const btn = form.querySelector('button[type="submit"]');
  form.insertBefore(div, btn);
}

/* -------------------------------------------------------
   wireLogoutLinks()
   Attaches logout confirmation handler to all elements
   with class 'logout-link' or id 'logout-btn'.
------------------------------------------------------- */
function wireLogoutLinks() {
  const logoutEls = document.querySelectorAll('.logout-link, #logout-btn');
  logoutEls.forEach(el => {
    el.addEventListener('click', function (e) {
      e.preventDefault();
      if (confirm('Are you sure you want to logout?')) {
        logoutUser();
      }
    });
  });
}

/* =======================================================
   AUTO-RUN ON DOM READY
   Waits for db.js to finish, then initializes auth.
   ======================================================= */
document.addEventListener('DOMContentLoaded', async function () {

  // Poll every 50ms until the DB is ready (set by db.js)
  const waitForDB = setInterval(() => {
    if (db !== null) {
      clearInterval(waitForDB);

      // Run login page logic if on login.html
      initLoginPage();

      // Wire logout buttons on all pages
      wireLogoutLinks();

      // Protect all pages EXCEPT login.html
      const page = window.location.pathname.split('/').pop();
      if (page !== 'login.html' && page !== '') {
        requireLogin();
      }
    }
  }, 50); // Check every 50ms until DB is ready

});
