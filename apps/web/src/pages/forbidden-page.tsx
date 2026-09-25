import { Link } from '@tanstack/react-router'
import { ShieldAlert } from 'lucide-react'

import { Button } from '@/components/ui/button'

export function ForbiddenPage() {
  return (
    <div className="flex h-[calc(100vh-4rem)] w-full flex-col items-center justify-center gap-4 bg-background px-4 text-center">
      <ShieldAlert className="h-16 w-16 text-destructive" />
      <h1 className="text-2xl font-semibold">403 - Bạn không có quyền truy cập</h1>
      <p className="text-muted-foreground">Vui lòng liên hệ quản lý cửa hàng nếu cần được cấp quyền.</p>
      <Button asChild className="mt-4">
        <Link to="/">Về trang chủ</Link>
      </Button>
    </div>
  )
}
