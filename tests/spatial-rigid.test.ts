import { beforeAll,describe,expect,it } from 'vitest'
import { initializeSpatialRigid } from '../src/spatialRigid'
import { dot,emptySpatialScene,length,rotateSpatialVector,SpatialPhysics,spatialObject,subtract,type Vec3 } from '../src/spatialPhysics'
import { extrudeContour,revolveProfile,spatialRibbon } from '../src/spatialGeometry'
import { spatialPreset } from '../src/spatialTemplates'

beforeAll(initializeSpatialRigid)
const advance=(engine:SpatialPhysics,steps:number)=>{for(let i=0;i<steps;i++)engine.step()}

describe('Rapier spatial rigid bodies',()=>{
  it('rolls downhill with the correct contact height and rolling speed on the template incline',()=>{
    const engine=new SpatialPhysics(spatialPreset('incline'))
    try {
      advance(engine,60)
      const [ramp,ball]=engine.bodies,normal=rotateSpatialVector([0,1,0],ramp.orientation)
      expect(ball.position[0]).toBeGreaterThan(-2)
      expect(dot(subtract(ball.position,ramp.position),normal)).toBeCloseTo(ball.radius+.04,2)
      expect(Math.abs(dot(ball.velocity,normal))).toBeLessThan(.06)
      expect(Math.abs(length(ball.velocity)-ball.radius*length(ball.angularVelocity))).toBeLessThan(.06)
    } finally {engine.dispose()}
  })

  it('contacts the curved template above ground and is deflected out of its initial plane',()=>{
    const engine=new SpatialPhysics(spatialPreset('surface'))
    try {
      advance(engine,45)
      const ball=engine.bodies[1]
      expect(ball.position[0]).toBeGreaterThan(-2.2)
      expect(ball.position[1]).toBeGreaterThan(1)
      expect(Math.abs(ball.position[2])).toBeGreaterThan(.2)
      expect(Math.abs(ball.velocity[2])).toBeGreaterThan(.5)
    } finally {engine.dispose()}
  })

  it('rests a cuboid on the ground and dissipates sliding speed through friction',()=>{
    const body={...spatialObject(),position:[0,2,0] as Vec3,velocity:[2,0,0] as Vec3,friction:.8,restitution:0,
      geometry:{kind:'box' as const,size:[1,1,1] as Vec3}}
    const engine=new SpatialPhysics({...emptySpatialScene(),ground:true,bodies:[body]})
    try {
      advance(engine,210)
      expect(engine.bodies[0].position[1]).toBeCloseTo(.5,2)
      expect(Math.abs(engine.bodies[0].velocity[0])).toBeLessThan(.04)
    } finally {engine.dispose()}
  })

  it('maintains the two attachment points of a spatial ball joint',()=>{
    const a={...spatialObject(),fixed:true,position:[0,4,0] as Vec3}
    const b={...spatialObject(),position:[0,2,0] as Vec3,velocity:[2,0,.7] as Vec3}
    const engine=new SpatialPhysics({...emptySpatialScene(),collisions:false,bodies:[a,b],
      pivots:[{id:'joint',a:a.id,b:b.id,anchorA:[0,0,0],anchorB:[0,2,0]}]})
    try {
      advance(engine,240)
      const live=engine.bodies[1]
      const offset=rotateSpatialVector([0,2,0],live.orientation)
      expect(length(subtract(subtract(a.position,live.position),offset))).toBeLessThan(.012)
      expect(Math.abs(live.position[2])).toBeGreaterThan(.01)
    } finally {engine.dispose()}
  })

  it('replays a contacting box from native solver state with identical motion',()=>{
    const body={...spatialObject(),position:[0,2.1,0] as Vec3,angularVelocity:[.8,.3,.4] as Vec3,
      geometry:{kind:'box' as const,size:[.7,.9,.8] as Vec3}}
    const engine=new SpatialPhysics({...emptySpatialScene(),ground:true,bodies:[body]})
    let restored:SpatialPhysics|undefined
    try {
      advance(engine,95)
      restored=SpatialPhysics.restore(JSON.parse(JSON.stringify(engine.capture())))
      advance(engine,80);advance(restored,80)
      expect(restored.state()).toEqual(engine.state())
      expect([...restored.history]).toEqual([...engine.history])
    } finally {restored?.dispose();engine.dispose()}
  })

  it('builds valid convex proxies for extrusion and revolution, and a static ribbon',()=>{
    const bodies=[
      {...spatialObject(),geometry:extrudeContour([{x:-1,y:-1},{x:1,y:-1},{x:1,y:1},{x:-1,y:1}],.5)},
      {...spatialObject(),position:[4,3,0] as Vec3,geometry:revolveProfile([{x:.4,y:-1},{x:.8,y:0},{x:.4,y:1}])},
      {...spatialObject(),position:[0,0,0] as Vec3,fixed:true,geometry:spatialRibbon([[-3,.5,0],[0,0,1],[3,.5,2]],1)},
    ]
    const engine=new SpatialPhysics({...emptySpatialScene(),bodies})
    try {
      engine.step()
      expect(engine.usesRigidSolver).toBe(true)
      expect(engine.bodies[0].position[1]).toBeLessThan(3)
    } finally {engine.dispose()}
  })
})
