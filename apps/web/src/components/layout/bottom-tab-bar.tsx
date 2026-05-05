import { Link, useRouterState } from '@tanstack/react-router'
import { MoreHorizontal } from 'lucide-react'

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

import { findActivePath } from './nav-items'
import { useFilteredNavItems } from './use-filtered-nav-items'

const MAX_VISIBLE_TABS = 4

export function BottomTabBar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const navItems = useFilteredNavItems()
  const activePath = findActivePath(
    pathname,
    navItems.map((i) => i.path),
  )

  const visibleTabs = navItems.slice(0, MAX_VISIBLE_TABS)
  const overflowTabs = navItems.slice(MAX_VISIBLE_TABS)
  const hasOverflow = overflowTabs.length > 0
  const isOverflowActive = overflowTabs.some((item) => item.path === activePath)

  return (
    <nav
      aria-label="Menu chính"
      className="fixed bottom-0 left-0 right-0 z-40 flex border-t border-border bg-background md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      {visibleTabs.map((item) => {
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

      {hasOverflow && (
        <Popover>
          <PopoverTrigger
            className={cn(
              'flex flex-1 flex-col items-center gap-0.5 py-2 text-xs transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary',
              isOverflowActive ? 'text-primary' : 'text-muted-foreground',
            )}
            aria-label="Thêm mục điều hướng"
          >
            <MoreHorizontal className="h-5 w-5" />
            <span>Thêm</span>
          </PopoverTrigger>
          <PopoverContent side="top" align="end" className="mb-2 max-h-80 w-56 overflow-y-auto p-2">
            <div className="flex flex-col gap-1">
              {overflowTabs.map((item) => {
                const isActive = item.path === activePath
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={cn(
                      'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                      'hover:bg-accent hover:text-foreground',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                      isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground',
                    )}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    <span>{item.label}</span>
                  </Link>
                )
              })}
            </div>
          </PopoverContent>
        </Popover>
      )}
    </nav>
  )
}
