const crypto = require('crypto');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Chess } = require('chess.js');

let helmet = null;
try {
    helmet = require('helmet');
} catch (_error) {
    helmet = null;
}

const PORT = Number(process.env.PORT || 3000);
const SITE_NAME = 'ATChess Live';
const DISCONNECT_GRACE_MS = 25_000;
const HTTP_RATE_LIMIT_WINDOW_MS = 60_000;
const HTTP_RATE_LIMIT_MAX = 240;
const DEFAULT_TIME_CONTROL_MS = 300_000;
const MAX_TIME_CONTROL_MS = 86_400_000;
const ROOM_CODE_LENGTH = 8;
const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const DEVELOPER_EMAILS = new Set(
    String(process.env.DEVELOPER_EMAILS || 'xxx@xx.com,yyyy@yy.com')
        .split(',')
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean)
);
const rateLimitBuckets = new Map();
const rooms = new Map();
const globalBans = new Map();

const allowedOrigins = new Set(
    String(process.env.ALLOWED_ORIGINS || '')
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
);

const app = express();
const server = http.createServer(app);

function isPrivateHost(hostname) {
    return (
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '::1' ||
        /^10\./.test(hostname) ||
        /^192\.168\./.test(hostname) ||
        /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
    );
}

function isAllowedOrigin(origin) {
    if (!origin) return true;
    if (allowedOrigins.has(origin)) return true;

    try {
        const parsed = new URL(origin);
        if (isPrivateHost(parsed.hostname)) return true;
    } catch (_error) {
        return false;
    }

    return false;
}

function doesOriginMatchHost(origin, hostHeader) {
    if (!origin || !hostHeader) return false;
    try {
        const parsed = new URL(origin);
        const normalizedPort =
            parsed.port ||
            (parsed.protocol === 'https:' ? '443' : parsed.protocol === 'http:' ? '80' : '');
        const normalizedHost = normalizedPort
            ? `${parsed.hostname}:${normalizedPort}`
            : parsed.hostname;
        return normalizedHost === hostHeader;
    } catch (_error) {
        return false;
    }
}

const io = new Server(server, {
    allowRequest(req, callback) {
        const origin = req.headers.origin;
        const hostHeader = req.headers.host;
        if (isAllowedOrigin(origin) || doesOriginMatchHost(origin, hostHeader)) {
            callback(null, true);
            return;
        }
        callback('Origin not allowed by Socket.IO policy.', false);
    },
    cors: {
        origin: allowedOrigins.size ? Array.from(allowedOrigins) : true,
        methods: ['GET', 'POST'],
        credentials: true
    }
});

app.disable('x-powered-by');

function applyFallbackSecurityHeaders(req, res, next) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader(
        'Content-Security-Policy',
        [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net",
            "script-src-elem 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net",
            "script-src-attr 'unsafe-inline'",
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com",
            "style-src-attr 'unsafe-inline'",
            "font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com data:",
            "img-src 'self' data: https:",
            "connect-src 'self' ws: wss: https://*.supabase.co https://cdn.jsdelivr.net",
            "worker-src 'self' blob:",
            "object-src 'none'",
            "base-uri 'self'",
            "frame-ancestors 'none'"
        ].join('; ')
    );
    next();
}

if (helmet) {
    app.use(
        helmet({
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "'wasm-unsafe-eval'", 'https://cdnjs.cloudflare.com', 'https://cdn.jsdelivr.net'],
                    scriptSrcElem: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "'wasm-unsafe-eval'", 'https://cdnjs.cloudflare.com', 'https://cdn.jsdelivr.net'],
                    scriptSrcAttr: ["'unsafe-inline'"],
                    styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://cdnjs.cloudflare.com'],
                    styleSrcAttr: ["'unsafe-inline'"],
                    fontSrc: ["'self'", 'https://fonts.gstatic.com', 'https://cdnjs.cloudflare.com', 'data:'],
                    imgSrc: ["'self'", 'data:', 'https:'],
                    connectSrc: ["'self'", 'ws:', 'wss:', 'https://*.supabase.co', 'https://cdn.jsdelivr.net'],
                    workerSrc: ["'self'", 'blob:'],
                    objectSrc: ["'none'"],
                    baseUri: ["'self'"],
                    frameAncestors: ["'none'"]
                }
            },
            crossOriginEmbedderPolicy: false
        })
    );
} else {
    app.use(applyFallbackSecurityHeaders);
}

