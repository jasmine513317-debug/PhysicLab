import { decodeExperiment, type Experiment } from './model'
import { decodeReplay, type Replay } from './replay'
import { electrostaticSchema, isElectrostatic, type ElectrostaticExperiment } from './electrostatics'
import { astronomySchema, type AstronomyExperiment, type SavedExperiment } from './astronomy'
import { extendedSchema, type ExtendedExperiment } from './extended-experiments'

const STORE = 'experiments'
const REPLAYS = 'replays'
type SceneVersion=Experiment['version']
type StorageScope=SceneVersion|'electrostatic'|'astronomy'|'extended'
const databases={1:'physiclab',2:'physiclab-studio',3:'physiclab-semantic',electrostatic:'physiclab-electrostatics',astronomy:'physiclab-astronomy',extended:'physiclab-extended'} as const
export function storageFor(scene:SavedExperiment):StorageScope {
  if('extension' in scene)return 'extended'
  if(isElectrostatic(scene))return 'electrostatic'
  return 'domain' in scene?'astronomy':scene.version
}
function decodeStored(scope:StorageScope,value:unknown) {
  if(scope==='electrostatic')return electrostaticSchema.parse(value)
  if(scope==='astronomy')return astronomySchema.parse(value)
  if(scope==='extended')return extendedSchema.parse(value)
  return decodeExperiment(value)
}
function openDatabase(scope:StorageScope=1) {
  return new Promise<IDBDatabase>((resolve,reject) => {
    const request = indexedDB.open(databases[scope],scope===1?2:1)
    let blocked=false
    request.onupgradeneeded = () => {
      const db=request.result
      if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE,{keyPath:'id'})
      if(!db.objectStoreNames.contains(REPLAYS))db.createObjectStore(REPLAYS)
    }
    request.onerror = () => reject(request.error)
    request.onblocked = () => {
      blocked=true
      reject(new Error('请关闭其他 PhysicLab 标签页，再更新实验库。'))
    }
    request.onsuccess = () => {
      const db=request.result
      db.onversionchange=()=>db.close()
      if(blocked)db.close()
      else resolve(db)
    }
  })
}
async function transaction<T>(mode: IDBTransactionMode, operation: (store:IDBObjectStore)=>IDBRequest<T>, storeName=STORE, scope:StorageScope=1) {
  const db = await openDatabase(scope)
  try {
    return await new Promise<T>((resolve,reject) => {
      const tx = db.transaction(storeName,mode)
      const request = operation(tx.objectStore(storeName))
      tx.oncomplete = () => resolve(request.result)
      tx.onabort = () => reject(tx.error ?? new Error('实验存储操作已中断。'))
    })
  } finally { db.close() }
}
export async function listExperiments() {
  const scopes=[1,2,3,'electrostatic','astronomy','extended'] as const
  const results = await Promise.allSettled(scopes.map(scope=>transaction('readonly',store=>store.getAll(),STORE,scope)))
  if(results.every(result=>result.status==='rejected'))throw results[0].reason
  const experiments:SavedExperiment[]=[]
  const unreadable:unknown[]=[]
  results.forEach((result,index)=>{
    if(result.status!=='fulfilled')return
    const scope=scopes[index]
    for(const entry of result.value) {
      try {
        const scene=decodeStored(scope,entry)
        if(storageFor(scene)!==scope)unreadable.push(entry)
        else experiments.push(scene)
      } catch {unreadable.push(entry)}
    }
  })
  const latest=new Map<string,Experiment>()
  for(const scene of experiments)if('environment' in scene) {
    const previous=latest.get(scene.id)
    if(!previous||scene.version>previous.version)latest.set(scene.id,scene)
  }
  const unique=experiments.filter(scene=>!('environment' in scene)||latest.get(scene.id)===scene)
  unique.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))
  return {experiments:unique,unreadable,incomplete:results.some(result=>result.status==='rejected')}
}
async function findRecord(id:string) {
  const versions=[1,2,3] as const
  const results=await Promise.allSettled(versions.map(version=>transaction('readonly',store=>store.get(id),STORE,version)))
  let failure:unknown
  for(let i=results.length-1;i>=0;i--) {
    const result=results[i]
    if(result.status==='rejected') {failure??=result.reason;continue}
    if(result.value===undefined)continue
    try {
      const scene=decodeExperiment(result.value)
      if(scene.version===versions[i])return {value:result.value,version:versions[i]}
    } catch(error) {failure??=error}
  }
  if(failure!==undefined)throw failure
}
export async function loadExperiment(id:string) {
  const record=await findRecord(id)
  if(!record)throw new Error('实验库中已找不到该实验。')
  const scene=decodeExperiment(record.value)
  if(scene.version!==record.version)throw new Error('实验记录的版本与存储位置不符。')
  return scene
}
export async function saveExperiment(scene:Experiment) {
  const result = decodeExperiment({...scene,updatedAt:new Date().toISOString()})
  await transaction('readwrite',store=>store.put(result),STORE,result.version)
  return result
}
export async function loadElectrostatic(id:string) {
  const value=await transaction('readonly',store=>store.get(id),STORE,'electrostatic')
  if(value===undefined)throw new Error('实验库中已找不到该静电实验。')
  return electrostaticSchema.parse(value)
}
export async function saveElectrostatic(scene:ElectrostaticExperiment,asCopy=false) {
  const result=electrostaticSchema.parse({...scene,id:asCopy?crypto.randomUUID():scene.id,updatedAt:new Date().toISOString()})
  await transaction('readwrite',store=>asCopy?store.add(result):store.put(result),STORE,'electrostatic')
  return result
}
export async function loadAstronomy(id:string) {
  const value=await transaction('readonly',store=>store.get(id),STORE,'astronomy')
  if(value===undefined)throw new Error('实验库中已找不到该双体实验。')
  return astronomySchema.parse(value)
}
export async function saveAstronomy(scene:AstronomyExperiment,asCopy=false) {
  const result=astronomySchema.parse({...scene,id:asCopy?crypto.randomUUID():scene.id,updatedAt:new Date().toISOString()})
  await transaction('readwrite',store=>asCopy?store.add(result):store.put(result),STORE,'astronomy')
  return result
}
export async function loadExtended(id:string) {
  const value=await transaction('readonly',store=>store.get(id),STORE,'extended')
  if(value===undefined)throw new Error('实验库中已找不到该实验。')
  return extendedSchema.parse(value)
}
export async function saveExtended(scene:ExtendedExperiment,asCopy=false) {
  const result=extendedSchema.parse({...scene,id:asCopy?crypto.randomUUID():scene.id,updatedAt:new Date().toISOString()})
  await transaction('readwrite',store=>asCopy?store.add(result):store.put(result),STORE,'extended')
  return result
}
export async function loadReplay(id:string,version?:SceneVersion) {
  const resolved=version??(await findRecord(id))?.version
  if(resolved===undefined)return
  const value=await transaction('readonly',store=>store.get(id),REPLAYS,resolved)
  return value===undefined?undefined:decodeReplay(value)
}

