import { rotate } from './coordinates'
import type { BodyConfig, Point } from './model'

export type SurfaceSnap = {
  bodyId: string
  surfaceName: string
  side: 'above' | 'below'
  position: Point
  angle: number
  contact: [Point, Point]
}

const rectangleCorners = (width: number, height: number) => [
  {x:-width/2, y:-height/2}, {x:width/2, y:-height/2},
  {x:width/2, y:height/2}, {x:-width/2, y:height/2},
]

type Level = {y:number; left:number; right:number}
type Section = {bottom:Level; top:Level; centerY:number}
const EPS = 1e-8

// Vertical extent inside the actual length of the surface, including overhanging ends.
function section(geometry: BodyConfig['geometry'], angle: number, x: number, halfWidth: number): Section | undefined {
  if (geometry.kind === 'circle') {
    const nearest=Math.max(-halfWidth,Math.min(halfWidth,x))
    const dx=nearest-x
    if(Math.abs(dx)>=geometry.radius)return
    const height=Math.sqrt(geometry.radius**2-dx**2)
    return {bottom:{y:-height,left:nearest,right:nearest},top:{y:height,left:nearest,right:nearest},centerY:0}
  }
  const vertices = geometry.kind === 'polygon' || geometry.kind === 'track' || geometry.kind === 'freeform' ? geometry.vertices
    : geometry.kind === 'ellipse' ? Array.from({length:64},(_,i)=>{
      const angle=i*Math.PI/32
      return {x:geometry.radiusX*Math.cos(angle),y:geometry.radiusY*Math.sin(angle)}
    })
    : rectangleCorners(geometry.width, geometry.height)
  const points = vertices.map(p => { const q=rotate(p,angle); return {x:q.x+x,y:q.y} })
  if(Math.min(...points.map(p=>p.x))>=halfWidth-EPS || Math.max(...points.map(p=>p.x))<=-halfWidth+EPS)return
  const clipped=points.filter(p=>Math.abs(p.x)<=halfWidth)
  for(let i=0;i<points.length;i++) {
    const a=points[i],b=points[(i+1)%points.length]
    for(const edge of [-halfWidth,halfWidth]) {
      if((a.x<edge && b.x>edge)||(a.x>edge && b.x<edge))
        clipped.push({x:edge,y:a.y+(b.y-a.y)*(edge-a.x)/(b.x-a.x)})
    }
  }
  function level(y:number):Level {
    const xs=clipped.filter(p=>Math.abs(p.y-y)<EPS).map(p=>p.x)
    return {y,left:Math.min(...xs),right:Math.max(...xs)}
  }
  const ys=points.map(p=>p.y), clippedYs=clipped.map(p=>p.y)
  return {bottom:level(Math.min(...clippedYs)),top:level(Math.max(...clippedYs)),centerY:(Math.min(...ys)+Math.max(...ys))/2}
}

function parallelAngle(geometry: BodyConfig['geometry'], angle: number, surfaceAngle: number) {
  if (geometry.kind === 'circle') return angle
  if (geometry.kind !== 'polygon' && geometry.kind !== 'freeform') {
    const quarterTurn = Math.PI / 2
    return surfaceAngle + Math.round((angle - surfaceAngle) / quarterTurn) * quarterTurn
  }
  const vertices = geometry.vertices
  const signedArea = vertices.reduce((sum, p, i) => {
    const q = vertices[(i+1)%vertices.length]
    return sum + p.x*q.y - p.y*q.x
  }, 0)
  // Orient each edge with the interior above it, then choose the smallest rotation.
  const adjustments = vertices.map((p, i) => {
    const q = vertices[(i+1)%vertices.length]
    const edgeAngle = Math.atan2(q.y-p.y, q.x-p.x) + (signedArea < 0 ? Math.PI : 0)
    const delta = surfaceAngle - edgeAngle - angle
    return Math.atan2(Math.sin(delta), Math.cos(delta))
  })
  const adjustment = adjustments.reduce((best, delta) => Math.abs(delta) < Math.abs(best) ? delta : best)
  return angle + adjustment
}

interface SnapOptions {
  previousPosition?:Point
  overlapOnly?:boolean
  keepAngle?:boolean
}

function surfaceFrame(surface:BodyConfig,position:Point) {
  if(surface.geometry.kind!=='surface')return
  // A ramp drawn right-to-left has the same upward normal as one drawn left-to-right.
  const angle=surface.angle-Math.round(surface.angle/Math.PI)*Math.PI
  if(Math.abs(Math.cos(angle))<EPS)return
  const offset=surface.surfaceLine?rotate({x:0,y:surface.geometry.height/2},surface.angle):{x:0,y:0}
  const origin={x:surface.position.x+offset.x,y:surface.position.y+offset.y}
  const relative=rotate({x:position.x-origin.x,y:position.y-origin.y},-angle)
  return {angle,relative,origin,halfWidth:surface.geometry.width/2,halfHeight:surface.surfaceLine?0:surface.geometry.height/2}
}

