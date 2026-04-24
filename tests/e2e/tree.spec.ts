import { writeFileSync } from 'node:fs'
import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { dock, find, holdAndMove, leftToRight, nameBox, openSample, sprout, sproutOn, tile } from './helpers'

test('first run: start with you, add a parent, and it is still there after a reload (PLAN S1)', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /Start with you/ }).click()
  await nameBox(page).fill('Asha Patel')
  await page.keyboard.press('Enter')
  await expect(page.locator('.tile', { hasText: 'Asha Patel' })).toBeVisible()
  await sproutOn(page.locator('.tile.home'), 'parent')
  await nameBox(page).fill('Kiran Patel')
  await page.keyboard.press('Enter')
  await expect(page.locator('.tile', { hasText: 'Kiran Patel' })).toContainText('Parent')
  await page.waitForTimeout(700) // autosave waits 400 ms
  await page.reload()
  await expect(page.locator('.tile', { hasText: 'Kiran Patel' })).toBeVisible()
  await expect(page.locator('.ttl-text')).toHaveText('The Patel Family')
})

test('adding a partner names them in place, and undo takes them away in one step (PLAN S2, A-1)', async ({ page }) => {
  await openSample(page)
  await sprout(page, 'rajiv', 'partner')
  await nameBox(page).fill('Rosa Diaz')
  await page.keyboard.press('Enter')
  const rosa = page.locator('.tile', { hasText: 'Rosa Diaz' })
  // Rajiv is a man, so quick add guessed his partner is a woman (TODO.md QA-2)
  await expect(rosa).toContainText('Aunt by marriage')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(rosa).toHaveCount(0)
})

test('the camera keeps its zoom while you name someone new, and moves once they are added (TODO.md F13)', async ({ page }) => {
  await openSample(page)
  const camera = page.locator('.react-flow__viewport')
  const zoom = async () => (await camera.getAttribute('style'))!.match(/scale\(([\d.]+)\)/)![1]
  const before = await zoom()
  await sprout(page, 'ranbir', 'sibling')
  await expect(nameBox(page)).toBeFocused()
  await page.waitForTimeout(700)
  expect(await zoom()).toBe(before)
  await nameBox(page).fill('Tara Kapoor')
  await page.keyboard.press('Enter')
  await expect.poll(zoom).not.toBe(before)
})

test('find flies to someone and lights the path from you (PLAN S3)', async ({ page }) => {
  await openSample(page)
  await find(page, 'kareena')
  await expect(page.locator('.world.pathing')).toBeVisible()
  await expect(page.locator('.vine')).toHaveCount(6)
  await dock(page, 'Relate')
  const pick = page.getByLabel('Search the family')
  await expect(pick).toBeFocused()
  await pick.fill('kareena')
  await pick.press('Enter')
  await expect(page.locator('.answer .big')).toHaveText('First cousin')
  await expect(page.locator('.answer .sen')).toHaveText('Kareena is your first cousin')
})

test('tucking a branch away and bringing it back (PLAN S4, C-7)', async ({ page }) => {
  await openSample(page)
  const pill = page.locator('.pill', { hasText: 'tucked away' })
  // The sample starts mostly tucked away: five cousins' branches and the Bhatts (TODO.md F17)
  await expect(pill).toHaveCount(6)
  // Opening one can show pills off screen, so they're pressed without scrolling to them
  while (await pill.count()) await pill.first().evaluate((el) => (el as HTMLElement).click())
  await page.getByRole('button', { name: 'Tuck this branch away' }).first().click()
  await expect(pill).toBeVisible()
  await pill.click()
  await expect(pill).toHaveCount(0)
})

test('searching opens a tucked away branch (PLAN S-4)', async ({ page }) => {
  await openSample(page)
  // Tucking a branch away also hides the fold buttons inside it, so keep going until none are left
  const folds = page.getByRole('button', { name: 'Tuck this branch away' })
  while (await folds.count()) await folds.first().click()
  await expect(tile(page, 'agastya')).toHaveCount(0)
  await find(page, 'agastya nanda')
  await expect(tile(page, 'agastya')).toBeVisible()
})

