import { ChevronDown, Printer } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

import { getDefaultFormat, type PrintFormat } from './use-print-order'

interface PrintButtonProps {
  onPrint: (format: PrintFormat) => void
  disabled?: boolean
  /** Label override for the main button */
  label?: string
  /** Button size variant */
  size?: 'sm' | 'default'
}

const FORMAT_OPTIONS: { format: PrintFormat; label: string }[] = [
  { format: 'thermal-58', label: 'In máy nhiệt 58mm' },
  { format: 'thermal-80', label: 'In máy nhiệt 80mm' },
  { format: 'a4', label: 'In A4' },
  { format: 'a5', label: 'In A5' },
]

export function PrintButton({
  onPrint,
  disabled = false,
  label = 'In hóa đơn',
  size = 'default',
}: PrintButtonProps) {
  return (
    <div className="flex">
      <Button
        type="button"
        variant="outline"
        size={size}
        disabled={disabled}
        className="rounded-r-none border-r-0"
        onClick={() => onPrint(getDefaultFormat())}
      >
        <Printer className="size-4 mr-1" />
        {label}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size={size}
            disabled={disabled}
            className="rounded-l-none px-2"
          >
            <ChevronDown className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {FORMAT_OPTIONS.map((opt) => (
            <DropdownMenuItem key={opt.format} onClick={() => onPrint(opt.format)}>
              {opt.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