export async function importExperiment(scene:Experiment,replay?:Replay) {
  const id=crypto.randomUUID()
  const copy=decodeExperiment({...scene,id,updatedAt:new Date().toISOString()})
  if(!replay) {
    await transaction('readwrite',store=>store.add(copy),STORE,copy.version)
    return copy
  }
  if(replay.scene.id!==scene.id||replay.scene.version!==scene.version)throw new Error('回放不属于此实验。')
  const recording=decodeReplay({...replay,scene:{...replay.scene,id}})
  const db=await openDatabase(copy.version)
  try {
    await new Promise<void>((resolve,reject)=>{
      const tx=db.transaction([STORE,REPLAYS],'readwrite')
      tx.oncomplete=()=>resolve()
      tx.onabort=()=>reject(tx.error??new Error('导入实验备份已中断。'))
      tx.objectStore(STORE).add(copy)
      tx.objectStore(REPLAYS).add(recording,id)
    })
  } finally {db.close()}
  return copy
}

export async function saveReplay(scene:Experiment,replay:Replay) {
  const recording=decodeReplay(replay)
  const snapshot=decodeExperiment({...scene,updatedAt:new Date().toISOString()})
  if(recording.scene.id!==snapshot.id||recording.scene.version!==snapshot.version)throw new Error('回放不属于当前实验。')
  const db=await openDatabase(snapshot.version)
  try {
    return await new Promise<boolean>((resolve,reject)=>{
      const tx=db.transaction([STORE,REPLAYS],'readwrite')
      const scenes=tx.objectStore(STORE)
      const lookup=scenes.getKey(snapshot.id)
      let created=false
      lookup.onsuccess=()=>{
        if(lookup.result===undefined) {
          scenes.put(snapshot)
          created=true
        }
        tx.objectStore(REPLAYS).put(recording,snapshot.id)
      }
      tx.oncomplete=()=>resolve(created)
      tx.onabort=()=>reject(tx.error??new Error('回放保存已中断。'))
    })
  } finally {db.close()}
}

export async function deleteExperiment(id:string,scope?:StorageScope) {
  const scopes:StorageScope[]=scope===undefined||typeof scope==='number'?[1,2,3]:[scope]
  const results=await Promise.allSettled(scopes.map(async version=>{
    const db=await openDatabase(version)
    try {
      await new Promise<void>((resolve,reject)=>{
        const tx=db.transaction([STORE,REPLAYS],'readwrite')
        tx.objectStore(STORE).delete(id)
        tx.objectStore(REPLAYS).delete(id)
        tx.oncomplete=()=>resolve()
        tx.onabort=()=>reject(tx.error??new Error('删除操作已中断。'))
      })
    } finally {db.close()}
  }))
  const failure=results.find(result=>result.status==='rejected')
  if(failure?.status==='rejected')throw failure.reason
}
export async function duplicateExperiment(scene:SavedExperiment) {
  const title=scene.title.slice(0,96)+'（副本）', createdAt=new Date().toISOString()
  if('extension' in scene)return saveExtended({...scene,title,createdAt},true)
  if(isElectrostatic(scene))return saveElectrostatic({...scene,title,createdAt},true)
  if('domain' in scene)return saveAstronomy({...scene,title,createdAt},true)
  return saveExperiment({...scene,id:crypto.randomUUID(),title,createdAt})
}
export async function renameExperiment(id:string,title:string,scope?:StorageScope) {
  const resolved=scope??(await findRecord(id))?.version??1
  const db = await openDatabase(resolved)
  try {
    await new Promise<void>((resolve,reject) => {
      const tx = db.transaction(STORE,'readwrite')
      const store = tx.objectStore(STORE)
      const request = store.get(id)
      let validationError: unknown
      request.onsuccess = () => {
        try {
          if (!request.result) throw new Error('实验库中已找不到该实验。')
          const candidate={...request.result,title,updatedAt:new Date().toISOString()}
          store.put(decodeStored(resolved,candidate))
        } catch (error) { validationError = error; tx.abort() }
      }
      tx.oncomplete = () => resolve()
      tx.onabort = () => reject(validationError ?? tx.error ?? new Error('重命名操作已中断。'))
    })
  } finally { db.close() }
}
