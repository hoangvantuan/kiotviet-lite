import { useEffect } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import { PanelLeftClose, PanelLeftOpen, X } from 'lucide-react'

import { useMediaQuery } from '@/hooks/use-media-query'
import { useSidebarStore } from '@/hooks/use-sidebar'
import { cn } from '@/lib/utils'

import { useFilteredNavItems } from './use-filtered-nav-items'

function isPathActive(currentPath: string, itemPath: string) {
  if (itemPath === '/') return currentPath === '/'
  return currentPath === itemPath || currentPath.startsWith(itemPath + '/')
}

const SIDEBAR_WIDTH = 240
const SIDEBAR_COLLAPSED_WIDTH = 64

export function Sidebar() {
  const isCollapsedPref = useSidebarStore((s) => s.isCollapsed)
  const toggle = useSidebarStore((s) => s.toggle)
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const navItems = useFilteredNavItems()

  const isCollapsed = isDesktop ? isCollapsedPref : true
  const isTablet = !isDesktop

  return (
    <aside
      className={cn(
        'group fixed left-0 top-0 z-30 hidden h-full border-r border-border bg-background transition-[width] duration-200 md:block',
        isTablet && 'w-16 hover:w-[240px]',
      )}
      style={
        isTablet ? undefined : { width: isCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH }
      }
    >
      <div className="flex h-14 items-center justify-between border-b border-border px-3">
        <span
          className={cn(
            'text-sm font-semibold text-foreground truncate',
            isTablet ? 'hidden group-hover:inline' : !isCollapsed ? 'inline' : 'hidden',
          )}
        >
          KiotViet Lite
        </span>
        {isDesktop && (
          <button
            onClick={toggle}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            aria-label={isCollapsed ? 'Mở rộng menu' : 'Thu gọn menu'}
          >
            {isCollapsed ? (
              <PanelLeftOpen className="h-5 w-5" />
            ) : (
              <PanelLeftClose className="h-5 w-5" />
            )}
          </button>
        )}
      </div>
      <nav aria-label="Menu chính" className="flex flex-col gap-1 p-2">
        {navItems.map((item) => {
          const isActive = isPathActive(pathname, item.path)
          const showLabel = isTablet ? false : !isCollapsed
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                'hover:bg-accent hover:text-foreground',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground',
                isCollapsed && !isTablet && 'justify-center px-0',
                isTablet && 'group-hover:justify-start group-hover:px-3 justify-center px-0',
              )}
              aria-current={isActive ? 'page' : undefined}
              title={isCollapsed && !isTablet ? item.label : undefined}
            >
              <item.icon className="h-5 w-5 shrink-0" />
              {showLabel && <span className="truncate">{item.label}</span>}
              {isTablet && <span className="hidden group-hover:inline truncate">{item.label}</span>}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}

export function MobileDrawer() {
  const isMobileOpen = useSidebarStore((s) => s.isMobileOpen)
  const closeMobile = useSidebarStore((s) => s.closeMobile)
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const navItems = useFilteredNavItems()

  useEffect(() => {
    if (!isMobileOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMobile()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isMobileOpen, closeMobile])

  if (!isMobileOpen) return null

  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <div className="fixed inset-0 bg-black/50" onClick={closeMobile} aria-hidden="true" />
      <aside className="fixed left-0 top-0 h-full w-[240px] bg-background shadow-lg">
        <div className="flex h-14 items-center justify-between border-b border-border px-3">
          <span className="text-sm font-semibold text-foreground">KiotViet Lite</span>
          <button
            onClick={closeMobile}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            aria-label="Đóng menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav aria-label="Menu chính" className="flex flex-col gap-1 p-2">
          {navItems.map((item) => {
            const isActive = item.path === '/' ? pathname === '/' : pathname.startsWith(item.path)
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={closeMobile}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  'hover:bg-accent hover:text-foreground',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                  isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground',
                )}
                aria-current={isActive ? 'page' : undefined}
              >
                <item.icon className="h-5 w-5 shrink-0" />
                <span>{item.label}</span>
              </Link>
            )
          })}
        </nav>
      </aside>
    </div>
  )
}
