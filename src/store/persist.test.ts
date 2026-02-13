import { beforeEach, describe, expect, it, vi } from 'vitest'
import { alvarezTree } from '../../tests/fixtures/alvarez'
import { deleteTree, listTrees, loadCurrent, loadTree, saveTree, startAutosave } from './persist'
import { currentTreeDoc, redo, undo, useTree } from './treeStore'

vi.stubGlobal('window', { addEventListener() {}, removeEventListener() {} })
vi.stubGlobal('document', { addEventListener() {}, visibilityState: 'visible' })

describe('saving to IndexedDB', () => {
  beforeEach(() => useTree.getState().load(alvarezTree()))

  it('loads the sample family back exactly as it was saved', async () => {
    await saveTree(currentTreeDoc()!)
    const back = await loadCurrent()
    expect(back).toEqual({ ...alvarezTree(), title: 'The Alvarez & Raman Family' })
    expect(await listTrees()).toEqual([
      { id: 'sample', title: 'The Alvarez & Raman Family', people: 23, updatedAt: alvarezTree().meta.updatedAt },
    ])
  })

  it('autosaves an edit after a short pause', async () => {
    const stop = startAutosave(10)
    useTree.getState().updatePerson('maya', { nickname: 'May' })
    await new Promise((r) => setTimeout(r, 60))
    stop()
    expect((await loadCurrent())?.people.maya.nickname).toBe('May')
  })

  it('saves a waiting edit when another tree opens, and forgets it when the tree is deleted', async () => {
    const stop = startAutosave(10_000)
    useTree.getState().updatePerson('maya', { nickname: 'Switched' })
    useTree.getState().load({ ...alvarezTree(), id: 'other' })
    await saveTree(currentTreeDoc()!)
    expect((await loadTree('sample'))?.people.maya.nickname).toBe('Switched')
    expect((await loadCurrent())?.id).toBe('other')

    useTree.getState().updatePerson('maya', { nickname: 'Gone' })
    await deleteTree('other')
    useTree.getState().load(alvarezTree())
    await saveTree(currentTreeDoc()!)
    stop()
    expect(await loadTree('other')).toBeNull()
  })
})

describe('undo', () => {
  beforeEach(() => useTree.getState().load(alvarezTree()))

  it('undoes and redoes one edit at a time, including who is marked as you', () => {
    const s = useTree.getState()
    s.setHome('iris')
    s.updatePerson('iris', { nickname: 'Ris' })
    expect(useTree.getState().doc?.homePersonId).toBe('iris')
    undo()
    expect(useTree.getState().doc?.people.iris.nickname).toBeUndefined()
    expect(useTree.getState().doc?.homePersonId).toBe('iris')
    undo()
    expect(useTree.getState().doc?.homePersonId).toBe('maya')
    redo()
    expect(useTree.getState().doc?.homePersonId).toBe('iris')
  })

  it('leaves tucked away branches out of the history', () => {
    useTree.getState().toggleFamily('f_arjun')
    expect(useTree.temporal.getState().pastStates).toHaveLength(0)
  })

  it('reports why an edit could not be made', () => {
    expect(useTree.getState().addRelative('maya', 'parent')).toEqual({ ok: false, reason: 'Maya already has two parents' })
    expect(useTree.temporal.getState().pastStates).toHaveLength(0)
  })
})