test('"This is me" changes every label, and the neutral view has none (PLAN P-7)', async ({ page }) => {
  await openSample(page)
  await tile(page, 'riddhima').click()
  await page.locator('.pop').getByRole('button', { name: 'This is me' }).click()
  await expect(tile(page, 'ranbir')).toContainText('Brother')
  await expect(page.locator('.dock .me')).toContainText('Riddhima')
  await dock(page, 'Riddhima')
  await page.getByRole('button', { name: 'View neutrally' }).click()
  await expect(page.locator('.dock .me')).toContainText('Who are you?')
  await expect(page.locator('.legend')).toContainText('Kapoor line')
  await expect(tile(page, 'ranbir')).toContainText('b. 1982')
  await expect(tile(page, 'ranbir')).toContainText('Bombay')
})

test('renaming the tree changes the tab title and the backup file name (PLAN 6.12)', async ({ page }) => {
  await openSample(page)
  await page.locator('.ttl').click()
  await page.getByLabel('Tree title').fill('Our Big Family')
  await page.keyboard.press('Enter')
  await expect(page).toHaveTitle('Our Big Family · Jangal')
  await dock(page, 'Share')
  await page.getByRole('radio', { name: /Backup file/ }).click()
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download the backup' }).click()])
  expect(download.suggestedFilename()).toMatch(/^our-big-family-\d{4}-\d{2}-\d{2}\.jangal\.json$/)
})

test('leaving the sample family for your own tree, then starting another, with Undo to go back (PLAN X-2)', async ({ page }) => {
  await openSample(page)
  await page.getByRole('button', { name: 'Start your own tree' }).click()
  // A new tree that starts with you, named in place
  await expect(nameBox(page)).toBeFocused()
  await expect(nameBox(page)).toHaveAttribute('placeholder', 'Your name')
  await expect(page.locator('.tile')).toHaveCount(1)
  await expect(page.locator('.sample-tag')).toHaveCount(0)
  // Undo in the toast goes back to the sample family
  await page.locator('.toast').getByRole('button', { name: 'Undo' }).click()
  await expect(tile(page, 'ranbir')).toBeVisible()
  await expect(page.locator('.sample-tag')).toBeVisible()

  // This time keep the new tree, and start one more from it
  await page.getByRole('button', { name: 'Start your own tree' }).click()
  await nameBox(page).fill('Asha Patel')
  await page.keyboard.press('Enter')
  await expect(page.locator('.tile', { hasText: 'Asha Patel' })).toBeVisible()
  await page.getByRole('button', { name: 'New tree' }).click()
  await expect(page.locator('.tile')).toHaveCount(1)
  await expect(page.locator('.toast')).toContainText('Started a new tree')
  // Every tree stays saved in this browser
  await page.keyboard.press('Escape')
  await dock(page, 'Share')
  const trees = page.locator('.trees')
  await expect(trees).toContainText('The Patel Family')
  await expect(trees).toContainText('The Kapoor Family')
})

test('the sample family opens from Share, even when you have a tree of your own (TODO.md F8)', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /Start with you/ }).click()
  await nameBox(page).fill('Asha Patel')
  await page.keyboard.press('Enter')
  await expect(page.locator('.tile', { hasText: 'Asha Patel' })).toBeVisible()
  await dock(page, 'Share')
  await page.getByRole('button', { name: 'Explore the sample family' }).click()
  await expect(tile(page, 'ranbir')).toBeVisible()
  // Your own tree is still there, and the button hides while the sample is open
  await dock(page, 'Share')
  await expect(page.locator('.trees')).toContainText('The Patel Family')
  await expect(page.getByRole('button', { name: 'Explore the sample family' })).toHaveCount(0)
})

