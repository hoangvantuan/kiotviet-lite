import type pino from 'pino'

import { markShuttingDown } from './lifecycle.js'

export interface GracefulShutdownOptions {
  server: { close: (cb?: (err?: Error) => void) => void }
  logger: pino.Logger
  /** Chạy ngay khi nhận tín hiệu, song song với việc đóng server (vd chờ job nhập). */
  drain?: () => Promise<void>
  /** Chạy sau khi server đóng và drain xong (vd đóng pool DB). */
  cleanup?: () => Promise<void>
  timeoutMs?: number
  /** Khi ép thoát: cho cleanup tối đa chừng này rồi thoát, không chờ cleanup bị treo. */
  forceCleanupMs?: number
  exitFn?: (code: number) => void
}

function settleWithin(work: Promise<unknown>, ms: number): Promise<void> {
  let timer: NodeJS.Timeout | undefined
  return Promise.race([
    work.then(
      () => undefined,
      () => undefined,
    ),
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, ms)
      timer.unref?.()
    }),
  ]).finally(() => clearTimeout(timer))
}

export function setupGracefulShutdown({
  server,
  logger,
  drain,
  cleanup,
  timeoutMs = 10_000,
  forceCleanupMs = 1_000,
  exitFn = (code) => process.exit(code),
}: GracefulShutdownOptions): { shutdown: (signal: string) => Promise<void> } {
  let isShuttingDown = false
  let cleanupPromise: Promise<void> | null = null

  const executeCleanup = async () => {
    if (!cleanup) return
    if (!cleanupPromise) {
      cleanupPromise = (async () => {
        try {
          await cleanup()
          logger.info('Cleanup completed')
        } catch (err) {
          logger.error({ err }, 'Cleanup failed during shutdown')
        }
      })()
    }
    return cleanupPromise
  }

  const shutdown = (signal: string): Promise<void> => {
    if (isShuttingDown) return Promise.resolve()
    isShuttingDown = true
    // Readiness trả 503 và runner ngừng nhận job ngay từ lúc này.
    markShuttingDown()

    logger.info({ signal }, 'Shutdown signal received, closing server...')

    return new Promise<void>((resolve) => {
      let exited = false
      const exit = (code: number) => {
        if (exited) return
        exited = true
        clearTimeout(forceTimeout)
        logger.flush?.()
        exitFn(code)
        resolve()
      }

      // GL-11: đường ép thoát không được phụ thuộc vào chính bước có thể treo
      // (pool DB chờ truy vấn dài, job nhập còn chạy). Cho cleanup một khoảng ngắn rồi thoát.
      const forceTimeout = setTimeout(() => {
        logger.error(`Graceful shutdown timed out after ${timeoutMs}ms, forcing exit`)
        void settleWithin(executeCleanup(), forceCleanupMs).then(() => exit(1))
      }, timeoutMs)
      forceTimeout.unref?.()

      const drained = (drain ? drain() : Promise.resolve()).catch((err: unknown) => {
        logger.error({ err }, 'Drain failed during shutdown')
      })
      const closed = new Promise<void>((resolveClose) => server.close(() => resolveClose()))

      void Promise.all([drained, closed]).then(async () => {
        await executeCleanup()
        logger.info('Server shutdown complete')
        exit(0)
      })
    })
  }

  process.on('SIGTERM', () => {
    void shutdown('SIGTERM')
  })
  process.on('SIGINT', () => {
    void shutdown('SIGINT')
  })

  return { shutdown }
}
