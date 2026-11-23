import type { Point } from './model'

export const TRACK_VERTEX_LIMIT=256
export const TRACK_MIN_EDGE=0.02

export function segmentDistance(p:Point,a:Point,b:Point) {
  const x=b.x-a.x,y=b.y-a.y,len=x*x+y*y
  const t=len?Math.max(0,Math.min(1,((p.x-a.x)*x+(p.y-a.y)*y)/len)):0
  return Math.hypot(p.x-a.x-t*x,p.y-a.y-t*y)
}

export function simplifyPath(points:Point[],tolerance:number):Point[] {
  if(points.length<=2)return points
  const keep=new Set([0,points.length-1])
  const work:[number,number][]=[[0,points.length-1]]
  while(work.length) {
    const [start,end]=work.pop()!
    let farthest=start, distance=tolerance
    for(let i=start+1;i<end;i++) {
      const deviation=segmentDistance(points[i],points[start],points[end])
      if(deviation>distance) {farthest=i;distance=deviation}
    }
    if(farthest!==start) {keep.add(farthest);work.push([start,farthest],[farthest,end])}
  }
  return points.filter((_,i)=>keep.has(i))
}

function intersects(a:Point,b:Point,c:Point,d:Point) {
  if(Math.max(a.x,b.x)+1e-8<Math.min(c.x,d.x)||Math.max(c.x,d.x)+1e-8<Math.min(a.x,b.x)
    ||Math.max(a.y,b.y)+1e-8<Math.min(c.y,d.y)||Math.max(c.y,d.y)+1e-8<Math.min(a.y,b.y))return false
  const turn=(p:Point,q:Point,r:Point)=>(q.x-p.x)*(r.y-p.y)-(q.y-p.y)*(r.x-p.x)
  const abC=turn(a,b,c),abD=turn(a,b,d),cdA=turn(c,d,a),cdB=turn(c,d,b)
  return (abC*abD<0&&cdA*cdB<0)
    || [segmentDistance(a,c,d),segmentDistance(b,c,d),segmentDistance(c,a,b),segmentDistance(d,a,b)].some(x=>x<1e-8)
}

export function polygonArea(vertices:readonly Point[]) {
  return Math.abs(vertices.reduce((sum,a,i)=>{
    const b=vertices[(i+1)%vertices.length]
    return sum+a.x*b.y-a.y*b.x
  },0))/2
}

function selfIntersectionError(vertices:readonly Point[],closed:boolean) {
  const count=vertices.length-(closed?0:1)
  const start=(i:number)=>vertices[(i+vertices.length)%vertices.length]
  for(let i=0;i<count;i++) {
    for(let j=i+2;j<count;j++) {
      if(closed&&i===0&&j===count-1)continue
      if(intersects(start(i),start(i+1),start(j),start(j+1)))return '图形不能自相交或包含重叠的线段。'
    }
  }
}

export function trackError(vertices:readonly Point[],closed:boolean) {
  if(vertices.length<(closed?3:2)||vertices.length>TRACK_VERTEX_LIMIT)return '轨道需要 2 至 256 个顶点，闭合轨道至少需要 3 个。'
  const count=vertices.length-(closed?0:1)
  const start=(i:number)=>vertices[(i+vertices.length)%vertices.length]
  for(let i=0;i<count;i++) {
    const a=start(i),b=start(i+1)
    const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy)
    if(length<TRACK_MIN_EDGE)return '轨道含小于 0.02 m 的线段。请放大图形或提高容差。'
    if(i<count-1||closed) {
      const c=start(i+2),x=c.x-b.x,y=c.y-b.y
      if(dx*x+dy*y<-0.98*length*Math.hypot(x,y))return '轨道转角过尖，无法稳定计算碰撞。'
    }
  }
  return selfIntersectionError(vertices,closed)?.replace('图形','轨道')
}

export function isSimplePolygon(vertices:readonly Point[]) {
  return vertices.length>=3&&!selfIntersectionError(vertices,true)
}

export function freeformError(vertices:readonly Point[],closed:boolean,dynamic=false) {
  if(vertices.length<(closed?3:2)||vertices.length>TRACK_VERTEX_LIMIT)return '手绘图形需要 2 至 256 个顶点，封闭图形至少需要 3 个。'
  const count=vertices.length-(closed?0:1)
  for(let i=0;i<count;i++) {
    const a=vertices[i],b=vertices[(i+1)%vertices.length]
    if(Math.hypot(b.x-a.x,b.y-a.y)<TRACK_MIN_EDGE)return '手绘图形含小于 0.02 m 的线段。请放大图形。'
  }
  if(dynamic&&!closed)return '动态物块必须使用封闭曲线。'
  if(closed) {
    const error=selfIntersectionError(vertices,true)
    if(error)return error
    if(dynamic&&polygonArea(vertices)<0.0001)return '手绘物块的面积过小，请画得更大一些。'
  }
}