test('quick add sets gender and birthday in the same step, and guesses a second parent (TODO.md F1)', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /Start with you/ }).click()
  const card = page.locator('.quick-card')
  await expect(card).toContainText('Start with you')
  await nameBox(page).fill('Asha Patel')
  await card.locator('label', { hasText: 'Woman' }).click()
  await card.getByLabel('Your birthday: year').fill('1990')
  await page.keyboard.press('Enter')
  const me = page.locator('.tile.home')
  await expect(me).toContainText('b. 1990')

  // A first parent: no guess. Pick Man, and a bad date is caught before anything is saved.
  await sproutOn(me, 'parent')
  await expect(card).toContainText('New parent of Asha')
  await expect(card.locator('input[name="gender"]:checked')).toHaveValue('unknown')
  await nameBox(page).fill('Kiran Patel')
  await card.locator('label', { hasText: /^Man$/ }).click()
  await card.getByLabel('Birthday: month').selectOption('2')
  await card.getByLabel('Birthday: day').fill('31')
  await card.getByLabel('Birthday: year').fill('1960')
  await page.keyboard.press('Enter')
  await expect(card.locator('.field-err')).toHaveText('February 1960 has 29 days')
  await card.getByLabel('Birthday: day').fill('28')
  await page.keyboard.press('Enter')
  await expect(page.locator('.tile', { hasText: 'Kiran Patel' })).toContainText('Father')

  // The second parent is guessed: the father is there, so a woman
  await sproutOn(me, 'parent')
  await expect(card.locator('input[name="gender"]:checked')).toHaveValue('female')
  await nameBox(page).fill('Meera Patel')
  await page.keyboard.press('Enter')
  const meera = page.locator('.tile', { hasText: 'Meera Patel' })
  await expect(meera).toContainText('Mother')
  // Adding her, her name and her gender are one undo step
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(meera).toHaveCount(0)
  await expect(page.locator('.tile', { hasText: 'Kiran Patel' })).toContainText('Father')
})

test('traits: add some in the edit card, then light everyone who has one (TODO.md F2)', async ({ page }) => {
  await openSample(page)
  await tile(page, 'ranbir').click()
  await page.locator('.pop').getByRole('button', { name: 'Edit' }).click()
  // A comma finishes a trait, and what's still in the box is saved too. The starter list spells them.
  await page.locator('.pop input[name="traitDraft"]').fill('left handed, curly hair')
  await page.locator('.pop button[type="submit"]').click()
  await tile(page, 'ranbir').click()
  await expect(page.locator('.pop .trait-chip')).toHaveText(['Actor', 'Left-handed', 'Curly hair'])
  // Where a trait came from, in the card (TR-7)
  await expect(page.locator('.pop .trait-story')).toHaveText('Actor from Rishi (father) and Neetu (mother)')

  // Find offers a trait that matches what's typed
  await page.keyboard.press('Escape')
  await page.keyboard.press('/')
  await page.locator('.find-in').fill('acto')
  await page.getByRole('button', { name: 'Show everyone with Actor (37) on the tree' }).click()
  await expect(page.locator('.trait-sum')).toContainText('37 people · 4 generations')
  await expect(page.locator('.world.trait')).toHaveCount(1)
  await page.keyboard.press('Escape')
  await expect(page.locator('.trait-bar')).toHaveCount(0)
  await expect(page.locator('.world.trait')).toHaveCount(0)
})

