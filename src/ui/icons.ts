import { createElement, forwardRef, type ReactNode, type SVGProps } from 'react'
import { ICONS, type IconPart } from './icons.gen'

// Icons (PLAN 10.5): Phosphor's drawings, bold everywhere, sized like text and drawn in the text
// color. Only the drawings in use ship, and only the weights in use (TODO.md F17): Phosphor's own
// modules carry all six weights of every icon. After adding one here, run `npm run icon-paths`.

type Props = Omit<SVGProps<SVGSVGElement>, 'ref'> & { weight?: 'bold' | 'fill'; size?: string | number; color?: string }

const draw = (parts: readonly IconPart[]): ReactNode[] =>
  parts.map(([tag, attrs, children], i) => createElement(tag, { key: i, ...attrs }, ...(children ? draw(children) : [])))

/** An icon drawn on Phosphor's 256 unit grid. weight="fill" works for the icons listed with 'fill'. */
function icon(name: keyof typeof ICONS, _fill?: 'fill') {
  void _fill // read by scripts/build-icon-paths.mjs
  const Icon = forwardRef<SVGSVGElement, Props>(function Icon({ weight = 'bold', size = '1em', color = 'currentColor', children, ...rest }, ref) {
    const d: { bold: readonly IconPart[]; fill?: readonly IconPart[] } = ICONS[name]
    return createElement(
      'svg',
      { ref, xmlns: 'http://www.w3.org/2000/svg', width: size, height: size, fill: color, viewBox: '0 0 256 256', ...rest },
      children,
      ...draw((weight === 'fill' && d.fill) || d.bold),
    )
  })
  Icon.displayName = name
  return Icon
}

export const ArrowDown = icon('ArrowDown')
export const ArrowRight = icon('ArrowRight')
export const ArrowUUpLeft = icon('ArrowUUpLeft')
export const ArrowUUpRight = icon('ArrowUUpRight')
export const ArrowsLeftRight = icon('ArrowsLeftRight')
export const Browser = icon('Browser')
export const Cake = icon('Cake', 'fill')
export const CalendarCheck = icon('CalendarCheck')
export const CalendarPlus = icon('CalendarPlus')
export const Camera = icon('Camera')
export const CaretRight = icon('CaretRight')
export const ChartBarHorizontal = icon('ChartBarHorizontal')
export const ChartPieSlice = icon('ChartPieSlice')
export const Check = icon('Check')
export const Copy = icon('Copy')
export const CornersOut = icon('CornersOut')
export const Crosshair = icon('Crosshair')
export const DownloadSimple = icon('DownloadSimple')
export const Envelope = icon('Envelope')
export const Eye = icon('Eye')
export const FileArrowUp = icon('FileArrowUp')
export const FloppyDisk = icon('FloppyDisk')
export const GithubLogo = icon('GithubLogo')
export const Image = icon('Image')
export const Info = icon('Info')
export const Keyboard = icon('Keyboard')
export const Link = icon('Link')
export const MagnifyingGlass = icon('MagnifyingGlass')
export const MapPin = icon('MapPin', 'fill')
export const Minus = icon('Minus')
export const Moon = icon('Moon')
export const PaperPlaneTilt = icon('PaperPlaneTilt')
export const Path = icon('Path')
export const Pause = icon('Pause')
export const PencilSimple = icon('PencilSimple')
export const Play = icon('Play')
export const Plus = icon('Plus')
export const Printer = icon('Printer')
export const Question = icon('Question')
export const ShareFat = icon('ShareFat')
export const ShareNetwork = icon('ShareNetwork')
export const Sun = icon('Sun')
export const Table = icon('Table')
export const Trash = icon('Trash')
export const Translate = icon('Translate')
export const TreeStructure = icon('TreeStructure')
export const UserCircle = icon('UserCircle')
export const UserCircleCheck = icon('UserCircleCheck')
export const UserCircleDashed = icon('UserCircleDashed')
export const X = icon('X')
