import { Link, useRouterState } from '@tanstack/react-router'

import { cn } from '@/lib/utils'

import { findActivePath } from './nav-items'
import { useFilteredNavItems } from './use-filtered-nav-items'

export function BottomTabBar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const navItems = useFilteredNavItems()
  const activePath = findActivePath(
    pathname,
    navItems.map((i) => i.path),
  )

  return (
    <nav
      aria-label="Menu chính"
      className="fixed bottom-0 left-0 right-0 z-40 flex border-t border-border bg-background md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      {navItems.map((item) => {
        const isActive = item.path === activePath
        return (
          <Link
            key={item.path}
            to={item.path}
            className={cn(
              'flex flex-1 flex-col items-center gap-0.5 py-2 text-xs transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary',
              isActive ? 'text-primary' : 'text-muted-foreground',
            )}
            aria-current={isActive ? 'page' : undefined}
          >
            <item.icon className="h-5 w-5" />
            <span>{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
