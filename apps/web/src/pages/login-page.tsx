import { AlertCircle } from 'lucide-react'

import { AuthCard } from '@/features/auth/auth-card'
import { LoginForm } from '@/features/auth/login-form'
import { useAuthStore } from '@/stores/use-auth-store'

export function LoginPage() {
  const networkError = useAuthStore((s) => s.networkError)
  
  return (
    <div className="flex flex-col gap-4">
      {networkError && (
        <div className="mx-auto w-full max-w-sm rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>Không thể kết nối đến máy chủ. Vui lòng kiểm tra mạng.</span>
        </div>
      )}
      <AuthCard title="Đăng nhập" subtitle="Vào quản lý cửa hàng của bạn">
        <LoginForm />
      </AuthCard>
    </div>
  )
}
