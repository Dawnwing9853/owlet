/** Turns data saved by version `from` into version `from + 1`. Must not mutate its input. */
export interface Migration {
  from: number
  migrate: (data: Record<string, unknown>) => Record<string, unknown>
}

/** Version 1 is the first, so there is nothing to migrate yet. */
export const MIGRATIONS: readonly Migration[] = []

/** Applies each step from `version` up to `target`. Throws if a step is missing. */
export function migrate(
  data: Record<string, unknown>,
  version: number,
  target: number,
  migrations: readonly Migration[] = MIGRATIONS,
): Record<string, unknown> {
  let current = data
  for (let from = version; from < target; from += 1) {
    const step = migrations.find((m) => m.from === from)
    if (!step) throw new Error(`no migration from version ${from}`)
    current = step.migrate(current)
  }
  return current
}
