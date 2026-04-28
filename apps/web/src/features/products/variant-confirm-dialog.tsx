import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

interface VariantConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  additions: number
  softDeletions: number
  hardDeletions: number
  onConfirm: () => void
}

export function VariantConfirmDialog({
  open,
  onOpenChange,
  additions,
  softDeletions,
  hardDeletions,
  onConfirm,
}: VariantConfirmDialogProps) {
  const messages: string[] = []
  if (additions > 0) messages.push(`Sẽ tạo ${additions} biến thể mới.`)
  if (hardDeletions > 0)
    messages.push(`Sẽ xoá hoàn toàn ${hardDeletions} biến thể chưa có giao dịch.`)
  if (softDeletions > 0)
    messages.push(`Sẽ chuyển ${softDeletions} biến thể đã có giao dịch sang Ngừng bán.`)

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Xác nhận thay đổi biến thể</AlertDialogTitle>
          <AlertDialogDescription>
            {messages.length > 0 ? messages.join(' ') : 'Lưu các thay đổi của biến thể?'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Hủy</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              onConfirm()
              onOpenChange(false)
            }}
          >
            Xác nhận
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
