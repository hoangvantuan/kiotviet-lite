import * as XLSX from 'xlsx'

import { toCsvLine } from '@kiotviet-lite/shared'

/**
 * CSV có BOM để Excel đọc đúng tiếng Việt. Mọi ô đi qua `escapeCsvField` dùng chung (BC-12):
 * giữ số 0 đầu SĐT, chặn chèn công thức.
 */
export function buildCsv(headers: string[], rows: (string | number | null)[][]): string {
  return buildCsvFromLines([headers, ...rows])
}

/** CSV nhiều khối (ví dụ báo cáo tổng hợp), mỗi phần tử là một dòng; dòng rỗng là dòng trống. */
export function buildCsvFromLines(lines: readonly (readonly unknown[])[]): string {
  const BOM = '﻿'
  return BOM + lines.map((line) => toCsvLine(line)).join('\n')
}

export function buildXlsx(
  sheetName: string,
  headers: string[],
  rows: (string | number | null)[][],
): ArrayBuffer {
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
}
