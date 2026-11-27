// One set of checks for everything that comes from outside the app: what is
// loaded from localStorage now, and imported files in Phase 5.
import { z } from 'zod'
import { PERSON_COLOR_SLOTS } from '../domain/colors'
import { isCalendarDate } from '../domain/date'
import { isAmount } from '../domain/money'
import { parsePromptPayId } from '../domain/promptpay'
import type { Entry, Group, Person, Settings } from '../domain/types'

export const SCHEMA_VERSION = 1

/** My own record always has this id. */
export const ME_ID = 'me'

/** Why a record was set aside. Used as zod issue messages. */
export const PROBLEMS = ['shape', 'amount', 'date', 'unbalanced', 'duplicate-id', 'me'] as const
export type Problem = (typeof PROBLEMS)[number]

const fail = (problem: Problem) => ({ message: problem })

const id = z.string().min(1)
const amount = z.number().refine(isAmount, fail('amount'))
const amounts = z.record(id, amount)
const date = z.string().refine(isCalendarDate, fail('date'))

const total = (record: Record<string, number>) => Object.values(record).reduce((a, b) => a + b, 0)

const billItem = z.object({ id, name: z.string(), price: amount, sharedBy: z.array(id) })

// `owed` is checked, never recalculated: history must not change.
const bill = z
  .object({
    kind: z.literal('bill'),
    id,
    title: z.string(),
    date,
    groupId: id.optional(),
    items: z.array(billItem),
    payers: amounts,
    servicePct: z.number().min(0).max(100),
    vat: z.boolean(),
    discount: amount,
    note: z.string().optional(),
    owed: amounts,
  })
  .refine((b) => total(b.payers) === total(b.owed), fail('unbalanced'))

const loan = z.object({
  kind: z.literal('loan'),
  id,
  date,
  lenderId: id,
  borrowerId: id,
  amount,
  groupId: id.optional(),
  note: z.string().optional(),
})

const repay = z.object({
  kind: z.literal('repay'),
  id,
  date,
  fromId: id,
  toId: id,
  amount,
  groupId: id.optional(),
  note: z.string().optional(),
})

export const entrySchema = z.discriminatedUnion('kind', [bill, loan, repay]) satisfies z.ZodType<Entry>

export const personSchema = z
  .object({
    id,
    name: z.string().min(1),
    isMe: z.boolean(),
    archived: z.boolean().optional(),
    // Hints for the UI. A bad value must never quarantine a person.
    needsName: z.boolean().optional().catch(undefined),
    colorSlot: z
      .number()
      .int()
      .min(0)
      .max(PERSON_COLOR_SLOTS - 1)
      .optional()
      .catch(undefined),
  })
  .refine((p) => p.isMe === (p.id === ME_ID), fail('me')) satisfies z.ZodType<Person>

export const groupSchema = z.object({
  id,
  name: z.string(),
  memberIds: z.array(id),
  createdAt: z.number(),
  archived: z.boolean().optional(),
  simplify: z.boolean().optional(),
}) satisfies z.ZodType<Group>

export const settingsSchema = z.object({
  schemaVersion: z.number().int().min(1),
  myPromptPayId: z
    .string()
    .refine((value) => parsePromptPayId(value) !== null, fail('shape'))
    .optional(),
  lastBackupAt: z.number().optional(),
}) satisfies z.ZodType<Settings>

/** zod issues → our problem codes. Anything unrecognised is a shape problem. */
export function problemsOf(error: z.ZodError): Problem[] {
  const found = error.issues.map(
    (issue) => PROBLEMS.find((problem) => problem === issue.message) ?? 'shape',
  )
  return [...new Set(found)]
}
