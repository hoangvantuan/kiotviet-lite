import { Link } from '@tanstack/react-router'
import { FileQuestion } from 'lucide-react'

import { Button } from '@/components/ui/button'

export function NotFoundPage() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <FileQuestion className="h-16 w-16 text-muted-foreground" />
      <h1 className="text-2xl font-semibold text-foreground">Không tìm thấy trang</h1>
      <p className="text-muted-foreground">Trang bạn tìm không tồn tại hoặc đã bị chuyển đi.</p>
      <Button asChild className="mt-4">
        <Link to="/">Về trang chủ</Link>
      </Button>
    </div>
  )
}
