import type pino from 'pino'

export interface GracefulShutdownOptions {
  server: { close: (cb?: (err?: Error) => void) => void }
  logger: pino.Logger
  cleanup?: () => Promise<void>
  timeoutMs?: number
  exitFn?: (code: number) => void
}

export function setupGracefulShutdown({
  server,
  logger,
  cleanup,
  timeoutMs = 10_000,
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

    logger.info({ signal }, 'Shutdown signal received, closing server...')

    return new Promise<void>((resolve) => {
      let forceTimeout: NodeJS.Timeout | null = null

      forceTimeout = setTimeout(async () => {
        logger.error(`Graceful shutdown timed out after ${timeoutMs}ms, forcing exit`)
        await executeCleanup()
        logger.flush?.()
        exitFn(1)
        resolve()
      }, timeoutMs)
      forceTimeout.unref?.()

      server.close(async () => {
        await executeCleanup()

        logger.info('Server shutdown complete')
        logger.flush?.()

        if (forceTimeout) {
          clearTimeout(forceTimeout)
        }
        exitFn(0)
        resolve()
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
