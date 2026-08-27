/**
 * Tính metadata phân trang từ tổng số bản ghi.
 */
export function paginationMeta({
  total,
  page,
  pageSize,
}: {
  total: number
  page: number
  pageSize: number
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  return { total, page, pageSize, totalPages }
}
