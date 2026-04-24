import type { ReactNode } from 'react'

interface AuthCardProps {
  title: string
  subtitle?: string
  children: ReactNode
}

export function AuthCard({ title, subtitle, children }: AuthCardProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-md space-y-6 rounded-lg border bg-background p-8 shadow-sm">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-bold">{title}</h1>
          {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
        </div>
        {children}
      </div>
    </div>
  )
}