test('a family adds its own language for family titles, and a family page carries it (TODO.md F4)', async ({ page, context }, info) => {
  await openSample(page)
  await page.getByRole('button', { name: 'Family titles' }).click()
  const file = info.outputPath('marathi.json')
  writeFileSync(file, JSON.stringify({ format: 'jangal-titles', version: 1, lang: 'mr', name: 'Marathi', words: { father: ['Baba'], fatherOlderBrother: ['Mothe Baba'], cousin: ['x'] } }))
  await page.locator('.sheet input[type=file]').setInputFiles(file)
  await expect(page.locator('.titles-own .report')).toContainText("2 of 62 relationships have words. 1 that aren't on the list were left out: cousin.")
  await page.getByRole('button', { name: 'Add Marathi' }).click()
  await expect(page.getByRole('radio', { name: 'Marathi' })).toBeChecked()
  await page.keyboard.press('Escape')
  await expect(tile(page, 'rishi')).toContainText('Baba')
  await expect(tile(page, 'randhir')).toContainText('Mothe Baba')
  // A title is marked as the pack's language, an English label isn't (TP-9)
  await expect(tile(page, 'rishi').locator('.tag')).toHaveAttribute('lang', 'mr')
  await expect(tile(page, 'raj').locator('.tag')).not.toHaveAttribute('lang', /.+/)
  await page.reload()
  await expect(tile(page, 'rishi')).toContainText('Baba')

  // The family page opens with the same words, even on a computer that never had them
  await dock(page, 'Share')
  await page.getByRole('radio', { name: /A page for family/ }).click()
  await expect(page.getByLabel(/Include the family titles \(Marathi\)/)).toBeChecked()
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download the page' }).click()])
  const path = info.outputPath(download.suggestedFilename())
  await download.saveAs(path)
  const viewer = await context.newPage()
  await viewer.goto(`file://${path}`)
  await expect(viewer.locator('.tile[data-id="rishi"]')).toContainText('Baba')

  // Taking it away goes back to English
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Family titles' }).click()
  await page.getByRole('button', { name: 'Remove Marathi' }).click()
  await page.keyboard.press('Escape')
  await expect(tile(page, 'rishi')).toContainText('Father')
})

