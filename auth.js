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
    const authAvatarFileInput = document.getElementById('auth-avatar-file-input');
    const authAvatarUploadBtn = document.getElementById('auth-avatar-upload-btn');
    const authAvatarCenterBtn = document.getElementById('auth-avatar-center-btn');
    const authAvatarApplyBtn = document.getElementById('auth-avatar-apply-btn');
    const authAvatarClearBtn = document.getElementById('auth-avatar-clear-btn');
    const authCropStage = document.getElementById('auth-crop-stage');
    const authCropImage = document.getElementById('auth-crop-image');
    const authCropZoomInput = document.getElementById('auth-crop-zoom');
    const authCropSizeInput = document.getElementById('auth-crop-size');
    const authPhotoPreview = document.getElementById('auth-photo-preview');
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
    let cropSourceUrl = '';
    let cropImageState = {
        naturalWidth: 0,
        naturalHeight: 0,
        scale: 1,
        minScale: 1,
        offsetX: 0,
        offsetY: 0
    };
    let dragState = null;

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

    function updatePhotoPreview(url) {
        if (!authPhotoPreview) return;
        if (url) {
            authPhotoPreview.style.backgroundImage = `url("${url.replace(/"/g, '&quot;')}")`;
            authPhotoPreview.textContent = '';
            return;
        }
        authPhotoPreview.style.backgroundImage = '';
        authPhotoPreview.textContent = '\u2659';
    }

    function getCropStageSize() {
        return authCropStage ? Math.max(1, authCropStage.clientWidth) : 1;
    }

    function clampCropOffsets() {
        if (!authCropImage || !cropImageState.naturalWidth || !cropImageState.naturalHeight) return;
        const stageSize = getCropStageSize();
        const scaledWidth = cropImageState.naturalWidth * cropImageState.scale;
        const scaledHeight = cropImageState.naturalHeight * cropImageState.scale;
        const maxOffsetX = Math.max(0, (scaledWidth - stageSize) / 2);
        const maxOffsetY = Math.max(0, (scaledHeight - stageSize) / 2);
        cropImageState.offsetX = Math.min(maxOffsetX, Math.max(-maxOffsetX, cropImageState.offsetX));
        cropImageState.offsetY = Math.min(maxOffsetY, Math.max(-maxOffsetY, cropImageState.offsetY));
    }

    function renderCropImage() {
        if (!authCropImage || !cropSourceUrl || !cropImageState.naturalWidth || !cropImageState.naturalHeight) return;
        clampCropOffsets();
        authCropImage.style.width = `${cropImageState.naturalWidth * cropImageState.scale}px`;
        authCropImage.style.height = `${cropImageState.naturalHeight * cropImageState.scale}px`;
        authCropImage.style.transform = `translate(calc(-50% + ${cropImageState.offsetX}px), calc(-50% + ${cropImageState.offsetY}px))`;
    }

    function resetCropPosition() {
        cropImageState.offsetX = 0;
        cropImageState.offsetY = 0;
        renderCropImage();
    }

    function updateCropZoomRange(minScale) {
        if (!authCropZoomInput) return;
        authCropZoomInput.min = String(minScale);
        authCropZoomInput.max = String(Math.max(minScale + 2, minScale * 3));
        authCropZoomInput.value = String(Math.max(minScale, cropImageState.scale));
    }

    function loadCropSource(url) {
        cropSourceUrl = url || '';
        if (!authCropImage) return;
        if (!cropSourceUrl) {
            authCropImage.hidden = true;
            authCropImage.removeAttribute('src');
            updatePhotoPreview(authAvatarUrlInput?.value?.trim() || '');
            return;
        }
        authCropImage.onload = function () {
            const stageSize = getCropStageSize();
            const naturalWidth = authCropImage.naturalWidth || 1;
            const naturalHeight = authCropImage.naturalHeight || 1;
            const minScale = Math.max(stageSize / naturalWidth, stageSize / naturalHeight);
            cropImageState.naturalWidth = naturalWidth;
            cropImageState.naturalHeight = naturalHeight;
            cropImageState.minScale = minScale;
            cropImageState.scale = minScale;
            updateCropZoomRange(minScale);
            resetCropPosition();
            authCropImage.hidden = false;
            updatePhotoPreview(cropSourceUrl);
        };
        authCropImage.crossOrigin = cropSourceUrl.startsWith('data:image/') ? '' : 'anonymous';
        authCropImage.src = cropSourceUrl;
    }

    function exportCroppedAvatar() {
        if (!cropSourceUrl || !authCropImage || !cropImageState.naturalWidth || !cropImageState.naturalHeight) return null;
        const outputSize = Math.max(128, parseInt(authCropSizeInput?.value || '512', 10));
        const stageSize = getCropStageSize();
        const canvas = document.createElement('canvas');
        canvas.width = outputSize;
        canvas.height = outputSize;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        const srcX = ((cropImageState.naturalWidth * cropImageState.scale - stageSize) / 2 - cropImageState.offsetX) / cropImageState.scale;
        const srcY = ((cropImageState.naturalHeight * cropImageState.scale - stageSize) / 2 - cropImageState.offsetY) / cropImageState.scale;
        const srcSize = stageSize / cropImageState.scale;

        try {
            ctx.drawImage(
                authCropImage,
                Math.max(0, srcX),
                Math.max(0, srcY),
                Math.min(cropImageState.naturalWidth, srcSize),
                Math.min(cropImageState.naturalHeight, srcSize),
                0,
                0,
                outputSize,
                outputSize
            );
            return canvas.toDataURL('image/png');
        } catch (_error) {
            setAuthStatus('That image host blocks editing. Upload the file directly or use another image link.');
            return null;
        }
    }

    function applyCroppedAvatarToField() {
        const cropped = exportCroppedAvatar();
        if (!cropped || !authAvatarUrlInput) {
            setAuthStatus('Upload a photo first, then crop it.');
            return;
        }
        authAvatarUrlInput.value = cropped;
        updatePhotoPreview(cropped);
        setAuthStatus('Cropped photo ready. Click Save Profile to keep it.');
    }

    function maybeLoadAvatarUrlForEditing() {
        const url = authAvatarUrlInput?.value?.trim() || '';
        updatePhotoPreview(url);
        if (!url) {
            clearAvatarEditor();
            return;
        }
        if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:image/')) {
            loadCropSource(url);
        }
    }

    function clearAvatarEditor() {
        cropSourceUrl = '';
        cropImageState = {
            naturalWidth: 0,
            naturalHeight: 0,
            scale: 1,
            minScale: 1,
            offsetX: 0,
            offsetY: 0
        };
        if (authAvatarFileInput) authAvatarFileInput.value = '';
        if (authCropImage) {
            authCropImage.hidden = true;
            authCropImage.removeAttribute('src');
            authCropImage.style.width = '';
            authCropImage.style.height = '';
            authCropImage.style.transform = 'translate(-50%, -50%)';
        }
        if (authCropZoomInput) {
            authCropZoomInput.min = '1';
            authCropZoomInput.max = '3';
            authCropZoomInput.value = '1';
        }
        updatePhotoPreview(authAvatarUrlInput?.value?.trim() || '');
    }

    function describeUser(user) {
        if (!user) return null;
        return getProfileDisplayName(user) || 'Signed In';
    }

    function fillProfileInputs(user) {
        if (authDisplayNameInput) authDisplayNameInput.value = user ? getProfileDisplayName(user) : '';
        if (authAvatarUrlInput) authAvatarUrlInput.value = user ? getProfileAvatarUrl(user) : '';
        clearAvatarEditor();
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
        clearAvatarEditor();
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
    authAvatarUploadBtn?.addEventListener('click', () => authAvatarFileInput?.click());
    authAvatarCenterBtn?.addEventListener('click', () => {
        if (!cropSourceUrl) {
            setAuthStatus('Upload a photo first.');
            return;
        }
        resetCropPosition();
    });
    authAvatarApplyBtn?.addEventListener('click', applyCroppedAvatarToField);
    authAvatarClearBtn?.addEventListener('click', () => {
        if (authAvatarUrlInput) authAvatarUrlInput.value = '';
        clearAvatarEditor();
        setAuthStatus('Profile photo cleared. Click Save Profile to remove it from your account.');
    });
    authAvatarFileInput?.addEventListener('change', () => {
        const file = authAvatarFileInput.files?.[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            setAuthStatus('Choose a PNG, JPG, WEBP, or GIF image file.');
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            loadCropSource(typeof reader.result === 'string' ? reader.result : '');
            setAuthStatus('Photo loaded. Drag it into place, then click Use Cropped Photo.');
        };
        reader.readAsDataURL(file);
    });
    authAvatarUrlInput?.addEventListener('input', () => {
        updatePhotoPreview(authAvatarUrlInput.value.trim());
    });
    authAvatarUrlInput?.addEventListener('change', maybeLoadAvatarUrlForEditing);
    authAvatarUrlInput?.addEventListener('blur', maybeLoadAvatarUrlForEditing);
    authCropZoomInput?.addEventListener('input', () => {
        if (!cropSourceUrl) return;
        cropImageState.scale = Math.max(cropImageState.minScale, parseFloat(authCropZoomInput.value || '1'));
        renderCropImage();
    });
    authCropStage?.addEventListener('pointerdown', (event) => {
        if (!cropSourceUrl) return;
        dragState = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            originX: cropImageState.offsetX,
            originY: cropImageState.offsetY
        };
        authCropStage.setPointerCapture(event.pointerId);
        authCropStage.classList.add('dragging');
    });
    authCropStage?.addEventListener('pointermove', (event) => {
        if (!dragState || dragState.pointerId !== event.pointerId) return;
        cropImageState.offsetX = dragState.originX + (event.clientX - dragState.startX);
        cropImageState.offsetY = dragState.originY + (event.clientY - dragState.startY);
        renderCropImage();
    });
    authCropStage?.addEventListener('pointerup', (event) => {
        if (!dragState || dragState.pointerId !== event.pointerId) return;
        authCropStage.releasePointerCapture(event.pointerId);
        dragState = null;
        authCropStage.classList.remove('dragging');
    });
    authCropStage?.addEventListener('pointercancel', () => {
        dragState = null;
        authCropStage.classList.remove('dragging');
    });
    window.addEventListener('resize', () => {
        if (!cropSourceUrl || !cropImageState.naturalWidth || !cropImageState.naturalHeight) return;
        const stageSize = getCropStageSize();
        const minScale = Math.max(stageSize / cropImageState.naturalWidth, stageSize / cropImageState.naturalHeight);
        cropImageState.minScale = minScale;
        cropImageState.scale = Math.max(cropImageState.scale, minScale);
        updateCropZoomRange(minScale);
        renderCropImage();
    });
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
