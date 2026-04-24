import { create } from 'zustand'

import type { AuthUser } from '@kiotviet-lite/shared'

interface AuthState {
  user: AuthUser | null
  accessToken: string | null
  isAuthenticated: boolean
  setAuth: (input: { user: AuthUser; accessToken: string }) => void
  setAccessToken: (token: string) => void
  clearAuth: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  isAuthenticated: false,
  setAuth: ({ user, accessToken }) =>
    set({ user, accessToken, isAuthenticated: true }),
  setAccessToken: (token) => set({ accessToken: token, isAuthenticated: true }),
  clearAuth: () => set({ user: null, accessToken: null, isAuthenticated: false }),
}))
