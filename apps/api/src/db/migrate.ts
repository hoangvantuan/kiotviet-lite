import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'

import 'dotenv/config'

// Chạy migration bằng drizzle-orm (dependency production) để image không cần drizzle-kit.
// Cùng bảng drizzle.__drizzle_migrations với `drizzle-kit migrate`, nên dùng lẫn được.
// Thư mục migration: MIGRATIONS_DIR, mặc định ./migrations cạnh tệp này
// (src/db/migrations khi chạy bằng tsx, dist/migrations trong bản build).
const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL environment variable is required')
const migrationsFolder =
  process.env.MIGRATIONS_DIR ?? fileURLToPath(new URL('./migrations', import.meta.url))

const client = postgres(url, { max: 1, onnotice: () => {} })
try {
  await migrate(drizzle(client), { migrationsFolder })
  console.log('migrations applied')
} finally {
  await client.end({ timeout: 5 })
}