function getIpFromRequest(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.trim()) {
        return forwarded.split(',')[0].trim();
    }
    return req.socket?.remoteAddress || 'unknown';
}

function consumeRateLimit(key, limit, windowMs) {
    const now = Date.now();
    let bucket = rateLimitBuckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
        bucket = {
            count: 0,
            resetAt: now + windowMs
        };
    }

    bucket.count += 1;
    rateLimitBuckets.set(key, bucket);
    return bucket.count <= limit;
}

function httpRateLimit(req, res, next) {
    const ip = getIpFromRequest(req);
    const ok = consumeRateLimit(`http:${ip}`, HTTP_RATE_LIMIT_MAX, HTTP_RATE_LIMIT_WINDOW_MS);
    if (!ok) {
        res.status(429).json({ ok: false, error: 'Too many requests. Slow down and try again.' });
        return;
    }
    next();
}

app.use(httpRateLimit);
app.use(express.static(__dirname));

function getSocketIp(socket) {
    const forwarded = socket.handshake?.headers?.['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.trim()) {
        return forwarded.split(',')[0].trim();
    }
    return socket.handshake?.address || socket.conn?.remoteAddress || 'unknown';
}

function allowSocketAction(socket, action, limit, windowMs, callback) {
    const ip = getSocketIp(socket);
    const ok = consumeRateLimit(`socket:${action}:${ip}`, limit, windowMs);
    if (ok) return true;
    if (typeof callback === 'function') {
        callback({ ok: false, error: 'Too many requests. Slow down and try again.' });
    }
    return false;
}

function randomToken(size = 24) {
    return crypto.randomBytes(size).toString('base64url');
}

function generateRoomId() {
    let roomId = '';
    for (let i = 0; i < ROOM_CODE_LENGTH; i += 1) {
        const index = crypto.randomInt(0, ROOM_ALPHABET.length);
        roomId += ROOM_ALPHABET[index];
    }
    return roomId;
}

function generateUniqueRoomId() {
    let candidate = generateRoomId();
    while (rooms.has(candidate)) candidate = generateRoomId();
    return candidate;
}

function createSeat(color, socket, deviceId) {
    return {
        color,
        socketId: socket.id,
        connected: true,
        deviceId: String(deviceId || '').trim() || null,
        reconnectToken: randomToken(18),
        profile: null,
        disconnectedAt: null,
        disconnectDeadline: null,
        disconnectTimer: null
    };
}

function sanitizeProfile(profile) {
    if (!profile || typeof profile !== 'object') return null;
    const displayName = typeof profile.displayName === 'string' ? profile.displayName.trim().slice(0, 30) : '';
    const avatarUrl = typeof profile.avatarUrl === 'string' ? profile.avatarUrl.trim().slice(0, 500) : '';
    const email = typeof profile.email === 'string' ? profile.email.trim().slice(0, 120) : '';
    const userId = typeof profile.userId === 'string' ? profile.userId.trim().slice(0, 120) : '';
    return {
        displayName: displayName || 'Guest',
        avatarUrl: avatarUrl || null,
        email: email || null,
        userId: userId || null,
        isDeveloper: DEVELOPER_EMAILS.has(email.toLowerCase())
    };
}

function doesProfileMatchSeatIdentity(seat, profile) {
    if (!seat?.profile?.userId || !profile?.userId) return true;
    return seat.profile.userId === profile.userId;
}

function roomHasUserOnAnotherSeat(room, userId, excludedColor = null) {
    if (!userId) return false;
    return ['white', 'black'].some((color) => {
        if (color === excludedColor) return false;
        const seat = room.players[color];
        return !!seat?.profile?.userId && seat.profile.userId === userId;
    });
}

function clearSeatTimer(seat) {
    if (!seat?.disconnectTimer) return;
    clearTimeout(seat.disconnectTimer);
    seat.disconnectTimer = null;
}

