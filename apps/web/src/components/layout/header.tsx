import { useNavigate } from '@tanstack/react-router'
import { LogOut, Menu } from 'lucide-react'

import { hasPermission } from '@kiotviet-lite/shared'

import { Button } from '@/components/ui/button'
import { useLogout } from '@/features/auth/use-logout'
import { LowStockBell } from '@/features/products/low-stock-bell'
import { useSidebarStore } from '@/hooks/use-sidebar'
import { useAuthStore } from '@/stores/use-auth-store'

export function Header() {
  const user = useAuthStore((s) => s.user)
  const openMobile = useSidebarStore((s) => s.openMobile)
  const isMobileOpen = useSidebarStore((s) => s.isMobileOpen)
  const logout = useLogout()
  const navigate = useNavigate()

  const onLogout = async () => {
    await logout.mutateAsync()
    navigate({ to: '/login', replace: true })
  }

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-background px-4">
      <div className="flex items-center gap-3">
        <button
          onClick={openMobile}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground md:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          aria-label="Mở menu"
          aria-expanded={isMobileOpen}
        >
          <Menu className="h-5 w-5" />
        </button>
        <h1 className="text-sm font-semibold text-foreground truncate">
          {user?.name ?? 'KiotViet Lite'}
        </h1>
      </div>
      <div className="flex items-center gap-2">
        {user?.role && hasPermission(user.role, 'products.manage') && <LowStockBell />}
        <Button
          variant="outline"
          size="sm"
          onClick={onLogout}
          disabled={logout.isPending}
          className="gap-2"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">
            {logout.isPending ? 'Đang đăng xuất…' : 'Đăng xuất'}
          </span>
        </Button>
      </div>
    </header>
  )
}
