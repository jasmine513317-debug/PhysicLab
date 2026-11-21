import 'fake-indexeddb/auto'
import { expect, it } from 'vitest'
import { instantiate } from '../src/templates'
import { deleteExperiment, duplicateExperiment, listExperiments, loadExperiment, renameExperiment, saveExperiment } from '../src/repository'

it('saves, reopens, duplicates, renames and deletes an independent versioned scene',async()=>{
  const s={...instantiate('friction'),title:'Inclined Plane',notes:'Original experiment notes'}
  const saved=await saveExperiment(s)
  expect(await loadExperiment(s.id)).toEqual(saved)
  expect(saved.title).toBe('Inclined Plane')
  expect(saved.notes).toBe('Original experiment notes')
  const copy=await duplicateExperiment(saved)
  expect(copy.id).not.toBe(s.id)
  expect(copy.bodies).toEqual(s.bodies)
  await renameExperiment(copy.id,'Reduced friction')
  expect((await loadExperiment(copy.id)).title).toBe('Reduced friction')
  await expect(renameExperiment(copy.id,' ')).rejects.toThrow()
  expect((await loadExperiment(copy.id)).title).toBe('Reduced friction')
  await deleteExperiment(copy.id)
  await expect(loadExperiment(copy.id)).rejects.toThrow('找不到该实验')
  expect((await listExperiments()).map(x=>x.id)).toEqual([s.id])
})
