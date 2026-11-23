import { expect, it } from 'vitest'
import { createInk, INK_COLORS } from '../src/ink'
import { eraseBodies } from '../src/eraser'
import { centroid, triangulate } from '../src/freeform'
import { body, decodeExperiment, emptyExperiment, type BodyConfig, type Point } from '../src/model'
import { Physics } from '../src/physics'

const circlePath=(radius:number,cx=0,cy=0,count=64):Point[]=>
  Array.from({length:count},(_,i)=>{
    const angle=i*2*Math.PI/count
    return {x:cx+radius*Math.cos(angle),y:cy+radius*Math.sin(angle)}
  })

const rectanglePath=(width:number,height:number,step=.03):Point[]=>{
  const points:Point[]=[]
  const edge=(a:Point,b:Point)=>{
    const length=Math.hypot(b.x-a.x,b.y-a.y),count=Math.ceil(length/step)
    for(let i=0;i<count;i++)points.push({x:a.x+(b.x-a.x)*i/count,y:a.y+(b.y-a.y)*i/count})
  }
  edge({x:0,y:0},{x:width,y:0});edge({x:width,y:0},{x:width,y:height})
  edge({x:width,y:height},{x:0,y:height});edge({x:0,y:height},{x:0,y:0.01})
  return points
}

const trianglePath=(a:Point,b:Point,c:Point):Point[]=>{
  const points:Point[]=[]
  const edge=(from:Point,to:Point)=>{
    const count=Math.ceil(Math.hypot(to.x-from.x,to.y-from.y)/.04)
    for(let i=0;i<count;i++)points.push({x:from.x+(to.x-from.x)*i/count,y:from.y+(to.y-from.y)*i/count})
  }
  edge(a,b);edge(b,c);edge(c,{x:a.x+.01,y:a.y+.01})
  return points
}

const lineBody=(name:string,x1:number,x2:number,y:number,color='#ff5a5a'):BodyConfig=>
  body(name,{kind:'freeform',vertices:[{x:x1,y:0},{x:x2,y:0}],closed:false},0,y,{type:'static',color})

it('keeps quick strokes as static curves and closed strokes as dynamic bodies',()=>{
  const open=createInk([{x:0,y:0},{x:.4,y:.25},{x:.8,y:0},{x:1.2,y:.3}],'#5b8dff',false)
  expect(open).toMatchObject({kind:'freeform',label:'手绘曲线（静态斜面/碰撞曲线）'})
  if('body' in open) {
    expect(open.body.type).toBe('static')
    expect(open.body.geometry.kind).toBe('freeform')
    if(open.body.geometry.kind==='freeform')expect(open.body.geometry.closed).toBe(false)
    expect(open.body.color).toBe('#5b8dff')
  }

  const closed=createInk(circlePath(.5,1,1),'#ffffff',false)
  expect(closed).toMatchObject({kind:'freeform',label:'手绘物块'})
  if('body' in closed) {
    expect(closed.body.type).toBe('dynamic')
    expect(closed.body.geometry.kind).toBe('freeform')
    if(closed.body.geometry.kind==='freeform') {
      expect(closed.body.geometry.closed).toBe(true)
      expect(closed.body.geometry.vertices.length).toBeGreaterThan(2)
    }
  }

  expect(createInk([{x:0,y:0},{x:.01,y:.01}],'#ff5a5a',false)).toHaveProperty('error')
  expect(INK_COLORS.map(color=>color.value)).toEqual(['#ff5a5a','#5b8dff','#ffffff'])
})

it('regularizes held strokes into lines, circles, rectangles and convex polygons',()=>{
  const straight=createInk([{x:0,y:0},{x:.5,y:.01},{x:1,y:0},{x:1.5,y:.02}],'#ff5a5a',true)
  expect(straight).toMatchObject({kind:'line',label:'规整为直线'})
  if('body' in straight) {
    const g=straight.body.geometry
    expect(g.kind).toBe('freeform')
    if(g.kind==='freeform')expect(g.vertices).toHaveLength(2)
    expect(straight.body.type).toBe('static')
  }

  const circle=createInk(circlePath(.5,2,1),'#5b8dff',true)
  expect(circle).toMatchObject({kind:'circle',label:'规整为圆'})
  if('body' in circle) {
    const g=circle.body.geometry
    expect(g.kind).toBe('circle')
    if(g.kind==='circle')expect(g.radius).toBeCloseTo(.5,1)
    expect(circle.body.position.x).toBeCloseTo(2,1)
    expect(circle.body.type).toBe('dynamic')
  }

  const rectangle=createInk(rectanglePath(1,.6),'#ffffff',true)
  expect(rectangle).toMatchObject({kind:'rectangle',label:'规整为矩形'})
  if('body' in rectangle) {
    const g=rectangle.body.geometry
    expect(g.kind).toBe('rectangle')
    if(g.kind==='rectangle')expect([g.width,g.height].sort((a,b)=>a-b)[0]).toBeCloseTo(.6,1)
    expect(rectangle.body.position.x).toBeCloseTo(.5,1)
  }

  const triangle=createInk(trianglePath({x:0,y:0},{x:1.4,y:0},{x:.4,y:1}),'#ff5a5a',true)
  expect(triangle).toMatchObject({kind:'polygon',label:'规整为三角形'})
  if('body' in triangle) {
    expect(triangle.body.geometry.kind).toBe('polygon')
    if(triangle.body.geometry.kind==='polygon')expect(triangle.body.geometry.vertices).toHaveLength(3)
  }
})

