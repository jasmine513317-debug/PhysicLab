import { rotate } from './coordinates'
import type { BodyConfig, Point } from './model'
import { polygonArea, segmentDistance } from './track'

type Pose = Pick<BodyConfig,'position'|'angle'>
type Bounded = Pose&{geometry:BodyConfig['geometry']}

export function centroid(points:readonly Point[]):Point {
  if(!points.length)return {x:0,y:0}
  return points.reduce((sum,p)=>({x:sum.x+p.x/points.length,y:sum.y+p.y/points.length}),{x:0,y:0})
}

export function toWorld(body:Pose,points:readonly Point[]):Point[] {
  return points.map(p=>{
    const q=rotate(p,body.angle)
    return {x:body.position.x+q.x,y:body.position.y+q.y}
  })
}

export function toLocal(points:readonly Point[],center:Point):Point[] {
  return points.map(p=>({x:p.x-center.x,y:p.y-center.y}))
}

export function pointInPolygon(point:Point,vertices:readonly Point[]) {
  let inside=false
  for(let i=0,j=vertices.length-1;i<vertices.length;j=i++) {
    const a=vertices[i],b=vertices[j]
    if((a.y>point.y)!==(b.y>point.y)&&point.x<(b.x-a.x)*(point.y-a.y)/(b.y-a.y)+a.x)inside=!inside
  }
  return inside
}

export function distanceToPolyline(point:Point,vertices:readonly Point[],closed:boolean) {
  if(vertices.length<2)return Infinity
  let nearest=Infinity
  const count=vertices.length-(closed?0:1)
  for(let i=0;i<count;i++)nearest=Math.min(nearest,segmentDistance(point,vertices[i],vertices[(i+1)%vertices.length]))
  return nearest
}

export function containsPoint(body:Bounded,point:Point,tolerance=0) {
  const local=rotate({x:point.x-body.position.x,y:point.y-body.position.y},-body.angle)
  const g=body.geometry
  if(g.kind==='circle')return Math.hypot(local.x,local.y)<=g.radius+tolerance
  if(g.kind==='polygon')return pointInPolygon(local,g.vertices)||distanceToPolyline(local,g.vertices,true)<=tolerance
  if(g.kind==='track')return distanceToPolyline(local,g.vertices,g.closed)<=tolerance||(g.closed&&pointInPolygon(local,g.vertices))
  if(g.kind==='freeform')return (g.closed&&pointInPolygon(local,g.vertices))||distanceToPolyline(local,g.vertices,g.closed)<=tolerance
  return Math.abs(local.x)<=g.width/2+tolerance&&Math.abs(local.y)<=g.height/2+tolerance
}

export function outlinePoints(body:Bounded):Point[] {
  const g=body.geometry
  if(g.kind==='circle')return toWorld(body,Array.from({length:32},(_,i)=>{
    const angle=i*Math.PI/16
    return {x:g.radius*Math.cos(angle),y:g.radius*Math.sin(angle)}
  }))
  if(g.kind==='polygon'||g.kind==='track'||g.kind==='freeform')return toWorld(body,g.vertices)
  return toWorld(body,[
    {x:-g.width/2,y:-g.height/2},{x:g.width/2,y:-g.height/2},
    {x:g.width/2,y:g.height/2},{x:-g.width/2,y:g.height/2},
  ])
}

export function densify(points:readonly Point[],closed:boolean,spacing:number):Point[] {
  if(points.length<2||spacing<=0)return [...points]
  const result:Point[]=[]
  const count=points.length-(closed?0:1)
  for(let i=0;i<count;i++) {
    const a=points[i],b=points[(i+1)%points.length]
    const steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/spacing))
    for(let step=0;step<steps;step++) {
      const t=step/steps
      result.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t})
    }
  }
  if(!closed)result.push(points.at(-1)!)
  return result
}

export function convexHull(points:readonly Point[]):Point[] {
  const sorted=[...points].sort((a,b)=>a.x-b.x||a.y-b.y)
  if(sorted.length<3)return sorted
  const cross=(o:Point,a:Point,b:Point)=>(a.x-o.x)*(b.y-o.y)-(a.y-o.y)*(b.x-o.x)
  const lower:Point[]=[]
  for(const p of sorted) {
    while(lower.length>=2&&cross(lower.at(-2)!,lower.at(-1)!,p)<=1e-9)lower.pop()
    lower.push(p)
  }
  const upper:Point[]=[]
  for(let i=sorted.length-1;i>=0;i--) {
    const p=sorted[i]
    while(upper.length>=2&&cross(upper.at(-2)!,upper.at(-1)!,p)<=1e-9)upper.pop()
    upper.push(p)
  }
  lower.pop();upper.pop()
  return [...lower,...upper]
}

function cleanPolygon(vertices:readonly Point[]) {
  const result:Point[]=[]
  for(const p of vertices) {
    const last=result.at(-1)
    if(!last||Math.hypot(last.x-p.x,last.y-p.y)>1e-7)result.push(p)
  }
  while(result.length>2&&Math.hypot(result[0].x-result.at(-1)!.x,result[0].y-result.at(-1)!.y)<1e-7)result.pop()
  return result
}

function triangleContains(p:Point,a:Point,b:Point,c:Point) {
  const cross=(u:Point,v:Point,w:Point)=>(v.x-u.x)*(w.y-u.y)-(v.y-u.y)*(w.x-u.x)
  const ab=cross(a,b,p),bc=cross(b,c,p),ca=cross(c,a,p)
  return (ab>=-1e-9&&bc>=-1e-9&&ca>=-1e-9)||(ab<=1e-9&&bc<=1e-9&&ca<=1e-9)
}

export function triangulate(vertices:readonly Point[]):Point[][] {
  const polygon=cleanPolygon(vertices)
  if(polygon.length<3||polygonArea(polygon)<1e-7)return []
  const signed=polygon.reduce((sum,a,i)=>{
    const b=polygon[(i+1)%polygon.length]
    return sum+a.x*b.y-a.y*b.x
  },0)
  if(signed<0)polygon.reverse()
  const remaining=polygon.map((_,i)=>i)
  const triangles:Point[][]=[]
  let guard=polygon.length*polygon.length
  while(remaining.length>3&&guard-->0) {
    let clipped=false
    const n=remaining.length
    for(let i=0;i<n;i++) {
      const ia=remaining[(i-1+n)%n],ib=remaining[i],ic=remaining[(i+1)%n]
      const a=polygon[ia],b=polygon[ib],c=polygon[ic]
      const cross=(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x)
      if(cross<=1e-9)continue
      let blocked=false
      for(let j=0;j<n;j++) {
        const index=remaining[j]
        if(index===ia||index===ib||index===ic)continue
        if(triangleContains(polygon[index],a,b,c)) {blocked=true;break}
      }
      if(blocked)continue
      triangles.push([a,b,c])
      remaining.splice(i,1)
      clipped=true
      break
    }
    if(!clipped)return []
  }
  if(remaining.length===3)triangles.push(remaining.map(i=>polygon[i]))
  return triangles
}