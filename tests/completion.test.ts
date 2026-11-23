import 'fake-indexeddb/auto'
import { expect, it } from 'vitest'
import { decodeExperiment } from '../src/model'
import { instantiate } from '../src/templates'
import { setInitialExtension, springGeometry } from '../src/springs'
import { Physics } from '../src/physics'
import { decodeReplay } from '../src/replay'
import { deleteExperiment, loadExperiment, loadReplay, saveReplay } from '../src/repository'
import { metrics } from '../src/analysis'


it('sets spring displacement along the rotated anchors while preserving rest length',()=>{
  const scene=instantiate('spring')
  const [b,a]=scene.bodies
  const spring={...scene.joints[0],anchorB:{x:.3,y:.1}}
  const rotated={...b,angle:Math.PI/3}
  const moved=setInitialExtension(a,rotated,spring,-.7)
  expect(moved.id).toBe(b.id)
  expect(moved.angle).toBe(rotated.angle)
  expect(springGeometry(a,moved,spring).length).toBeCloseTo(spring.restLength-.7,9)
  const reversed={...spring,a:b.id,b:a.id,anchorA:spring.anchorB,anchorB:spring.anchorA}
  const movedA=setInitialExtension(rotated,a,reversed,1.25)
  expect(movedA.id).toBe(b.id)
  expect(springGeometry(movedA,a,reversed).length).toBeCloseTo(spring.restLength+1.25,9)
})

it('captures actual poses and a terminal step without altering chart sampling',()=>{
  const scene=instantiate('collision'),lab=new Physics(scene)
  expect(lab.captureReplay(scene)).toBeUndefined()
  for(let i=0;i<9;i++)lab.step()
  const replay=lab.captureReplay(scene)!
  const [id,samples]=replay.tracks[0]
  expect(samples.map(s=>s.time)).toEqual([0,4/60,8/60,9/60])
  expect(samples.at(-1)?.x).toBe(lab.bodies.get(id)?.getPosition().x)
  expect(samples.at(-1)?.angle).toBe(lab.bodies.get(id)?.getAngle())
  expect(lab.samples.get(id)).toHaveLength(3)
  expect(decodeReplay(replay)).toEqual(replay)
  const [trackA,[other,trackB]]=replay.tracks
  expect(()=>decodeReplay({...replay,tracks:[trackA,[other,trackB.slice(1)]]})).toThrow('不匹配')
  expect(metrics(samples,'collision')['Final velocity X']).toBe('4.00 m/s')
  expect(metrics(samples,'collision')['Final velocity Y']).toBe('0.00 m/s')
})

it('upgrades a version 1 library, stores recordings independently, and removes them with the experiment',async()=>{
  const scene=instantiate('projectile'),lab=new Physics(scene)
  lab.step()
  const replay=lab.captureReplay(scene)!
  const oldScene={...scene,title:'已保存场景'}
  await new Promise<void>((resolve,reject)=>{
    const request=indexedDB.open('physiclab',1)
    request.onupgradeneeded=()=>request.result.createObjectStore('experiments',{keyPath:'id'}).put(oldScene)
    request.onerror=()=>reject(request.error)
    request.onsuccess=()=>{request.result.close();resolve()}
  })
  const saved=await loadExperiment(scene.id)
  expect(saved).toEqual(oldScene)
  expect(await saveReplay({...scene,title:'草稿标题'},replay)).toBe(false)
  expect(await loadExperiment(scene.id)).toEqual(saved)
  expect(await loadReplay(scene.id)).toEqual(replay)
  await deleteExperiment(scene.id)
  expect(await loadReplay(scene.id)).toBeUndefined()
  expect(await saveReplay(scene,replay)).toBe(true)
  expect((await loadExperiment(scene.id)).id).toBe(scene.id)
  expect(await loadReplay(scene.id)).toEqual(replay)
})

it('applies configured world boundaries and preserves the switch for unbounded scenes',()=>{
  const scene=instantiate('collision')
  scene.bodies=scene.bodies.slice(0,1)
  const moving=scene.bodies[0]
  moving.position={x:0,y:0}
  scene.environment={...scene.environment,boundaries:true,worldBounds:{minX:-2,maxX:1,minY:-2,maxY:2}}
  const bounded=new Physics(scene)
  const unbounded=new Physics({...scene,environment:{...scene.environment,boundaries:false}})
  for(let i=0;i<45;i++){bounded.step();unbounded.step()}
  expect(bounded.bodies.get(moving.id)!.getPosition().x).toBeLessThan(.5)
  expect(unbounded.bodies.get(moving.id)!.getPosition().x).toBeCloseTo(3,8)
  expect(()=>decodeExperiment({...scene,environment:{...scene.environment,worldBounds:{minX:1,maxX:-1,minY:-2,maxY:2}}})).toThrow('边界')
})
