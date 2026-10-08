import { io, Socket } from "socket.io-client";
import { API_URL } from "@/config/env";
import { refreshAccessToken } from "@/api/http";
import { useAuthStore } from "@/store/authStore";
import type { RideOffer } from "@/features/corrida/corridaService";

type DriverOfferEvent = { corrida_id: number; local_embarque: string; local_desembarque: string; valor_motorista: number | string; distancia_km: number | string; tempo_minutos: number | string; forma_pagamento: RideOffer["forma_pagamento"]; categoria: RideOffer["categoria"]; conta_verificada?: boolean; coordenadas?: { origem: { lat: number; lng: number }; destino: { lat: number; lng: number } }; tempo_para_aceitar?: number };
type ServerEvents = { nova_oferta_corrida: (payload: DriverOfferEvent) => void };
type Ack = { ok?: boolean; codigo?: string; erro?: string; disponivel?: boolean };
type ClientEvents = {
  heartbeat: (ack?: (response: Ack) => void) => void;
  definir_disponibilidade: (payload: { disponivel: boolean }, ack: (response: Ack) => void) => void;
  atualizar_localizacao: (payload: { lat: number; lng: number; direcao?: number; corrida_id?: number }, ack: (response: Ack) => void) => void;
};

let socket: Socket<ServerEvents, ClientEvents> | null = null;
let refreshingSocket = false;

export function getSocket() {
  const token = useAuthStore.getState().accessToken;
  if (!token) return null;
  if (!socket) {
    socket = io(API_URL, {
      autoConnect: false,
      // Polling avoids a React Native Android WebSocket failure; Socket.IO can
      // upgrade the connection to WebSocket once the initial session is stable.
      transports: ["polling", "websocket"],
      auth: { token },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 15000,
      timeout: 10000,
    });
    socket.on("connect", () => { socket?.emit("heartbeat", () => undefined); });
    socket.on("connect_error", (error) => {
      const code = (error as Error & { data?: { codigo?: string } }).data?.codigo;
      if (!refreshingSocket && (code === "AUTH_INVALID" || code === "AUTH_REQUIRED")) {
        refreshingSocket = true;
        void refreshAccessToken().then((ok) => {
          if (ok && socket) {
            socket.auth = { token: useAuthStore.getState().accessToken ?? "" };
            socket.connect();
          }
        }).finally(() => { refreshingSocket = false; });
      }
    });
  }
  socket.auth = { token };
  return socket;
}

export function connectSocket() {
  const current = getSocket();
  if (current && !current.connected) current.connect();
  return current;
}

export function disconnectSocket() {
  if (!socket) return;
  socket.removeAllListeners();
  socket.disconnect();
  socket = null;
}

function emitWithAck(event: "definir_disponibilidade" | "atualizar_localizacao", payload: { disponivel: boolean } | { lat: number; lng: number; direcao?: number; corrida_id?: number }) {
  return new Promise<Ack>((resolve, reject) => {
    const current = connectSocket();
    if (!current) return reject(new Error("Entre novamente para continuar."));
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      current.off("connect", onConnect);
      callback();
    };
    const send = () => {
      const ack = (response: Ack) => finish(() => response?.ok ? resolve(response) : reject(new Error(response?.erro || response?.codigo || "O servidor não confirmou a operação.")));
      if (event === "definir_disponibilidade") current.emit(event, payload as { disponivel: boolean }, ack);
      else current.emit(event, payload as { lat: number; lng: number; direcao?: number; corrida_id?: number }, ack);
    };
    const onConnect = () => send();
    const timeout = setTimeout(() => finish(() => reject(new Error("Não foi possível conectar ao MOVI. Verifique a conexão e tente novamente."))), 12000);
    if (current.connected) send(); else current.once("connect", onConnect);
  });
}

export function setAvailability(disponivel: boolean) {
  return emitWithAck("definir_disponibilidade", { disponivel });
}

export function updateLocation(lat: number, lng: number, corridaId?: number, direcao?: number) {
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    return Promise.reject(new Error("A localização retornou coordenadas inválidas."));
  }
  return emitWithAck("atualizar_localizacao", { lat, lng, ...(corridaId ? { corrida_id: corridaId } : {}), ...(direcao == null ? {} : { direcao }) });
}

export function sendHeartbeat() {
  const current = getSocket();
  if (current?.connected) current.emit("heartbeat", () => undefined);
}

export function subscribeRideEvents(handlers: Partial<ServerEvents>) {
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