function clearSeatState(seat) {
    if (!seat) return;
    clearSeatTimer(seat);
    seat.disconnectedAt = null;
    seat.disconnectDeadline = null;
}

function createRoom(roomId, timeControlMs = 300000) {
    const room = {
        id: roomId,
        game: new Chess(),
        players: {
            white: null,
            black: null
        },
        host: null,
        roomBans: new Set(),
        sockets: new Set(),
        timeControlMs,
        clocks: {
            white: timeControlMs,
            black: timeControlMs
        },
        activeColor: 'white',
        lastTickAt: Date.now(),
        resigned: null,
        timeoutWinner: null,
        lastMove: null,
        createdAt: Date.now()
    };
    rooms.set(roomId, room);
    return room;
}

function getAccountIdentityKeys(profile) {
    const keys = [];
    const userId = String(profile?.userId || '').trim();
    const email = String(profile?.email || '').trim().toLowerCase();
    if (userId) keys.push(`user:${userId}`);
    if (email) keys.push(`email:${email}`);
    return keys;
}

function getGuestIdentityKeys(deviceId = null) {
    const keys = [];
    const normalizedDeviceId = String(deviceId || '').trim();
    if (normalizedDeviceId) keys.push(`device:${normalizedDeviceId}`);
    return keys;
}

function getPlayableIdentityKeys(profile, deviceId = null) {
    const accountKeys = getAccountIdentityKeys(profile);
    return accountKeys.length ? accountKeys : getGuestIdentityKeys(deviceId);
}

function getGlobalBan(profile, deviceId = null) {
    const key = getPlayableIdentityKeys(profile, deviceId).find((identityKey) => globalBans.has(identityKey));
    return key ? globalBans.get(key) : null;
}

function addGlobalBan(profile, deviceId = null, reason = '', moderatorProfile = null) {
    const keys = getPlayableIdentityKeys(profile, deviceId);
    const ban = {
        id: randomToken(9),
        keys,
        reason: reason || 'You are banned from ATChess Live.',
        deviceId: String(deviceId || '').trim() || null,
        userId: profile?.userId || null,
        email: profile?.email || null,
        displayName: profile?.displayName || null,
        moderatorEmail: moderatorProfile?.email || null,
        createdAt: new Date().toISOString()
    };
    keys.forEach((key) => {
        globalBans.set(key, ban);
    });
    return ban;
}

