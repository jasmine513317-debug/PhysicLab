import { describe, expect, it } from 'vitest'
import { displayPoint, normalizeAngle, polarComponents, polarPosition, screenPoint, shortestAngleDelta, worldFromDisplay, worldPoint } from '../src/coordinates'
import { body, decodeExperiment, defaultCoordinates, emptyExperiment } from '../src/model'
import { Physics } from '../src/physics'

const camera={x:1,y:2,scale:80},view={width:640,height:400}

describe('world, display and screen coordinates',()=>{
  it('separates the movable measurement origin from the viewport center',()=>{
    const world={x:3,y:4},origin={x:1,y:2}
    expect(displayPoint(world,origin)).toEqual({x:2,y:2})
    expect(worldFromDisplay({x:2,y:2},origin)).toEqual(world)
    const screen=screenPoint(world,camera,view)
    expect(screen).toEqual({x:480,y:40})
    expect(worldPoint(screen,camera,view)).toEqual(world)
    expect(screenPoint(worldFromDisplay(displayPoint(world,{x:-4,y:7}),{x:-4,y:7}),camera,view)).toEqual(screen)
  })

  it('keeps the world point under the cursor fixed while zooming',()=>{
    const world={x:3,y:4},screen=screenPoint(world,camera,view)
    const movedOrigin={x:9,y:-3}
    expect(screenPoint(worldFromDisplay(displayPoint(world,movedOrigin),movedOrigin),camera,view)).toEqual(screen)
  })
})

describe('polar coordinates',()=>{
  it('reports radius and a normalized counterclockwise angle',()=>{
    expect(polarPosition({x:1,y:0},{x:0,y:0})).toEqual({r:1,theta:0})
    expect(polarPosition({x:0,y:1},{x:0,y:0})).toEqual({r:1,theta:Math.PI/2})
    expect(polarPosition({x:-1,y:0},{x:0,y:0})).toEqual({r:1,theta:Math.PI})
    expect(polarPosition({x:0,y:-1},{x:0,y:0})).toEqual({r:1,theta:3*Math.PI/2})
    expect(polarPosition({x:2,y:2},{x:1,y:1})).toEqual({r:Math.sqrt(2),theta:Math.PI/4})
  })

  it('leaves theta undefined at the origin and resolves angular wrapping',()=>{
    expect(polarPosition({x:0,y:0},{x:0,y:0})).toEqual({r:0,theta:undefined})
    expect(normalizeAngle(-Math.PI/2)).toBeCloseTo(3*Math.PI/2,12)
    expect(normalizeAngle(2*Math.PI)).toBe(0)
    expect(shortestAngleDelta(3*Math.PI/2,Math.PI/2)).toBeCloseTo(-Math.PI,12)
    expect(shortestAngleDelta(Math.PI/2,3*Math.PI/2)).toBeCloseTo(Math.PI,12)
  })

  it('projects world velocity without changing its magnitude or direction',()=>{
    const origin={x:1,y:1},position={x:3,y:1},velocity={x:0,y:2}
    expect(polarComponents(position,velocity,origin)).toEqual({radial:0,tangential:2})
    expect(polarComponents({x:1,y:1},velocity,origin)).toBeUndefined()
    const diagonal=polarComponents({x:2,y:2},{x:3,y:4},origin)!
    expect(diagonal.radial).toBeCloseTo(7/Math.sqrt(2),12)
    expect(diagonal.tangential).toBeCloseTo(1/Math.sqrt(2),12)
    expect(Math.hypot(diagonal.radial,diagonal.tangential)).toBeCloseTo(5,12)
  })
})

describe('coordinate configuration and physical isolation',()=>{
  it('defaults legacy scenes to Cartesian coordinates and validates saved display settings',()=>{
    const legacy=emptyExperiment()
    expect(defaultCoordinates).toEqual({mode:'cartesian',origin:{x:0,y:0}})
    expect(decodeExperiment(JSON.parse(JSON.stringify(legacy))).coordinates).toEqual(defaultCoordinates)
    const configured={...legacy,version:3 as const,coordinates:{mode:'polar' as const,origin:{x:2,y:-1}}}
    expect(decodeExperiment(JSON.parse(JSON.stringify(configured))).coordinates).toEqual(configured.coordinates)
    expect(()=>decodeExperiment({...configured,coordinates:{mode:'isometric',origin:{x:0,y:0}}})).toThrow()
    expect(()=>decodeExperiment({...configured,coordinates:{mode:'none',origin:{x:10001,y:0}}})).toThrow()
  })

  it('produces identical motion and samples for different display origins and modes',()=>{
    const scene={...emptyExperiment(),version:3 as const,bodies:[body('落体',{kind:'circle',radius:.2},1,3,{velocity:{x:2,y:1}})]}
    const a=new Physics({...scene,coordinates:{mode:'cartesian',origin:{x:0,y:0}}})
    const b=new Physics({...scene,coordinates:{mode:'polar',origin:{x:4,y:-2}}})
    for(let i=0;i<60;i++){a.step();b.step()}
    expect([...a.samples]).toEqual([...b.samples])
    expect(a.bodies.get(scene.bodies[0].id)!.getPosition()).toEqual(b.bodies.get(scene.bodies[0].id)!.getPosition())
    expect(a.bodies.get(scene.bodies[0].id)!.getLinearVelocity()).toEqual(b.bodies.get(scene.bodies[0].id)!.getLinearVelocity())
  })
})
