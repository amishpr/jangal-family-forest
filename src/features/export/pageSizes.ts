// Poster page sizes in points (72 to the inch), for the PDF export (PLAN E-4)

export type PageSize = 'letter' | 'a4' | 'a3' | 'tabloid' | 'poster18x24' | 'poster24x36'

export const PAGE_SIZES: Record<PageSize, { label: string; w: number; h: number }> = {
  letter: { label: 'Letter', w: 612, h: 792 },
  a4: { label: 'A4', w: 595.28, h: 841.89 },
  a3: { label: 'A3', w: 841.89, h: 1190.55 },
  tabloid: { label: 'Tabloid (11 by 17 in)', w: 792, h: 1224 },
  poster18x24: { label: 'Poster, 18 by 24 in', w: 1296, h: 1728 },
  poster24x36: { label: 'Poster, 24 by 36 in', w: 1728, h: 2592 },
}
