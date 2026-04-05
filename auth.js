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
    const authCard = authModal?.querySelector('.auth-card') || null;
    const authPanel = document.querySelector('.auth-panel');
    const authTitleLine = document.getElementById('auth-title-line');
    const authSubtitleLine = document.getElementById('auth-subtitle-line');
    const authStatusLine = document.getElementById('auth-status-line');
    const authConfigNote = document.getElementById('auth-config-note');
    const authIdentityAvatar = document.getElementById('auth-identity-avatar');
    const authIdentityName = document.getElementById('auth-identity-name');
    const authIdentityEmail = document.getElementById('auth-identity-email');
    const authSignedInBadge = document.getElementById('auth-signed-in-badge');
    const authPreviewAvatar = document.getElementById('auth-preview-avatar');
    const authPreviewName = document.getElementById('auth-preview-name');
    const authPreviewSubtitle = document.getElementById('auth-preview-subtitle');
    const authEmailInput = document.getElementById('auth-email-input');
    const authOtpInput = document.getElementById('auth-otp-input');
    const authDisplayNameInput = document.getElementById('auth-display-name-input');
    const authAvatarUrlInput = document.getElementById('auth-avatar-url-input');
    const authUsernameMeta = document.getElementById('auth-username-meta');
    const authUsernameFeedback = document.getElementById('auth-username-feedback');
    const authUsernameCount = document.getElementById('auth-username-count');
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
    const authMicrosoftBtn = document.getElementById('auth-microsoft-btn');
    const authGithubBtn = document.getElementById('auth-github-btn');
    const authSignoutBtn = document.getElementById('auth-signout-btn');
    const authOpenBtn = document.getElementById('auth-open-btn');
    const matchHistoryList = document.getElementById('match-history-list');
    const matchHistoryEmpty = document.getElementById('match-history-empty');

    let supabaseClient = null;
    let currentUser = null;
    let authBackendUnavailable = false;
    let usernameRegistryReady = true;
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
    const MAX_USERNAME_LENGTH = 24;
    const MAX_AVATAR_FILE_BYTES = 5 * 1024 * 1024;
    const USER_PROFILES_TABLE = 'user_profiles';
    const RESERVED_USERNAMES = new Set([
        'admin',
        'administrator',
        'moderator',
        'mod',
        'support',
        'system',
        'owner',
        'atchess',
        'atchesslive',
        'atchess live',
        'stockfish'
    ]);
    const BLOCKED_USERNAME_TERMS = [
        'fuck',
        'fucking',
        'fucker',
        'shit',
        'shitty',
        'bitch',
        'bastard',
        'asshole',
        'motherfucker',
        'cock',
        'cunt',
        'pussy',
        'whore',
        'slut',
        'nigger',
        'nigga',
        'faggot',
        'retard',
        'porn'
    ];
    let pendingAuthStatus = '';
    let pendingAuthStatusTone = '';
    let usernameAvailabilityToken = 0;
    let usernameAvailabilityTimeout = null;
    let usernameAvailabilityState = {
        normalized: '',
        available: null,
        message: ''
    };

    function getAuthRedirectUrl() {
        const { origin, pathname } = window.location;
        const normalizedPath = pathname && pathname !== '/' ? pathname : '/';
        return `${origin}${normalizedPath.endsWith('/') ? normalizedPath : `${normalizedPath}/`}`;
    }

    function clearAuthCallbackParams() {
        const cleanUrl = `${window.location.origin}${window.location.pathname}${window.location.hash || ''}`;
        window.history.replaceState({}, document.title, cleanUrl);
    }

    function readAuthCallbackMessage() {
        const params = new URLSearchParams(window.location.search);
        const errorCode = params.get('error_code');
        const description = params.get('error_description') || '';
        if (!errorCode) return;

        if (errorCode === 'bad_oauth_state') {
            pendingAuthStatus = 'Google sign-in expired or got interrupted. Please try again from this page.';
            pendingAuthStatusTone = 'error';
            clearAuthCallbackParams();
            return;
        }

        pendingAuthStatus = decodeURIComponent(description.replace(/\+/g, ' ')) || 'Sign-in could not be completed.';
        pendingAuthStatusTone = 'error';
        clearAuthCallbackParams();
    }

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

    function setAvatarElement(element, url, fallbackGlyph) {
        if (!element) return;
        if (url) {
            element.style.backgroundImage = `url("${url.replace(/"/g, '&quot;')}")`;
            element.classList.add('has-photo');
            element.textContent = fallbackGlyph || '';
            return;
        }
        element.style.backgroundImage = '';
        element.classList.remove('has-photo');
        element.textContent = fallbackGlyph || '';
    }

    function normalizeUsername(rawValue) {
        return String(rawValue || '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, MAX_USERNAME_LENGTH);
    }

    function normalizeUsernameRegistryKey(rawValue) {
        return normalizeUsername(rawValue).toLowerCase();
    }

    function compactUsernameForModeration(rawValue) {
        return normalizeUsername(rawValue)
            .toLowerCase()
            .replace(/[@4]/g, 'a')
            .replace(/[3]/g, 'e')
            .replace(/[1!|]/g, 'i')
            .replace(/[0]/g, 'o')
            .replace(/[5$]/g, 's')
            .replace(/[7]/g, 't')
            .replace(/[^a-z0-9]/g, '');
    }

    function containsBlockedUsernameTerm(rawValue) {
        const normalized = normalizeUsername(rawValue).toLowerCase();
        const compact = compactUsernameForModeration(rawValue);
        return BLOCKED_USERNAME_TERMS.some((term) => {
            const plain = term.toLowerCase();
            return normalized.includes(plain) || compact.includes(plain.replace(/[^a-z0-9]/g, ''));
        });
    }

    function validateUsername(rawValue) {
        const normalized = normalizeUsername(rawValue);
        const lowered = normalized.toLowerCase();

        if (!normalized) {
            return { valid: false, normalized, message: 'Username cannot be empty.' };
        }
        if (normalized.length < 3) {
            return { valid: false, normalized, message: 'Use at least 3 characters.' };
        }
        if (!/^[a-zA-Z0-9 _.-]+$/.test(normalized)) {
            return { valid: false, normalized, message: 'Use letters, numbers, spaces, dots, dashes, or underscores only.' };
        }
        if (RESERVED_USERNAMES.has(lowered)) {
            return { valid: false, normalized, message: 'That username is reserved. Pick another one.' };
        }
        if (containsBlockedUsernameTerm(normalized)) {
            return { valid: false, normalized, message: 'Choose a cleaner username. Swearing or explicit names are not allowed.' };
        }
        return { valid: true, normalized, message: 'Looks good.' };
    }

    async function fetchUsernameOwner(normalizedUsername) {
        if (!supabaseClient || !currentUser || !usernameRegistryReady) return null;
        const { data, error } = await supabaseClient
            .from(USER_PROFILES_TABLE)
            .select('user_id')
            .eq('normalized_username', normalizedUsername)
            .maybeSingle();

        if (error) {
            const lowered = String(error.message || '').toLowerCase();
            if (lowered.includes('relation') || lowered.includes('schema cache')) {
                usernameRegistryReady = false;
                return null;
            }
            throw error;
        }

        return data?.user_id || null;
    }

    async function checkUsernameAvailability(rawValue) {
        const validation = validateUsername(rawValue);
        if (!validation.valid || !supabaseClient || !currentUser || authBackendUnavailable || !usernameRegistryReady) {
            return { state: 'idle', message: validation.message, normalized: validation.normalized };
        }

        const normalizedUsername = normalizeUsernameRegistryKey(validation.normalized);
        const ownerId = await fetchUsernameOwner(normalizedUsername);
        const available = !ownerId || ownerId === currentUser.id;
        return {
            state: available ? 'available' : 'taken',
            normalized: validation.normalized,
            message: available ? 'Looks good and is available.' : 'That username is already taken.'
        };
    }

    function formatAuthError(error, fallbackMessage) {
        const raw = String(error?.message || error || '').trim();
        const lowered = raw.toLowerCase();
        if (
            lowered.includes('failed to fetch') ||
            lowered.includes('networkerror') ||
            lowered.includes('network request failed') ||
            lowered.includes('err_connection_closed') ||
            lowered.includes('load failed')
        ) {
            return 'Account services are temporarily unavailable. Try again in a minute.';
        }
        return raw || fallbackMessage;
    }

    function setAuthBackendAvailability(isAvailable, message = '') {
        authBackendUnavailable = !isAvailable;
        authCard?.classList.toggle('auth-disabled', !isAvailable);
        authPanel?.classList.toggle('auth-disabled', !isAvailable);
        const disableActions = !isAvailable;
        if (authSaveProfileBtn) authSaveProfileBtn.disabled = disableActions || !currentUser;
        if (authSendOtpBtn) authSendOtpBtn.disabled = disableActions;
        if (authVerifyOtpBtn) authVerifyOtpBtn.disabled = disableActions;
        if (authGoogleBtn) authGoogleBtn.disabled = disableActions || config.googleEnabled === false;
        if (authMicrosoftBtn) authMicrosoftBtn.disabled = disableActions || config.microsoftEnabled === false;
        if (authGithubBtn) authGithubBtn.disabled = disableActions || config.githubEnabled === false;
        if (authSignoutBtn) authSignoutBtn.disabled = disableActions || !currentUser;
        if (message) setAuthStatus(message, disableActions ? 'error' : 'success');
    }

    function setAuthStatus(message, tone = '') {
        if (!authStatusLine) return;
        authStatusLine.textContent = message;
        authStatusLine.classList.toggle('error', tone === 'error');
        authStatusLine.classList.toggle('success', tone === 'success');
    }

    function setButtonBusy(button, busy, busyText, idleText) {
        if (!button) return;
        button.disabled = busy;
        button.textContent = busy ? busyText : idleText;
    }

    function refreshUsernameMeta() {
        if (!authDisplayNameInput) return true;
        const validation = validateUsername(authDisplayNameInput.value);
        authDisplayNameInput.value = validation.normalized;
        if (authUsernameCount) authUsernameCount.textContent = `${validation.normalized.length} / ${MAX_USERNAME_LENGTH}`;
        let feedbackMessage = validation.message;
        if (validation.valid && usernameAvailabilityState.normalized === validation.normalized) {
            feedbackMessage = usernameAvailabilityState.message || feedbackMessage;
        } else if (validation.valid && currentUser && usernameRegistryReady) {
            feedbackMessage = 'Checking availability...';
        } else if (validation.valid && currentUser && !usernameRegistryReady) {
            feedbackMessage = 'Availability check will turn on after the username SQL is installed.';
        }
        if (authUsernameFeedback) authUsernameFeedback.textContent = feedbackMessage;
        if (authUsernameMeta) {
            authUsernameMeta.classList.toggle('error', !validation.valid);
            authUsernameMeta.classList.toggle('success', validation.valid && usernameAvailabilityState.message !== 'That username is already taken.');
        }
        const isTaken = usernameAvailabilityState.normalized === validation.normalized && usernameAvailabilityState.message === 'That username is already taken.';
        authDisplayNameInput.classList.toggle('invalid', !validation.valid || isTaken);
        if (authSaveProfileBtn && !authBackendUnavailable) {
            authSaveProfileBtn.disabled = !currentUser || !validation.valid || isTaken;
        }
        return validation.valid && !isTaken;
    }

    function scheduleUsernameAvailabilityCheck() {
        if (!authDisplayNameInput) return;
        const validation = validateUsername(authDisplayNameInput.value);
        usernameAvailabilityState = {
            normalized: validation.normalized,
            available: null,
            message: validation.message
        };
        if (usernameAvailabilityTimeout) {
            clearTimeout(usernameAvailabilityTimeout);
            usernameAvailabilityTimeout = null;
        }
        if (!validation.valid || !currentUser || !supabaseClient || authBackendUnavailable || !usernameRegistryReady) {
            refreshUsernameMeta();
            return;
        }

        const requestId = ++usernameAvailabilityToken;
        usernameAvailabilityTimeout = setTimeout(async () => {
            try {
                const result = await checkUsernameAvailability(validation.normalized);
                if (requestId !== usernameAvailabilityToken) return;
                usernameAvailabilityState = {
                    normalized: result.normalized,
                    available: result.state === 'available',
                    message: result.message
                };
                refreshUsernameMeta();
            } catch (error) {
                if (requestId !== usernameAvailabilityToken) return;
                const message = formatAuthError(error, 'Could not verify username availability.');
                usernameAvailabilityState = {
                    normalized: validation.normalized,
                    available: null,
                    message
                };
                if (message.includes('temporarily unavailable')) {
                    setAuthBackendAvailability(false, message);
                } else {
                    refreshUsernameMeta();
                }
            }
        }, 250);
        refreshUsernameMeta();
    }

    function refreshAccountPreview() {
        const previewName = normalizeUsername(authDisplayNameInput?.value) || describeUser(currentUser) || 'Guest Player';
        const previewAvatar = authAvatarUrlInput?.value?.trim() || getProfileAvatarUrl(currentUser) || '';
        const previewSubtitle = currentUser
            ? `Signed in as ${currentUser.email || describeUser(currentUser)}`
            : 'Guest preview - save this profile after signing in.';

        setAvatarElement(authPreviewAvatar, previewAvatar, '\u2659');
        if (authPreviewName) authPreviewName.textContent = previewName;
        if (authPreviewSubtitle) authPreviewSubtitle.textContent = previewSubtitle;

        const sidebarAvatar = currentUser ? getProfileAvatarUrl(currentUser) : '';
        setAvatarElement(authIdentityAvatar, sidebarAvatar, '\u2659');
        if (authIdentityName) authIdentityName.textContent = currentUser ? describeUser(currentUser) : 'Guest';
        if (authIdentityEmail) authIdentityEmail.textContent = currentUser?.email || 'Not signed in';
        if (authSignedInBadge) {
            authSignedInBadge.textContent = currentUser ? `Signed In · ${describeUser(currentUser)}` : 'Guest Session';
            authSignedInBadge.classList.toggle('muted', !currentUser);
        }
    }

    function updatePhotoPreview(url) {
        setAvatarElement(authPhotoPreview, url, '\u2659');
        refreshAccountPreview();
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
        authCropImage.onerror = function () {
            authCropImage.hidden = true;
            setAuthStatus('That image could not be loaded. Try another link or upload the file directly.', 'error');
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
        maybeLoadAvatarUrlForEditing();
    }

    function formatHistoryDate(value) {
        try {
            return new Date(value).toLocaleString([], {
                dateStyle: 'medium',
                timeStyle: 'short'
            });
        } catch (_error) {
            return 'Recently';
        }
    }

    function describeHistoryOutcome(row) {
        const result = String(row.result || 'draw').toLowerCase();
        const reason = String(row.reason || 'game').toLowerCase();
        const outcomePrefix = result === 'win' ? 'Win' : result === 'loss' ? 'Loss' : 'Draw';
        const reasonLabel = reason.charAt(0).toUpperCase() + reason.slice(1);
        return `${outcomePrefix} by ${reasonLabel}`;
    }

    function createHistoryCodeRow(label, value) {
        const row = document.createElement('div');
        row.className = 'match-history-extra-row';

        const rowLabel = document.createElement('div');
        rowLabel.className = 'match-history-extra-label';
        rowLabel.textContent = label;

        const code = document.createElement('div');
        code.className = 'match-history-code';
        code.textContent = value || 'Unavailable';

        row.appendChild(rowLabel);
        row.appendChild(code);
        return row;
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
            const summary = document.createElement('button');
            summary.type = 'button';
            summary.className = 'match-history-summary';

            const main = document.createElement('div');
            main.className = 'match-history-main';

            const avatar = document.createElement('div');
            avatar.className = 'match-history-avatar';
            setAvatarElement(avatar, row.opponent_avatar_url || '', '\u265F');

            const meta = document.createElement('div');
            meta.className = 'match-history-meta';

            const opponent = document.createElement('div');
            opponent.className = 'match-history-opponent';
            opponent.textContent = row.opponent_name || 'Unknown Opponent';

            const detail = document.createElement('div');
            detail.className = 'match-history-detail';
            detail.textContent = `${describeHistoryOutcome(row)} · ${formatHistoryDate(row.played_at)}`;

            const result = document.createElement('div');
            result.className = `match-history-result ${resultClass}`;
            result.textContent = describeHistoryOutcome(row);

            const chevron = document.createElement('div');
            chevron.className = 'match-history-chevron';
            chevron.textContent = 'Details';

            const extra = document.createElement('div');
            extra.className = 'match-history-extra';

            extra.appendChild(createHistoryCodeRow('Mode & Color', `${String(row.mode || 'game').toUpperCase()} · ${(row.player_color || 'white').toUpperCase()}`));
            extra.appendChild(createHistoryCodeRow('Final FEN', row.fen || 'Unavailable'));
            extra.appendChild(createHistoryCodeRow('PGN', row.pgn || 'Unavailable'));

            main.appendChild(avatar);
            meta.appendChild(opponent);
            meta.appendChild(detail);
            main.appendChild(meta);
            summary.appendChild(main);
            summary.appendChild(result);
            summary.appendChild(chevron);
            summary.addEventListener('click', () => {
                item.classList.toggle('match-history-expanded');
                chevron.textContent = item.classList.contains('match-history-expanded') ? 'Hide' : 'Details';
            });

            item.appendChild(summary);
            item.appendChild(extra);
            matchHistoryList.appendChild(item);
        });
    }

    async function loadMatchHistory() {
        if (!supabaseClient || !currentUser) {
            renderMatchHistory([]);
            return;
        }
        try {
            let query = await supabaseClient
                .from('match_history')
                .select('played_at, mode, result, reason, opponent_name, opponent_avatar_url, pgn, fen, player_color')
                .eq('user_id', currentUser.id)
                .order('played_at', { ascending: false })
                .limit(10);

            if (query.error) {
                query = await supabaseClient
                    .from('match_history')
                    .select('played_at, mode, result, reason, opponent_name, pgn, fen, player_color')
                    .eq('user_id', currentUser.id)
                    .order('played_at', { ascending: false })
                    .limit(10);
            }

            if (query.error) {
                if (formatAuthError(query.error, '').includes('temporarily unavailable')) {
                    setAuthBackendAvailability(false, 'Account services are temporarily unavailable. Try again in a minute.');
                } else {
                    renderMatchHistory([]);
                    setAuthStatus('Signed in. Match history table is not ready yet.', 'error');
                }
                return;
            }

            setAuthBackendAvailability(true);
            renderMatchHistory(query.data || []);
        } catch (error) {
            renderMatchHistory([]);
            setAuthBackendAvailability(false, formatAuthError(error, 'Account services are temporarily unavailable. Try again in a minute.'));
        }
    }

    function updateAuthUI() {
        if (!authTitleLine || !authSubtitleLine || !authSignoutBtn || !authOpenBtn) return;

        if (!isConfigured) {
            authTitleLine.textContent = 'Auth Setup Needed';
            authSubtitleLine.textContent = 'Add your Supabase project URL and anon key in auth-config.js to enable email OTP and Google sign-in.';
            setAuthBackendAvailability(false);
            renderMatchHistory([]);
            refreshAccountPreview();
            return;
        }

        if (currentUser) {
            authTitleLine.textContent = describeUser(currentUser);
            authSubtitleLine.textContent = currentUser.email ? `Signed in as ${currentUser.email}` : 'Signed in';
            authOpenBtn.textContent = 'Manage Account';
        } else {
            authTitleLine.textContent = 'Guest Mode';
            authSubtitleLine.textContent = 'Create an account with email OTP or Google so we can attach identity to your profile later.';
            authOpenBtn.textContent = 'Create / Sign In';
        }
        fillProfileInputs(currentUser);
        if (!authBackendUnavailable) setAuthBackendAvailability(true);
        refreshUsernameMeta();
        refreshAccountPreview();
    }

    async function handleSession() {
        if (!supabaseClient) return;
        try {
            const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
            if (sessionError) {
                const message = formatAuthError(sessionError, 'Could not read account session.');
                if (message.includes('temporarily unavailable')) {
                    setAuthBackendAvailability(false, message);
                } else {
                    setAuthStatus(message, 'error');
                }
                return;
            }

            const session = sessionData?.session || null;
            if (!session) {
                currentUser = null;
                setAuthBackendAvailability(true);
                updateAuthUI();
                emitAuthProfile(currentUser);
                await loadMatchHistory();
                if (pendingAuthStatus) {
                    setAuthStatus(pendingAuthStatus, pendingAuthStatusTone);
                    pendingAuthStatus = '';
                    pendingAuthStatusTone = '';
                } else {
                    setAuthStatus('Auth is optional. You can keep playing as a guest.');
                }
                return;
            }

            const { data, error } = await supabaseClient.auth.getUser();
            if (error) {
                const message = formatAuthError(error, 'Could not read account session.');
                if (message.includes('temporarily unavailable')) {
                    setAuthBackendAvailability(false, message);
                } else {
                    setAuthStatus(message, 'error');
                }
                return;
            }
            currentUser = data?.user || null;
            setAuthBackendAvailability(true);
            updateAuthUI();
            emitAuthProfile(currentUser);
            await loadMatchHistory();
            if (currentUser) {
                setAuthStatus(`Signed in as ${currentUser.email || describeUser(currentUser)}.`, 'success');
            } else if (pendingAuthStatus) {
                setAuthStatus(pendingAuthStatus, pendingAuthStatusTone);
                pendingAuthStatus = '';
                pendingAuthStatusTone = '';
            }
        } catch (error) {
            setAuthBackendAvailability(false, formatAuthError(error, 'Account services are temporarily unavailable. Try again in a minute.'));
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
            setAuthStatus('Auth is not configured yet.', 'error');
            return;
        }
        try {
            const { error } = await supabaseClient.auth.signOut();
            if (error) {
                const message = formatAuthError(error, 'Could not sign out.');
                if (message.includes('temporarily unavailable')) {
                    setAuthBackendAvailability(false, message);
                } else {
                    setAuthStatus(message, 'error');
                }
                return;
            }
            currentUser = null;
            setAuthBackendAvailability(true);
            updateAuthUI();
            emitAuthProfile(null);
            renderMatchHistory([]);
            setAuthStatus('Signed out.', 'success');
        } catch (error) {
            setAuthBackendAvailability(false, formatAuthError(error, 'Account services are temporarily unavailable. Try again in a minute.'));
        }
    };

    window.recordMatchHistory = async function (payload) {
        if (!supabaseClient || !currentUser || !payload) return;
        const basePayload = {
            user_id: currentUser.id,
            mode: payload.mode || 'engine',
            result: payload.result || 'draw',
            reason: payload.reason || 'draw',
            opponent_name: payload.opponentName || 'Unknown Opponent',
            player_color: payload.playerColor || 'white',
            pgn: payload.pgn || '',
            fen: payload.fen || ''
        };
        try {
            let result = await supabaseClient.from('match_history').insert({
                ...basePayload,
                opponent_avatar_url: payload.opponentAvatarUrl || null
            });
            if (result.error) {
                result = await supabaseClient.from('match_history').insert(basePayload);
            }
            if (!result.error) {
                setAuthBackendAvailability(true);
                await loadMatchHistory();
            }
        } catch (_error) {
            setAuthBackendAvailability(false, 'Account services are temporarily unavailable. Try again in a minute.');
        }
    };

    async function sendOtp() {
        if (!supabaseClient) {
            setAuthStatus('Auth is not configured yet.', 'error');
            return;
        }
        const email = authEmailInput?.value?.trim();
        if (!email) {
            setAuthStatus('Enter your email address first.', 'error');
            return;
        }

        try {
            setButtonBusy(authSendOtpBtn, true, 'Sending...', 'Send OTP');
            const { error } = await supabaseClient.auth.signInWithOtp({
                email,
                options: {
                    shouldCreateUser: true,
                    emailRedirectTo: getAuthRedirectUrl()
                }
            });
            setButtonBusy(authSendOtpBtn, false, 'Sending...', 'Send OTP');

            if (error) {
                const message = formatAuthError(error, 'Could not send OTP.');
                if (message.includes('temporarily unavailable')) {
                    setAuthBackendAvailability(false, message);
                } else {
                    setAuthStatus(message, 'error');
                }
                return;
            }

            setAuthBackendAvailability(true);
            setAuthStatus(`Verification code sent to ${email}. Enter the 8-digit code here. If Supabase is still using magic links, switch the email template to token mode first.`, 'success');
        } catch (error) {
            setButtonBusy(authSendOtpBtn, false, 'Sending...', 'Send OTP');
            setAuthBackendAvailability(false, formatAuthError(error, 'Account services are temporarily unavailable. Try again in a minute.'));
        }
    }

    async function verifyOtp() {
        if (!supabaseClient) {
            setAuthStatus('Auth is not configured yet.', 'error');
            return;
        }
        const email = authEmailInput?.value?.trim();
        const token = authOtpInput?.value?.trim();
        if (!email || !token) {
            setAuthStatus('Enter both your email and the OTP.', 'error');
            return;
        }
        try {
            setButtonBusy(authVerifyOtpBtn, true, 'Verifying...', 'Verify OTP');
            const { data, error } = await supabaseClient.auth.verifyOtp({
                email,
                token,
                type: 'email'
            });
            setButtonBusy(authVerifyOtpBtn, false, 'Verifying...', 'Verify OTP');

            if (error) {
                const message = formatAuthError(error, 'Invalid OTP.');
                if (message.includes('temporarily unavailable')) {
                    setAuthBackendAvailability(false, message);
                } else {
                    setAuthStatus(message, 'error');
                }
                return;
            }

            currentUser = data?.user || null;
            setAuthBackendAvailability(true);
            updateAuthUI();
            emitAuthProfile(currentUser);
            await loadMatchHistory();
            setAuthStatus('Email verified. You are signed in.', 'success');
            window.closeAuthModal();
        } catch (error) {
            setButtonBusy(authVerifyOtpBtn, false, 'Verifying...', 'Verify OTP');
            setAuthBackendAvailability(false, formatAuthError(error, 'Account services are temporarily unavailable. Try again in a minute.'));
        }
    }

    async function saveProfile() {
        if (!supabaseClient || !currentUser) {
            setAuthStatus('Sign in before saving a profile.', 'error');
            return;
        }

        const validation = validateUsername(authDisplayNameInput?.value);
        scheduleUsernameAvailabilityCheck();
        refreshUsernameMeta();
        if (!validation.valid) {
            setAuthStatus(validation.message, 'error');
            return;
        }

        const displayName = validation.normalized;
        const normalizedUsername = normalizeUsernameRegistryKey(displayName);
        const avatarUrl = authAvatarUrlInput?.value?.trim();

        try {
            setButtonBusy(authSaveProfileBtn, true, 'Saving...', 'Save Profile');
            const { data: previousRegistryRow, error: previousRegistryError } = await supabaseClient
                .from(USER_PROFILES_TABLE)
                .select('username, normalized_username, avatar_url')
                .eq('user_id', currentUser.id)
                .maybeSingle();

            if (previousRegistryError) {
                const lowered = String(previousRegistryError.message || '').toLowerCase();
                if (lowered.includes('relation') || lowered.includes('schema cache')) {
                    usernameRegistryReady = false;
                    setButtonBusy(authSaveProfileBtn, false, 'Saving...', 'Save Profile');
                    setAuthStatus('Install the username registry SQL first so duplicate usernames can be blocked.', 'error');
                    return;
                }
                throw previousRegistryError;
            }

            const { error: profileRegistryError } = await supabaseClient
                .from(USER_PROFILES_TABLE)
                .upsert(
                    {
                        user_id: currentUser.id,
                        username: displayName,
                        normalized_username: normalizedUsername,
                        avatar_url: avatarUrl || null
                    },
                    {
                        onConflict: 'user_id'
                    }
                );

            if (profileRegistryError) {
                const lowered = String(profileRegistryError.message || '').toLowerCase();
                if (lowered.includes('duplicate key value') || lowered.includes('duplicate')) {
                    usernameAvailabilityState = {
                        normalized: displayName,
                        available: false,
                        message: 'That username is already taken.'
                    };
                    setButtonBusy(authSaveProfileBtn, false, 'Saving...', 'Save Profile');
                    refreshUsernameMeta();
                    setAuthStatus('That username is already taken. Pick another one.', 'error');
                    return;
                }
                if (lowered.includes('relation') || lowered.includes('schema cache')) {
                    usernameRegistryReady = false;
                    setButtonBusy(authSaveProfileBtn, false, 'Saving...', 'Save Profile');
                    setAuthStatus('Install the username registry SQL first so duplicate usernames can be blocked.', 'error');
                    return;
                }
                throw profileRegistryError;
            }

            const { data, error } = await supabaseClient.auth.updateUser({
                data: {
                    atchess_display_name: displayName,
                    atchess_avatar_url: avatarUrl || null
                }
            });
            setButtonBusy(authSaveProfileBtn, false, 'Saving...', 'Save Profile');

            if (error) {
                if (previousRegistryRow) {
                    await supabaseClient
                        .from(USER_PROFILES_TABLE)
                        .upsert(
                            {
                                user_id: currentUser.id,
                                username: previousRegistryRow.username,
                                normalized_username: previousRegistryRow.normalized_username,
                                avatar_url: previousRegistryRow.avatar_url || null
                            },
                            {
                                onConflict: 'user_id'
                            }
                        );
                } else {
                    await supabaseClient
                        .from(USER_PROFILES_TABLE)
                        .delete()
                        .eq('user_id', currentUser.id);
                }
                const message = formatAuthError(error, 'Could not save profile.');
                if (message.includes('temporarily unavailable')) {
                    setAuthBackendAvailability(false, message);
                } else {
                    setAuthStatus(message, 'error');
                }
                return;
            }

            currentUser = data?.user || currentUser;
            usernameAvailabilityState = {
                normalized: displayName,
                available: true,
                message: 'Looks good and is available.'
            };
            setAuthBackendAvailability(true);
            updateAuthUI();
            emitAuthProfile(currentUser);
            clearAvatarEditor();
            setAuthStatus('Profile saved.', 'success');
        } catch (error) {
            setButtonBusy(authSaveProfileBtn, false, 'Saving...', 'Save Profile');
            setAuthBackendAvailability(false, formatAuthError(error, 'Account services are temporarily unavailable. Try again in a minute.'));
        }
    }

    async function signInWithProvider(provider, label, button, options = {}) {
        if (!supabaseClient) {
            setAuthStatus('Auth is not configured yet.', 'error');
            return;
        }

        try {
            setButtonBusy(button, true, 'Redirecting...', `Continue with ${label}`);
            const { error } = await supabaseClient.auth.signInWithOAuth({
                provider,
                options: {
                    redirectTo: getAuthRedirectUrl(),
                    ...options
                }
            });
            setButtonBusy(button, false, 'Redirecting...', `Continue with ${label}`);

            if (error) {
                const message = formatAuthError(error, `Could not start ${label} sign-in.`);
                if (message.includes('temporarily unavailable')) {
                    setAuthBackendAvailability(false, message);
                } else {
                    setAuthStatus(message, 'error');
                }
            }
        } catch (error) {
            setButtonBusy(button, false, 'Redirecting...', `Continue with ${label}`);
            setAuthBackendAvailability(false, formatAuthError(error, 'Account services are temporarily unavailable. Try again in a minute.'));
        }
    }

    async function initAuth() {
        if (!isConfigured) {
            updateAuthUI();
            setAuthStatus('Auth is disabled until auth-config.js is filled in.');
            return;
        }

        if (!window.supabase?.createClient) {
            setAuthStatus('Supabase client failed to load.', 'error');
            return;
        }

        supabaseClient = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
            auth: {
                persistSession: true,
                autoRefreshToken: true,
                detectSessionInUrl: true
            }
        });

        readAuthCallbackMessage();

        supabaseClient.auth.onAuthStateChange((_event, session) => {
            currentUser = session?.user || null;
            setAuthBackendAvailability(true);
            updateAuthUI();
            emitAuthProfile(currentUser);
            loadMatchHistory();
        });

        await handleSession();
    }

    authSendOtpBtn?.addEventListener('click', sendOtp);
    authVerifyOtpBtn?.addEventListener('click', verifyOtp);
    authSaveProfileBtn?.addEventListener('click', saveProfile);
    authGoogleBtn?.addEventListener('click', () => signInWithProvider('google', 'Google', authGoogleBtn));
    authMicrosoftBtn?.addEventListener('click', () => signInWithProvider('azure', 'Microsoft', authMicrosoftBtn, { scopes: 'email openid profile' }));
    authGithubBtn?.addEventListener('click', () => signInWithProvider('github', 'GitHub', authGithubBtn, { scopes: 'read:user user:email' }));
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
            setAuthStatus('Choose a PNG, JPG, WEBP, or GIF image file.', 'error');
            if (authAvatarFileInput) authAvatarFileInput.value = '';
            return;
        }
        if (file.size > MAX_AVATAR_FILE_BYTES) {
            setAuthStatus('Choose an image smaller than 5 MB.', 'error');
            if (authAvatarFileInput) authAvatarFileInput.value = '';
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            loadCropSource(typeof reader.result === 'string' ? reader.result : '');
            setAuthStatus('Photo loaded. Drag it into place, then click Use Cropped Photo.', 'success');
        };
        reader.readAsDataURL(file);
    });
    authDisplayNameInput?.addEventListener('input', () => {
        scheduleUsernameAvailabilityCheck();
        refreshAccountPreview();
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

    if (config.googleEnabled === false && authGoogleBtn) {
        authGoogleBtn.disabled = true;
        authGoogleBtn.textContent = 'Google Not Enabled';
    }
    if (config.microsoftEnabled === false && authMicrosoftBtn) {
        authMicrosoftBtn.disabled = true;
        authMicrosoftBtn.textContent = 'Microsoft Not Enabled';
    }
    if (config.githubEnabled === false && authGithubBtn) {
        authGithubBtn.disabled = true;
        authGithubBtn.textContent = 'GitHub Not Enabled';
    }
    if (authConfigNote && isConfigured) {
        authConfigNote.textContent = 'Supabase is configured. Make sure email OTP token mode is on, and enable Google, Microsoft, or GitHub in the Supabase dashboard before using those buttons.';
    }

    updateAuthUI();
    refreshUsernameMeta();
    refreshAccountPreview();
    emitAuthProfile(null);
    initAuth();
})();

