import { describe, expect, it } from 'vitest'
import { body, emptyExperiment } from '../src/model'
import { Physics } from '../src/physics'
import { decodeReplay } from '../src/replay'

function isolatedBody() {
  const scene=emptyExperiment()
  scene.environment={...scene.environment,gravity:0,collisions:false,boundaries:false}
  const target=body('物体',{kind:'circle',radius:.2},0,0,{mass:2})
  scene.bodies=[target]
  const physics=new Physics(scene)
  const velocity=()=>physics.bodies.get(target.id)!.getLinearVelocity().x
  const step=(count:number)=>{for(let i=0;i<count;i++)physics.step()}
  return {scene,target,physics,velocity,step}
}

describe('fixed-step interventions',()=>{
  it('applies a timed force on start-inclusive, end-exclusive ticks',()=>{
    const {physics,target,velocity,step}=isolatedBody()
    physics.schedule(target.id,{kind:'timed',vector:{x:12,y:0},start:1/60,end:3/60})
    expect(physics.externalForceApplied).toBe(false)
    step(1)
    expect(velocity()).toBe(0)
    step(2)
    expect(velocity()).toBeCloseTo(.2,10)
    step(5)
    expect(velocity()).toBeCloseTo(.2,10)
    expect(physics.interventions).toHaveLength(1)
  })

  it('applies an impulse exactly once and records its change in momentum',()=>{
    const {physics,scene,target,velocity,step}=isolatedBody()
    physics.schedule(target.id,{kind:'impulse',vector:{x:6,y:0}})
    step(8)
    expect(velocity()).toBeCloseTo(3,10)
    const replay=decodeReplay(physics.captureReplay(scene))
    expect(replay.interventions?.[0]).toMatchObject({tick:0,time:0,velocityBefore:{x:0,y:0},velocityAfter:{x:3,y:0}})
  })

  it('restores pre-edit and post-edit physical states from timelines',()=>{
    const {physics,scene,target,velocity,step}=isolatedBody()
    physics.setForce(target.id,{x:4,y:0})
    step(12)
    const before=physics.timeline()
    physics.schedule(target.id,{kind:'velocity',vector:{x:7,y:0}})
    step(6)
    const after=physics.timeline()
    const undo=Physics.restoreTimeline(scene,before)
    const redo=Physics.restoreTimeline(scene,after)
    expect(undo.bodies.get(target.id)!.getLinearVelocity().x).toBeCloseTo(.4,10)
    expect(redo.bodies.get(target.id)!.getLinearVelocity().x).toBe(velocity())
    expect(redo.captureReplay(scene)).toEqual(physics.captureReplay(scene))
  })

  it('rejects non-finite vectors, unknown bodies and expired intervals',()=>{
    const {physics,target,step}=isolatedBody()
    step(2)
    expect(()=>physics.setForce(target.id,{x:Infinity,y:0})).toThrow()
    expect(()=>physics.setForce('missing',{x:1,y:0})).toThrow()
    expect(()=>physics.schedule(target.id,{kind:'timed',vector:{x:1,y:0},start:0,end:1/60})).toThrow()
    expect(physics.timeline().events).toEqual([])
  })

  it('solves a strict acceleration target against directional gravity',()=>{
    const {scene,target}=isolatedBody()
    const engine=new Physics({...scene,environment:{...scene.environment,gravity:10,gravityAngle:0}})
    engine.schedule(target.id,engine.inputForNetForce(target.id,{x:0,y:3},'acceleration'))
    engine.step()
    expect(engine.acceleration.get(target.id)?.x).toBeCloseTo(0,10)
    expect(engine.acceleration.get(target.id)?.y).toBeCloseTo(3,10)
  })

  it('solves the next step with drag and collision detection enabled while airborne',()=>{
    const {scene,target}=isolatedBody()
    target.velocity={x:6,y:-2}
    const engine=new Physics({...scene,environment:{...scene.environment,gravity:10,collisions:true,linearDrag:3}})
    engine.schedule(target.id,engine.inputForNetForce(target.id,{x:-2,y:3},'acceleration'))
    engine.step()
    expect(engine.acceleration.get(target.id)?.x).toBeCloseTo(-2,10)
    expect(engine.acceleration.get(target.id)?.y).toBeCloseTo(3,10)
  })

  it('bounds the force on a charged body passing arbitrarily close to a planar field source',()=>{
    const {scene,target}=isolatedBody()
    target.charge=100
    const source=body('场源',{kind:'circle',radius:.1},1e-100,0,{type:'static',role:'field',charge:100})
    const engine=new Physics({...scene,version:3,bodies:[target,source]})
    const field=engine.electricField(target.id)
    expect(field.x).toBeLessThan(0)
    expect(field.x).toBeGreaterThan(-1e-85)
    engine.step()
    expect(engine.bodies.get(target.id)?.getLinearVelocity().x).toBeLessThan(0)
  })

  it.each([.001,100000])('advances a supported extreme mass of %s kg with zero initial velocity and impulse',mass=>{
    const {scene,target}=isolatedBody()
    target.mass=mass
    const engine=new Physics(scene)
    engine.schedule(target.id,{kind:'impulse',vector:{x:0,y:0}})
    engine.step()
    expect(engine.bodies.get(target.id)?.getLinearVelocity()).toMatchObject({x:0,y:0})
    engine.setForce(target.id,{x:mass*.01,y:0})
    for(let i=0;i<60;i++)engine.step()
    expect(engine.bodies.get(target.id)?.getLinearVelocity().x).toBeCloseTo(.01,10)
    expect(engine.lastImpulse(target.id)).toBeUndefined()
  })
})
