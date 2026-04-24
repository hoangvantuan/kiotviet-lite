import { AuthCard } from '@/features/auth/auth-card'
import { LoginForm } from '@/features/auth/login-form'

export function LoginPage() {
  return (
    <AuthCard title="Đăng nhập" subtitle="Vào quản lý cửa hàng của bạn">
      <LoginForm />
    </AuthCard>
  )
}