it('accepts custom ink colors only as #RRGGBB and upgrades scenes that use freeform geometry',()=>{
  const scene=emptyExperiment()
  const custom=body('彩色物块',{kind:'freeform',vertices:[{x:-.5,y:-.5},{x:.5,y:-.5},{x:.5,y:.5},{x:-.5,y:.5}],closed:true},0,2,{color:'#12ab34'})
  expect(custom.color).toBe('#12ab34')
  expect(decodeExperiment({...scene,version:2,bodies:[custom]}).bodies[0].color).toBe('#12ab34')
  expect(()=>decodeExperiment({...scene,version:1,bodies:[custom]})).toThrow('版本 2')
  expect(()=>decodeExperiment({...scene,version:2,bodies:[{...custom,color:'green'}]})).toThrow('颜色')
  expect(()=>decodeExperiment({...scene,version:2,bodies:[{...custom,geometry:{kind:'freeform',vertices:[{x:-1,y:-1},{x:1,y:1},{x:1,y:-1},{x:-1,y:1}],closed:true}}]})).toThrow('自相交')
})

it('erases whole strokes or splits dragged static curves without touching other objects',()=>{
  const line=lineBody('手绘曲线',-1,1,0)
  const path=[{x:0,y:-.2},{x:0,y:.2}]
  const stroke=eraseBodies([line],path,.15,'stroke')
  expect(stroke.removed.has(line.id)).toBe(true)
  expect(stroke.bodies).toHaveLength(0)

  const drag=eraseBodies([line],path,.15,'drag')
  expect(drag.removed.has(line.id)).toBe(true)
  expect(drag.hidden.has(line.id)).toBe(true)
  expect(drag.bodies).toHaveLength(2)
  expect(drag.segments).toHaveLength(2)
  for(const part of drag.bodies) {
    expect(part.type).toBe('static')
    expect(part.geometry.kind).toBe('freeform')
    if(part.geometry.kind==='freeform')expect(part.geometry.closed).toBe(false)
  }

  const untouched=eraseBodies([line],[{x:4,y:0},{x:4,y:.2}],.15,'drag')
  expect(untouched.changed).toBe(false)
  expect(untouched.bodies).toEqual([line])

  const covered=eraseBodies([line],[{x:-1.2,y:0},{x:1.2,y:0}],.15,'drag')
  expect(covered.bodies).toHaveLength(0)
})

it('splits closed static curves and always deletes rigid bodies whole',()=>{
  const square=body('方框',{kind:'freeform',vertices:[{x:-1,y:-1},{x:1,y:-1},{x:1,y:1},{x:-1,y:1}],closed:true},0,0,{type:'static'})
  const cut=eraseBodies([square],[{x:0,y:1.3},{x:0,y:.8}],.15,'drag')
  expect(cut.bodies.length).toBeGreaterThan(0)
  expect(cut.hidden.has(square.id)).toBe(true)

  const block=body('物块',{kind:'freeform',vertices:[{x:-.5,y:-.5},{x:.5,y:-.5},{x:.5,y:.5},{x:-.5,y:.5}],closed:true},0,2,{type:'dynamic'})
  const erased=eraseBodies([block],[{x:0,y:2}],.2,'drag')
  expect(erased.bodies).toHaveLength(0)
  expect(erased.removed.has(block.id)).toBe(true)
})

it('collides closed freeform blocks with surfaces and supports static freeform ramps',()=>{
  const scene=emptyExperiment()
  const vertices:[Point,Point,Point,Point]=[{x:-.5,y:-.5},{x:.5,y:-.5},{x:.5,y:.5},{x:-.5,y:.5}]
  const block=body('手绘物块',{kind:'freeform',vertices,closed:true},0,2,{restitution:0})
  const floor=body('地面',{kind:'surface',width:4,height:.2},0,0,{type:'static',restitution:0})
  expect(triangulate(vertices)).toHaveLength(2)
  const lab=new Physics({...scene,version:2,bodies:[block,floor]})
  for(let i=0;i<150;i++)lab.step()
  const settled=lab.bodies.get(block.id)!.getPosition()
  expect(settled.y).toBeGreaterThan(.5)
  expect(settled.y).toBeLessThan(1.2)

  const ball=body('小球',{kind:'circle',radius:.2},0,1.5,{restitution:0})
  const ramp=body('手绘曲线',{kind:'freeform',vertices:[{x:-1,y:0},{x:0,y:0},{x:1,y:0}],closed:false},0,.8,{type:'static'})
  const lab2=new Physics({...scene,version:2,bodies:[ball,ramp]})
  for(let i=0;i<150;i++)lab2.step()
  expect(lab2.bodies.get(ball.id)!.getPosition().y).toBeGreaterThan(.85)
  expect(lab2.bodies.get(ball.id)!.getPosition().y).toBeLessThan(1.3)
})

it('keeps freeform vertices centered on the body centroid',()=>{
  const points=circlePath(.6,1,1)
  const center=centroid(points)
  const result=createInk(points,'#ff5a5a',false)
  if('body' in result&&result.body.geometry.kind==='freeform') {
    expect(result.body.position.x).toBeCloseTo(center.x,6)
    expect(result.body.position.y).toBeCloseTo(center.y,6)
    const localCenter=centroid(result.body.geometry.vertices)
    expect(localCenter.x).toBeCloseTo(0,6)
    expect(localCenter.y).toBeCloseTo(0,6)
  }
})