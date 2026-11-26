import { beforeAll,expect,it } from 'vitest'
import { body,emptyExperiment } from '../src/model'
import { Physics } from '../src/physics'
import { liftPlanarExperiment,projectSpatialExperiment } from '../src/spatialConversion'
import { initializeSpatialRigid } from '../src/spatialRigid'
import { add,inductionMeasurements,length,multiply,rotateSpatialVector,SpatialPhysics,spatialObject,emptySpatialScene,subtract,type Vec3 } from '../src/spatialPhysics'
import { workspaceSchema } from '../src/spatialWorkspace'
import { equipotentialSurface,spaceFieldLines,spatialField } from '../src/spatialFields'
import { orbitInclination,spatialPreset,withOrbitInclination } from '../src/spatialTemplates'

beforeAll(initializeSpatialRigid)

it('lifts a moving rectangle without adding a third velocity component and sections its shape',()=>{
  const block=body('立方体',{kind:'rectangle',width:2,height:1},0,3,{velocity:{x:1,y:1}})
  const scene={...emptyExperiment(),bodies:[block]}
  const solver=new Physics(scene)
  for(let i=0;i<9;i++)solver.step()
  const state=liftPlanarExperiment(scene,solver)
  expect(state.unsupported).toEqual([])
  expect(state.scene?.source?.time).toBe(.15)
  const object=state.scene!.bodies[0]
  expect(object.velocity[2]).toBe(0)
  expect(object.geometry).toEqual({kind:'box',size:[2,1,.8]})
  const restored=new SpatialPhysics(state.scene!)
  const section=projectSpatialExperiment(restored,'xy',0)
  expect(section.bodies[0].geometry).toEqual({kind:'polygon',vertices:[{x:-1,y:-.5},{x:1,y:-.5},{x:1,y:.5},{x:-1,y:.5}]})
  expect(section.bodies[0].velocity.x).toBe(solver.bodies.get(block.id)!.getLinearVelocity().x)
})

it('applies a force and finite-duration increment at the prescribed ticks after restoration',()=>{
  const object={...spatialObject(),mass:2}
  const engine=new SpatialPhysics({...emptySpatialScene(),gravity:[0,0,0],bodies:[object]})
  engine.schedule(object.id,{kind:'force',value:[6,0,0]})
  engine.schedule(object.id,{kind:'timed',value:[0,4,0],steps:20})
  for(let i=0;i<8;i++)engine.step()
  engine.schedule(object.id,{kind:'impulse',value:[0,0,6]})
  const clone=SpatialPhysics.restore(JSON.parse(JSON.stringify(engine.capture())))
  for(let i=8;i<60;i++){engine.step();clone.step()}
  expect(clone.state()).toEqual(engine.state())
  expect(clone.interventions.at(-1)?.before?.[2]).toBe(0)
  expect(clone.interventions.at(-1)?.after?.[2]).toBe(3)
  expect(engine.bodies[0].velocity[0]).toBeCloseTo(3,10)
  expect(engine.bodies[0].velocity[1]).toBeCloseTo(2/3,10)
})

it('validates that a cross-dimensional workspace preserves both timelines and camera',()=>{
  const scene=emptyExperiment()
  const spatial=new SpatialPhysics(spatialPreset('fall'))
  spatial.step()
  const json={
    kind:'physiclab-unified-workspace',version:1,planar:{scene,timeline:{tick:123,events:[]}},
    spatial:spatial.capture(),view:{camera:{yaw:.5,pitch:.4,distance:15,focus:[1,2,3],mode:'xy'},
      trail:'both',trailWindow:30,vectors:true,color:'#aaaaaa',alpha:.7,markers:true},
  }
  const workspace=workspaceSchema.parse(JSON.parse(JSON.stringify(json)))
  expect(Physics.restoreTimeline(workspace.planar.scene,workspace.planar.timeline).time).toBeCloseTo(123/60,10)
  expect(SpatialPhysics.restore(workspace.spatial).time).toBe(1/60)
  expect(workspace.view.camera.mode).toBe('xy')
  expect(workspace.view.camera.focus).toEqual([1,2,3])
})

