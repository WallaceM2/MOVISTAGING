import { create } from 'zustand';
import type { Passenger } from '@/types/api';

type AuthState = {
  hydrated: boolean;
  accessToken: string | null;
  passenger: Passenger | null;
  requiresLegalConsent: boolean;
  setHydrated: (value: boolean) => void;
  setSession: (accessToken: string, passenger?: Partial<Passenger>) => void;
  setPassenger: (passenger: Passenger) => void;
  setRequiresLegalConsent: (value: boolean) => void;
  clearSession: () => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  hydrated: false,
  accessToken: null,
  passenger: null,
  requiresLegalConsent: false,
  setHydrated: (value) => set({ hydrated: value }),
  setSession: (accessToken, passenger) => set((state) => ({
    accessToken,
    passenger: passenger ? { ...(state.passenger ?? {}), ...passenger } as Passenger : state.passenger,
  })),
  setPassenger: (passenger) => set({ passenger }),
  setRequiresLegalConsent: (value) => set({ requiresLegalConsent: value }),
  clearSession: () => set({ accessToken: null, passenger: null, requiresLegalConsent: false }),
}));
