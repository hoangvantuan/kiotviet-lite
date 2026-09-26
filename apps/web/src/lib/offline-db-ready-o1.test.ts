import type { PGliteInterface } from '@electric-sql/pglite'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { closePGlite, OFFLINE_DB_NOT_READY_MESSAGE, whenOfflineDBReady } from './pglite'

/** PGlite giả: truy vấn chỉ trả lời khi bài kiểm cho phép, như worker chủ chưa mở xong */
function stalledPGlite() {
  let release: () => void = () => {}
  const answered = new Promise<void>((resolve) => {
    release = resolve
  })
  const query = vi.fn(() => answered.then(() => ({ rows: [{ '?column?': 1 }] })))
  return { pglite: { query } as unknown as PGliteInterface, query, release: () => release() }
}

describe('whenOfflineDBReady (OFF-04: worker chủ chưa mở được cơ sở dữ liệu)', () => {
  afterEach(async () => {
    await closePGlite()
  })

  it('quá hạn thì báo lỗi tiếng Việt, không treo; lần sau dùng lại lượt thăm dò cũ', async () => {
    const { pglite, query, release } = stalledPGlite()

    await expect(whenOfflineDBReady(pglite, 20)).rejects.toThrow(OFFLINE_DB_NOT_READY_MESSAGE)
    await expect(whenOfflineDBReady(pglite, 20)).rejects.toThrow(OFFLINE_DB_NOT_READY_MESSAGE)
    expect(query).toHaveBeenCalledTimes(1)

    // Worker mở lại được: lượt chờ sau thành công ngay, không thăm dò thêm
    release()
    await expect(whenOfflineDBReady(pglite, 20)).resolves.toBeUndefined()
    await expect(whenOfflineDBReady(pglite, 20)).resolves.toBeUndefined()
    expect(query).toHaveBeenCalledTimes(1)
  })

  it('truy vấn thăm dò lỗi thì lần sau thăm dò lại', async () => {
    const query = vi
      .fn()
      .mockRejectedValueOnce(new Error('chưa mở'))
      .mockResolvedValueOnce({ rows: [] })
    const pglite = { query } as unknown as PGliteInterface

    await expect(whenOfflineDBReady(pglite, 1000)).rejects.toThrow('chưa mở')
    await expect(whenOfflineDBReady(pglite, 1000)).resolves.toBeUndefined()
    expect(query).toHaveBeenCalledTimes(2)
  })
})