it('samples fields generated from the same potential and obtains a level surface',()=>{
  const charged={...spatialObject(),charge:1e-6,fixed:true,position:[0,0,0] as Vec3}
  const engine=new SpatialPhysics({...emptySpatialScene(),mutualElectric:true,bodies:[charged]})
  const at=spatialField([charged],[1,0,0]),plus=spatialField([charged],[1.00001,0,0]),minus=spatialField([charged],[.99999,0,0])
  expect((minus.potential-plus.potential)/.00002).toBeCloseTo(at.field[0],3)
  expect(spaceFieldLines(engine,[0,0,0],3)).toHaveLength(10)
  const faces=equipotentialSurface(engine,[0,0,0],4,at.potential)
  expect(faces.length).toBeGreaterThan(30)
  const error=Math.max(...faces.flat().map(v=>Math.abs(length(v)-1)))
  expect(error).toBeLessThan(.035)
})

it('implements Faraday sign and advances a particle in the induced field',()=>{
  const scene=spatialPreset('induction')
  const zero=inductionMeasurements(scene,0)!,later=inductionMeasurements(scene,2)!
  expect(-(later.flux-zero.flux)/2).toBeCloseTo(zero.emf,12)
  expect(zero.emf).toBeLessThan(0)
  const engine=new SpatialPhysics(scene)
  engine.step()
  expect(engine.bodies[0].velocity[2]).toBeGreaterThan(0)
})

it.each(['fall','throw','spring','rigid','pendulum','double','incline','surface','helix','electric','induction','orbit','three','escape','assist'])(
  'starts, advances and restores the %s workbench template',name=>{
    const engine=new SpatialPhysics(spatialPreset(name))
    let copy:SpatialPhysics|undefined
    try {
      for(let i=0;i<30;i++)engine.step()
      copy=SpatialPhysics.restore(JSON.parse(JSON.stringify(engine.capture())))
      copy.step();engine.step()
      expect(copy.state()).toEqual(engine.state())
    } finally {copy?.dispose();engine.dispose()}
  })

it.each([['throw',90],['fall',60]] as const)('matches the %s template before ground contact on each axis',(name,steps)=>{
  const scene=spatialPreset(name),initial=scene.bodies[0]
  const engine=new SpatialPhysics(scene)
  for(let i=0;i<steps;i++)engine.step()
  const body=engine.bodies[0],time=engine.time
  body.position.forEach((value,i)=>expect(value).toBeCloseTo(initial.position[i]+initial.velocity[i]*time+scene.gravity[i]*time**2/2,9))
  body.velocity.forEach((value,i)=>expect(value).toBeCloseTo(initial.velocity[i]+scene.gravity[i]*time,9))
})

it('holds both spherical joints in the default spatial double pendulum',()=>{
  const engine=new SpatialPhysics(spatialPreset('double'))
  try {
    for(let i=0;i<240;i++) {
      engine.step()
      for(const pivot of engine.scene.pivots!) {
        const [a,b]=[pivot.a,pivot.b].map(id=>engine.bodies.find(body=>body.id===id)!)
        const before=add(a.position,rotateSpatialVector(pivot.anchorA,a.orientation))
        const after=add(b.position,rotateSpatialVector(pivot.anchorB,b.orientation))
        expect(length(subtract(after,before))).toBeLessThan(.025)
      }
    }
  } finally {engine.dispose()}
})

it('maintains the three mutual spacings of the spatial equilateral solution',()=>{
  const engine=new SpatialPhysics(spatialPreset('three'))
  for(let i=0;i<600;i++) {
    engine.step()
    for(let body=0;body<3;body++) {
      const gap=length(subtract(engine.bodies[body].position,engine.bodies[(body+1)%3].position))
      expect(Math.abs(gap/(2.4*Math.sqrt(3))-1)).toBeLessThan(.0001)
    }
  }
})

