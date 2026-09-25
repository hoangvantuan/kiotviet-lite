import { create } from 'zustand'

import type { AuthUser } from '@kiotviet-lite/shared'

interface AuthState {
  user: AuthUser | null
  accessToken: string | null
  isAuthenticated: boolean
  booted: boolean
  networkError: boolean
  setAuth: (input: { user: AuthUser; accessToken: string }) => void
  setAccessToken: (token: string) => void
  clearAuth: () => void
  markBooted: () => void
  setNetworkError: (error: boolean) => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  isAuthenticated: false,
  booted: false,
  networkError: false,
  setAuth: ({ user, accessToken }) =>
    set({ user, accessToken, isAuthenticated: true, booted: true, networkError: false }),
  setAccessToken: (token) =>
    set((state) => ({ accessToken: token, isAuthenticated: state.user !== null })),
  clearAuth: () => set({ user: null, accessToken: null, isAuthenticated: false }),
  markBooted: () => set({ booted: true }),
  setNetworkError: (error) => set({ networkError: error }),
}))
