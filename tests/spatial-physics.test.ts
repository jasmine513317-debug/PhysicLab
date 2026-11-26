import { describe, expect, it } from 'vitest'
import { add, cross, emptySpatialScene, length, multiply, rotateSpatialVector, SpatialPhysics, spatialObject, subtract, type Vec3 } from '../src/spatialPhysics'
import { projectSpatialExperiment } from '../src/spatialConversion'

describe('spatial solvers',()=>{
  it('matches constant acceleration on all three axes',()=>{
    const object={...spatialObject(),position:[0,0,0] as Vec3,velocity:[1,2,3] as Vec3}
    const engine=new SpatialPhysics({...emptySpatialScene(),gravity:[2,-4,6],bodies:[object]})
    for(let i=0;i<60;i++)engine.step()
    engine.bodies[0].position.forEach((value,i)=>expect(value).toBeCloseTo([2,0,6][i],10))
    engine.bodies[0].velocity.forEach((value,i)=>expect(value).toBeCloseTo([3,-2,9][i],10))
  })

  it('preserves speed and the axial component of a magnetic helix',()=>{
    const object={...spatialObject(),charge:1,velocity:[2,0,1] as Vec3}
    const engine=new SpatialPhysics({...emptySpatialScene(),gravity:[0,0,0],magnetic:[0,0,2],bodies:[object]})
    for(let i=0;i<600;i++)engine.step()
    const live=engine.bodies[0]
    expect(length(live.velocity)).toBeCloseTo(Math.sqrt(5),10)
    expect(live.position[2]).toBeCloseTo(10,10)
  })

  it('conserves momentum and kinetic energy in oblique elastic sphere contact',()=>{
    const a={...spatialObject(),mass:2,position:[-1,0,-.4] as Vec3,velocity:[4,0,1] as Vec3,restitution:1}
    const b={...spatialObject(),mass:3,position:[1,0,.4] as Vec3,velocity:[-2,0,-1] as Vec3,restitution:1}
    const engine=new SpatialPhysics({...emptySpatialScene(),gravity:[0,0,0],bodies:[a,b]})
    const momentum=add(multiply(a.velocity,a.mass),multiply(b.velocity,b.mass))
    const energy=(a.mass*length(a.velocity)**2+b.mass*length(b.velocity)**2)/2
    for(let i=0;i<60;i++)engine.step()
    const [p,q]=engine.bodies
    const after=add(multiply(p.velocity,p.mass),multiply(q.velocity,q.mass))
    expect(p.velocity[0]).not.toBe(a.velocity[0])
    after.forEach((v,i)=>expect(v).toBeCloseTo(momentum[i],10))
    expect((p.mass*length(p.velocity)**2+q.mass*length(q.velocity)**2)/2).toBeCloseTo(energy,10)
  })

  it('predicts independently and retains a bounded history',()=>{
    const body=spatialObject()
    const engine=new SpatialPhysics({...emptySpatialScene(),bodies:[body]})
    const forecast=engine.prediction(240)
    expect(forecast.get(body.id)?.at(-1)?.time).toBe(4)
    expect(engine.time).toBe(0)
    expect(engine.history.get(body.id)).toHaveLength(1)
    for(let i=0;i<7500;i++)engine.step()
    expect(engine.history.get(body.id)!.length).toBeLessThanOrEqual(1800)
  })

  it('continues from a serialized checkpoint with identical coordinates and rotation',()=>{
    const object={...spatialObject(),angularVelocity:[0,0,Math.PI/2] as Vec3}
    const engine=new SpatialPhysics({...emptySpatialScene(),bodies:[object]})
    for(let i=0;i<60;i++)engine.step()
    const marked=rotateSpatialVector([1,0,0],engine.bodies[0].orientation)
    expect(marked[0]).toBeCloseTo(0,10)
    expect(marked[1]).toBeCloseTo(1,10)
    const restored=SpatialPhysics.restore(JSON.parse(JSON.stringify(engine.capture())))
    expect(restored.capture()).toEqual(engine.capture())
    for(let i=0;i<90;i++){engine.step();restored.step()}
    expect(restored.capture()).toEqual(engine.capture())
  })

  it('preserves spatial angular momentum over a two-body orbit',()=>{
    const mass=1e11,d=6,speed=Math.sqrt(6.6743e-11*mass/(2*d))
    const a={...spatialObject(),mass,position:[-d/2,0,0] as Vec3,velocity:[0,.6*speed,.8*speed] as Vec3}
    const b={...spatialObject(),mass,position:[d/2,0,0] as Vec3,velocity:multiply(a.velocity,-1)}
    const engine=new SpatialPhysics({...emptySpatialScene(),gravity:[0,0,0],mutualGravity:true,collisions:false,bodies:[a,b]})
    const momentum=()=>length(engine.bodies.reduce((sum,p)=>add(sum,cross(p.position,multiply(p.velocity,p.mass))),[0,0,0] as Vec3))
    const energy=()=>{
      const [a,b]=engine.bodies
      const kinetic=.5*mass*(length(a.velocity)**2+length(b.velocity)**2)
      return kinetic-6.6743e-11*mass**2/Math.hypot(length(subtract(a.position,b.position)),.01)
    }
    const l=momentum(),e=energy()
    for(let i=0;i<1800;i++)engine.step()
    expect(Math.abs(momentum()/l-1)).toBeLessThan(.001)
    expect(Math.abs(energy()/e-1)).toBeLessThan(.001)
  })

  it('creates detached projection and section files',()=>{
    const object={...spatialObject(),radius:1,position:[1,2,.6] as Vec3,velocity:[3,4,5] as Vec3}
    const engine=new SpatialPhysics({...emptySpatialScene(),bodies:[object]})
    const projection=projectSpatialExperiment(engine,'xy')
    const section=projectSpatialExperiment(engine,'xy',0)
    expect(projection.bodies[0]).toMatchObject({position:{x:1,y:2},velocity:{x:3,y:4},geometry:{kind:'circle',radius:1}})
    expect(section.bodies[0].geometry).toEqual({kind:'circle',radius:.8})
    expect(projectSpatialExperiment(engine,'xy',3).bodies).toHaveLength(0)
    expect(engine.bodies[0].position).toEqual([1,2,.6])
  })
})
