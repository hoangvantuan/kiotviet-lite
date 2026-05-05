import { v001Initial } from './v001-initial.js'

export interface PGliteMigration {
  version: number
  name: string
  sql: string
}

export const pgliteMigrations: PGliteMigration[] = [v001Initial]