function serializeGlobalBans() {
    const bansById = new Map();
    for (const ban of globalBans.values()) {
        bansById.set(ban.id, ban);
    }
    return Array.from(bansById.values()).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

function removeGlobalBan(banIdOrKey) {
    const target = String(banIdOrKey || '').trim();
    if (!target) return false;
    let removed = false;
    for (const [key, ban] of Array.from(globalBans.entries())) {
        if (key === target || ban.id === target) {
            globalBans.delete(key);
            removed = true;
        }
    }
    return removed;
}

function addRoomBan(room, profile, deviceId = null) {
    getPlayableIdentityKeys(profile, deviceId).forEach((key) => room.roomBans.add(key));
}

function isRoomBanned(room, profile, deviceId = null) {
    return getPlayableIdentityKeys(profile, deviceId).some((key) => room.roomBans.has(key));
}

function normalizeBanReason(value) {
    const words = String(value || '')
        .replace(/\s+/g, ' ')
        .trim()
        .split(' ')
        .filter(Boolean)
        .slice(0, 200);
    return words.join(' ') || 'You are banned from ATChess Live.';
}

function setRoomHost(room, seat) {
    room.host = {
        color: seat.color,
        deviceId: seat.deviceId || null,
        userId: seat.profile?.userId || null,
        email: seat.profile?.email || null
    };
}

function normalizeTimeControlMs(value) {
    if (!Number.isFinite(value)) return DEFAULT_TIME_CONTROL_MS;
    const normalized = Math.round(value);
    if (normalized < 0) return DEFAULT_TIME_CONTROL_MS;
    return Math.min(normalized, MAX_TIME_CONTROL_MS);
}

function isRoomActive(room) {
    return !!room && !room.resigned && !room.timeoutWinner && !room.game.isGameOver();
}

function getRoomStatus(room) {
    if (room.timeoutWinner) return `${room.timeoutWinner} wins on time`;
    if (room.resigned) return `${room.resigned} wins by resignation`;
    if (room.game.isCheckmate()) return `${room.game.turn() === 'w' ? 'black' : 'white'} wins by checkmate`;
    if (room.game.isStalemate()) return 'draw by stalemate';
    if (room.game.isDraw()) return 'draw';
    return `${room.game.turn() === 'w' ? 'white' : 'black'} to move`;
}

function getSeatPublicState(seat) {
    if (!seat) {
        return {
            occupied: false,
            connected: false,
            pendingReconnect: false,
            msToForfeit: 0
        };
    }

    const msToForfeit = seat.disconnectDeadline
        ? Math.max(0, seat.disconnectDeadline - Date.now())
        : 0;

    return {
        occupied: true,
        connected: !!seat.connected,
        pendingReconnect: !seat.connected && msToForfeit > 0,
        msToForfeit,
        profile: seat.profile || null
    };
}

function getPresenceNotice(room) {
    const pending = ['white', 'black']
        .map((color) => ({ color, seat: room.players[color] }))
        .filter(({ seat }) => seat && !seat.connected && seat.disconnectDeadline && seat.disconnectDeadline > Date.now());

    if (!pending.length || !isRoomActive(room)) return null;

    const nextPending = pending.sort((a, b) => a.seat.disconnectDeadline - b.seat.disconnectDeadline)[0];
    const seconds = Math.max(1, Math.ceil((nextPending.seat.disconnectDeadline - Date.now()) / 1000));
    return `${nextPending.color} disconnected - waiting ${seconds}s to reconnect`;
}

function serializeRoom(room) {
    return {
        id: room.id,
        fen: room.game.fen(),
        pgn: room.game.pgn(),
        history: room.game.history(),
        turn: room.game.turn() === 'w' ? 'white' : 'black',
        status: getRoomStatus(room),
        presenceNotice: getPresenceNotice(room),
        players: {
            white: getSeatPublicState(room.players.white),
            black: getSeatPublicState(room.players.black)
        },
        hostColor: room.host?.color || 'white',
        moderationLocked: room.game.history().length > 0,
        clocks: room.clocks,
        timeControlMs: room.timeControlMs,
        resigned: room.resigned,
        timeoutWinner: room.timeoutWinner,
        lastMove: room.lastMove
    };
}

function emitRoomState(roomId) {
    const room = rooms.get(roomId);
    if (!room) return;
    io.to(roomId).emit('room_state', serializeRoom(room));
}

function cleanupRoomIfEmpty(roomId) {
    const room = rooms.get(roomId);
    if (!room) return;

    const hasSeat = !!room.players.white || !!room.players.black;
    if (!hasSeat && room.sockets.size === 0) {
        rooms.delete(roomId);
        return;
    }

    const seatsSettled = ['white', 'black'].every((color) => {
        const seat = room.players[color];
        return !seat || (!seat.connected && !seat.disconnectDeadline);
    });

    if (room.sockets.size === 0 && seatsSettled && !isRoomActive(room)) {
        rooms.delete(roomId);
    }
}

function scheduleSeatForfeit(room, color) {
    const seat = room.players[color];
    if (!seat) return;

    clearSeatTimer(seat);
    seat.disconnectTimer = setTimeout(() => {
        const liveRoom = rooms.get(room.id);
        const liveSeat = liveRoom?.players?.[color];
        if (!liveRoom || !liveSeat || liveSeat.connected) return;

        liveSeat.disconnectTimer = null;
        if (!isRoomActive(liveRoom)) {
            emitRoomState(liveRoom.id);
            cleanupRoomIfEmpty(liveRoom.id);
            return;
        }

        liveSeat.disconnectDeadline = null;
        liveSeat.disconnectedAt = Date.now();
        liveRoom.resigned = color === 'white' ? 'black' : 'white';
        emitRoomState(liveRoom.id);
    }, DISCONNECT_GRACE_MS);
}

function releaseSeat(room, color, allowReconnect) {
    const seat = room.players[color];
    if (!seat) return;

    room.sockets.delete(seat.socketId);

    const shouldHoldSeat =
        allowReconnect &&
        isRoomActive(room) &&
        room.game.history().length > 0;

    if (!shouldHoldSeat) {
        clearSeatState(seat);
        room.players[color] = null;
        return;
    }

    seat.connected = false;
    seat.socketId = null;
    seat.disconnectedAt = Date.now();
    seat.disconnectDeadline = Date.now() + DISCONNECT_GRACE_MS;
    scheduleSeatForfeit(room, color);
}

function reclaimSeat(room, color, socket, profile) {
    const seat = room.players[color];
    if (!seat) return null;

    clearSeatState(seat);
    seat.connected = true;
    seat.socketId = socket.id;
    if (profile) seat.profile = profile;
    room.sockets.add(socket.id);
    socket.join(room.id);
    return seat;
}

function findSeatBySocket(room, socketId) {
    if (room.players.white?.socketId === socketId) return 'white';
    if (room.players.black?.socketId === socketId) return 'black';
    return null;
}

function getSeatBySocket(room, socketId) {
    const color = findSeatBySocket(room, socketId);
    return color ? room.players[color] : null;
}

function isRoomHostSeat(room, seat) {
    if (!room?.host || !seat) return false;
    const seatUserId = seat.profile?.userId || null;
    const seatEmail = seat.profile?.email || null;
    return (
        (room.host.deviceId && seat.deviceId && room.host.deviceId === seat.deviceId) ||
        (room.host.userId && seatUserId && room.host.userId === seatUserId) ||
        (room.host.email && seatEmail && room.host.email === seatEmail)
    );
}

function removeSeatFromRoom(room, color, reason) {
    const seat = room.players[color];
    if (!seat) return null;

    clearSeatState(seat);
    if (seat.socketId) {
        const targetSocket = io.sockets.sockets.get(seat.socketId);
        if (targetSocket) {
            targetSocket.emit('room_removed', {
                roomId: room.id,
                reason
            });
            targetSocket.leave(room.id);
        }
        room.sockets.delete(seat.socketId);
    }

    room.players[color] = null;
    return seat;
}

function tryReclaimSeat(room, socket, deviceId, reconnectToken, profile) {
    if (!deviceId || !reconnectToken) return null;

    for (const color of ['white', 'black']) {
        const seat = room.players[color];
        if (!seat) continue;
        if (seat.deviceId !== deviceId) continue;
        if (seat.reconnectToken !== reconnectToken) continue;
        if (!doesProfileMatchSeatIdentity(seat, profile)) return null;
        return reclaimSeat(room, color, socket, profile);
    }

    return null;
}

function settleRoomClock(room) {
    if (!room || room.resigned || room.timeoutWinner || room.timeControlMs <= 0) {
        room.lastTickAt = Date.now();
        return;
    }

    const now = Date.now();
    const elapsed = Math.max(0, now - room.lastTickAt);
    room.lastTickAt = now;

    room.clocks[room.activeColor] = Math.max(0, room.clocks[room.activeColor] - elapsed);
    if (room.clocks[room.activeColor] === 0) {
        room.timeoutWinner = room.activeColor === 'white' ? 'black' : 'white';
    }
}

function leaveSpecificRoom(socket, roomId, allowReconnect = true) {
    const normalizedId = String(roomId || '').trim().toUpperCase();
    const room = rooms.get(normalizedId);
    if (!room) return;

    room.sockets.delete(socket.id);
    const color = findSeatBySocket(room, socket.id);
    if (color) {
        releaseSeat(room, color, allowReconnect);
    }

    socket.leave(normalizedId);
    emitRoomState(normalizedId);
    cleanupRoomIfEmpty(normalizedId);
}

app.get('/health', (_req, res) => {
    res.json({
        ok: true,
        site: SITE_NAME,
        rooms: rooms.size
    });
});

app.get('/api/site', (_req, res) => {
    res.json({
        name: SITE_NAME,
        multiplayer: true,
        deployment: 'free-friendly',
        disconnectGraceMs: DISCONNECT_GRACE_MS
    });
});

io.use((socket, next) => {
    if (!allowSocketAction(socket, 'connect', 20, 60_000)) {
        next(new Error('Too many connections. Slow down and try again.'));
        return;
    }
    next();
});

io.on('connection', (socket) => {
    socket.on('create_room', ({ timeControlMs, deviceId, profile } = {}, callback = () => {}) => {
        if (!allowSocketAction(socket, 'create_room', 8, 60_000, callback)) return;

        const roomId = generateUniqueRoomId();
        const initialTime = normalizeTimeControlMs(timeControlMs);
        const sanitizedProfile = sanitizeProfile(profile);
        const globalBan = getGlobalBan(sanitizedProfile, deviceId);
        if (globalBan) {
            callback({ ok: false, error: globalBan.reason, globalBan: true });
            return;
        }
        const room = createRoom(roomId, initialTime);
        const seat = createSeat('white', socket, deviceId);
        seat.profile = sanitizedProfile;
        setRoomHost(room, seat);

        room.players.white = seat;
        room.sockets.add(socket.id);
        socket.join(roomId);

        callback({
            ok: true,
            roomId,
            color: 'white',
            reconnectToken: seat.reconnectToken,
            site: SITE_NAME,
            state: serializeRoom(room)
        });
        emitRoomState(roomId);
    });

    socket.on('join_room', ({ roomId, preferredColor, deviceId, reconnectToken, profile } = {}, callback = () => {}) => {
        if (!allowSocketAction(socket, 'join_room', 20, 60_000, callback)) return;
        if (!roomId) {
            callback({ ok: false, error: 'Missing room id.' });
            return;
        }

        const normalizedId = String(roomId).trim().toUpperCase();
        const room = rooms.get(normalizedId);
        const sanitizedProfile = sanitizeProfile(profile);
        if (!room) {
            callback({ ok: false, error: 'Room not found.' });
            return;
        }
        const globalBan = getGlobalBan(sanitizedProfile, deviceId);
        if (globalBan) {
            callback({ ok: false, error: globalBan.reason, globalBan: true });
            return;
        }
        if (isRoomBanned(room, sanitizedProfile, deviceId)) {
            callback({ ok: false, error: 'You are banned from this room.' });
            return;
        }

        let assignedColor = 'spectator';
        let seat = tryReclaimSeat(room, socket, String(deviceId || '').trim(), String(reconnectToken || '').trim(), sanitizedProfile);
        let warning = null;

        if (seat) {
            assignedColor = seat.color;
        } else if (sanitizedProfile?.userId && roomHasUserOnAnotherSeat(room, sanitizedProfile.userId)) {
            warning = 'This signed-in account already occupies a seat in the room, so this session joined as spectator.';
        } else if (preferredColor === 'black' && !room.players.black) {
            seat = createSeat('black', socket, deviceId);
            seat.profile = sanitizedProfile;
            room.players.black = seat;
            assignedColor = 'black';
        } else if (preferredColor === 'white' && !room.players.white) {
            seat = createSeat('white', socket, deviceId);
            seat.profile = sanitizedProfile;
            room.players.white = seat;
            assignedColor = 'white';
        } else if (!room.players.white) {
            seat = createSeat('white', socket, deviceId);
            seat.profile = sanitizedProfile;
            room.players.white = seat;
            assignedColor = 'white';
        } else if (!room.players.black) {
            seat = createSeat('black', socket, deviceId);
            seat.profile = sanitizedProfile;
            room.players.black = seat;
            assignedColor = 'black';
        }

        room.sockets.add(socket.id);
        socket.join(normalizedId);

        callback({
            ok: true,
            roomId: normalizedId,
            color: assignedColor,
            reconnectToken: seat?.reconnectToken || null,
            warning,
            state: serializeRoom(room)
        });
        emitRoomState(normalizedId);
    });

    socket.on('request_room_state', ({ roomId } = {}, callback = () => {}) => {
        if (!allowSocketAction(socket, 'request_room_state', 120, 60_000, callback)) return;

        const room = rooms.get(String(roomId || '').trim().toUpperCase());
        if (!room) {
            callback({ ok: false, error: 'Room not found.' });
            return;
        }
        settleRoomClock(room);
        callback({ ok: true, state: serializeRoom(room) });
    });

    socket.on('make_move', ({ roomId, from, to, promotion } = {}, callback = () => {}) => {
        if (!allowSocketAction(socket, 'make_move', 100, 10_000, callback)) return;

        const normalizedId = String(roomId || '').trim().toUpperCase();
        const room = rooms.get(normalizedId);
        if (!room) {
            callback({ ok: false, error: 'Room not found.' });
            return;
        }

        if (room.resigned || room.timeoutWinner || room.game.isGameOver()) {
            callback({ ok: false, error: 'Game is already over.' });
            return;
        }

        const turnColor = room.game.turn() === 'w' ? 'white' : 'black';
        if (room.players[turnColor]?.socketId !== socket.id) {
            callback({ ok: false, error: 'It is not your turn.' });
            return;
        }

        settleRoomClock(room);
        if (room.timeoutWinner) {
            emitRoomState(normalizedId);
            callback({ ok: false, error: 'Time expired before the move could be made.' });
            return;
        }

        try {
            const move = room.game.move({ from, to, promotion });
            if (!move) {
                callback({ ok: false, error: 'Illegal move.' });
                return;
            }

            room.lastMove = { from: move.from, to: move.to };
            room.activeColor = room.game.turn() === 'w' ? 'white' : 'black';
            room.lastTickAt = Date.now();

            emitRoomState(normalizedId);
            callback({ ok: true, state: serializeRoom(room) });
        } catch (_error) {
            callback({ ok: false, error: 'Illegal move.' });
        }
    });

    socket.on('resign_game', ({ roomId } = {}, callback = () => {}) => {
        if (!allowSocketAction(socket, 'resign_game', 12, 60_000, callback)) return;

        const normalizedId = String(roomId || '').trim().toUpperCase();
        const room = rooms.get(normalizedId);
        if (!room) {
            callback({ ok: false, error: 'Room not found.' });
            return;
        }

        if (room.players.white?.socketId === socket.id) room.resigned = 'black';
        else if (room.players.black?.socketId === socket.id) room.resigned = 'white';
        else {
            callback({ ok: false, error: 'Only players can resign.' });
            return;
        }

        settleRoomClock(room);
        emitRoomState(normalizedId);
        callback({ ok: true, state: serializeRoom(room) });
    });

    socket.on('reset_room', ({ roomId } = {}, callback = () => {}) => {
        if (!allowSocketAction(socket, 'reset_room', 12, 60_000, callback)) return;

        const normalizedId = String(roomId || '').trim().toUpperCase();
        const room = rooms.get(normalizedId);
        if (!room) {
            callback({ ok: false, error: 'Room not found.' });
            return;
        }

        const isPlayer =
            room.players.white?.socketId === socket.id ||
            room.players.black?.socketId === socket.id;

        if (!isPlayer) {
            callback({ ok: false, error: 'Only players can reset the room.' });
            return;
        }

        room.game.reset();
        room.clocks.white = room.timeControlMs;
        room.clocks.black = room.timeControlMs;
        room.activeColor = 'white';
        room.lastTickAt = Date.now();
        room.resigned = null;
        room.timeoutWinner = null;
        room.lastMove = null;

        for (const color of ['white', 'black']) {
            const seat = room.players[color];
            if (!seat) continue;
            clearSeatState(seat);
            if (!seat.connected || !seat.socketId) {
                room.players[color] = null;
            }
        }

        emitRoomState(normalizedId);
        callback({ ok: true, state: serializeRoom(room) });
    });

    socket.on('room_moderation', ({ roomId, action, targetColor, reason } = {}, callback = () => {}) => {
        if (!allowSocketAction(socket, 'room_moderation', 20, 60_000, callback)) return;

        const normalizedId = String(roomId || '').trim().toUpperCase();
        const normalizedTargetColor = targetColor === 'white' ? 'white' : targetColor === 'black' ? 'black' : '';
        const normalizedAction = ['kick', 'room_ban', 'global_ban'].includes(action) ? action : '';
        const banReason = normalizeBanReason(reason);
        const room = rooms.get(normalizedId);

        if (!room) {
            callback({ ok: false, error: 'Room not found.' });
            return;
        }
        if (!normalizedAction || !normalizedTargetColor) {
            callback({ ok: false, error: 'Choose a player to moderate.' });
            return;
        }

        const requesterSeat = getSeatBySocket(room, socket.id);
        const targetSeat = room.players[normalizedTargetColor];
        const requesterIsDeveloper = !!requesterSeat?.profile?.isDeveloper;
        const requesterIsHost = isRoomHostSeat(room, requesterSeat);

        if (!requesterSeat) {
            callback({ ok: false, error: 'Only seated players can moderate this room.' });
            return;
        }
        if (!targetSeat) {
            callback({ ok: false, error: 'That seat is already empty.' });
            return;
        }
        if (targetSeat.socketId === socket.id) {
            callback({ ok: false, error: 'You cannot moderate your own seat.' });
            return;
        }

        if (normalizedAction === 'kick' || normalizedAction === 'room_ban') {
            if (!requesterIsHost && !requesterIsDeveloper) {
                callback({ ok: false, error: 'Only the room creator can moderate this room before the game starts.' });
                return;
            }
            if (!requesterIsDeveloper && room.game.history().length > 0) {
                callback({ ok: false, error: 'Room moderation locks after the first move.' });
                return;
            }

            if (normalizedAction === 'room_ban') {
                addRoomBan(room, targetSeat.profile, targetSeat.deviceId);
            }

            removeSeatFromRoom(
                room,
                normalizedTargetColor,
                normalizedAction === 'room_ban' ? 'You were banned from this room.' : 'You were kicked from the room.'
            );
            emitRoomState(normalizedId);
            callback({ ok: true, state: serializeRoom(room) });
            return;
        }

        if (!requesterIsDeveloper) {
            callback({ ok: false, error: 'Only developers can permanently ban users.' });
            return;
        }

        const ban = addGlobalBan(targetSeat.profile, targetSeat.deviceId, banReason, requesterSeat.profile);
        removeSeatFromRoom(room, normalizedTargetColor, banReason);
        if (targetSeat.socketId) {
            const targetSocket = io.sockets.sockets.get(targetSeat.socketId);
            targetSocket?.emit('global_ban_applied', {
                reason: banReason,
                email: targetSeat.profile?.email || null,
                userId: targetSeat.profile?.userId || null,
                deviceId: targetSeat.deviceId || null,
                banId: ban.id,
                guest: !targetSeat.profile?.userId && !targetSeat.profile?.email
            });
        }
        emitRoomState(normalizedId);
        callback({ ok: true, state: serializeRoom(room) });
    });

    socket.on('developer_bans', ({ roomId, action, banId } = {}, callback = () => {}) => {
        if (!allowSocketAction(socket, 'developer_bans', 20, 60_000, callback)) return;

        const normalizedId = String(roomId || '').trim().toUpperCase();
        const room = rooms.get(normalizedId);
        const requesterSeat = room ? getSeatBySocket(room, socket.id) : null;
        if (!requesterSeat?.profile?.isDeveloper) {
            callback({ ok: false, error: 'Only developers can view or edit game bans.' });
            return;
        }

        if (action === 'unban') {
            const removed = removeGlobalBan(banId);
            callback({
                ok: removed,
                error: removed ? null : 'Ban entry not found.',
                bans: serializeGlobalBans()
            });
            return;
        }

        callback({ ok: true, bans: serializeGlobalBans() });
    });

    socket.on('leave_room', ({ roomId } = {}, callback = () => {}) => {
        if (!allowSocketAction(socket, 'leave_room', 20, 60_000, callback)) return;
        leaveSpecificRoom(socket, roomId, true);
        callback({ ok: true });
    });

    socket.on('disconnect', () => {
        for (const roomId of rooms.keys()) {
            leaveSpecificRoom(socket, roomId, true);
        }
    });
});

setInterval(() => {
    for (const [roomId, room] of rooms.entries()) {
        settleRoomClock(room);
        emitRoomState(roomId);
        cleanupRoomIfEmpty(roomId);
    }
}, 500);

server.listen(PORT, () => {
    console.log(`${SITE_NAME} listening on http://localhost:${PORT}`);
});
