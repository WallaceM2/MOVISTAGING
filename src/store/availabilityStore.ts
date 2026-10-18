import { create } from "zustand";

type DriverAvailabilityState = {
  online: boolean;
  setOnline: (online: boolean) => void;
};

export const useDriverAvailabilityStore = create<DriverAvailabilityState>((set) => ({
  online: false,
  setOnline: (online) => set({ online }),
}));
