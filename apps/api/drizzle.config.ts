import { defineConfig } from 'drizzle-kit'

import 'dotenv/config'

const url = process.env.DATABASE_URL
if (!url) {
  throw new Error('DATABASE_URL environment variable is required')
}

export default defineConfig({
  out: './src/db/migrations',
  schema: '../../packages/shared/src/schema/index.ts',
  dialect: 'postgresql',
  dbCredentials: { url },
  casing: 'snake_case',
})
