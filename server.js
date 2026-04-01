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
const DISCONNECT_GRACE_MS = 10_000;
const HTTP_RATE_LIMIT_WINDOW_MS = 60_000;
const HTTP_RATE_LIMIT_MAX = 240;
const ROOM_CODE_LENGTH = 8;
const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const rateLimitBuckets = new Map();
const rooms = new Map();

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
            "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com",
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com",
            "font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com data:",
            "img-src 'self' data:",
            "connect-src 'self' ws: wss:",
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
                    scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdnjs.cloudflare.com'],
                    styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://cdnjs.cloudflare.com'],
                    fontSrc: ["'self'", 'https://fonts.gstatic.com', 'https://cdnjs.cloudflare.com', 'data:'],
                    imgSrc: ["'self'", 'data:'],
                    connectSrc: ["'self'", 'ws:', 'wss:'],
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
        disconnectedAt: null,
        disconnectDeadline: null,
        disconnectTimer: null
    };
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
        msToForfeit
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

function reclaimSeat(room, color, socket) {
    const seat = room.players[color];
    if (!seat) return null;

    clearSeatState(seat);
    seat.connected = true;
    seat.socketId = socket.id;
    room.sockets.add(socket.id);
    socket.join(room.id);
    return seat;
}

function findSeatBySocket(room, socketId) {
    if (room.players.white?.socketId === socketId) return 'white';
    if (room.players.black?.socketId === socketId) return 'black';
    return null;
}

function tryReclaimSeat(room, socket, deviceId, reconnectToken) {
    if (!deviceId || !reconnectToken) return null;

    for (const color of ['white', 'black']) {
        const seat = room.players[color];
        if (!seat) continue;
        if (seat.deviceId !== deviceId) continue;
        if (seat.reconnectToken !== reconnectToken) continue;
        return reclaimSeat(room, color, socket);
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
    socket.on('create_room', ({ timeControlMs, deviceId } = {}, callback = () => {}) => {
        if (!allowSocketAction(socket, 'create_room', 8, 60_000, callback)) return;

        const roomId = generateUniqueRoomId();
        const initialTime = typeof timeControlMs === 'number' ? timeControlMs : 300000;
        const room = createRoom(roomId, initialTime);
        const seat = createSeat('white', socket, deviceId);

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

    socket.on('join_room', ({ roomId, preferredColor, deviceId, reconnectToken } = {}, callback = () => {}) => {
        if (!allowSocketAction(socket, 'join_room', 20, 60_000, callback)) return;
        if (!roomId) {
            callback({ ok: false, error: 'Missing room id.' });
            return;
        }

        const normalizedId = String(roomId).trim().toUpperCase();
        const room = rooms.get(normalizedId);
        if (!room) {
            callback({ ok: false, error: 'Room not found.' });
            return;
        }

        let assignedColor = 'spectator';
        let seat = tryReclaimSeat(room, socket, String(deviceId || '').trim(), String(reconnectToken || '').trim());

        if (seat) {
            assignedColor = seat.color;
        } else if (preferredColor === 'black' && !room.players.black) {
            seat = createSeat('black', socket, deviceId);
            room.players.black = seat;
            assignedColor = 'black';
        } else if (preferredColor === 'white' && !room.players.white) {
            seat = createSeat('white', socket, deviceId);
            room.players.white = seat;
            assignedColor = 'white';
        } else if (!room.players.white) {
            seat = createSeat('white', socket, deviceId);
            room.players.white = seat;
            assignedColor = 'white';
        } else if (!room.players.black) {
            seat = createSeat('black', socket, deviceId);
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

        clearSeatState(room.players.white);
        clearSeatState(room.players.black);

        emitRoomState(normalizedId);
        callback({ ok: true, state: serializeRoom(room) });
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
