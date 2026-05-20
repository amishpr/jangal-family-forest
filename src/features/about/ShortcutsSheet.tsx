import { Sheet } from '../sheets/Sheet'

// The keyboard shortcut sheet (PLAN A-5), opened with "?"

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
const MOD = isMac ? '⌘' : 'Ctrl'
const ALT = isMac ? '⌥' : 'Alt'

const ALL: [string[], string][] = [
  [['/'], 'Find someone'],
  [[MOD, 'K'], 'Find someone'],
  [['1', '2', '3'], 'Tree, Timeline, Fan chart'],
  [['F'], 'Fit the tree'],
  [['Tab'], 'Move between people'],
  [['↑', '↓'], 'To a parent, to a child'],
  [['←', '→'], 'Through siblings and partners'],
  [['Enter'], 'Open the person card'],
  [['E'], 'Edit the person'],
  [['A'], 'Add a relative'],
  [['R'], 'How are we related?'],
  [['H'], 'Tuck their branch away, or bring it back'],
  [[ALT, '←', '→'], 'Move them among their brothers and sisters'],
  [[MOD, 'Z'], 'Undo'],
  [['⇧', MOD, 'Z'], 'Redo'],
  [['Esc'], 'Close or clear'],
  [['?'], 'This list'],
]

const SHORT = new Set(['/', '1', 'F', 'Esc'])

export function ShortcutList({ short = false }: { short?: boolean }) {
  const rows = short ? ALL.filter(([k]) => SHORT.has(k[0]) || (k[0] === MOD && k[1] === 'Z')) : ALL
  return (
    <dl className="kbd">
      {rows.map(([keys, what]) => (
        <div key={keys.join('+')} style={{ display: 'contents' }}>
          <dt>
            {keys.map((k) => (
              <kbd key={k}>{k}</kbd>
            ))}
          </dt>
          <dd>{what}</dd>
        </div>
      ))}
    </dl>
  )
}

export default function ShortcutsSheet() {
  return (
    <Sheet title="Keyboard shortcuts" label="Keyboard shortcuts">
      <ShortcutList />
    </Sheet>
  )
}
