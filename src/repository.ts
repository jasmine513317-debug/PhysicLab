import { decodeExperiment, type Experiment } from './model'
import { decodeReplay, type Replay } from './replay'

const STORE = 'experiments'
const REPLAYS = 'replays'
function openDatabase() {
  return new Promise<IDBDatabase>((resolve,reject) => {
    const request = indexedDB.open('physiclab',2)
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
async function transaction<T>(mode: IDBTransactionMode, operation: (store:IDBObjectStore)=>IDBRequest<T>, storeName=STORE) {
  const db = await openDatabase()
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
  const entries = await transaction('readonly',store=>store.getAll())
  return entries.map(decodeExperiment).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))
}
export async function loadExperiment(id:string) {
  const value = await transaction('readonly',store=>store.get(id))
  if (!value) throw new Error('实验库中已找不到该实验。')
  return decodeExperiment(value)
}
export async function saveExperiment(scene:Experiment) {
  const result = decodeExperiment({...scene,updatedAt:new Date().toISOString()})
  await transaction('readwrite',store=>store.put(result))
  return result
}
export async function loadReplay(id:string) {
  const value=await transaction('readonly',store=>store.get(id),REPLAYS)
  if(value===undefined)return
  return decodeReplay(value)
}

export async function saveReplay(scene:Experiment,replay:Replay) {
  const recording=decodeReplay(replay)
  const snapshot=decodeExperiment({...scene,updatedAt:new Date().toISOString()})
  if(recording.scene.id!==snapshot.id)throw new Error('回放不属于当前实验。')
  const db=await openDatabase()
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

export async function deleteExperiment(id:string) {
  const db=await openDatabase()
  try {
    await new Promise<void>((resolve,reject)=>{
      const tx=db.transaction([STORE,REPLAYS],'readwrite')
      tx.objectStore(STORE).delete(id)
      tx.objectStore(REPLAYS).delete(id)
      tx.oncomplete=()=>resolve()
      tx.onabort=()=>reject(tx.error??new Error('删除操作已中断。'))
    })
  } finally {db.close()}
}
export async function duplicateExperiment(scene:Experiment) {
  return saveExperiment({...scene,id:crypto.randomUUID(),title:scene.title.slice(0,96)+'（副本）',createdAt:new Date().toISOString()})
}
export async function renameExperiment(id:string,title:string) {
  const db = await openDatabase()
  try {
    await new Promise<void>((resolve,reject) => {
      const tx = db.transaction(STORE,'readwrite')
      const store = tx.objectStore(STORE)
      const request = store.get(id)
      let validationError: unknown
      request.onsuccess = () => {
        try {
          if (!request.result) throw new Error('实验库中已找不到该实验。')
          store.put(decodeExperiment({...request.result,title,updatedAt:new Date().toISOString()}))
        } catch (error) { validationError = error; tx.abort() }
      }
      tx.oncomplete = () => resolve()
      tx.onabort = () => reject(validationError ?? tx.error ?? new Error('重命名操作已中断。'))
    })
  } finally { db.close() }
}
