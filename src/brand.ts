// The app's name lives here and nowhere else (PLAN 6.11): the word, the script, the subtitle, the
// About text and the file names. Change it here and the app, exports and pages follow.

export const BRAND = {
  word: 'Jangal',
  script: 'જંગલ',
  sub: 'The Family Forest',
  /** "Jangal (જંગલ)", the wordmark */
  mark: 'Jangal (જંગલ)',
  /** "Jangal (જંગલ) - The Family Forest", the full title */
  full: 'Jangal (જંગલ) - The Family Forest',
  about:
    "Jangal (જંગલ) is Gujarati and Hindi for forest. It's the old joke about Indian families: we don't have a family tree, we have a family forest. This is a place to map yours, see how everyone in it is connected, and share it with them.",
  /** Backups end in .jangal.json, and calendars say PRODID:-//Jangal//Birthdays//EN */
  slug: 'jangal',
  /** The GitHub button is only shown when the build sets VITE_REPO_URL (PLAN A-9) */
  repoUrl: (import.meta.env.VITE_REPO_URL as string | undefined)?.trim() || '',
} as const
