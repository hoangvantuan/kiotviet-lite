import type { Db } from '../db/index.js'

/** A transaction from the production Drizzle connection; nested transaction() uses a savepoint. */
export type ServiceTransaction = Parameters<Parameters<Db['transaction']>[0]>[0]

/** Use the same connection for prechecks, writes, reads and audit, not just the write itself. */
export function serviceDb(db: Db, transaction?: ServiceTransaction): Db {
  // Drizzle transactions expose the query/transaction API used by these services,
  // but their type is not the root connection type expected by existing helpers.
  return (transaction ?? db) as Db
}
