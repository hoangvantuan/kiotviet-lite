declare module 'pino-roll' {
  import type { Writable } from 'node:stream'

  interface RollStreamOptions {
    file: string
    frequency?: 'daily' | 'hourly' | number
    extension?: string
    limit?: { count?: number }
    size?: string | number
    mkdir?: boolean
  }

  export default function pinoRoll(options: RollStreamOptions): Promise<Writable>
}
