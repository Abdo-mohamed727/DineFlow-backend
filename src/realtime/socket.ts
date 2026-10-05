import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import { verifyToken } from '../utils/jwt';
import { env } from '../config/env';
import { Role } from '../types';
import { ROOM } from '../types/realtime';
import type { JwtPayload } from 'jsonwebtoken';

/**
 * Socket.IO realtime server.
 *
 * Architecture:
 *   - One Socket.IO server attached to the existing Express HTTP server.
 *   - Clients authenticate with the SAME JWT used for REST requests, passed
 *     via the `auth.token` field of the Socket.IO handshake.
 *   - After auth, the socket joins a role-specific room (`kitchen`, `waiter`,
 *     or `customer`) so events can be targeted with `io.to('kitchen').emit()`.
 *
 * Why this design:
 *   - Single HTTP server: REST + WebSocket on the same port. No second server,
 *     no second port, no extra CORS config.
 *   - JWT-based auth: reuses the existing `verifyToken()` from `src/utils/jwt.ts`.
 *     No new auth mechanism invented.
 *   - Role-gated rooms: a customer CANNOT join the `kitchen` room even if they
 *     send `socket.emit('join_room', 'kitchen')` — the server checks the
 *     decoded JWT role before calling `socket.join()`.
 *
 * Connection lifecycle:
 *   1. Client connects with `io(serverUrl, { auth: { token: '<JWT>' } })`.
 *   2. Server runs the `connection` handler — verifies the JWT.
 *      - If invalid → `socket.disconnect()` and log.
 *      - If valid → store `socket.data.user = { id, role }` and join the
 *        role room automatically. Client doesn't need to manually join.
 *   3. Client may also emit `join_room` with an explicit room name. The server
 *      verifies the requested room matches the user's role before joining.
 *   4. On disconnect → Socket.IO automatically removes the socket from rooms.
 *      No cleanup needed.
 */

let io: SocketIOServer | null = null;

/**
 * Initialize Socket.IO and attach it to the existing HTTP server.
 * Called once from `src/server.ts` after `http.createServer(app)`.
 *
 * Returns the SocketIOServer instance so the realtime service can use it
 * for emits.
 */
export function initSocketIO(httpServer: HttpServer): SocketIOServer {
  // Reuse the existing CORS_ORIGIN env var so Socket.IO CORS matches REST.
  // The Flutter app connects from the same origin either way.
  const corsOrigin = env.CORS_ORIGIN === '*' ? '*' : env.CORS_ORIGIN.split(',').map((s) => s.trim());

  io = new SocketIOServer(httpServer, {
    cors: {
      origin: corsOrigin,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'PUT'],
      credentials: true,
    },
    // Allow the client to pass `auth: { token }` in the handshake.
    // We'll verify it in the connection handler.
    allowRequest: (req, callback) => {
      // No additional request-level filtering needed; JWT is verified in
      // the connection handler. This hook exists for future IP/rate limiting.
      callback(null, true);
    },
  });

  // ─── Connection handler ────────────────────────────────────────────────
  io.on('connection', (socket: Socket) => {
    // The Flutter client should pass `auth: { token: '<JWT>' }` (without
    // the 'Bearer ' prefix, since Socket.IO auth is a separate channel
    // from HTTP headers). For backward-compat with clients that send the
    // full header, we also strip a leading 'Bearer '.
    const rawToken = (socket.handshake.auth as { token?: string } | undefined)?.token;
    const token = rawToken?.startsWith('Bearer ') ? rawToken.slice('Bearer '.length).trim() : rawToken;

    if (!token) {
      // eslint-disable-next-line no-console
      console.warn(`[Socket.IO] ${socket.id} rejected — no token in handshake auth`);
      socket.emit('auth_error', { message: 'Authentication token required' });
      socket.disconnect(true);
      return;
    }

    let decoded: JwtPayload;
    try {
      decoded = verifyToken(token) as JwtPayload;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[Socket.IO] ${socket.id} rejected — invalid token:`, (err as Error).message);
      socket.emit('auth_error', { message: 'Invalid or expired token' });
      socket.disconnect(true);
      return;
    }

    const role = decoded.role as Role;
    const userId = decoded.userId;
    socket.data.user = { id: userId, role };

    // Auto-join the role-specific room. The client doesn't need to manually
    // emit 'join_room' — we put them in the right room based on their JWT.
    const roleRoom = roleRoomFor(role);
    if (roleRoom) {
      void socket.join(roleRoom);
      if (env.NODE_ENV !== 'test') {
        // eslint-disable-next-line no-console
        console.log(`[Socket.IO] ${socket.id} connected (user=${userId}, role=${role}, room=${roleRoom})`);
      }
    }

    // Also join a per-user room (so we can target a specific customer later,
    // e.g. for "your order is ready" pushes). The room name is `user:<id>`.
    void socket.join(`user:${userId}`);

    // Tell the client that the server has finished setting up (auth verified,
    // rooms joined). The client can use this to know it's safe to start
    // listening for events — without this, there's a race where the client
    // receives `connect` before the server has joined it to any room.
    socket.emit('ready', { rooms: [roleRoom, `user:${userId}`].filter(Boolean) });

    // ─── Client-initiated room join (with role verification) ──────────
    socket.on('join_room', (roomName: unknown, ack?: (response: { ok: boolean; error?: string }) => void) => {
      if (typeof roomName !== 'string') {
        ack?.({ ok: false, error: 'room name must be a string' });
        return;
      }
      // The client can ONLY join rooms that match their JWT role.
      // This prevents a customer from joining the 'kitchen' room.
      const allowedRoom = roleRoomFor(role);
      if (roomName !== allowedRoom && !roomName.startsWith('user:')) {
        // eslint-disable-next-line no-console
        console.warn(`[Socket.IO] ${socket.id} denied join to '${roomName}' (role=${role})`);
        ack?.({ ok: false, error: `Forbidden: role '${role}' cannot join room '${roomName}'` });
        return;
      }
      void socket.join(roomName);
      ack?.({ ok: true });
    });

    // ─── Disconnect ──────────────────────────────────────────────────
    socket.on('disconnect', (reason: string) => {
      if (env.NODE_ENV !== 'test') {
        // eslint-disable-next-line no-console
        console.log(`[Socket.IO] ${socket.id} disconnected (${reason})`);
      }
    });

    // ─── Error handler (must never crash the backend) ───────────────
    socket.on('error', (err: Error) => {
      // eslint-disable-next-line no-console
      console.error(`[Socket.IO] ${socket.id} error:`, err.message);
    });
  });

  if (env.NODE_ENV !== 'test') {
    // eslint-disable-next-line no-console
    console.log('✅ Socket.IO initialized (kitchen/waiter/customer rooms)');
  }

  return io;
}

/**
 * Get the Socket.IO server instance. Returns null if `initSocketIO` hasn't
 * been called yet (e.g. during tests that don't boot the full server).
 */
export function getIO(): SocketIOServer | null {
  return io;
}

/**
 * Map a role to its room name. Returns null for unknown roles (defensive —
 * the JWT enum is already restricted to customer/waiter/kitchen).
 *
 * Exported so the realtime service can target rooms by role without
 * duplicating the role→room mapping.
 */
export function roleRoomFor(role: Role): string | null {
  switch (role) {
    case 'kitchen':
      return ROOM.KITCHEN;
    case 'waiter':
      return ROOM.WAITER;
    case 'customer':
      return ROOM.CUSTOMER;
    default:
      return null;
  }
}
