import { create } from "zustand";

export type UnoErpCalendarEvent = {
  id: string;
  unoerpId: string;
  title: string;
  subtitle?: string;
  description?: string;
  start: Date;
  end: Date;
  allDay: boolean;
  color?: string;
  category?: string;
  priority?: string;
  ticketType?: string;
};

const VISIBILITY_STORAGE_KEY = "wf.unoerp.calendarVisible";

function loadVisibility(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(VISIBILITY_STORAGE_KEY) !== "false";
}

type UnoErpEventsState = {
  events: UnoErpCalendarEvent[];
  hydrated: boolean;
  /** "Mostra eventi UnoERP" toggle — persisted to localStorage, not the synced preferences table. */
  visible: boolean;
  setEvents: (events: UnoErpCalendarEvent[]) => void;
  setVisible: (visible: boolean) => void;
};

/**
 * Synced UnoERP calendar events for the signed-in user. Hydrated once by
 * `UnoErpEventsProvider` (fetch-based, no Dexie — this integration is
 * online-only) and read by every calendar view via `useCalendarEvents()`.
 */
export const useUnoErpEventsStore = create<UnoErpEventsState>((set) => ({
  events: [],
  hydrated: false,
  visible: loadVisibility(),
  setEvents: (events) => set({ events, hydrated: true }),
  setVisible: (visible) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(VISIBILITY_STORAGE_KEY, String(visible));
    }
    set({ visible });
  }
}));
