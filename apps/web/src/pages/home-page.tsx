import { useNavigate } from '@tanstack/react-router'

import { Button } from '@/components/ui/button'
import { useLogout } from '@/features/auth/use-logout'
import { useAuthStore } from '@/stores/use-auth-store'

export function HomePage() {
  const user = useAuthStore((s) => s.user)
  const logout = useLogout()
  const navigate = useNavigate()

  const onLogout = async () => {
    await logout.mutateAsync()
    navigate({ to: '/login', replace: true })
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background text-foreground">
      <h1 className="text-3xl font-bold text-primary">Xin chào {user?.name ?? ''}</h1>
      <p className="text-muted-foreground">Cửa hàng của bạn đã sẵn sàng.</p>
      <Button variant="outline" onClick={onLogout} disabled={logout.isPending}>
        {logout.isPending ? 'Đang đăng xuất…' : 'Đăng xuất'}
      </Button>
    </div>
  )
}
