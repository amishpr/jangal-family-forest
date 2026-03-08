import { setMe, showPerson } from '../../app/actions'
import { sideClass, useHome, useIndex, useSides } from '../../app/derive'
import { fullName } from '../../core/model'
import { useUi } from '../../store/uiStore'
import { Avatar } from '../../ui/Avatar'
import { Crosshair, Eye } from '../../ui/icons'
import { PeoplePicker } from './PeoplePicker'
import { Sheet } from './Sheet'

// "Who are you in this tree?" (PLAN A-10, P-7): pick yourself, jump to yourself, or view the tree
// neutrally with no one in the middle. The choice is saved with the tree and goes into exports.

export default function WhoAreYouSheet() {
  const ix = useIndex()
  const sides = useSides()
  const home = useHome()
  if (!ix || !sides) return null
  const me = home ? ix.person(home) : null
  return (
    <Sheet title="Who are you in this tree?" label="Who are you">
      <p className="lede">
        Pick yourself and the tree reads from your side, like "your aunt Marisol", with colors for your father's and mother's
        families. Or keep it neutral, with no one in the middle. Your choice is saved with the tree and goes into exports.
      </p>
      <div className={`me-now ${me ? sideClass(sides, me.id) : ''}`}>
        {me ? (
          <>
            <Avatar person={me} size={54} side={sideClass(sides, me.id)} />
            <span className="who">
              <b>{fullName(me)}</b>
              <span>You're viewing the tree as {me.firstName}</span>
            </span>
            <span className="acts">
              <button
                type="button"
                className="chunky"
                onClick={() => {
                  useUi.getState().openSheet(null)
                  showPerson(me.id)
                }}
              >
                <Crosshair />
                Show me
              </button>
              <button type="button" className="chunky" onClick={() => setMe(null)}>
                <Eye />
                View neutrally
              </button>
            </span>
          </>
        ) : (
          <>
            <span className="q">
              <Eye />
            </span>
            <span className="who">
              <b>Neutral view</b>
              <span>No one is marked as you. Tiles show birth years and birthplaces.</span>
            </span>
          </>
        )}
      </div>
      <PeoplePicker placeholder="Find yourself" current={home} onPick={(id) => setMe(id)} />
    </Sheet>
  )
}
