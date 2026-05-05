import * as XLSX from 'xlsx'

function escapeCsvValue(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

export function buildCsv(headers: string[], rows: (string | number | null)[][]): string {
  const BOM = '﻿'
  const headerLine = headers.map(escapeCsvValue).join(',')
  const dataLines = rows.map((row) => row.map(escapeCsvValue).join(','))
  return BOM + [headerLine, ...dataLines].join('\n')
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
