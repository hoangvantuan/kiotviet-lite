import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { LogOut, Menu } from 'lucide-react'

import { hasPermission } from '@kiotviet-lite/shared'

import { OfflineIndicator } from '@/components/shared/OfflineIndicator'
import { Button } from '@/components/ui/button'
import { LogoutGuardDialog } from '@/features/auth/logout-guard-dialog'
import { useLogout } from '@/features/auth/use-logout'
import { LowStockBell } from '@/features/products/low-stock-bell'
import { useSidebarStore } from '@/hooks/use-sidebar'
import { useAuthStore } from '@/stores/use-auth-store'
import { useOfflineStore } from '@/stores/use-offline-store'

export function Header() {
  const user = useAuthStore((s) => s.user)
  const openMobile = useSidebarStore((s) => s.openMobile)
  const isMobileOpen = useSidebarStore((s) => s.isMobileOpen)
  const logout = useLogout()
  const navigate = useNavigate()
  const [guardOpen, setGuardOpen] = useState(false)

  const doLogout = async () => {
    setGuardOpen(false)
    try {
      await logout.mutateAsync()
    } catch {
      // Mất mạng: máy chủ không nhận lệnh đăng xuất, nhưng phiên trên máy đã dọn ở onSettled
    }
    navigate({ to: '/login', replace: true })
  }

  const onLogout = () => {
    // OFF-05: còn đơn chưa lên máy chủ thì hỏi trước
    const { pendingOrderCount, errorOrderCount } = useOfflineStore.getState()
    if (pendingOrderCount + errorOrderCount > 0) {
      setGuardOpen(true)
      return
    }
    void doLogout()
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
        {/* Không dùng h1: mỗi trang chỉ có một h1 là tiêu đề trang (UX-25) */}
        <p className="text-sm font-semibold text-foreground truncate">
          {user?.name ?? 'KiotViet Lite'}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <OfflineIndicator />
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
      <LogoutGuardDialog
        open={guardOpen}
        onOpenChange={setGuardOpen}
        onConfirmLogout={() => void doLogout()}
      />
    </header>
  )
}
