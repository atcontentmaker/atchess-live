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
    const authDisplayNameInput = document.getElementById('auth-display-name-input');
    const authAvatarUrlInput = document.getElementById('auth-avatar-url-input');
    const authSendOtpBtn = document.getElementById('auth-send-otp-btn');
    const authVerifyOtpBtn = document.getElementById('auth-verify-otp-btn');
    const authSaveProfileBtn = document.getElementById('auth-save-profile-btn');
    const authGoogleBtn = document.getElementById('auth-google-btn');
    const authSignoutBtn = document.getElementById('auth-signout-btn');
    const authOpenBtn = document.getElementById('auth-open-btn');
    const matchHistoryList = document.getElementById('match-history-list');
    const matchHistoryEmpty = document.getElementById('match-history-empty');

    let supabaseClient = null;
    let currentUser = null;

    function getProfileDisplayName(user) {
        if (!user) return null;
        return (
            user.user_metadata?.atchess_display_name ||
            user.user_metadata?.display_name ||
            user.user_metadata?.full_name ||
            user.user_metadata?.name ||
            user.email ||
            'Player'
        );
    }

    function getProfileAvatarUrl(user) {
        if (!user) return '';
        return user.user_metadata?.atchess_avatar_url || user.user_metadata?.avatar_url || '';
    }

    function buildProfile(user) {
        if (!user) return null;
        return {
            id: user.id,
            email: user.email || '',
            displayName: getProfileDisplayName(user),
            avatarUrl: getProfileAvatarUrl(user)
        };
    }

    function emitAuthProfile(user) {
        window.dispatchEvent(new CustomEvent('atchess-auth-changed', { detail: buildProfile(user) }));
    }

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
        return getProfileDisplayName(user) || 'Signed In';
    }

    function fillProfileInputs(user) {
        if (authDisplayNameInput) authDisplayNameInput.value = user ? getProfileDisplayName(user) : '';
        if (authAvatarUrlInput) authAvatarUrlInput.value = user ? getProfileAvatarUrl(user) : '';
    }

    function formatHistoryDate(value) {
        try {
            return new Date(value).toLocaleString();
        } catch (_error) {
            return 'Recently';
        }
    }

    function renderMatchHistory(rows) {
        if (!matchHistoryList) return;
        matchHistoryList.innerHTML = '';

        if (!rows || !rows.length) {
            const empty = document.createElement('div');
            empty.className = 'auth-note';
            empty.textContent = currentUser ? 'No saved matches yet.' : 'Sign in to load account match history.';
            matchHistoryList.appendChild(empty);
            return;
        }

        rows.forEach((row) => {
            const item = document.createElement('div');
            item.className = 'match-history-item';
            const resultClass = row.result === 'win' ? 'win' : row.result === 'loss' ? 'loss' : 'draw';
            item.innerHTML = `
                <div class="match-history-meta">
                    <div class="match-history-opponent">${row.opponent_name || 'Unknown Opponent'}</div>
                    <div class="match-history-detail">${(row.mode || 'game').toUpperCase()} · ${(row.reason || 'result').toUpperCase()} · ${formatHistoryDate(row.played_at)}</div>
                </div>
                <div class="match-history-result ${resultClass}">${row.result || 'draw'}</div>
            `;
            matchHistoryList.appendChild(item);
        });
    }

    async function loadMatchHistory() {
        if (!supabaseClient || !currentUser) {
            renderMatchHistory([]);
            return;
        }

        const { data, error } = await supabaseClient
            .from('match_history')
            .select('played_at, mode, result, reason, opponent_name')
            .eq('user_id', currentUser.id)
            .order('played_at', { ascending: false })
            .limit(10);

        if (error) {
            renderMatchHistory([]);
            setAuthStatus('Signed in. Match history table is not ready yet.');
            return;
        }

        renderMatchHistory(data || []);
    }

    function updateAuthUI() {
        if (!authTitleLine || !authSubtitleLine || !authSignoutBtn || !authOpenBtn) return;

        if (!isConfigured) {
            authTitleLine.textContent = 'Auth Setup Needed';
            authSubtitleLine.textContent = 'Add your Supabase project URL and anon key in auth-config.js to enable email OTP and Google sign-in.';
            authSignoutBtn.disabled = true;
            if (authGoogleBtn) authGoogleBtn.disabled = true;
            if (authSaveProfileBtn) authSaveProfileBtn.disabled = true;
            renderMatchHistory([]);
            return;
        }

        if (currentUser) {
            authTitleLine.textContent = describeUser(currentUser);
            authSubtitleLine.textContent = currentUser.email ? `Signed in as ${currentUser.email}` : 'Signed in';
            authOpenBtn.textContent = 'Manage Account';
            authSignoutBtn.disabled = false;
            if (authSaveProfileBtn) authSaveProfileBtn.disabled = false;
        } else {
            authTitleLine.textContent = 'Guest Mode';
            authSubtitleLine.textContent = 'Create an account with email OTP or Google so we can attach identity to your profile later.';
            authOpenBtn.textContent = 'Create / Sign In';
            authSignoutBtn.disabled = true;
            if (authSaveProfileBtn) authSaveProfileBtn.disabled = true;
        }
        fillProfileInputs(currentUser);
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
        emitAuthProfile(currentUser);
        await loadMatchHistory();
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
        emitAuthProfile(null);
        renderMatchHistory([]);
        setAuthStatus('Signed out.');
    };

    window.recordMatchHistory = async function (payload) {
        if (!supabaseClient || !currentUser || !payload) return;
        const { error } = await supabaseClient.from('match_history').insert({
            user_id: currentUser.id,
            mode: payload.mode || 'engine',
            result: payload.result || 'draw',
            reason: payload.reason || 'draw',
            opponent_name: payload.opponentName || 'Unknown Opponent',
            player_color: payload.playerColor || 'white',
            pgn: payload.pgn || '',
            fen: payload.fen || ''
        });
        if (!error) {
            await loadMatchHistory();
        }
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
        emitAuthProfile(currentUser);
        await loadMatchHistory();
        setAuthStatus('Email verified. You are signed in.');
        window.closeAuthModal();
    }

    async function saveProfile() {
        if (!supabaseClient || !currentUser) {
            setAuthStatus('Sign in before saving a profile.');
            return;
        }

        const displayName = authDisplayNameInput?.value?.trim();
        const avatarUrl = authAvatarUrlInput?.value?.trim();

        setButtonBusy(authSaveProfileBtn, true, 'Saving...', 'Save Profile');
        const { data, error } = await supabaseClient.auth.updateUser({
            data: {
                atchess_display_name: displayName || currentUser.email || 'Player',
                atchess_avatar_url: avatarUrl || null
            }
        });
        setButtonBusy(authSaveProfileBtn, false, 'Saving...', 'Save Profile');

        if (error) {
            setAuthStatus(error.message || 'Could not save profile.');
            return;
        }

        currentUser = data?.user || currentUser;
        updateAuthUI();
        emitAuthProfile(currentUser);
        setAuthStatus('Profile saved.');
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
            emitAuthProfile(currentUser);
            loadMatchHistory();
        });

        await handleSession();
    }

    authSendOtpBtn?.addEventListener('click', sendOtp);
    authVerifyOtpBtn?.addEventListener('click', verifyOtp);
    authSaveProfileBtn?.addEventListener('click', saveProfile);
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
    emitAuthProfile(null);
    initAuth();
})();