it('reproduces the period and energy of a one-dimensional spatial spring',()=>{
  const anchor={...spatialObject(),fixed:true,position:[0,0,0] as Vec3}
  const actor={...spatialObject(),mass:2,position:[1.3,0,0] as Vec3}
  const k=8,period=2*Math.PI/Math.sqrt(k/actor.mass)
  const engine=new SpatialPhysics({...emptySpatialScene(),gravity:[0,0,0],collisions:false,bodies:[anchor,actor],
    springs:[{id:'spring',a:anchor.id,b:actor.id,stiffness:k,restLength:1,damping:0}]})
  for(let i=0;i<Math.round(period*60);i++)engine.step()
  const live=engine.bodies[1]
  const energy=.5*actor.mass*length(live.velocity)**2+.5*k*(live.position[0]-1)**2
  expect(live.position[0]).toBeCloseTo(1.3,3)
  expect(Math.abs(energy/(.5*k*.3**2)-1)).toBeLessThan(.005)
})

it('returns near the initial point after one analytic elliptic period and classifies escape',()=>{
  const ellipse=spatialPreset('orbit'),engine=new SpatialPhysics(ellipse)
  const mu=6.6743e-11*(ellipse.bodies[0].mass+ellipse.bodies[1].mass)
  const period=2*Math.PI*Math.sqrt(7**3/mu)
  for(let i=0;i<Math.round(period*60);i++)engine.step()
  expect(length(subtract(engine.bodies[0].position,ellipse.bodies[0].position))).toBeLessThan(.02)
  const escape=new SpatialPhysics(spatialPreset('escape'))
  for(let i=0;i<240;i++)escape.step()
  expect(length(subtract(escape.bodies[0].position,escape.bodies[1].position))).toBeGreaterThan(7)
})

it('changes inclination while preserving relative separation, speed and barycentric motion',()=>{
  const scene=spatialPreset('orbit')
  scene.bodies[0].mass*=3
  scene.bodies[0].velocity=add(scene.bodies[0].velocity,[1,2,3])
  const [a,b]=scene.bodies
  for(const degrees of [0,45,90,180]) {
    const transformed=withOrbitInclination(scene,degrees)
    const [p,q]=transformed.bodies
    expect(orbitInclination(transformed)?.radians).toBeCloseTo(degrees*Math.PI/180,7)
    expect(length(subtract(p.position,q.position))).toBeCloseTo(length(subtract(a.position,b.position)),12)
    expect(length(subtract(p.velocity,q.velocity))).toBeCloseTo(length(subtract(a.velocity,b.velocity)),12)
    for(const key of ['position','velocity'] as const) {
      const center=(left:typeof a,right:typeof b)=>add(left[key],multiply(subtract(right[key],left[key]),.25))
      expect(length(subtract(center(a,b),center(p,q)))).toBeLessThan(1e-12)
    }
  }
})

it('records a spatial flyby gain in the central frame and comparable speeds at the same sphere in the moving frame',()=>{
  const engine=new SpatialPhysics(spatialPreset('assist'))
  let previous:number|undefined,entry:[number,number]|undefined,exit:[number,number]|undefined
  for(let i=0;i<120&&!exit;i++) {
    engine.step()
    const [central,planet,probe]=engine.bodies
    const r=length(subtract(probe.position,planet.position))
    const sample:[number,number]=[length(subtract(probe.velocity,central.velocity)),length(subtract(probe.velocity,planet.velocity))]
    if(previous!==undefined) {
      if(previous>=2&&r<2)entry=sample
      if(previous<2&&r>=2)exit=sample
    }
    previous=r
  }
  expect(entry).toBeDefined()
  expect(exit).toBeDefined()
  expect(exit![0]-entry![0]).toBeGreaterThan(8)
  expect(Math.abs(exit![1]-entry![1])).toBeLessThan(.5)
})
