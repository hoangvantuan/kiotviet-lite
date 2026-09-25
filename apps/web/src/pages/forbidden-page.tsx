import { Link } from '@tanstack/react-router'
import { ShieldAlert } from 'lucide-react'

import { Button } from '@/components/ui/button'

export function ForbiddenPage() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <ShieldAlert className="h-16 w-16 text-destructive" />
      <h1 className="text-2xl font-semibold text-foreground">
        Bạn không có quyền truy cập trang này
      </h1>
      <p className="text-muted-foreground">
        Liên hệ chủ cửa hàng hoặc quản lý nếu bạn cần được cấp quyền.
      </p>
      <Button asChild className="mt-4">
        <Link to="/">Về trang chủ</Link>
      </Button>
    </div>
  )
}
