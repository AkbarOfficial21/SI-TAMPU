'use strict';

/**
 * Konfigurasi aplikasi Si-Tampu.
 * Ganti SCRIPT_URL setelah Google Apps Script di-deploy sebagai Web App.
 */
window.APP_CONFIG = Object.freeze({
    SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbybGESo3MVAYoBfOQT2r9ripNETIA0FW8PIsRVy74y8TgiVxzN7Boldz60iI9NzJ1HS/exec',
    SPREADSHEET_NAME: 'Dev.Sitampu',
    USER_SHEET_NAME: 'User',
    LOGIN_PAGE: 'index.html',
    DASHBOARD_PAGE: 'dashboard.html',
    SESSION_KEY: 'sitampu_session',
    USER_KEY: 'sitampu_user'
});
