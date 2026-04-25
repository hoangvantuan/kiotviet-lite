import type { SendResult } from './transports/base.js'

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function withRetry(
  fn: () => Promise<SendResult>,
  maxAttempts = 4,
): Promise<SendResult> {
  let lastResult: SendResult | undefined

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = await fn()

    if (result.ok) {
      return { ok: true, attempts: attempt }
    }

    lastResult = result

    if (!result.retriable || attempt === maxAttempts) {
      return { ok: false, error: result.error, attempts: attempt, retriable: result.retriable }
    }

    const backoffMs = Math.pow(4, attempt - 1) * 1000
    await delay(backoffMs)
  }

  return lastResult ?? { ok: false, error: 'No attempts made', attempts: 0, retriable: false }
}
