// Trạng thái vòng đời tiến trình dùng chung cho readiness và các tác vụ nền.
// Khi nhận tín hiệu tắt, readiness trả 503 để proxy/uptime ngừng gửi việc mới,
// còn runner nhập hàng loạt ngừng nhận job và dừng job đang chạy tại ranh giới dòng.

let shuttingDown = false
const listeners = new Set<() => void>()

export function isShuttingDown(): boolean {
  return shuttingDown
}

export function markShuttingDown(): void {
  if (shuttingDown) return
  shuttingDown = true
  for (const listener of listeners) listener()
}

export function onShutdown(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Chỉ dùng trong test: đưa trạng thái về ban đầu giữa các ca. */
export function resetLifecycleForTest(): void {
  shuttingDown = false
  listeners.clear()
}
