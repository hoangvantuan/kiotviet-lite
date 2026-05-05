import { useState } from 'react'
import { Download } from 'lucide-react'

import type { ExportFormat } from '@kiotviet-lite/shared'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface ReportExportButtonProps {
  onExport: (format: ExportFormat) => void
  loading?: boolean
}

export function ReportExportButton({ onExport, loading }: ReportExportButtonProps) {
  const [open, setOpen] = useState(false)

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={loading}>
          <Download className="mr-2 h-4 w-4" />
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={() => {
            onExport('csv')
            setOpen(false)
          }}
        >
          CSV (.csv)
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            onExport('xlsx')
            setOpen(false)
          }}
        >
          Excel (.xlsx)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
