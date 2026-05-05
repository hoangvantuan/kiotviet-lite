import type pino from 'pino'

export interface GracefulShutdownOptions {
  server: { close: (cb?: (err?: Error) => void) => void }
  logger: pino.Logger
  cleanup?: () => Promise<void>
}

export function setupGracefulShutdown({ server, logger, cleanup }: GracefulShutdownOptions): void {
  let isShuttingDown = false

  const shutdown = async (signal: string) => {
    if (isShuttingDown) return
    isShuttingDown = true

    logger.info({ signal }, 'Shutdown signal received, closing server...')

    const forceTimeout = setTimeout(() => {
      logger.error('Graceful shutdown timed out after 10s, forcing exit')
      process.exit(1)
    }, 10_000)
    forceTimeout.unref()

    server.close(async () => {
      if (cleanup) {
        try {
          await cleanup()
          logger.info('Cleanup completed')
        } catch (err) {
          logger.error({ err }, 'Cleanup failed during shutdown')
        }
      }

      logger.info('Server shutdown complete')
      logger.flush()

      clearTimeout(forceTimeout)
      process.exit(0)
    })
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}
