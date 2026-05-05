import { v001Initial } from './v001-initial.js'
import { v002OfflineOrdersEnhance } from './v002-offline-orders-enhance.js'

export interface PGliteMigration {
  version: number
  name: string
  sql: string
}

export const pgliteMigrations: PGliteMigration[] = [v001Initial, v002OfflineOrdersEnhance]
