import { create } from "zustand";
import type { Session, User } from "@supabase/supabase-js";

type AuthState = {
  session: Session | null;
  user: User | null;
  setSession: (session: Session | null) => void;
  clear: () => void;
  /**
   * 2FA (TOTP) readiness.
   * Supabase supports MFA; we keep a local flag so the UI can later
   * guide users/admin to enable it per account.
   */
  mfaEnabled: boolean;
  setMfaEnabled: (enabled: boolean) => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  user: null,
  mfaEnabled: false,
  setSession: (session) =>
    set({
      session,
      user: session?.user ?? null
    }),
  clear: () => set({ session: null, user: null }),
  setMfaEnabled: (enabled) => set({ mfaEnabled: enabled })
}));

