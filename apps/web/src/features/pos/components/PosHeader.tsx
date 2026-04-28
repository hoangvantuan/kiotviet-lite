import { Link } from '@tanstack/react-router'
import { ArrowLeft, Zap } from 'lucide-react'

import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useCartStore } from '@/stores/use-cart-store'

export function PosHeader() {
  const mode = useCartStore((s) => s.mode)
  const setMode = useCartStore((s) => s.setMode)

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background px-4">
      <Link
        to="/"
        className="flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        aria-label="Quay về trang chủ"
      >
        <ArrowLeft className="h-5 w-5" />
      </Link>

      <h1 className="text-base font-semibold text-foreground">Bán hàng</h1>

      <div className="ml-auto flex items-center gap-2">
        <div className="flex items-center gap-2">
          <Zap
            className={`h-4 w-4 ${mode === 'quick' ? 'text-primary' : 'text-muted-foreground'}`}
          />
          <Switch
            id="pos-mode"
            checked={mode === 'quick'}
            onCheckedChange={(checked) => setMode(checked ? 'quick' : 'normal')}
            aria-label="Chế độ bán nhanh"
          />
          <Label
            htmlFor="pos-mode"
            className="cursor-pointer select-none text-sm text-muted-foreground"
          >
            Bán nhanh
          </Label>
        </div>

        <div className="ml-4 flex items-center gap-2 text-sm text-muted-foreground">
          <span>Khách vãng lai</span>
          <button
            disabled
            className="cursor-not-allowed rounded-md border border-input px-2.5 py-1 text-xs text-muted-foreground opacity-50"
            title="Chức năng chọn KH sẽ kích hoạt trong Epic 4 (Story 4.5)"
          >
            Chọn KH
          </button>
        </div>
      </div>
    </header>
  )
}
