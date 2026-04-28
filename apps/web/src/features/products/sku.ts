export function generateRandomSku(): string {
  const n = Math.floor(Math.random() * 1_000_000)
  return `SP-${String(n).padStart(6, '0')}`
}
