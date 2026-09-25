export type SortDirection = 'asc' | 'desc'

export interface SortState<K extends string> {
  key: K
  direction: SortDirection
}

/** BC-17: sắp xếp bảng báo cáo theo cột; chuỗi so theo tiếng Việt, số so theo giá trị */
export function sortRows<T, K extends string & keyof T>(
  rows: readonly T[],
  sort: SortState<K>,
): T[] {
  const factor = sort.direction === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const va = a[sort.key]
    const vb = b[sort.key]
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * factor
    return String(va ?? '').localeCompare(String(vb ?? ''), 'vi') * factor
  })
}

/** Bấm lại cột đang sắp thì đảo chiều; cột mới bắt đầu giảm dần (số lớn trước) */
export function nextSort<K extends string>(current: SortState<K>, key: K): SortState<K> {
  if (current.key === key) {
    return { key, direction: current.direction === 'desc' ? 'asc' : 'desc' }
  }
  return { key, direction: 'desc' }
}