function penetrates(cut:Section,centerY:number,halfHeight:number) {
  return centerY+cut.bottom.y < halfHeight-EPS && centerY+cut.top.y > -halfHeight+EPS
}

export function findSurfaceSnap(body: BodyConfig, position: Point, bodies: readonly BodyConfig[], scale: number,
  {previousPosition,overlapOnly=false,keepAngle=false}:SnapOptions={}) {
  if (body.type !== 'dynamic' || body.geometry.kind==='track') return
  const tolerance = Math.min(10 / scale, 0.25)
  const candidates:{snap:SurfaceSnap;overlaps:boolean;distance:number}[]=[]
  for (const surface of bodies) {
    const frame=surfaceFrame(surface,position)
    if(!frame)continue
    const {angle:surfaceAngle,relative,origin,halfWidth,halfHeight}=frame
    const raw=section(body.geometry,body.angle-surfaceAngle,relative.x,halfWidth)
    if(!raw)continue
    const overlaps=penetrates(raw,relative.y,halfHeight)
    const upperGap=relative.y+raw.bottom.y-halfHeight
    if(!overlaps && (overlapOnly || upperGap < -EPS || upperGap>tolerance || Math.abs(surfaceAngle)>=85*Math.PI/180))continue
    let center=relative.y+raw.centerY
    if(Math.abs(center)<EPS && previousPosition) {
      center=rotate({x:previousPosition.x-origin.x,y:previousPosition.y-origin.y},-surfaceAngle).y+raw.centerY
    }
    const below=overlaps && center < -EPS
    const normalAbove=Math.cos(surface.angle-surfaceAngle)>0
    if(surface.contactSide==='left'&&below===normalAbove || surface.contactSide==='right'&&below!==normalAbove)continue
    const face=below ? -halfHeight : halfHeight
    let angle=keepAngle?body.angle:parallelAngle(body.geometry,body.angle,surfaceAngle+(below?Math.PI:0))
    let aligned=angle===body.angle?raw:section(body.geometry,angle-surfaceAngle,relative.x,halfWidth)
    if(!aligned) {angle=body.angle;aligned=raw}
    const edge=below?aligned.top:aligned.bottom
    const targetY=face-edge.y
    const distance=Math.abs(targetY-relative.y)
    function toWorld(x: number, y: number) {
      const offset = rotate({x, y}, surfaceAngle)
      return {x:origin.x + offset.x, y:origin.y + offset.y}
    }
    const snap:SurfaceSnap = {bodyId:body.id, surfaceName:surface.name, side:below?'below':'above', position:toWorld(relative.x,targetY),
      angle, contact:[toWorld(edge.left,face),toWorld(edge.right,face)]}
    candidates.push({snap,overlaps,distance})
  }
  if(candidates.length<2)return candidates[0]?.snap
  candidates.sort((a,b)=>Number(b.overlaps)-Number(a.overlaps)||a.distance-b.distance)
  // At a junction, prefer a contact that also clears the adjacent surface.
  for(const {snap} of candidates) {
    const blocked=bodies.some(surface=>{
      const frame=surfaceFrame(surface,snap.position)
      if(!frame)return false
      const cut=section(body.geometry,snap.angle-frame.angle,frame.relative.x,frame.halfWidth)
      return cut && penetrates(cut,frame.relative.y,frame.halfHeight)
    })
    if(!blocked)return snap
  }
  return candidates[0].snap
}

// Correct only geometry affected by this edit. This also handles moving a surface
// into a stationary block, without rewriting unrelated objects in a saved scene.
export function separateEditedBodies(previous:readonly BodyConfig[], proposed:BodyConfig[]) {
  const before=new Map(previous.map(body=>[body.id,body]))
  function changed(body:BodyConfig) {
    const old=before.get(body.id)
    return !old || body.type!==old.type || body.position.x!==old.position.x || body.position.y!==old.position.y ||
      body.angle!==old.angle || body.surfaceLine!==old.surfaceLine || body.contactSide!==old.contactSide ||
      (body.geometry!==old.geometry && JSON.stringify(body.geometry)!==JSON.stringify(old.geometry))
  }
  const surfaces=proposed.filter(body=>body.geometry.kind==='surface')
  const editedSurfaces=surfaces.filter(changed)
  return proposed.map(body=>{
    if(body.type!=='dynamic')return body
    const candidates=changed(body)?surfaces:editedSurfaces
    if(!candidates.length)return body
    const snap=findSurfaceSnap(body,body.position,candidates,1,{overlapOnly:true,keepAngle:true,previousPosition:before.get(body.id)?.position})
    return snap?{...body,position:snap.position}:body
  })
}
