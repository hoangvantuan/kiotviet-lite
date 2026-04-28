export function unwrapDriverError(err: unknown): unknown {
  let current: unknown = err
  for (let i = 0; i < 5; i++) {
    if (!current || typeof current !== 'object') break
    if ('code' in current || 'constraint_name' in current || 'constraint' in current) return current
    if ('cause' in current) {
      current = (current as { cause: unknown }).cause
      continue
    }
    break
  }
  return current
}

export function getPgErrorCode(err: unknown): string | undefined {
  const unwrapped = unwrapDriverError(err)
  if (unwrapped && typeof unwrapped === 'object' && 'code' in unwrapped) {
    const code = (unwrapped as { code: unknown }).code
    if (typeof code === 'string') return code
  }
  return undefined
}

export function getPgConstraint(err: unknown): string | undefined {
  const unwrapped = unwrapDriverError(err)
  if (unwrapped && typeof unwrapped === 'object') {
    for (const key of ['constraint_name', 'constraint'] as const) {
      if (key in unwrapped) {
        const name = (unwrapped as Record<string, unknown>)[key]
        if (typeof name === 'string') return name
      }
    }
  }
  return undefined
}

export function isUniqueViolation(err: unknown, constraintName: string): boolean {
  return getPgErrorCode(err) === '23505' && getPgConstraint(err) === constraintName
}

export function isFkViolation(err: unknown): boolean {
  return getPgErrorCode(err) === '23503'
}
