export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return ''
  return phone.replace(/(\d{3})(\d{3,4})(\d{4})/, '$1 $2 $3')
}
