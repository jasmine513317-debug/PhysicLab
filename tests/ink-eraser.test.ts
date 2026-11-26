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

const ellipsePath=(rx:number,ry:number,cx=0,cy=0):Point[]=>
  Array.from({length:80},(_,i)=>{const a=i*2*Math.PI/80;return {x:cx+rx*Math.cos(a),y:cy+ry*Math.sin(a)}})

it('recognizes ellipses without confusing them with circles',()=>{
  const ellipse=createInk(ellipsePath(1.4,.55,2,3),'#5b8dff',true)
  expect(ellipse).toMatchObject({kind:'ellipse',label:'规整为椭圆'})
  if('body' in ellipse&&ellipse.body.geometry.kind==='ellipse') {
    expect([ellipse.body.geometry.radiusX,ellipse.body.geometry.radiusY]).toEqual([1.4,.55])
    expect(ellipse.body.position.x).toBeCloseTo(2,8)
    expect(ellipse.body.position.y).toBeCloseTo(3,8)
  }
})

it('preserves polyline corners instead of smoothing them into a curve',()=>{
  const raw=[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:2,y:1}]
  const result=createInk(raw,'#ffffff',true)
  expect(result).toMatchObject({kind:'polyline',label:'规整为折线'})
  if('body' in result&&result.body.geometry.kind==='freeform') {
    expect(result.body.geometry.closed).toBe(false)
    expect(result.body.geometry.vertices.map(p=>({x:p.x+result.body.position.x,y:p.y+result.body.position.y}))).toEqual(raw)
  }
})

it('retains uncertain raw strokes and reports recognition evidence',()=>{
  const raw=Array.from({length:90},(_,i)=>({x:i*.025,y:.18*Math.sin(i*.73)+.04*Math.sin(i*2.11)}))
  const result=createInk(raw,'#ff5a5a',true)
  expect(result).toMatchObject({kind:'curve',regularized:false})
  const evidence=(result as {recognition?:{raw:Point[];confidence:number;fitError:number;sampleDensity:number}}).recognition!
  expect(evidence.raw).toEqual(raw)
  expect(evidence.confidence).toBeLessThan(.9)
  expect(evidence.fitError).toBeGreaterThan(0)
  expect(evidence.sampleDensity).toBeGreaterThan(0)

  const circle=createInk(circlePath(.5,1,1),'#ffffff',true)
  const recognized=(circle as {recognition?:{confidence:number;sampleCount:number}}).recognition!
  expect(recognized.confidence).toBeGreaterThanOrEqual(.9)
  expect(recognized.sampleCount).toBeGreaterThan(10)
})

