import { expect, it } from 'vitest'
import { rotate } from '../src/coordinates'
import { body } from '../src/model'
import { findSurfaceSnap, separateEditedBodies } from '../src/surfaceSnap'

const ground = body('地面',{kind:'surface',width:4,height:.2},0,0)
const block = body('矩形',{kind:'rectangle',width:.8,height:.6},0,0)

it('snaps only near the finite upper face and chooses the closest contact',()=>{
  const lowerGround = {...ground, name:'较低地面', position:{x:0,y:-.05}}
  const snap = findSurfaceSnap(block,{x:.4,y:.45},[lowerGround,ground],80)
  expect(snap?.surfaceName).toBe('地面')
  expect(snap?.position).toEqual({x:.4,y:.4})
  expect(snap?.contact).toEqual([{x:0,y:.1},{x:.8,y:.1}])
  expect(findSurfaceSnap(block,{x:.4,y:.7},[ground],80)).toBeUndefined()
  expect(findSurfaceSnap(block,{x:.4,y:-.4},[ground],80)).toBeUndefined()
  expect(findSurfaceSnap(block,{x:2.5,y:.4},[ground],80)).toBeUndefined()
  expect(findSurfaceSnap(block,{x:0,y:.48},[ground],200)).toBeUndefined()
})

it('puts a flat side against the upper face of a ramp drawn in either direction',()=>{
  const angle = Math.PI/6
  const position = rotate({x:0,y:.6},angle)
  for(const direction of [angle,angle-Math.PI]) {
    const snap = findSurfaceSnap(block,position,[{...ground,angle:direction}],80)!
    expect(snap.angle).toBeCloseTo(angle)
    expect(rotate(snap.position,-angle).y).toBeCloseTo(.4)
    for(const point of snap.contact)expect(rotate(point,-angle).y).toBeCloseTo(.1)
  }
})

it('makes circles tangent and keeps walls and static objects out of snapping',()=>{
  const circle = body('圆形',{kind:'circle',radius:.25},0,0,{angle:.3})
  const snap = findSurfaceSnap(circle,{x:0,y:.4},[ground],80)
  expect(snap?.position.y).toBeCloseTo(.35)
  expect(snap?.contact).toEqual([{x:0,y:.1},{x:0,y:.1}])
  expect(snap?.angle).toBe(.3)
  expect(findSurfaceSnap({...circle,type:'static'},{x:0,y:.35},[ground],80)).toBeUndefined()
  expect(findSurfaceSnap(circle,{x:-.35,y:0},[{...ground,angle:Math.PI/2}],80)).toBeUndefined()
})

it.each([0,Math.PI/6,-Math.PI/4,Math.PI*7/6])('resolves deep overlap on either side of a finite slope at angle %s',angle=>{
  const axis=angle-Math.round(angle/Math.PI)*Math.PI
  const ramp={...ground,angle}
  for(const sign of [1,-1]) {
    const pos=rotate({x:.6,y:sign*.035},axis)
    const alignedBlock={...block,angle:axis}
    const snap=findSurfaceSnap(alignedBlock,pos,[ramp],400)!
    const local=rotate(snap.position,-axis)
    expect(snap.side).toBe(sign>0?'above':'below')
    expect(local.x).toBeCloseTo(.6)
    expect(local.y).toBeCloseTo(sign*.4)
    expect(findSurfaceSnap({...alignedBlock,angle:snap.angle},snap.position,[ramp],400,{overlapOnly:true})).toBeUndefined()
  }
})

it('uses the starting side when centered and computes real contact at finite ends',()=>{
  const tied=findSurfaceSnap(block,{x:0,y:0},[ground],80,{previousPosition:{x:0,y:-1}})
  expect(tied?.side).toBe('below')
  const ball=body('圆形',{kind:'circle',radius:.5},2.3,-.1)
  const end=findSurfaceSnap(ball,ball.position,[ground],80)!
  expect(end.position.y).toBeCloseTo(-.5)
  expect(end.contact[0].x).toBeCloseTo(2)
  expect(findSurfaceSnap(ball,{x:2.49,y:-.45},[ground],80)).toBeUndefined()
})

it('clears both faces when parallel surfaces overlap',()=>{
  const other={...ground,id:'higher',name:'上层地面',position:{x:0,y:.06}}
  const result=findSurfaceSnap(block,{x:0,y:.12},[ground,other],80)!
  expect(result.surfaceName).toBe('上层地面')
  expect(result.position.y).toBeCloseTo(.46)
})

it('resolves newly placed and resized blocks and blocks hit by repositioned surfaces',()=>{
  const above={...block,position:{x:0,y:.05}}
  expect(separateEditedBodies([ground],[ground,above])[1].position.y).toBeCloseTo(.4)
  const below={...block,position:{x:0,y:-.4}}
  const grown={...below,geometry:{kind:'rectangle' as const,width:.8,height:1.2}}
  expect(separateEditedBodies([ground,below],[ground,grown])[1].position.y).toBeCloseTo(-.7)
  const lowered={...ground,position:{x:0,y:-.35}}
  expect(separateEditedBodies([ground,below],[lowered,below])[1].position.y).toBeCloseTo(-.75)
  expect(separateEditedBodies([ground,above],[ground,{...above,mass:2}])[1].position.y).toBe(.05)
})
