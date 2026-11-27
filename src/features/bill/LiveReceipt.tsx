import { memo } from 'react'
import type { Person } from '../../domain/types'
import { ME_ID } from '../../storage/schema'
import { Receipt } from '../../ui/Receipt'
import { evaluate, type BillForm } from './billForm'

/**
 * The receipt for the form being typed. Memoised so that, given a deferred
 * form, a long receipt never holds up typing.
 */
export const LiveReceipt = memo(function LiveReceipt({ form, people }: { form: BillForm; people: Person[] }) {
  const { draft, breakdown } = evaluate(form)
  // I can be paying for a bill I'm not in.
  const listed = people.filter((p) => form.peopleIds.includes(p.id) || p.id === ME_ID)
  return <Receipt title={form.title} date={form.date} draft={draft} breakdown={breakdown} people={listed} />
})
