import { stamp, today } from '../core/dates'
import { upcoming } from '../core/calendar'
import { indexOf } from '../core/index'
import { isSampleTree } from '../core/model'
import { useTree } from '../store/treeStore'
import { useUi } from '../store/uiStore'
import { toast } from './actions'

// Quiet notes when the app opens: whose birthday it is today (PLAN X-3), and a gentle backup
// reminder when there hasn't been an export in 30 days (PLAN A-2). Each shows at most once a day.

const get = (k: string) => {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
const set = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v)
  } catch {
    // Private mode: it may show again next time, which is fine
  }
}

const DAY = 86_400_000

export function startupNotice() {
  const doc = useTree.getState().doc
  if (!doc || useUi.getState().readOnly) return
  const ix = indexOf(doc)
  const day = stamp()

  const todays = upcoming(ix, 0).filter((u) => u.kind === 'birthday')
  if (todays.length && get('jangal:birthday-note') !== `${doc.id}:${day}`) {
    set('jangal:birthday-note', `${doc.id}:${day}`)
    const [first, ...rest] = todays
    const who = `${first.label}${first.next.turning != null ? ` turns ${first.next.turning}` : "'s birthday is"} today`
    toast(rest.length ? `${who}, and ${rest.length} more` : who, { label: 'Birthdays', run: () => useUi.getState().openSheet('bdays') })
    return
  }

  if (isSampleTree(doc) || ix.ids.length < 5) return
  const last = get('jangal:last-export')
  const since = last ? Date.parse(last) : Date.parse(doc.meta.createdAt)
  const lastReminder = get('jangal:backup-reminder')
  const remindedRecently = lastReminder && today().getTime() - Date.parse(lastReminder) < 7 * DAY
  if (Number.isFinite(since) && Date.now() - since > 30 * DAY && !remindedRecently) {
    set('jangal:backup-reminder', new Date().toISOString())
    toast(last ? "It's been a month since your last backup" : 'Your tree only lives in this browser', {
      label: 'Download a backup',
      run: () => void import('../features/export/exportJson').then((m) => m.exportBackup(true)),
    })
  }
}
