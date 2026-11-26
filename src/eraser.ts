import type { BodyConfig, Point } from './model'
import { centroid, containsPoint, densify, toLocal, toWorld } from './freeform'
import { segmentDistance, simplifyPath } from './track'

export type EraserMode = 'stroke'|'drag'
export type EraseResult = {
  bodies: BodyConfig[]
  removed: Set<string>
  hidden: Set<string>
  segments: {points:Point[];color:string;name:string;strokeWidth?:number}[]
  changed: boolean
}

function pathDistance(point:Point,path:readonly Point[]) {
  if(path.length===1)return Math.hypot(point.x-path[0].x,point.y-path[0].y)
  let nearest=Infinity
  for(let i=0;i<path.length-1;i++)nearest=Math.min(nearest,segmentDistance(point,path[i],path[i+1]))
  return nearest
}

function touched(body:BodyConfig,path:readonly Point[],radius:number) {
  return path.some(point=>containsPoint(body,point,radius))
}

function cleanRun(points:Point[],spacing:number) {
  const spaced:Point[]=[]
  for(const point of points) {
    const last=spaced.at(-1)
    if(!last||Math.hypot(point.x-last.x,point.y-last.y)>=0.02)spaced.push(point)
  }
  if(spaced.length<2&&points.length)spaced.push(points.at(-1)!)
  let tolerance=Math.max(0.01,spacing*0.55)
  let simplified=simplifyPath(spaced,tolerance)
  while(simplified.length>256)simplified=simplifyPath(spaced,tolerance*=1.5)
  return simplified.length>=2?simplified:undefined
}

function runBody(original:BodyConfig,points:Point[]) {
  const center=centroid(points),vertices=toLocal(points,center)
  const geometry=original.geometry.kind==='track'
    ? {kind:'track' as const,vertices,closed:false}
    : {kind:'freeform' as const,vertices,closed:false}
  return {
    ...original,id:crypto.randomUUID(),geometry,position:center,type:'static' as const,
    angle:0,velocity:{x:0,y:0},angularVelocity:0,
  }
}

function splitStroke(original:BodyConfig,path:readonly Point[],radius:number,spacing:number) {
  const g=original.geometry
  if(g.kind!=='freeform'&&g.kind!=='track')return
  const world=toWorld(original,g.vertices)
  const samples=densify(world,g.closed,spacing)
  if(samples.length<2)return
  const keep=samples.map(point=>pathDistance(point,path)>radius)
  if(keep.every(Boolean))return {unchanged:true as const}
  if(keep.every(value=>!value))return {bodies:[] as BodyConfig[],segments:[] as EraseResult['segments']}

  const runs:Point[][]=[]
  if(g.closed) {
    const removedIndex=keep.findIndex(value=>!value)
    let run:Point[]=[]
    for(let step=0;step<samples.length;step++) {
      const index=(removedIndex+step)%samples.length
      if(keep[index]) run.push(samples[index])
      else if(run.length) {runs.push(run);run=[]}
    }
    if(run.length)runs.push(run)
  } else {
    let run:Point[]=[]
    for(let i=0;i<samples.length;i++) {
      if(keep[i])run.push(samples[i])
      else if(run.length){runs.push(run);run=[]}
    }
    if(run.length)runs.push(run)
  }

  const bodies:BodyConfig[]=[]
  const segments:EraseResult['segments']=[]
  for(const run of runs) {
    const cleaned=cleanRun(run,spacing)
    if(!cleaned)continue
    bodies.push(runBody(original,cleaned))
    segments.push({points:cleaned,color:original.color,name:original.name,strokeWidth:original.strokeWidth})
  }
  return {bodies,segments}
}

export function eraseBodies(original:readonly BodyConfig[],rawPath:readonly Point[],radius:number,mode:EraserMode):EraseResult {
  const path=rawPath.length>1?densify(rawPath,false,Math.max(0.02,radius/2)):rawPath
  const bodies:BodyConfig[]=[]
  const removed=new Set<string>(),hidden=new Set<string>(),segments:EraseResult['segments']=[]
  let changed=false
  for(const candidate of original) {
    if(!touched(candidate,path,radius)) {bodies.push(candidate);continue}
    changed=true
    const g=candidate.geometry
    if(mode==='drag'&&candidate.type==='static'&&(g.kind==='freeform'||g.kind==='track')) {
      const perimeter=g.vertices.reduce((sum,p,i)=>{
        const next=g.vertices[(i+1)%g.vertices.length]
        return i===g.vertices.length-1&&!g.closed?sum:sum+Math.hypot(next.x-p.x,next.y-p.y)
      },0)
      const spacing=Math.max(0.02,Math.min(radius/2,perimeter/240))
      const split=splitStroke(candidate,path,radius,spacing)
      if(split&&'unchanged' in split) {bodies.push(candidate);changed=false;continue}
      if(split&&'bodies' in split) {
        hidden.add(candidate.id);removed.add(candidate.id)
        bodies.push(...split.bodies);segments.push(...split.segments)
        continue
      }
    }
    hidden.add(candidate.id);removed.add(candidate.id)
  }
  return {bodies,removed,hidden,segments,changed}
}