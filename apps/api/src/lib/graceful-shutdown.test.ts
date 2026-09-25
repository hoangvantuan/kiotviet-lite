import type pino from 'pino'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { setupGracefulShutdown } from './graceful-shutdown.js'
import { isShuttingDown, resetLifecycleForTest } from './lifecycle.js'

describe('setupGracefulShutdown', () => {
  const mockLogger = {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    flush: vi.fn(),
  } as unknown as pino.Logger

  afterEach(() => resetLifecycleForTest())

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

  // GL-11: trước đây forceTimeout `await cleanup()` rồi mới exit, cleanup treo (pool DB chờ
  // truy vấn của job nhập) thì tiến trình không bao giờ thoát.
  it('ép thoát mã 1 dù cleanup treo vĩnh viễn', async () => {
    vi.useFakeTimers()
    try {
      const mockServer = { close: vi.fn() }
      const hangingCleanup = vi.fn(() => new Promise<void>(() => {}))
      const mockExit = vi.fn()

      const { shutdown } = setupGracefulShutdown({
        server: mockServer,
        logger: mockLogger,
        cleanup: hangingCleanup,
        timeoutMs: 1000,
        forceCleanupMs: 200,
        exitFn: mockExit,
      })

      void shutdown('SIGTERM')
      await vi.advanceTimersByTimeAsync(1000)
      expect(hangingCleanup).toHaveBeenCalledTimes(1)
      expect(mockExit).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(200)
      expect(mockExit).toHaveBeenCalledWith(1)
      expect(mockExit).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('đánh dấu đang tắt, chạy drain ngay và chỉ cleanup sau khi drain xong', async () => {
    let serverCloseCallback: (() => void) | undefined
    const mockServer = {
      close: vi.fn((cb?: (err?: Error) => void) => {
        serverCloseCallback = cb
      }),
    }
    let finishDrain: (() => void) | undefined
    const drain = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishDrain = resolve
        }),
    )
    const cleanup = vi.fn().mockResolvedValue(undefined)
    const mockExit = vi.fn()

    const { shutdown } = setupGracefulShutdown({
      server: mockServer,
      logger: mockLogger,
      drain,
      cleanup,
      timeoutMs: 5000,
      exitFn: mockExit,
    })

    const done = shutdown('SIGTERM')
    expect(isShuttingDown()).toBe(true)
    expect(drain).toHaveBeenCalledTimes(1)
    serverCloseCallback?.()
    await Promise.resolve()
    expect(cleanup).not.toHaveBeenCalled()

    finishDrain?.()
    await done
    expect(cleanup).toHaveBeenCalledTimes(1)
    expect(mockExit).toHaveBeenCalledWith(0)
  })
})
