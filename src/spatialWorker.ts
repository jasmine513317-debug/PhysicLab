import { equipotentialSurface,spaceFieldLines } from './spatialFields'
import { initializeSpatialRigid } from './spatialRigid'
import { SpatialPhysics,type SpatialRun,type SpatialSample,type SpatialScene,type Vec3 } from './spatialPhysics'

type Request={id:number}&(
  {kind:'prediction';snapshot:SpatialRun}
  |{kind:'fields';scene:SpatialScene;center:Vec3;extent:number;lines:boolean;surface:boolean;level:number}
)
export type SpatialWorkerRequest=Request extends infer R?R extends {id:number}?Omit<R,'id'>:never:never
export type SpatialWorkerReply={id:number}&(
  {kind:'prediction';forecast:Map<string,SpatialSample[]>}
  |{kind:'fields';lines?:Vec3[][];faces?:Vec3[][]}
  |{kind:'error';error:string}
)

self.onmessage=async(event:MessageEvent<Request>)=>{
  const task=event.data
  let engine:SpatialPhysics|undefined
  try {
    if(task.kind==='prediction') {
      if(task.snapshot.rigidSnapshot||task.snapshot.initial.rigid||task.snapshot.initial.bodies.some(body=>body.geometry)||task.snapshot.initial.pivots?.length)
        await initializeSpatialRigid()
      engine=SpatialPhysics.restore(task.snapshot)
      self.postMessage({id:task.id,kind:'prediction',forecast:engine.prediction()} satisfies SpatialWorkerReply)
    } else {
      engine=new SpatialPhysics(task.scene)
      const lines=task.lines?spaceFieldLines(engine,task.center,task.extent):undefined
      const faces=task.surface?equipotentialSurface(engine,task.center,task.extent,task.level):undefined
      self.postMessage({id:task.id,kind:'fields',lines,faces} satisfies SpatialWorkerReply)
    }
  } catch(error) {
    self.postMessage({id:task.id,kind:'error',error:error instanceof Error?error.message:String(error)} satisfies SpatialWorkerReply)
  } finally {engine?.dispose()}
}
