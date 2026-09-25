import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// deploy/backup/lib.sh chạy trong image backup; test gọi thật hàm shell retention_victims
// (quyết định bản sao lưu nào bị xóa) với danh sách tên giả, mới nhất trước như backup.sh.
const LIB = resolve(import.meta.dirname, '../../../../deploy/backup/lib.sh')
const PREFIX = 'kvl-backup-'

function victims(names: string[], keep = { days: 7, weeks: 4, months: 6 }): string[] {
  const out = execFileSync('bash', ['-c', '. "$0"; retention_victims', LIB], {
    input: names.join('\n') + '\n',
    env: {
      PATH: process.env.PATH!,
      PREFIX,
      KEEP_DAYS: String(keep.days),
      KEEP_WEEKS: String(keep.weeks),
      KEEP_MONTHS: String(keep.months),
    },
    encoding: 'utf8',
  })
  return out.split('\n').filter(Boolean)
}

const stamp = (d: Date) =>
  d
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '')
const backupName = (d: Date) => `${PREFIX}${stamp(d)}.tar.age`

// Danh sách hằng ngày lúc 02:30Z, mới nhất trước.
function daily(from: string, days: number): string[] {
  const start = Date.parse(`${from}T02:30:00Z`)
  return Array.from({ length: days }, (_, i) => backupName(new Date(start - i * 86_400_000)))
}

describe('deploy/backup/lib.sh retention_victims (GL-04)', () => {
  it('400 bản hằng ngày: giữ 7 ngày, 4 tuần ISO, 6 tháng gần nhất, còn lại xóa', () => {
    const names = daily('2026-09-25', 400)
    const deleted = new Set(victims(names))
    const kept = names.filter((n) => !deleted.has(n)).map((n) => n.slice(11, 19))
    expect(kept).toEqual([
      // 7 ngày gần nhất (25/9 là thứ Sáu, tuần 2026-W39).
      '20260925',
      '20260924',
      '20260923',
      '20260922',
      '20260921',
      '20260920',
      '20260919',
      // Bản mới nhất còn lại của các tuần W37, W36 (W39, W38 đã có trong 7 ngày).
      '20260913',
      '20260906',
      // Bản mới nhất của các tháng 8, 7, 6, 5, 4 (tháng 9 đã có).
      '20260831',
      '20260731',
      '20260630',
      '20260531',
      '20260430',
    ])
  })

  it('giữ bản mới nhất trong ngày, xóa các bản cũ hơn cùng ngày', () => {
    const names = [
      `${PREFIX}20260925T180000Z.tar.age`,
      `${PREFIX}20260925T020000Z.tar.age`,
      `${PREFIX}20260924T020000Z.tar`,
    ]
    expect(victims(names, { days: 7, weeks: 0, months: 0 })).toEqual([
      `${PREFIX}20260925T020000Z.tar.age`,
    ])
  })

  it('tuần ISO vắt qua năm: 29/12/2025 đến 4/1/2026 cùng tuần 2026-W01', () => {
    const names = daily('2026-01-04', 14)
    // Chỉ giữ theo tuần: bản mới nhất của W01 (4/1) và W52 năm 2025 (28/12).
    const deleted = new Set(victims(names, { days: 0, weeks: 2, months: 0 }))
    const kept = names.filter((n) => !deleted.has(n))
    expect(kept.map((n) => n.slice(11, 19))).toEqual(['20260104', '20251228'])
  })

  it('tên không đúng mẫu không bao giờ bị xóa', () => {
    const odd = [
      'README.txt',
      `${PREFIX}20260101T000000Z.tar.age.part`,
      `${PREFIX}latest.tar.age`,
      `other-20250101T000000Z.tar.age`,
    ]
    const names = [...daily('2026-09-25', 60), ...odd]
    const out = victims(names, { days: 1, weeks: 0, months: 0 })
    expect(out).toHaveLength(59)
    for (const name of odd) expect(out).not.toContain(name)
  })
})
