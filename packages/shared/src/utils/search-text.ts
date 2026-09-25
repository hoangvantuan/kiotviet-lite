/**
 * Bỏ dấu tiếng Việt cho tìm kiếm, cùng một bảng ký tự cho JS và SQL (`translate`), để API,
 * cột sinh `products.search_text` và PGlite ngoại tuyến cho cùng kết quả.
 */

const LETTERS: Record<string, string> = {
  a: 'àáảãạăằắẳẵặâầấẩẫậ',
  e: 'èéẻẽẹêềếểễệ',
  i: 'ìíỉĩị',
  o: 'òóỏõọôồốổỗộơờớởỡợ',
  u: 'ùúủũụưừứửữự',
  y: 'ỳýỷỹỵ',
  d: 'đ',
}
// Dấu tổ hợp (chuỗi dạng NFD): bị xoá vì nằm cuối FROM, không có ký tự tương ứng trong TO.
const COMBINING_MARKS = '̛̣̀́̃̉̂̆'

let from = ''
let to = ''
for (const [base, letters] of Object.entries(LETTERS)) {
  for (const letter of letters) {
    from += letter + letter.toUpperCase()
    to += base + base
  }
}

export const SEARCH_FOLD_FROM = from + COMBINING_MARKS
export const SEARCH_FOLD_TO = to

const fold = new Map<string, string>()
for (let index = 0; index < SEARCH_FOLD_FROM.length; index++) {
  fold.set(SEARCH_FOLD_FROM[index]!, SEARCH_FOLD_TO[index] ?? '')
}

/** Chuỗi so khớp: bỏ dấu tiếng Việt, đ thành d, chữ thường. */
export function normalizeSearchText(input: string): string {
  let result = ''
  for (const char of input) result += fold.get(char) ?? char
  return result.toLowerCase()
}

/** Mẫu LIKE "chứa" cho chuỗi tìm kiếm đã chuẩn hóa, thoát sẵn %, _ và dấu gạch ngược. */
export function searchLikePattern(term: string): string {
  return `%${normalizeSearchText(term.trim()).replace(/[\\%_]/g, (char) => `\\${char}`)}%`
}

/** Nguồn của cột products.search_text; PGlite ngoại tuyến dùng lại khi bảng không có cột sinh. */
export const PRODUCT_SEARCH_SOURCE = `"name" || ' ' || "sku"`

/** Biểu thức SQL cùng quy tắc với normalizeSearchText; `expression` là SQL tin cậy (tên cột). */
export function searchTextSql(expression: string): string {
  return `lower(translate(${expression}, '${SEARCH_FOLD_FROM}', '${SEARCH_FOLD_TO}'))`
}
