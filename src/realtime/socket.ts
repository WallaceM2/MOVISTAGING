import { io, Socket } from 'socket.io-client';
import { API_URL } from '@/config/env';
import { useAuthStore } from '@/store/authStore';
import type { SocketEventPayload } from '@/types/api';

type ServerEvents = SocketEventPayload;
type ClientEvents = {
  heartbeat: (ack: () => void) => void;
};
let socket: Socket<ServerEvents, ClientEvents> | null = null;

export function getSocket() {
  const token = useAuthStore.getState().accessToken;
  if (!token) return null;
  if (!socket) {
  socket = io(API_URL, {
    autoConnect: false,
    transports: ['websocket', 'polling'],
    auth: { token },
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 700,
    reconnectionDelayMax: 5000,
    timeout: 10000,
  });
} else {
  socket.auth = { token };
}
  return socket;
}

export function connectSocket() {
  const current = getSocket();
  if (current && !current.connected) current.connect();
  return current;
}

export function disconnectSocket() {
  if (socket?.connected) socket.disconnect();
}

export function sendHeartbeat() {
  if (socket?.connected) socket.emit('heartbeat', () => undefined);
}

export function subscribeRideEvents(handlers: Partial<{ [K in keyof ServerEvents]: (payload: ServerEvents[K]) => void }>) {
  const current = connectSocket();
  if (!current) return () => undefined;
  for (const event of Object.keys(handlers) as Array<keyof ServerEvents>) {
    const handler = handlers[event];
    if (handler) current.on(event, handler as never);
  }
  return () => {
    for (const event of Object.keys(handlers) as Array<keyof ServerEvents>) {
      const handler = handlers[event];
      if (handler) current.off(event, handler as never);
    }
  };
}
