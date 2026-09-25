import { useAuthStore } from '@/stores/use-auth-store'

/**
 * POS-02, TIEN-04, KHO-08 (R4): Idempotency-Key cho các thao tác tạo chứng từ.
 *
 * Mỗi ý định lưu (một form, một tab bán hàng) có một khóa theo `scope`. Khóa gắn với nội dung
 * gửi đi: bấm lưu lại với cùng nội dung (kể cả sau khi đóng rồi mở lại form, tải lại trang) dùng
 * lại khóa cũ, nên nếu lần trước máy chủ đã lưu mà phản hồi bị mất thì máy chủ trả lại chứng từ
 * cũ thay vì tạo bản thứ hai. Sửa nội dung thì sinh khóa mới. Lưu thành công thì bỏ khóa, lần tạo
 * kế tiếp (dù nội dung giống hệt) là một chứng từ mới.
 *
 * Khóa nằm trong sessionStorage (riêng từng thẻ trình duyệt, còn sau khi tải lại trang). Không
 * đọc hay ghi được thì vẫn giữ trong bộ nhớ, chỉ mất khi tải lại trang. Mỗi mục chỉ có UUID và
 * giá trị băm của nội dung, tách theo người dùng, nên không xóa khi đăng xuất: hết phiên giữa lúc
 * lưu rồi đăng nhập lại bấm lưu tiếp vẫn dùng đúng khóa cũ.
 */

const STORAGE_KEY = 'kiotviet-idempotency-keys'
/** Khóa chưa dùng xong sau chừng này thì bỏ: người dùng đã chuyển sang việc khác. */
const TTL_MS = 30 * 60 * 1000

interface Entry {
  key: string
  fingerprint: string
  createdAt: number
}

let memory: Record<string, Entry> | null = null

function load(): Record<string, Entry> {
  if (memory) return memory
  memory = {}
  try {
    const saved: unknown = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? '{}')
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
      for (const [scope, value] of Object.entries(saved as Record<string, unknown>)) {
        const entry = value as Partial<Entry> | null
        if (
          entry &&
          typeof entry.key === 'string' &&
          typeof entry.fingerprint === 'string' &&
          typeof entry.createdAt === 'number'
        ) {
          memory[scope] = entry as Entry
        }
      }
    }
  } catch {
    // Không đọc được sessionStorage: dùng bộ nhớ
  }
  return memory
}

function persist(entries: Record<string, Entry>): void {
  const now = Date.now()
  for (const [scope, entry] of Object.entries(entries)) {
    if (now - entry.createdAt > TTL_MS) delete entries[scope]
  }
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  } catch {
    // Không ghi được sessionStorage: khóa vẫn còn trong bộ nhớ
  }
}

/** Khóa theo người dùng và cửa hàng: đổi tài khoản trên cùng máy không dùng lẫn khóa. */
function fullScope(scope: string): string {
  const user = useAuthStore.getState().user
  return `${user?.storeId ?? '-'}:${user?.id ?? '-'}:${scope}`
}

/** JSON với khóa object sắp theo thứ tự, bỏ giá trị undefined: cùng nội dung ra cùng một chuỗi. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

/**
 * Dấu vân tay của nội dung: chỉ lưu giá trị băm, không lưu nguyên nội dung (có thể chứa PIN duyệt)
 * vào sessionStorage. Hai lượt cyrb53 với hạt khác nhau (khoảng 106 bit) là đủ để phân biệt các
 * lần sửa nội dung của cùng một form, đây không phải băm mật mã.
 */
function fingerprintOf(payload: unknown): string {
  const text = stableStringify(payload)
  return `${cyrb53(text, 0x9e3779b1)}${cyrb53(text, 0x85ebca77)}`
}

function cyrb53(text: string, seed: number): string {
  let h1 = 0xdeadbeef ^ seed
  let h2 = 0x41c6ce57 ^ seed
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

/** Khóa cho lần lưu này: dùng lại khóa cũ nếu nội dung không đổi, ngược lại sinh khóa mới. */
export function idempotencyKeyFor(scope: string, payload: unknown): string {
  const entries = load()
  const id = fullScope(scope)
  const fingerprint = fingerprintOf(payload)
  const current = entries[id]
  if (current && current.fingerprint === fingerprint && Date.now() - current.createdAt <= TTL_MS) {
    return current.key
  }
  const key = crypto.randomUUID()
  entries[id] = { key, fingerprint, createdAt: Date.now() }
  persist(entries)
  return key
}

/** Lưu xong (hoặc máy chủ báo khóa không dùng được nữa): lần sau là một chứng từ mới. */
export function releaseIdempotencyKey(scope: string, key?: string): void {
  const entries = load()
  const id = fullScope(scope)
  if (!entries[id] || (key !== undefined && entries[id].key !== key)) return
  delete entries[id]
  persist(entries)
}

/** Chỉ dùng trong test. */
export function resetIdempotencyKeysForTest(): void {
  memory = null
}
