import { CircleCheck, X } from 'lucide-react'
import type { Person, PersonId } from '../../domain/types'
import type { AppData } from '../../storage/parse'
import type { SaveResult } from '../../storage/repository'
import { Tabs } from '../../ui/Tabs'
import { FriendsList } from './FriendsList'
import { HistoryList, type HistoryActions } from './HistoryList'

export type SettingsTab = 'history' | 'friends'

const TABS = [
  ['history', 'ประวัติ'],
  ['friends', 'เพื่อน'],
] as const

interface Props extends HistoryActions {
  data: AppData
  tab: SettingsTab
  onTab: (tab: SettingsTab) => void
  /** A confirmation to show, e.g. after an edit was saved. */
  notice: string | null
  onDismissNotice: () => void
  onRename: (id: PersonId, name: string) => SaveResult<Person>
}

export function SettingsScreen({ data, tab, onTab, notice, onDismissNotice, onRename, ...history }: Props) {
  return (
    <div className="mx-auto w-full max-w-xl pb-6">
      <h1 className="sr-only">ตั้งค่า</h1>
      <Tabs label="ตั้งค่า" tabs={TABS} value={tab} panelId="settings-panel" onChange={onTab} />

      {notice && (
        <div className="mb-3 flex items-center gap-2 rounded-xl border border-line bg-paper py-1 pl-3" role="status">
          <CircleCheck aria-hidden size={20} className="flex-none text-paid" />
          <p className="min-w-0 flex-1 wrap-anywhere">{notice}</p>
          <button type="button" className="btn btn-quiet btn-icon" aria-label="ปิด" onClick={onDismissNotice}>
            <X aria-hidden size={18} />
          </button>
        </div>
      )}

      <div id="settings-panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {tab === 'history' ? (
          <HistoryList data={data} {...history} />
        ) : (
          <FriendsList people={data.people} onRename={onRename} onGoToBill={history.onGoToBill} />
        )}
      </div>
    </div>
  )
}
