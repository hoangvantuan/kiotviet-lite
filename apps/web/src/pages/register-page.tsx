import { AuthCard } from '@/features/auth/auth-card'
import { RegisterForm } from '@/features/auth/register-form'

export function RegisterPage() {
  return (
    <AuthCard title="Đăng ký cửa hàng" subtitle="Tạo cửa hàng mới trên KiotViet Lite">
      <RegisterForm />
    </AuthCard>
  )
}
