/**
 * Common JavaScript - Shared functionality across pages
 * Handles: Session management, API calls, Navigation updates
 */

// ===== SESSION MANAGEMENT =====
const SESSION_KEY = 'evoting_session';
const USER_KEY = 'evoting_user';

function getSession() {
    return localStorage.getItem(SESSION_KEY);
}

function setSession(token, userInfo) {
    localStorage.setItem(SESSION_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(userInfo));
}

function clearSession() {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(USER_KEY);
}

function getUserInfo() {
    const userStr = localStorage.getItem(USER_KEY);
    return userStr ? JSON.parse(userStr) : null;
}

function isLoggedIn() {
    return !!getSession();
}

function isCommission() {
    const user = getUserInfo();
    return user && (user.is_commission === 1 || user.is_commission === true);
}

// ===== API HELPER =====
async function apiCall(endpoint, options = {}) {
    const session = getSession();
    const headers = {
        'Content-Type': 'application/json',
        ...(options.headers || {})
    };
    
    if (session) {
        headers['Authorization'] = `Bearer ${session}`;
    }
    
    const response = await fetch(`/api/${endpoint}`, {
        ...options,
        headers
    });
    
    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Network error' }));
        throw new Error(error.error || `HTTP ${response.status}`);
    }
    
    return response.json();
}

// ===== NAVIGATION UPDATE =====
function updateNavigation() {
    const navbar = document.querySelector('.nav-links');
    if (!navbar) return;
    
    const loggedIn = isLoggedIn();
    const commission = isCommission();
    const currentPage = window.location.pathname;
    
    let navHTML = '';
    
    if (!loggedIn) {
        // Not logged in - show login modal trigger
        navHTML = `
            <a href="/index.html" ${currentPage === '/index.html' || currentPage === '/' ? 'class="active"' : ''}>Główna</a>
            <a href="/hash-generator.html" ${currentPage === '/hash-generator.html' ? 'class="active"' : ''}>Generator Hash</a>
            <a href="#" onclick="if(typeof showLoginModal === 'function') showLoginModal(); return false;">Logowanie</a>
        `;
    } else if (commission) {
        // Commission member
        navHTML = `
            <a href="/index.html" ${currentPage === '/index.html' || currentPage === '/' ? 'class="active"' : ''}>Główna</a>
            <a href="/hash-generator.html" ${currentPage === '/hash-generator.html' ? 'class="active"' : ''}>Generator Hash</a>
            <a href="/commission.html" ${currentPage === '/commission.html' ? 'class="active"' : ''}>Komisja</a>
            <a href="#" onclick="logout(); return false;">Wyloguj</a>
        `;
    } else {
        // Regular user (voter)
        navHTML = `
            <a href="/index.html" ${currentPage === '/index.html' || currentPage === '/' ? 'class="active"' : ''}>Główna</a>
            <a href="/hash-generator.html" ${currentPage === '/hash-generator.html' ? 'class="active"' : ''}>Generator Hash</a>
            <a href="#" onclick="logout(); return false;">Wyloguj</a>
        `;
    }
    
    navbar.innerHTML = navHTML;
}

// ===== LOGOUT =====
function logout() {
    clearSession();
    window.location.href = '/index.html';
}

// ===== UTILITY FUNCTIONS =====
async function sha256(data) {
    const encoder = new TextEncoder();
    const buffer = await crypto.subtle.digest('SHA-256', encoder.encode(data));
    const hashArray = Array.from(new Uint8Array(buffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function formatDate(dateString) {
    return new Date(dateString).toLocaleString('pl-PL');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getStatusLabel(status) {
    const labels = {
        'pending': '⏳ Oczekuje',
        'active': '✅ Aktywne',
        'closed': '🔒 Zakończone',
        'finalized': '🏁 Sfinalizowane'
    };
    return labels[status] || status;
}

// ===== INITIALIZE ON PAGE LOAD =====
document.addEventListener('DOMContentLoaded', () => {
    updateNavigation();
});

// ===== EXPORT FOR MODULE USAGE =====
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        getSession,
        setSession,
        clearSession,
        getUserInfo,
        isLoggedIn,
        isCommission,
        apiCall,
        updateNavigation,
        logout,
        sha256,
        formatDate,
        escapeHtml,
        getStatusLabel
    };
}
