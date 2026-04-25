import { useEffect } from 'react'
import { useRouterState } from '@tanstack/react-router'
import { create } from 'zustand'

interface SidebarState {
  isCollapsed: boolean
  isMobileOpen: boolean
  toggle: () => void
  setCollapsed: (collapsed: boolean) => void
  openMobile: () => void
  closeMobile: () => void
}

const getInitialCollapsed = () => {
  try {
    return localStorage.getItem('sidebar-collapsed') === 'true'
  } catch {
    return false
  }
}

export const useSidebarStore = create<SidebarState>((set) => ({
  isCollapsed: getInitialCollapsed(),
  isMobileOpen: false,
  toggle: () =>
    set((state) => {
      const next = !state.isCollapsed
      try {
        localStorage.setItem('sidebar-collapsed', String(next))
      } catch {
        // localStorage unavailable
      }
      return { isCollapsed: next }
    }),
  setCollapsed: (collapsed) => {
    try {
      localStorage.setItem('sidebar-collapsed', String(collapsed))
    } catch {
      // localStorage unavailable
    }
    set({ isCollapsed: collapsed })
  },
  openMobile: () => set({ isMobileOpen: true }),
  closeMobile: () => set({ isMobileOpen: false }),
}))

export function useSidebarAutoClose() {
  const closeMobile = useSidebarStore((s) => s.closeMobile)
  const routerState = useRouterState({ select: (s) => s.location.pathname })

  useEffect(() => {
    closeMobile()
  }, [routerState, closeMobile])

  useEffect(() => {
    const mql = window.matchMedia('(min-width: 768px)')
    const handler = (e: MediaQueryListEvent) => {
      if (e.matches) closeMobile()
    }
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [closeMobile])
}
