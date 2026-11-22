import 'fake-indexeddb/auto'
import { expect, it } from 'vitest'
import { instantiate } from '../src/templates'
import { deleteExperiment, duplicateExperiment, importExperiment, listExperiments, loadExperiment, loadReplay, renameExperiment, saveExperiment, saveReplay } from '../src/repository'
import { decodeImport, encodeBackup } from '../src/backup'
import { Physics } from '../src/physics'
import { defaultGeometry, trackExperiment } from '../src/geometry'

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
  expect((await listExperiments()).experiments.map(x=>x.id)).toEqual([s.id])
})

it('keeps readable experiments available alongside an unsupported record',async()=>{
  const scene=await saveExperiment(instantiate('fall'))
  const unsupported={id:crypto.randomUUID(),version:99,title:'Future experiment'}
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{
    const request=indexedDB.open('physiclab',2)
    request.onsuccess=()=>resolve(request.result)
    request.onerror=()=>reject(request.error)
  })
  try {
    await new Promise<void>((resolve,reject)=>{
      const tx=db.transaction('experiments','readwrite')
      tx.oncomplete=()=>resolve()
      tx.onabort=()=>reject(tx.error)
      tx.objectStore('experiments').add(unsupported)
    })
    const library=await listExperiments()
    expect(library.experiments).toContainEqual(scene)
    expect(library.unreadable).toContainEqual(unsupported)
    expect((await listExperiments()).unreadable).toContainEqual(unsupported)
  } finally {db.close()}
})

it('restores a backup as a new scene with its independent replay snapshot',async()=>{
  const original=await saveExperiment(instantiate('projectile'))
  const engine=new Physics(original)
  engine.step()
  const replay=engine.captureReplay(original)!
  const updated={...original,title:'Edited after recording'}
  const text=encodeBackup(updated,replay)
  const backup=decodeImport(text,text.length)
  const copy=await importExperiment(backup.scene,backup.replay)
  expect(copy.id).not.toBe(original.id)
  expect(await loadExperiment(copy.id)).toEqual(copy)
  expect(copy.title).toBe(updated.title)
  expect(await loadReplay(copy.id)).toEqual({...replay,scene:{...original,id:copy.id}})
  expect(await loadExperiment(original.id)).toEqual(original)
  expect(await loadReplay(original.id)).toBeUndefined()
  const invalid=encodeBackup({...original,id:crypto.randomUUID()},replay)
  expect(()=>decodeImport(invalid,invalid.length)).toThrow('场景或回放无效')
  await expect(importExperiment({...original,id:crypto.randomUUID()},replay)).rejects.toThrow('回放不属于此实验')
})

it('keeps track scenes and their recordings separate from the legacy database',async()=>{
  const legacy=await saveExperiment(instantiate('fall'))
  const source=await saveExperiment(trackExperiment(defaultGeometry(),0.04,true))
  const engine=new Physics(source)
  engine.step()
  const replay=engine.captureReplay(source)!
  const mismatched={...replay,scene:{...replay.scene,id:legacy.id}}
  const invalid=encodeBackup(legacy,mismatched)
  expect(()=>decodeImport(invalid,invalid.length)).toThrow('场景或回放无效')
  await expect(importExperiment(legacy,mismatched)).rejects.toThrow('回放不属于此实验')
  await expect(saveReplay(legacy,mismatched)).rejects.toThrow('回放不属于当前实验')
  const text=encodeBackup(source,replay)
  const parsed=decodeImport(text,text.length)
  const copy=await importExperiment(parsed.scene,parsed.replay)
  expect((await listExperiments()).experiments).toEqual(expect.arrayContaining([legacy,source,copy]))
  await renameExperiment(copy.id,'Track copy')
  expect((await loadExperiment(copy.id)).title).toBe('Track copy')
  expect((await loadReplay(copy.id))?.scene.id).toBe(copy.id)
  const version1Ids=await new Promise<string[]>((resolve,reject)=>{
    const request=indexedDB.open('physiclab',2)
    request.onerror=()=>reject(request.error)
    request.onsuccess=()=>{
      const db=request.result,read=db.transaction('experiments').objectStore('experiments').getAllKeys()
      read.onsuccess=()=>{db.close();resolve(read.result.map(String))}
      read.onerror=()=>{db.close();reject(read.error)}
    }
  })
  expect(version1Ids).toContain(legacy.id)
  expect(version1Ids).not.toContain(source.id)
  expect(version1Ids).not.toContain(copy.id)
  await deleteExperiment(copy.id)
  expect(await loadReplay(copy.id)).toBeUndefined()
  expect(await loadExperiment(source.id)).toEqual(source)
})
