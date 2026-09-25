import type { ReactNode } from 'react'
import { AlertCircle, RotateCw } from 'lucide-react'

import { Button } from '@/components/ui/button'

interface QueryErrorStateProps {
  /** Ví dụ: "Không tải được danh sách sản phẩm." */
  title: string
  onRetry: () => void
  retrying?: boolean
  /** Thao tác phụ đặt cạnh nút "Thử lại", ví dụ liên kết về danh sách. */
  children?: ReactNode
}

/**
 * Trạng thái lỗi dùng chung khi query thất bại (UX-14): luôn có nút "Thử lại" gọi refetch.
 * Nơi dùng phải loại trừ nhánh rỗng khi đang lỗi để không hiện đồng thời "chưa có dữ liệu".
 */
export function QueryErrorState({ title, onRetry, retrying, children }: QueryErrorStateProps) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <AlertCircle className="h-12 w-12 text-destructive" />
      <p className="text-lg font-medium text-foreground">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">Kiểm tra kết nối mạng rồi thử lại.</p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        <Button onClick={onRetry} disabled={retrying}>
          <RotateCw className={retrying ? 'size-4 mr-1 animate-spin' : 'size-4 mr-1'} />
          {retrying ? 'Đang thử lại…' : 'Thử lại'}
        </Button>
        {children}
      </div>
    </div>
  )
}
