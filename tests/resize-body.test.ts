import { expect, it } from 'vitest'
import { rotate } from '../src/coordinates'
import { body } from '../src/model'
import { resizeBody, resizeHandleAt } from '../src/resizeBody'

it('resizes a rotated box along a whole edge and keeps its opposite edge fixed',()=>{
  const angle=Math.PI/6
  const box=body('滑块',{kind:'rectangle',width:2,height:1},0,0,{angle})
  const edge=rotate({x:1,y:.27},angle)
  const handle=resizeHandleAt(box,edge,.04)!
  const result=resizeBody(box,handle,edge,rotate({x:2,y:1},angle))
  expect(result.body.geometry).toEqual({kind:'rectangle',width:3,height:1})
  expect(rotate(result.body.position,-angle).x).toBeCloseTo(.5)
  expect(rotate(result.body.position,-angle).y).toBeCloseTo(0)
  expect(result.scaleAnchor({x:-1,y:.3})).toEqual({x:-1.5,y:.3})
})

it('scales both box dimensions at a corner without inverting the shape',()=>{
  const box=body('矩形',{kind:'rectangle',width:2,height:2},0,0)
  const corner={x:1,y:1},handle=resizeHandleAt(box,corner,.05)!
  const result=resizeBody(box,handle,corner,{x:-3,y:2})
  expect(result.body.geometry).toEqual({kind:'rectangle',width:.02,height:3})
  expect(result.body.position).toEqual({x:-.99,y:.5})
  expect(resizeHandleAt(box,{x:0,y:0},.05)).toBeUndefined()
})

it('resizes a circle at any point on its rim while retaining its center',()=>{
  const circle=body('圆形',{kind:'circle',radius:5},2,1)
  const handle=resizeHandleAt(circle,{x:5,y:5},.05)!
  const result=resizeBody(circle,handle,{x:5,y:5},{x:8,y:9})
  expect(result.body.geometry).toEqual({kind:'circle',radius:10})
  expect(result.body.position).toEqual(circle.position)
})

it('moves a polygon edge with its orientation preserved in either winding order',()=>{
  const vertices=[{x:0,y:0},{x:4,y:0},{x:0,y:2}]
  for(const corners of [vertices,[...vertices].reverse()]) {
    const polygon=body('三角形',{kind:'polygon',vertices:corners},0,0)
    const handle=resizeHandleAt(polygon,{x:1.25,y:.02},.04)!
    const result=resizeBody(polygon,handle,{x:1.25,y:.02},{x:1.25,y:-.98})
    const geometry=result.body.geometry
    if(geometry.kind!=='polygon')throw new Error('Expected polygon')
    geometry.vertices.forEach((p,i)=>{
      expect(p.x+result.body.position.x).toBeCloseTo(corners[i].x)
      expect(p.y+result.body.position.y).toBeCloseTo(corners[i].y===0?-1:2)
    })
  }
})
