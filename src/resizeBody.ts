import { rotate } from './coordinates'
import type { BodyConfig, Point } from './model'
import { trackProfile } from './drawnShapes'

type Geometry = BodyConfig['geometry']
type Handle = {point:Point; direction:Point; edge?:[Point,Point]; corner?:boolean; curvature?:boolean}
const dot = (a:Point,b:Point) => a.x*b.x+a.y*b.y
const minus = (a:Point,b:Point) => ({x:a.x-b.x,y:a.y-b.y})
const limit = (n:number,min=.02,max=1000) => Math.max(min,Math.min(max,n))

export function resizeHandles(g:Geometry,surfaceLine=false):Handle[] {
  if(g.kind==='surface'&&surfaceLine)return [-1,1].map(x=>({
    point:{x:x*g.width/2,y:g.height/2},direction:{x,y:0},
  }))
  if(g.kind==='track'||g.kind==='freeform'){
    const handles:Handle[]=[g.vertices[0],g.vertices.at(-1)!].map(point=>{
    const length=Math.hypot(point.x,point.y)||1
    return {point,direction:{x:point.x/length,y:point.y/length}}
    })
    if(g.kind==='track'&&g.profile)handles.unshift({point:g.vertices[Math.floor(g.vertices.length/2)],direction:{x:0,y:1},curvature:true})
    return handles
  }
  if(g.kind==='circle')return [{x:1,y:0},{x:0,y:1},{x:-1,y:0},{x:0,y:-1}].map(direction=>({
    point:{x:direction.x*g.radius,y:direction.y*g.radius},direction,
  }))
  if(g.kind==='ellipse') {
    const handles:Handle[]=[{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}].map(direction=>({
      point:{x:direction.x*g.radiusX,y:direction.y*g.radiusY},direction,
    }))
    for(const x of [-1,1])for(const y of [-1,1])handles.push({
      point:{x:x*g.radiusX/Math.SQRT2,y:y*g.radiusY/Math.SQRT2},direction:{x,y},corner:true,
    })
    return handles
  }
  const box=g.kind!=='polygon'
  const vertices=box?[
    {x:-g.width/2,y:-g.height/2},{x:g.width/2,y:-g.height/2},
    {x:g.width/2,y:g.height/2},{x:-g.width/2,y:g.height/2},
  ]:g.vertices
  const handles:Handle[]=[]
  for(let i=0;i<vertices.length;i++) {
    const a=vertices[i],b=vertices[(i+1)%vertices.length]
    const v=minus(b,a),length=Math.hypot(v.x,v.y)
    const normal={x:v.y/length,y:-v.x/length}
    if(dot(normal,minus(vertices[(i+2)%vertices.length],a))>0) {normal.x*=-1;normal.y*=-1}
    handles.push({point:{x:(a.x+b.x)/2,y:(a.y+b.y)/2},direction:normal,edge:[a,b]})
    if(box)handles.push({point:a,direction:{x:Math.sign(a.x),y:Math.sign(a.y)},corner:true})
  }
  return handles
}

export function resizeHandleAt(body:BodyConfig,world:Point,tolerance:number) {
  const p=rotate(minus(world,body.position),-body.angle),g=body.geometry
  if(g.kind==='circle') {
    const r=Math.hypot(p.x,p.y)
    if(r>0 && Math.abs(r-g.radius)<=tolerance && r>=g.radius/2)
      return {point:p,direction:{x:p.x/r,y:p.y/r}}
    return
  }
  if(g.kind==='track'||g.kind==='freeform')return resizeHandles(g).find(handle=>Math.hypot(p.x-handle.point.x,p.y-handle.point.y)<=tolerance)
  if(body.surfaceLine)return resizeHandles(g,true).find(handle=>Math.hypot(p.x-handle.point.x,p.y-handle.point.y)<=tolerance)
  if(g.kind==='ellipse') {
    const radial=Math.hypot(p.x/g.radiusX,p.y/g.radiusY)
    for(const handle of resizeHandles(g)) {
      const point=handle.point,distance=Math.hypot(p.x-point.x,p.y-point.y)
      if(distance<=tolerance&&(handle.corner||Math.abs(radial-1)*Math.min(g.radiusX,g.radiusY)<=tolerance))return handle
    }
    return
  }
  const handles=resizeHandles(g)
  // Keep the middle of narrow objects available for moving.
  if(g.kind!=='polygon')tolerance=Math.min(tolerance,Math.min(g.width,g.height)*.32)
  let closest:Handle|undefined, best=tolerance
  for(const handle of handles) {
    const edge=handle.edge
    let nearest=handle.point
    if(edge) {
      const v=minus(edge[1],edge[0])
      const t=limit(dot(minus(p,edge[0]),v)/dot(v,v),0,1)
      nearest={x:edge[0].x+t*v.x,y:edge[0].y+t*v.y}
    }
    const distance=Math.hypot(nearest.x-p.x,nearest.y-p.y)
    if(handle.corner && distance<=tolerance)return handle
    if(distance<=best) {closest=handle;best=distance}
  }
  return closest
}