it('creates the role selected by the current drawing tool',()=>{
  const raw=circlePath(.5,1,1)
  for(const role of ['marker','body','boundary','track','field'] as const) {
    const result=createInk(raw,'#ff5a5a',false,2.4,role)
    expect(result).toHaveProperty('body.role',role)
    if('body' in result) {
      expect(result.body.role).toBe(role)
      expect(result.body.type).toBe(role==='body'?'dynamic':'static')
    }
  }
  expect(()=>decodeExperiment({...emptyExperiment(),version:2,bodies:[createInk(raw,'#ff5a5a',false,2.4,'marker').body]})).toThrow('版本 3')
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

it('preserves semantic roles, charge and recognition provenance when splitting curves',()=>{
  const provenance={source:'ink' as const,raw:[{x:-1,y:0},{x:0,y:0},{x:1,y:0}],regularized:false,confidence:.72,fitError:.03,sampleDensity:20}
  for(const role of ['body','marker','boundary','field'] as const) {
    const original=body('语义曲线',{kind:'freeform',vertices:[{x:-1,y:0},{x:1,y:0}],closed:false},0,0,{
      type:'static',role,color:'#5b8dff',strokeWidth:3.6,friction:.65,restitution:.2,provenance,
      ...(role==='field'?{charge:-25}:{}),
    })
    const split=eraseBodies([original],[{x:0,y:-.2},{x:0,y:.2}],.15,'drag')
    expect(split.bodies).toHaveLength(2)
    for(const part of split.bodies) {
      expect(part).toMatchObject({role,color:'#5b8dff',strokeWidth:3.6,friction:.65,restitution:.2,provenance,
        ...(role==='field'?{charge:-25}:{})})
      expect(part.geometry.kind).toBe('freeform')
      expect(part.id).not.toBe(original.id)
    }
    expect(()=>decodeExperiment({...emptyExperiment(),version:3,bodies:split.bodies})).not.toThrow()
  }

  const track=body('语义轨道',{kind:'track',vertices:[{x:-1,y:0},{x:1,y:0}],closed:false},0,0,{role:'track',provenance})
  const splitTrack=eraseBodies([track],[{x:0,y:-.2},{x:0,y:.2}],.15,'drag')
  expect(splitTrack.bodies).toHaveLength(2)
  for(const part of splitTrack.bodies)expect(part).toMatchObject({role:'track',geometry:{kind:'track',closed:false},provenance})

  const dynamic=body('动态刚体',{kind:'freeform',vertices:[{x:-.5,y:-.5},{x:.5,y:-.5},{x:.5,y:.5},{x:-.5,y:.5}],closed:true},0,0,{role:'body',provenance})
  expect(eraseBodies([dynamic],[{x:0,y:0}],.2,'drag').bodies).toEqual([])
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

it('stores stroke width on every ink form and keeps it through splitting',()=>{
  const forms=[
    {result:createInk([{x:0,y:0},{x:.4,y:.25},{x:.8,y:0},{x:1.2,y:.3}],'#5b8dff',false,3.6),width:3.6},
    {result:createInk(circlePath(.5,1,1),'#ffffff',false,1.8),width:1.8},
    {result:createInk([{x:0,y:0},{x:.5,y:.01},{x:1,y:0},{x:1.5,y:.02}],'#ff5a5a',true,3.6),width:3.6},
    {result:createInk(circlePath(.5,2,1),'#5b8dff',true,1.8),width:1.8},
    {result:createInk(rectanglePath(1,.6),'#ffffff',true,3.6),width:3.6},
    {result:createInk(trianglePath({x:0,y:0},{x:1.4,y:0},{x:.4,y:1}),'#ff5a5a',true,1.8),width:1.8},
  ]
  for(const {result,width} of forms) {
    if(!('body' in result))throw new Error(result.error)
    expect(result.body.strokeWidth).toBe(width)
  }

  const line=body('手绘曲线',{kind:'freeform',vertices:[{x:-1,y:0},{x:1,y:0}],closed:false},0,0,{type:'static',color:'#5b8dff',strokeWidth:3.6})
  const split=eraseBodies([line],[{x:0,y:-.2},{x:0,y:.2}],.15,'drag')
  expect(split.bodies).toHaveLength(2)
  for(const part of split.bodies)expect(part.strokeWidth).toBe(3.6)
  for(const segment of split.segments)expect(segment.strokeWidth).toBe(3.6)
})

it('decodes optional stroke width and rejects values outside the visual range',()=>{
  const scene=emptyExperiment()
  const wide=body('粗线',{kind:'circle',radius:.3},0,1,{strokeWidth:3.6})
  const decoded=decodeExperiment({...scene,version:2,bodies:[wide]}).bodies[0]
  expect(decoded.strokeWidth).toBe(3.6)
  expect(()=>decodeExperiment({...scene,version:2,bodies:[{...wide,strokeWidth:12}]})).toThrow()
  expect(()=>decodeExperiment({...scene,version:2,bodies:[{...wide,strokeWidth:0.2}]})).toThrow()
})

it('uses nanocoulombs and live positions when calculating and displaying electric forces',()=>{
  const source=body('场源',{kind:'circle',radius:.2},0,0,{type:'static',role:'field',charge:100})
  const charged=body('带电球',{kind:'circle',radius:.1},1,0,{role:'body',charge:100})
  const lab=new Physics({...emptyExperiment(),version:3,bodies:[source,charged]})
  const initial=lab.forceVectors(charged.id).find(force=>force.name==='电场力')!.vector.x
  lab.bodies.get(charged.id)!.setPosition({x:2,y:0})
  const moved=lab.forceVectors(charged.id).find(force=>force.name==='电场力')!.vector.x
  expect(initial).toBeCloseTo(8.98755179e-5,12)
  expect(moved).toBeCloseTo(initial/4,12)
})

it('keeps markers and field sources collision-free and applies real Coulomb forces',()=>{
  const marker=body('标记',{kind:'circle',radius:.3},0,1,{type:'static',role:'marker'})
  const source=body('场源',{kind:'circle',radius:.2},0,0,{type:'static',role:'field',charge:1000})
  const charged=body('带电球',{kind:'circle',radius:.1},1,0,{role:'body',charge:100})
  const lab=new Physics({...emptyExperiment(),version:3,bodies:[marker,source,charged]})
  expect(lab.bodies.get(marker.id)!.getFixtureList()).toBeNull()
  expect(lab.bodies.get(source.id)!.getFixtureList()).toBeNull()
  lab.step()
  expect(lab.bodies.get(charged.id)!.getLinearVelocity().x).toBeGreaterThan(0)
  expect(lab.forceVectors(charged.id).some(force=>force.name==='电场力')).toBe(true)
})

it('treats stroke width as visual-only and never changes simulated motion',()=>{
  const scene=emptyExperiment()
  const make=(strokeWidth:number)=>body('落球',{kind:'circle',radius:.2},0,2,{restitution:0,strokeWidth})
  const floor=body('地面',{kind:'surface',width:4,height:.2},0,0,{type:'static',restitution:0})
  const thinBall=make(1.8), thickBall=make(3.6)
  const thin=new Physics({...scene,version:2,bodies:[thinBall,floor]})
  const thick=new Physics({...scene,version:2,bodies:[thickBall,floor]})
  for(let i=0;i<180;i++){thin.step();thick.step()}
  const thinBody=thin.bodies.get(thinBall.id)!
  const thickBody=thick.bodies.get(thickBall.id)!
  expect(thickBody.getMass()).toBe(thinBody.getMass())
  expect(thickBody.getPosition().x).toBeCloseTo(thinBody.getPosition().x,10)
  expect(thickBody.getPosition().y).toBeCloseTo(thinBody.getPosition().y,10)
})