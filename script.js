'use strict';

const CONFIG = window.APP_CONFIG;

function clearLoginSession() {
    sessionStorage.removeItem(CONFIG.SESSION_KEY);
    sessionStorage.removeItem(CONFIG.USER_KEY);
}

function isBackForwardNavigation() {
    const navigation = performance.getEntriesByType('navigation')[0];
    return navigation?.type === 'back_forward';
}

// Saat halaman login muncul kembali melalui tombol Back, sesi wajib dihapus.
window.addEventListener('pageshow', (event) => {
    if (event.persisted || isBackForwardNavigation()) {
        clearLoginSession();
    }
});

function generateCaptcha() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let captcha = '';

    for (let i = 0; i < 6; i += 1) {
        captcha += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    document.getElementById('captchaCode').textContent = captcha;
    document.getElementById('captchaInput').value = '';
    document.getElementById('captchaInput').classList.remove('error', 'success');
    document.getElementById('captchaError').style.display = 'none';
    return captcha;
}

async function callApi(payload) {
    if (!CONFIG.SCRIPT_URL || CONFIG.SCRIPT_URL.includes('PASTE_URL')) {
        throw new Error('SCRIPT_URL pada config.js belum diisi.');
    }

    const response = await fetch(CONFIG.SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
        redirect: 'follow',
        cache: 'no-store'
    });

    if (!response.ok) {
        throw new Error(`Server merespons dengan status ${response.status}.`);
    }

    return response.json();
}

function validateForm(username, password, captchaInput, currentCaptcha) {
    let isValid = true;

    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const captchaElement = document.getElementById('captchaInput');

    if (!username) {
        usernameInput.classList.add('error');
        document.getElementById('usernameError').style.display = 'block';
        isValid = false;
    } else {
        usernameInput.classList.remove('error');
        document.getElementById('usernameError').style.display = 'none';
    }

    if (password.length < 6) {
        passwordInput.classList.add('error');
        document.getElementById('passwordError').style.display = 'block';
        isValid = false;
    } else {
        passwordInput.classList.remove('error');
        document.getElementById('passwordError').style.display = 'none';
    }

    if (captchaInput.toUpperCase() !== currentCaptcha.toUpperCase()) {
        captchaElement.classList.add('error');
        document.getElementById('captchaError').style.display = 'block';
        isValid = false;
    } else {
        captchaElement.classList.remove('error');
        document.getElementById('captchaError').style.display = 'none';
    }

    return isValid;
}

document.addEventListener('DOMContentLoaded', () => {
    // Membuka index.html selalu dianggap sebagai halaman awal login.
    clearLoginSession();

    let currentCaptcha = generateCaptcha();

    document.getElementById('refreshCaptcha').addEventListener('click', () => {
        currentCaptcha = generateCaptcha();
    });

    document.getElementById('passwordToggle').addEventListener('click', function togglePassword() {
        const passwordInput = document.getElementById('password');
        const visible = passwordInput.type === 'text';
        passwordInput.type = visible ? 'password' : 'text';
        this.querySelector('i').className = visible ? 'fas fa-eye' : 'fas fa-eye-slash';
    });

    document.getElementById('loginForm').addEventListener('submit', async (event) => {
        event.preventDefault();

        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value;
        const captchaInput = document.getElementById('captchaInput').value.trim();
        const errorElement = document.getElementById('loginError');

        errorElement.style.display = 'none';

        if (!validateForm(username, password, captchaInput, currentCaptcha)) return;

        const loginButton = document.getElementById('loginButton');
        const loadingOverlay = document.getElementById('loadingOverlay');
        loginButton.disabled = true;
        loadingOverlay.classList.add('active');

        try {
            const result = await callApi({ action: 'login', username, password });

            if (!result.success || !result.user || !result.token) {
                throw new Error(result.message || 'Login gagal. Periksa username dan password.');
            }

            sessionStorage.setItem(CONFIG.USER_KEY, JSON.stringify(result.user));
            sessionStorage.setItem(CONFIG.SESSION_KEY, result.token);

            if (document.getElementById('remember').checked) {
                localStorage.setItem('rememberedUser', username);
            } else {
                localStorage.removeItem('rememberedUser');
            }

            // Dashboard menjadi halaman baru, tetapi jika kembali ke index sesi akan dihapus.
            window.location.href = CONFIG.DASHBOARD_PAGE;
        } catch (error) {
            errorElement.textContent = error.message || 'Terjadi kesalahan saat menghubungi server.';
            errorElement.style.display = 'block';
            currentCaptcha = generateCaptcha();
        } finally {
            loadingOverlay.classList.remove('active');
            loginButton.disabled = false;
        }
    });

    document.getElementById('username').addEventListener('input', function clearUsernameError() {
        if (this.value.trim()) {
            this.classList.remove('error');
            document.getElementById('usernameError').style.display = 'none';
        }
    });

    document.getElementById('password').addEventListener('input', function clearPasswordError() {
        if (this.value.length >= 6) {
            this.classList.remove('error');
            document.getElementById('passwordError').style.display = 'none';
        }
    });

    document.getElementById('captchaInput').addEventListener('input', function clearCaptchaError() {
        if (this.value.toUpperCase() === currentCaptcha.toUpperCase()) {
            this.classList.remove('error');
            document.getElementById('captchaError').style.display = 'none';
        }
    });

    const rememberedUser = localStorage.getItem('rememberedUser');
    if (rememberedUser) {
        document.getElementById('username').value = rememberedUser;
        document.getElementById('remember').checked = true;
    }
});
