import { build } from './build'

// The tricky families from PLAN 9. Each one is small enough to reason about by hand.

/** Adam was married to Beth (Cal), then married Dana (Eve). Dana has Finn from her marriage to Gus. */
export const remarriage = () =>
  build('adam:m beth:f cal:m dana:f eve:f gus:m finn:m', [
    [['adam', 'beth'], ['cal'], 'divorced'],
    [['adam', 'dana'], ['eve'], 'married'],
    [['gus', 'dana'], ['finn'], 'divorced'],
  ])

/** Two mothers, Pat and Quinn, and their son Kit */
export const sameSexParents = () =>
  build('pat:f quinn:f kit:m', [[['pat', 'quinn'], ['kit'], 'married']])

/** Sol raised Tia and Uri on his own */
export const singleParent = () => build('sol:m tia:f uri:m', [[['sol'], ['tia', 'uri']]])

/** Vera and Walt are siblings whose parents aren't recorded. Their children Xena and Yuri are cousins. */
export const unknownParents = () =>
  build('vera:f walt:m xena:f yuri:m ada:m bea:f', [
    [[], ['vera', 'walt']],
    [['vera', 'ada'], ['xena']],
    [['bea', 'walt'], ['yuri']],
  ])

/** First cousins Mona and Ned married and had Quil. Their shared grandparents are Gil and Hana. */
export const cousinsMarried = () =>
  build('gil:m hana:f jo:f ken:m lou:f max:m mona:f ned:m quil:u', [
    [['gil', 'hana'], ['jo', 'ken']],
    [['jo', 'max'], ['mona']],
    [['lou', 'ken'], ['ned']],
    [['ned', 'mona'], ['quil']],
  ])

/** A straight line of four generations, with unknown genders */
export const fourGenerations = () =>
  build('g1:u g2:u g3:u g4:u', [
    [['g1'], ['g2']],
    [['g2'], ['g3']],
    [['g3'], ['g4']],
  ])

/**
 * A wide family for cousins: Root's children Ann, Ben and Sis (gender unknown). Ann's line: Cal,
 * Dee, Eli. Ben's line: Fay, Gus, Hal. Sis has Nib. So Dee and Gus are second cousins, and Eli and
 * Gus are second cousins once removed.
 */
export const cousins = () =>
  build('root:u ann:f ben:m sis:u cal:m dee:f eli:m fay:f gus:m hal:m nib:u', [
    [['root'], ['ann', 'ben', 'sis']],
    [['ann'], ['cal']],
    [['cal'], ['dee']],
    [['dee'], ['eli']],
    [['ben'], ['fay']],
    [['fay'], ['gus']],
    [['gus'], ['hal']],
    [['sis'], ['nib']],
  ])

/** A generated tree of about `size` people, for layout and speed checks */
export function generated(size = 500, seed = 7) {
  let s = seed
  const rand = () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31)
  const ids: string[] = []
  const fams: [string[], string[]][] = []
  const genders: string[] = []
  let n = 0
  const add = (g: 'm' | 'f') => {
    const id = `p${n++}`
    ids.push(id)
    genders.push(`${id}:${g}`)
    return id
  }
  const queue: string[] = [add('m')]
  while (n < size && queue.length) {
    const person = queue.shift()!
    const g = genders[ids.indexOf(person)].endsWith(':m') ? 'f' : 'm'
    const partner = add(g)
    const kids: string[] = []
    const count = 1 + Math.floor(rand() * 4)
    for (let k = 0; k < count && n < size; k++) {
      const kid = add(rand() < 0.5 ? 'm' : 'f')
      kids.push(kid)
      queue.push(kid)
    }
    fams.push([[person, partner], kids])
  }
  return build(genders.join(' '), fams.map(([p, c]) => [p, c, 'married']))
}
