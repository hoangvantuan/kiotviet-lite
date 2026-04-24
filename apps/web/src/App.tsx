import { APP_NAME } from '@kiotviet-lite/shared'

export function App() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
      <h1 className="text-3xl font-bold text-primary">{APP_NAME}</h1>
    </div>
  )
}