test('the titles editor: a new language from Hindi, and Gujarati words of your own (TODO.md F9)', async ({ page }) => {
  await openSample(page)
  const sheet = page.locator('.sheet')
  await page.getByRole('button', { name: 'Family titles' }).click()
  await sheet.getByRole('button', { name: '+ New language' }).click()
  await sheet.getByLabel('Name in English').fill('Marathi')
  await sheet.getByLabel('Code').fill('mr')
  await sheet.getByLabel(/^Hindi words/).check()
  await sheet.getByRole('button', { name: 'Next: the words' }).click()
  await expect(sheet.getByLabel('Father', { exact: true })).toHaveValue('Papa, Pita, Baba, Bapu, Abba, Pitashri')
  await sheet.getByLabel('Father', { exact: true }).fill('Baba')
  while (await sheet.getByRole('button', { name: 'Next group' }).count()) await sheet.getByRole('button', { name: 'Next group' }).click()
  await sheet.getByRole('button', { name: 'Next: save' }).click()
  await sheet.getByRole('button', { name: 'Save Marathi' }).click()
  await expect(page.getByRole('radio', { name: 'Marathi' })).toBeChecked()
  await page.keyboard.press('Escape')
  await expect(tile(page, 'rishi')).toContainText('Baba')

  // Gujarati: a word of the family's own, made the usual one, then back to the built-in words
  await page.getByRole('button', { name: 'Family titles' }).click()
  await sheet.locator('.langs label', { hasText: 'Gujarati' }).click()
  await sheet.getByRole('switch', { name: 'Edit words' }).click()
  const father = sheet.getByRole('group', { name: 'Father', exact: true })
  await father.getByLabel('Add a word for Father').fill('Bapu')
  await father.getByLabel('Add a word for Father').press('Enter')
  await father.getByRole('button', { name: 'Make Bapu the usual word' }).click()
  await expect(father.getByRole('button', { name: 'Bapu is the usual word' })).toBeFocused()
  await page.keyboard.press('Alt+ArrowRight')
  await expect(father.locator('.wchip').nth(1)).toContainText('Bapu')
  await father.getByRole('button', { name: 'Make Bapu the usual word' }).click()
  await page.keyboard.press('Escape')
  await expect(tile(page, 'rishi')).toContainText('Bapu')

  await page.getByRole('button', { name: 'Family titles' }).click()
  await sheet.getByRole('switch', { name: 'Edit words' }).click()
  await father.getByRole('button', { name: 'Back to the built-in words for Father' }).click()
  await expect(father.locator('.wchip').first()).toContainText('Pappa')
  await sheet.getByRole('button', { name: 'Back to the built-in words', exact: true }).click()
  await expect(sheet.getByRole('button', { name: 'Back to the built-in words', exact: true })).toHaveCount(0)
  // Undo brings the family's pack back
  await page.locator('.toast').getByRole('button', { name: 'Undo' }).click()
  await expect(sheet.getByRole('button', { name: 'Back to the built-in words', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(tile(page, 'rishi')).toContainText('Pappa')
})

test('a pet joins its owners’ family and is named from them (TODO.md F14)', async ({ page }) => {
  await openSample(page)
  const card = page.locator('.pop')
  await tile(page, 'ranbir').click()
  await card.getByRole('button', { name: 'Add a relative' }).click()
  await card.locator('.addpanel label', { hasText: 'Pet' }).click()
  await card.getByRole('button', { name: 'Add someone new' }).click()
  await expect(nameBox(page)).toBeFocused()
  await page.locator('.quick-pet label', { hasText: 'Dog' }).click()
  await nameBox(page).fill('Bruno')
  await page.keyboard.press('Enter')
  const bruno = page.locator('.tile', { hasText: 'Bruno' })
  await expect(bruno).toContainText('Dog')
  await expect(page.locator('.ttl-stats')).toContainText('88 people · 1 pet · 6 generations')
  // No + buttons on a pet, and no "This is me"
  await bruno.hover()
  await expect(bruno.locator('.sprout')).toHaveCount(0)
  await bruno.click()
  await expect(card.locator('.tag')).toHaveText('Your dog')
  await expect(card.getByRole('button', { name: 'This is me' })).toHaveCount(0)
  await expect(card.locator('.family')).toContainText('Owners')
  await card.getByRole('button', { name: 'Edit' }).click()
  await expect(card.getByLabel('Kind of pet')).toHaveValue('Dog')
  await expect(card.getByLabel('Middle name')).toHaveCount(0)
})

test('a branch from a file joins the open tree at the people in both, in one undo step (TODO.md F12)', async ({ page }, info) => {
  await openSample(page)
  // A cousin's file: Ranbir and Alia, with a daughter this tree doesn't have yet
  const branch = await page.evaluate(() => {
    const doc = (window as unknown as { __jangal: { tree: { getState(): { doc: Record<string, any> } } } }).__jangal.tree.getState().doc
    const t = '2026-01-01T00:00:00.000Z'
    return {
      ...doc,
      id: 'branch',
      title: 'Ranbir and Alia',
      homePersonId: 'ranbir',
      people: { ranbir: doc.people.ranbir, alia: doc.people.alia, tara: { id: 'tara', firstName: 'Tara', lastName: 'Kapoor', gender: 'female', birth: { date: { year: 2020 } }, createdAt: t, updatedAt: t } },
      families: { fx: { id: 'fx', partnerIds: ['ranbir', 'alia'], status: 'married', children: [{ personId: 'tara', kind: 'biological' }] } },
      view: { ...doc.view, collapsedAncestors: [], collapsedFamilies: [] },
    }
  })
  const file = info.outputPath('branch.jangal.json')
  writeFileSync(file, JSON.stringify(branch))
  await dock(page, 'Share')
  await page.getByRole('button', { name: 'Import a file' }).click()
  await page.locator('.sheet input[type=file]').setInputFiles(file)
  await page.getByRole('button', { name: 'Add to the open tree' }).click()
  const review = page.locator('.report.merge')
  await expect(review.locator('.merge-list li')).toHaveCount(2)
  await expect(review.getByRole('checkbox')).toHaveCount(2)
  for (const box of await review.getByRole('checkbox').all()) await expect(box).toBeChecked()
  const axe = await new AxeBuilder({ page }).include('.sheet').withTags(['wcag2a', 'wcag2aa']).analyze()
  expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([])
  await review.getByRole('button', { name: 'Combine: add 1 person' }).click()
  await expect(review).toContainText('1 person was added, and 2 people were in both trees')
  await review.getByRole('button', { name: 'Done' }).click()
  await expect(page.locator('.ttl-stats')).toContainText('89 people')
  await expect(page.locator('.tile', { hasText: 'Tara Kapoor' })).toContainText('Daughter')
  await page.getByRole('button', { name: 'Undo', exact: true }).first().click()
  await expect(page.locator('.ttl-stats')).toContainText('88 people')
})

test('hold a tile and drag it to rearrange brothers and sisters, or use Alt+arrows (TODO.md F18)', async ({ page }) => {
  await openSample(page)
  const kids = ['randhir', 'ritu', 'rishi', 'rima', 'rajiv']
  const camera = () => page.locator('.react-flow__viewport').getAttribute('style')
  expect(await leftToRight(page, kids)).toEqual(kids)

  // Held and dragged past Babita and Randhir: Rishi and Neetu move to the front, the canvas stays put
  const before = await camera()
  const babita = (await tile(page, 'babita').boundingBox())!
  await holdAndMove(page, 'rishi', babita.x - 20)
  expect(await camera()).toBe(before)
  await page.mouse.up()
  await expect(page.locator('.toast')).toContainText('Moved Rishi before Randhir')
  await expect(page.locator('.pop')).toHaveCount(0)
  await expect.poll(() => leftToRight(page, kids)).toEqual(['rishi', 'randhir', 'ritu', 'rima', 'rajiv'])
  // Neetu came along. First of the group now, she sits on its outer side, as people married in do.
  await expect.poll(() => leftToRight(page, ['rishi', 'neetu', 'randhir'])).toEqual(['neetu', 'rishi', 'randhir'])
  await page.waitForTimeout(700) // autosave waits 400 ms
  await page.reload()
  await expect(tile(page, 'ranbir')).toBeVisible()
  expect(await leftToRight(page, kids)).toEqual(['rishi', 'randhir', 'ritu', 'rima', 'rajiv'])
  // Back to birth order from the card
  await tile(page, 'rima').click()
  await page.locator('.pop').getByRole('button', { name: 'Brothers and sisters: back to birth order' }).click()
  await expect.poll(() => leftToRight(page, kids)).toEqual(kids)
  await page.keyboard.press('Escape')

  // Esc while holding puts it back
  await holdAndMove(page, 'rima', babita.x - 20)
  await page.keyboard.press('Escape')
  await page.mouse.up()
  expect(await leftToRight(page, kids)).toEqual(kids)

  // A quick drag still pans
  const still = await camera()
  const rima = (await tile(page, 'rima').boundingBox())!
  await page.mouse.move(rima.x + 60, rima.y + 90)
  await page.mouse.down()
  await page.mouse.move(rima.x - 140, rima.y + 90, { steps: 5 })
  await page.mouse.up()
  expect(await camera()).not.toBe(still)
  expect(await leftToRight(page, kids)).toEqual(kids)

  // The keyboard, then Undo
  await page.locator('.react-flow__node[data-id="rima"]').focus()
  await page.keyboard.press('Alt+ArrowLeft')
  await expect(page.locator('.toast')).toContainText('Moved Rima before Rishi')
  await expect.poll(() => leftToRight(page, kids)).toEqual(['randhir', 'ritu', 'rima', 'rishi', 'rajiv'])
  await page.locator('.toast').getByRole('button', { name: 'Undo' }).click()
  await expect.poll(() => leftToRight(page, kids)).toEqual(kids)
})
