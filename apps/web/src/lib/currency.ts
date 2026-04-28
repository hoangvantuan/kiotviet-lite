const VND_FORMATTER = new Intl.NumberFormat('vi-VN')

export function formatVnd(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return ''
  return VND_FORMATTER.format(value)
}

export function formatVndWithSuffix(value: number | null | undefined): string {
  const s = formatVnd(value)
  return s ? `${s} đ` : ''
}

export function parseVnd(input: string): number | null {
  const cleaned = input.replace(/[^\d-]/g, '')
  if (cleaned.length === 0) return null
  const n = Number(cleaned)
  if (Number.isNaN(n) || !Number.isInteger(n) || n < 0) return null
  return n
}
