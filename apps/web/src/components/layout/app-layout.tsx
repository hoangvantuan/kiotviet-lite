import { Outlet } from '@tanstack/react-router'

import { useMediaQuery } from '@/hooks/use-media-query'
import { useSidebarAutoClose, useSidebarStore } from '@/hooks/use-sidebar'

import { BottomTabBar } from './bottom-tab-bar'
import { ErrorBoundary } from './error-boundary'
import { Header } from './header'
import { MobileDrawer, Sidebar } from './sidebar'

export function AppLayout() {
  const isCollapsed = useSidebarStore((s) => s.isCollapsed)
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  const isTablet = useMediaQuery('(min-width: 768px)')
  useSidebarAutoClose()

  let contentMargin = 0
  if (isDesktop) {
    contentMargin = isCollapsed ? 64 : 240
  } else if (isTablet) {
    contentMargin = 64
  }

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <MobileDrawer />
      <div
        className="flex min-h-screen flex-col transition-[margin-left] duration-200"
        style={{ marginLeft: contentMargin }}
      >
        <Header />
        <main className="flex-1 p-4 pb-20 md:pb-4">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
      <BottomTabBar />
    </div>
  )
}
