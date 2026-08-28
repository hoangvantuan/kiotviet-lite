import type pino from 'pino'
import { describe, expect, it, vi } from 'vitest'

import { setupGracefulShutdown } from './graceful-shutdown.js'

describe('setupGracefulShutdown', () => {
  const mockLogger = {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    flush: vi.fn(),
  } as unknown as pino.Logger

  it('chạy cleanup và thoát với code 0 khi server đóng thành công', async () => {
    let serverCloseCallback: (() => void) | undefined
    const mockServer = {
      close: vi.fn((cb?: (err?: Error) => void) => {
        serverCloseCallback = cb
      }),
    }
    const mockCleanup = vi.fn().mockResolvedValue(undefined)
    const mockExit = vi.fn()

    const { shutdown } = setupGracefulShutdown({
      server: mockServer,
      logger: mockLogger,
      cleanup: mockCleanup,
      timeoutMs: 5000,
      exitFn: mockExit,
    })

    const shutdownPromise = shutdown('SIGTERM')
    expect(mockServer.close).toHaveBeenCalledTimes(1)

    // Giả lập server đóng xong
    serverCloseCallback?.()
    await shutdownPromise

    expect(mockCleanup).toHaveBeenCalledTimes(1)
    expect(mockExit).toHaveBeenCalledWith(0)
  })

  it('chạy cleanup và thoát với code 1 khi server đóng bị treo quá timeout (L29 fix)', async () => {
    vi.useFakeTimers()
    try {
      const mockServer = {
        close: vi.fn(), // Không bao giờ gọi callback (giả lập treo kết nối)
      }
      const mockCleanup = vi.fn().mockResolvedValue(undefined)
      const mockExit = vi.fn()

      const { shutdown } = setupGracefulShutdown({
        server: mockServer,
        logger: mockLogger,
        cleanup: mockCleanup,
        timeoutMs: 1000,
        exitFn: mockExit,
      })

      void shutdown('SIGTERM')
      expect(mockServer.close).toHaveBeenCalledTimes(1)
      expect(mockCleanup).not.toHaveBeenCalled()

      // Kích hoạt timer timeout 1000ms
      await vi.advanceTimersByTimeAsync(1000)

      // Cleanup BẮT BUỘC phải được gọi trước khi force exit
      expect(mockCleanup).toHaveBeenCalledTimes(1)
      expect(mockExit).toHaveBeenCalledWith(1)
    } finally {
      vi.useRealTimers()
    }
  })
})
