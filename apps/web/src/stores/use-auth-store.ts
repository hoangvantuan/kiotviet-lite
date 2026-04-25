import { create } from 'zustand'

import type { AuthUser } from '@kiotviet-lite/shared'

interface AuthState {
  user: AuthUser | null
  accessToken: string | null
  isAuthenticated: boolean
  booted: boolean
  setAuth: (input: { user: AuthUser; accessToken: string }) => void
  setAccessToken: (token: string) => void
  clearAuth: () => void
  markBooted: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  isAuthenticated: false,
  booted: false,
  setAuth: ({ user, accessToken }) =>
    set({ user, accessToken, isAuthenticated: true, booted: true }),
  setAccessToken: (token) =>
    set((state) => ({ accessToken: token, isAuthenticated: state.user !== null })),
  clearAuth: () => set({ user: null, accessToken: null, isAuthenticated: false }),
  markBooted: () => set({ booted: true }),
}))
