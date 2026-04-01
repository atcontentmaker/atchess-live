(function () {
    'use strict';

    const config = window.ATCHESS_AUTH_CONFIG || {};
    const isConfigured =
        typeof config.supabaseUrl === 'string' &&
        typeof config.supabaseAnonKey === 'string' &&
        config.supabaseUrl &&
        config.supabaseAnonKey &&
        !config.supabaseUrl.includes('YOUR_SUPABASE_URL') &&
        !config.supabaseAnonKey.includes('YOUR_SUPABASE_ANON_KEY');

    const authModal = document.getElementById('auth-modal');
    const authTitleLine = document.getElementById('auth-title-line');
    const authSubtitleLine = document.getElementById('auth-subtitle-line');
    const authStatusLine = document.getElementById('auth-status-line');
    const authConfigNote = document.getElementById('auth-config-note');
    const authEmailInput = document.getElementById('auth-email-input');
    const authOtpInput = document.getElementById('auth-otp-input');
    const authSendOtpBtn = document.getElementById('auth-send-otp-btn');
    const authVerifyOtpBtn = document.getElementById('auth-verify-otp-btn');
    const authGoogleBtn = document.getElementById('auth-google-btn');
    const authSignoutBtn = document.getElementById('auth-signout-btn');
    const authOpenBtn = document.getElementById('auth-open-btn');

    let supabaseClient = null;
    let currentUser = null;

    function setAuthStatus(message) {
        if (authStatusLine) authStatusLine.textContent = message;
    }

    function setButtonBusy(button, busy, busyText, idleText) {
        if (!button) return;
        button.disabled = busy;
        button.textContent = busy ? busyText : idleText;
    }

    function describeUser(user) {
        if (!user) return null;
        return user.user_metadata?.full_name || user.user_metadata?.name || user.email || 'Signed In';
    }

    function updateAuthUI() {
        if (!authTitleLine || !authSubtitleLine || !authSignoutBtn || !authOpenBtn) return;

        if (!isConfigured) {
            authTitleLine.textContent = 'Auth Setup Needed';
            authSubtitleLine.textContent = 'Add your Supabase project URL and anon key in auth-config.js to enable email OTP and Google sign-in.';
            authSignoutBtn.disabled = true;
            if (authGoogleBtn) authGoogleBtn.disabled = true;
            return;
        }

        if (currentUser) {
            authTitleLine.textContent = describeUser(currentUser);
            authSubtitleLine.textContent = currentUser.email ? `Signed in as ${currentUser.email}` : 'Signed in';
            authOpenBtn.textContent = 'Manage Account';
            authSignoutBtn.disabled = false;
        } else {
            authTitleLine.textContent = 'Guest Mode';
            authSubtitleLine.textContent = 'Create an account with email OTP or Google so we can attach identity to your profile later.';
            authOpenBtn.textContent = 'Create / Sign In';
            authSignoutBtn.disabled = true;
        }
    }

    async function handleSession() {
        if (!supabaseClient) return;
        const { data, error } = await supabaseClient.auth.getUser();
        if (error) {
            setAuthStatus(error.message || 'Could not read account session.');
            return;
        }
        currentUser = data?.user || null;
        updateAuthUI();
        if (currentUser) {
            setAuthStatus(`Signed in as ${currentUser.email || describeUser(currentUser)}.`);
        }
    }

    window.openAuthModal = function () {
        if (!authModal) return;
        authModal.classList.add('open');
        authModal.setAttribute('aria-hidden', 'false');
        if (authEmailInput) authEmailInput.focus();
    };

    window.closeAuthModal = function () {
        if (!authModal) return;
        authModal.classList.remove('open');
        authModal.setAttribute('aria-hidden', 'true');
    };

    window.signOutAccount = async function () {
        if (!supabaseClient) {
            setAuthStatus('Auth is not configured yet.');
            return;
        }
        const { error } = await supabaseClient.auth.signOut();
        if (error) {
            setAuthStatus(error.message || 'Could not sign out.');
            return;
        }
        currentUser = null;
        updateAuthUI();
        setAuthStatus('Signed out.');
    };

    async function sendOtp() {
        if (!supabaseClient) {
            setAuthStatus('Auth is not configured yet.');
            return;
        }
        const email = authEmailInput?.value?.trim();
        if (!email) {
            setAuthStatus('Enter your email address first.');
            return;
        }

        setButtonBusy(authSendOtpBtn, true, 'Sending...', 'Send OTP');
        const { error } = await supabaseClient.auth.signInWithOtp({
            email,
            options: {
                shouldCreateUser: true,
                emailRedirectTo: window.location.origin
            }
        });
        setButtonBusy(authSendOtpBtn, false, 'Sending...', 'Send OTP');

        if (error) {
            setAuthStatus(error.message || 'Could not send OTP.');
            return;
        }
        setAuthStatus(`OTP sent to ${email}. If Supabase is still using magic links, switch the email template to token mode first.`);
    }

    async function verifyOtp() {
        if (!supabaseClient) {
            setAuthStatus('Auth is not configured yet.');
            return;
        }
        const email = authEmailInput?.value?.trim();
        const token = authOtpInput?.value?.trim();
        if (!email || !token) {
            setAuthStatus('Enter both your email and the OTP.');
            return;
        }

        setButtonBusy(authVerifyOtpBtn, true, 'Verifying...', 'Verify OTP');
        const { data, error } = await supabaseClient.auth.verifyOtp({
            email,
            token,
            type: 'email'
        });
        setButtonBusy(authVerifyOtpBtn, false, 'Verifying...', 'Verify OTP');

        if (error) {
            setAuthStatus(error.message || 'Invalid OTP.');
            return;
        }

        currentUser = data?.user || null;
        updateAuthUI();
        setAuthStatus('Email verified. You are signed in.');
        window.closeAuthModal();
    }

    async function signInWithGoogle() {
        if (!supabaseClient) {
            setAuthStatus('Auth is not configured yet.');
            return;
        }

        setButtonBusy(authGoogleBtn, true, 'Redirecting...', 'Continue with Google');
        const { error } = await supabaseClient.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: window.location.origin
            }
        });
        setButtonBusy(authGoogleBtn, false, 'Redirecting...', 'Continue with Google');

        if (error) {
            setAuthStatus(error.message || 'Could not start Google sign-in.');
        }
    }

    async function initAuth() {
        if (!isConfigured) {
            updateAuthUI();
            setAuthStatus('Auth is disabled until auth-config.js is filled in.');
            return;
        }

        if (!window.supabase?.createClient) {
            setAuthStatus('Supabase client failed to load.');
            return;
        }

        supabaseClient = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
            auth: {
                persistSession: true,
                autoRefreshToken: true,
                detectSessionInUrl: true
            }
        });

        supabaseClient.auth.onAuthStateChange((_event, session) => {
            currentUser = session?.user || null;
            updateAuthUI();
        });

        await handleSession();
    }

    authSendOtpBtn?.addEventListener('click', sendOtp);
    authVerifyOtpBtn?.addEventListener('click', verifyOtp);
    authGoogleBtn?.addEventListener('click', signInWithGoogle);
    authModal?.addEventListener('click', (event) => {
        if (event.target === authModal) window.closeAuthModal();
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && authModal?.classList.contains('open')) {
            window.closeAuthModal();
        }
    });

    if (!config.googleEnabled && authGoogleBtn) {
        authGoogleBtn.disabled = true;
        authGoogleBtn.textContent = 'Google Not Enabled';
    }
    if (authConfigNote && isConfigured) {
        authConfigNote.textContent = 'Supabase is configured. Make sure the email template uses the OTP token and Google is enabled in the Supabase dashboard.';
    }

    updateAuthUI();
    initAuth();
})();
