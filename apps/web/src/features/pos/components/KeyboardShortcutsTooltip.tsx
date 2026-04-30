import { HelpCircle } from 'lucide-react'

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

const SHORTCUTS = [
  { key: 'F2', description: 'Thanh toan' },
  { key: 'F4', description: 'Ghi no (chua kich hoat)' },
  { key: 'F5', description: 'Don hang moi' },
  { key: 'Esc', description: 'Dong dialog' },
  { key: 'Ctrl+F', description: 'Tim kiem san pham' },
]

export function KeyboardShortcutsTooltip() {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="fixed bottom-4 right-4 z-50 flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Phim tat"
          >
            <HelpCircle className="h-4 w-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          align="end"
          className="w-52 bg-popover p-3 text-popover-foreground"
        >
          <p className="mb-2 text-xs font-semibold">Phim tat</p>
          <div className="space-y-1">
            {SHORTCUTS.map((s) => (
              <div key={s.key} className="flex items-center justify-between text-xs">
                <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                  {s.key}
                </kbd>
                <span className="text-muted-foreground">{s.description}</span>
              </div>
            ))}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
