import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'

export type NotificationDb = PgDatabase<PgQueryResultHKT, Record<string, unknown>>
