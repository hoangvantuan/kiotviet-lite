/**
 * Tiện ích chuyển đổi chuỗi văn bản tiếng Việt sang dạng slug (dùng cho SKU, tên file CSV, đường dẫn URL).
 */

export interface SlugifyOptions {
  maxLength?: number
}

/**
 * Chuẩn hóa chuỗi tiếng Việt thành slug:
 * - Bỏ dấu tiếng Việt (kể cả đ, Đ)
 * - Chuyển chữ thường (lowercase)
 * - Thay thế khoảng trắng và ký tự đặc biệt bằng dấu gạch ngang (-)
 * - Loại bỏ dấu gạch ngang thừa ở đầu/cuối
 * - Cắt theo maxLength (nếu được chỉ định)
 */
export function slugify(input: string, options?: SlugifyOptions): string {
  if (!input) return ''

  let result = input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  if (options?.maxLength && options.maxLength > 0) {
    result = result.slice(0, options.maxLength).replace(/-+$/, '')
  }

  return result
}

/**
 * Tên định danh tương thích cho việc sinh mã SKU từ tên biến thể/thuộc tính.
 */
export const slugifyForSku = slugify
