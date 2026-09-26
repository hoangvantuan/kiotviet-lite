import { v001Initial } from './v001-initial.js'
import { v002OfflineOrdersEnhance } from './v002-offline-orders-enhance.js'
import { v003OfflineOutboxSeller } from './v003-offline-outbox-seller.js'

export interface PGliteMigration {
  version: number
  name: string
  sql: string
}

export const pgliteMigrations: PGliteMigration[] = [
  v001Initial,
  v002OfflineOrdersEnhance,
  v003OfflineOutboxSeller,
]