export function resizeCursor(handle:Handle,angle:number) {
  const d=rotate(handle.direction,angle)
  const octant=Math.round(Math.atan2(-d.y,d.x)/(Math.PI/4))
  return ['ew-resize','nwse-resize','ns-resize','nesw-resize'][(octant+8)%4]
}

export function resizeBody(body:BodyConfig,handle:Handle,from:Point,to:Point) {
  const delta=rotate(minus(to,from),-body.angle),g=body.geometry,n=handle.direction
  if(g.kind==='track'||g.kind==='freeform'){
    if(g.kind==='track'&&g.profile&&handle.curvature) {
      const span=g.vertices.at(-1)!.x-g.vertices[0].x
      const depth=limit(handle.point.y+delta.y,-10000,10000)
      return {body:{...body,geometry:{...g,vertices:trackProfile(g.profile,span,depth)}}}
    }
    const radius=Math.hypot(handle.point.x,handle.point.y)
    const shortest=Math.min(...g.vertices.slice(1).map((p,i)=>Math.hypot(p.x-g.vertices[i].x,p.y-g.vertices[i].y)))
    if(!radius||!shortest)return {body,scaleAnchor:(p:Point)=>p}
    const extent=Math.max(...g.vertices.map(p=>Math.max(Math.abs(p.x),Math.abs(p.y))))
    const factor=limit(1+dot(delta,n)/radius,.020001/shortest,10000/extent)
    const scaleAnchor=(p:Point)=>({x:p.x*factor,y:p.y*factor})
    return {body:{...body,geometry:{...g,vertices:g.vertices.map(scaleAnchor)}},scaleAnchor}
  }
  let geometry:Geometry
  let offset={x:0,y:0}
  let scaleAnchor:(p:Point)=>Point
  if(g.kind==='circle') {
    const radius=limit(g.radius+dot(delta,n))
    geometry={...g,radius}
    scaleAnchor=p=>({x:p.x*radius/g.radius,y:p.y*radius/g.radius})
  } else if(g.kind==='ellipse') {
    let radiusX=g.radiusX,radiusY=g.radiusY
    if(handle.corner) {
      const factor=limit(Math.max(Math.abs(to.x)/g.radiusX,Math.abs(to.y)/g.radiusY),.01,500)
      radiusX=limit(g.radiusX*factor),radiusY=limit(g.radiusY*factor)
    } else if(n.x) radiusX=limit(g.radiusX+delta.x*n.x)
    else radiusY=limit(g.radiusY+delta.y*n.y)
    geometry={...g,radiusX,radiusY}
    offset=handle.corner?{x:0,y:0}:{x:(radiusX-g.radiusX)*n.x/2,y:(radiusY-g.radiusY)*n.y/2}
    scaleAnchor=p=>({x:p.x*radiusX/g.radiusX,y:p.y*radiusY/g.radiusY})
  } else if(g.kind==='polygon') {
    // Scale perpendicular to the moving edge and leave its opposite support line fixed.
    const back=Math.min(...g.vertices.map(p=>dot(p,n)))
    const span=dot(handle.point,n)-back
    const factor=limit(span+dot(delta,n),Math.min(.02,span),Math.max(1000,span))/span
    scaleAnchor=p=>{
      const shift=dot(p,n)*(factor-1)
      return {x:p.x+shift*n.x,y:p.y+shift*n.y}
    }
    offset={x:back*(1-factor)*n.x,y:back*(1-factor)*n.y}
    geometry={...g,vertices:g.vertices.map(scaleAnchor)}
  } else {
    const width=limit(g.width+delta.x*n.x),height=limit(g.height+delta.y*n.y)
    offset={x:(width-g.width)*n.x/2,y:(height-g.height)*n.y/2}
    geometry={...g,width,height}
    scaleAnchor=p=>({x:p.x*width/g.width,y:p.y*height/g.height})
  }
  const shift=rotate(offset,body.angle)
  return {body:{...body,geometry,position:{x:body.position.x+shift.x,y:body.position.y+shift.y}},scaleAnchor}
}
