import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// GL-12: image production và service sao lưu không được chạy bằng root. Test đọc tệp cấu hình
// vì CI không build image; đổi Dockerfile/compose mà quên USER thì test đỏ.
const ROOT = resolve(import.meta.dirname, '../../../..')
const read = (path: string) => readFileSync(resolve(ROOT, path), 'utf8')
const isRoot = (user: string) => /^(root|0)(:.*)?$/.test(user.trim().replace(/^['"]|['"]$/g, ''))

describe('image production không chạy bằng root (GL-12)', () => {
  it('stage cuối của apps/api/Dockerfile đặt USER không phải root', () => {
    const stages = read('apps/api/Dockerfile').split(/^(?=FROM\s)/im)
    const users = stages
      .at(-1)!
      .split('\n')
      .map((line) => /^USER\s+(\S+)/i.exec(line)?.[1])
      .filter((user): user is string => !!user)
    expect(users.length).toBeGreaterThan(0)
    expect(isRoot(users.at(-1)!)).toBe(false)
  })

  it('docker-compose.prod.yml không ép service nào chạy bằng root, trừ init-permissions', () => {
    const compose = read('docker-compose.prod.yml')
    const services = compose.split(/\n(?= {2}[a-z][\w-]*:\n)/)
    const users = services.flatMap((block) => {
      const name = /^ {2}([a-z][\w-]*):/m.exec(block)?.[1]
      const user = /^ {4}user:\s*(.+)$/m.exec(block)?.[1]
      return name && user ? [{ name, user }] : []
    })
    expect(users.find((u) => u.name === 'backup')?.user).toBeDefined()
    for (const { name, user } of users) {
      if (name !== 'init-permissions') expect(isRoot(user), `${name}: user ${user}`).toBe(false)
    }
  })
})
