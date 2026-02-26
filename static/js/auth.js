/**
 * AUTH GUARD + GLOBAL FETCH INTERCEPTOR
 * ======================================
 * This script does two jobs:
 *
 * JOB 1 - GUARD: If there's no login token, redirect to /auth/login immediately.
 *
 * JOB 2 - INTERCEPTOR: Patches the global fetch() so that EVERY API call
 *   in EVERY page automatically gets the Authorization header injected.
 *   This means we don't need to change a single fetch() call in any template!
 */

(function () {
    const token = localStorage.getItem('sb_access_token');
    const PUBLIC_PATHS = ['/auth/login', '/auth/signup', '/static/'];

    // --- JOB 1: GUARD ---
    const isPublicPage = PUBLIC_PATHS.some(p => window.location.pathname.startsWith(p));

    if (!token && !isPublicPage) {
        window.location.replace('/auth/login');
        throw new Error('Not authenticated. Redirecting...');
    }

    // Set Sentry User Context
    if (typeof Sentry !== 'undefined') {
        const userEmail = localStorage.getItem('sb_user_email');
        if (userEmail) {
            Sentry.setUser({ email: userEmail });
        }
    }

    // --- JOB 2: FETCH INTERCEPTOR ---
    // Save the original browser fetch first
    const _originalFetch = window.fetch.bind(window);

    // Replace global fetch with our smart version
    window.fetch = function (url, options = {}) {
        // Only inject token for our own API calls (not CDN fonts, Google, etc.)
        const urlStr = typeof url === 'string' ? url : (url && url.url) || '';
        const isOwnApi = urlStr.startsWith('/') || urlStr.includes('localhost');

        if (token && isOwnApi) {
            options = {
                ...options,
                headers: {
                    ...options.headers,
                    'Authorization': `Bearer ${token}`
                }
            };
        }

        return _originalFetch(url, options).then(function (response) {
            // If server says our token is expired, force re-login
            if (response.status === 401 && !urlStr.includes('/auth/')) {
                console.warn('Session expired. Redirecting to login...');
                localStorage.removeItem('sb_access_token');
                localStorage.removeItem('sb_user_email');
                window.location.replace('/auth/login');
            }
            return response;
        });
    };

    // --- GLOBAL HELPERS ---

    /** Call this from any logout button */
    window.logout = function () {
        localStorage.removeItem('sb_access_token');
        localStorage.removeItem('sb_user_email');
        window.location.replace('/auth/login');
    };

    /** The currently logged-in user's email */
    window.currentUserEmail = localStorage.getItem('sb_user_email') || '';

})();
