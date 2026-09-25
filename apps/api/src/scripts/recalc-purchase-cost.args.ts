/** Đọc tham số dòng lệnh của script cost:recalc, sai thì báo lỗi rõ thay vì chạy khác ý */
const USAGE =
  'Cách dùng: cost:recalc [--store <storeId>] [--json] [--apply] [--apply-variant-parent]'
const FLAGS = new Set(['--apply', '--apply-variant-parent', '--json', '--store'])

export function parseRecalcArgs(argv: string[]) {
  const args = argv.filter((a) => a !== '--')
  for (const a of args) {
    if (a.startsWith('--') && !FLAGS.has(a)) throw new Error(`Tham số không hợp lệ: ${a}. ${USAGE}`)
  }
  const apply = args.includes('--apply')
  const applyVariantParent = args.includes('--apply-variant-parent')
  const json = args.includes('--json')
  const storeIdx = args.indexOf('--store')
  let storeId: string | undefined
  if (storeIdx >= 0) {
    storeId = args[storeIdx + 1]
    // Thiếu giá trị thì không được lặng lẽ chạy cả DB hay nuốt cờ đứng sau
    if (!storeId || storeId.startsWith('--')) throw new Error(`--store thiếu storeId. ${USAGE}`)
  }
  return { apply, applyVariantParent, json, storeId }
}
