import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import * as schema from '@kiotviet-lite/shared/schema'

import 'dotenv/config'

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is required')
}

const client = postgres(connectionString)

export const db = drizzle(client, {
  schema,
  casing: 'snake_case',
})

// Không chờ vô hạn truy vấn đang chạy khi tắt: quá 5 s thì đóng kết nối cưỡng bức.
export const closeDbPool = () => client.end({ timeout: 5 })

export type Db = typeof db
