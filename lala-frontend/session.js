const SESSION_TIMEOUT_MS = 5 * 60 * 60 * 1000;
const CHECK_INTERVAL_MS = 30 * 1000;
const STORAGE_KEY = 'lala_last_activity';

function touchActivity() {
  localStorage.setItem(STORAGE_KEY, Date.now().toString());
}

function checkSession() {
  const lastStr = localStorage.getItem(STORAGE_KEY);
  if (!lastStr) {
    touchActivity();
    return;
  }
  const elapsed = Date.now() - parseInt(lastStr, 10);
  if (elapsed > SESSION_TIMEOUT_MS) {
    localStorage.removeItem('lala_token');
    localStorage.removeItem('lala_user');
    localStorage.removeItem(STORAGE_KEY);
    const current = window.location.pathname.split('/').pop();
    const publicPages = ['guest-login.html', 'signup.html', 'forgot-password.html', 'index.html', 'search.html'];
    if (!publicPages.includes(current)) {
      window.location.href = 'guest-login.html?expired=1';
    }
  }
}

const activityEvents = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
activityEvents.forEach(ev => document.addEventListener(ev, touchActivity, { passive: true }));

touchActivity();
checkSession();
setInterval(checkSession, CHECK_INTERVAL_MS);
