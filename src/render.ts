import { rotate, screenPoint, worldPoint, displayPoint, polarComponents, polarPosition, type View } from './coordinates'
import { ballisticDuration, projectile, type Sample } from './analysis'
import { DEFAULT_WORLD_BOUNDS, type BodyConfig, type Camera, type Experiment, type Point } from './model'
import type { Physics } from './physics'
import type { RecordedSample } from './replay'
import type { SurfaceSnap } from './surfaceSnap'
import { resizeHandles } from './resizeBody'
import { rotationGuide } from './rotationHandle'
import { roleVisual } from './objectRole'
import { coordinateGridStep, drawCoordinates } from './coordinateOverlay'

const palette = {
  mint:['#d2d2d0','#f5f5f2'], blue:['#899bbd','#b9c9ef'],
  amber:['#947650','#f2c38b'], slate:['#303035','#717178'],
} as const
export function inkColors(color:string):[string,string] {
  if(color in palette) {
    const [fill,stroke]=palette[color as keyof typeof palette]
    return [fill,stroke]
  }
  return /^#[0-9a-fA-F]{6}$/.test(color)?[color+'55',color]:['#d2d2d055','#d2d2d0']
}
export type Display = {grid:boolean; reference:boolean; trails:boolean; velocity:boolean; acceleration:boolean; forces:boolean; vectorScale:number}
export const defaultDisplay: Display = {grid:true, reference:true,trails:true,velocity:true,acceleration:false,forces:false,vectorScale:1}
export type ReplayView = {tracks:ReadonlyMap<string,RecordedSample[]>;index:number;externalForceApplied?:true}
export type Overlay = {points:Point[]; color?:string; strokeWidth?:number; dash?:number[]}
export type EraseView = {segments:{points:Point[];color:string;strokeWidth?:number}[];cursor?:Point;radius:number}

function path(ctx:CanvasRenderingContext2D, points:Point[], color:string, dash:number[]=[]) {
  if (!points.length) return
  ctx.beginPath()
  ctx.moveTo(points[0].x,points[0].y)
  for (const p of points.slice(1)) ctx.lineTo(p.x,p.y)
  ctx.strokeStyle=color
  ctx.setLineDash(dash)
  ctx.stroke()
  ctx.setLineDash([])
}

function arrow(ctx:CanvasRenderingContext2D, a:Point, b:Point, color:string, text:string) {
  const length = Math.hypot(b.x-a.x,b.y-a.y)
  if (length<6) return
  const angle = Math.atan2(b.y-a.y,b.x-a.x)
  ctx.lineWidth=1.5
  path(ctx,[a,b],color)
  ctx.beginPath()
  ctx.moveTo(b.x,b.y)
  for (const offset of [-0.42,0.42]) ctx.lineTo(b.x-9*Math.cos(angle+offset),b.y-9*Math.sin(angle+offset))
  ctx.closePath()
  ctx.fillStyle=color
  ctx.fill()
  if(text)ctx.fillText(text,b.x+8,b.y-8)
}

function shape(ctx:CanvasRenderingContext2D,b:BodyConfig,center:Point,angle:number,scale:number,selected:boolean,simple:boolean,dash?:number) {
  const [fill,stroke] = inkColors(b.color), g = b.geometry, visual=roleVisual(b)
  ctx.save()
  ctx.translate(center.x,center.y)
  ctx.rotate(-angle)
  if((g.kind==='track')||(g.kind==='freeform'&&!g.closed)) {
    const vertices=g.vertices.map(p=>({x:p.x*scale,y:-p.y*scale}))
    if(g.kind==='track'&&g.closed)vertices.push(vertices[0])
    const strokeWidth=b.strokeWidth??2.4
    ctx.lineWidth=selected?strokeWidth+.8:strokeWidth
    ctx.lineCap='round'
    ctx.lineJoin='round'
    ctx.lineDashOffset=dash??0
    path(ctx,vertices,selected?'#ffffff':visual.stroke??stroke,visual.dash??(dash===undefined?[]:[8,6]))
    ctx.restore()
    return
  }
  ctx.beginPath()
  if (g.kind==='circle') ctx.arc(0,0,g.radius*scale,0,Math.PI*2)
  else if (g.kind==='ellipse') ctx.ellipse(0,0,g.radiusX*scale,g.radiusY*scale,0,0,Math.PI*2)
  else if (g.kind==='polygon'||g.kind==='freeform') {
    g.vertices.forEach((p,i)=>i===0?ctx.moveTo(p.x*scale,-p.y*scale):ctx.lineTo(p.x*scale,-p.y*scale))
    ctx.closePath()
  } else ctx.rect(-g.width*scale/2,-g.height*scale/2,g.width*scale,g.height*scale)
  ctx.fillStyle=fill
  if(visual.filled&&!simple) {
    const gradient=ctx.createLinearGradient(0,-18,0,27)
    gradient.addColorStop(0,fill)
    gradient.addColorStop(1,b.color==='slate'?'#1a1a1e':b.color in palette?fill+'7d':stroke+'2a')
    ctx.fillStyle=gradient
  }
  ctx.strokeStyle=visual.stroke??stroke
  ctx.lineWidth=b.strokeWidth??1.1
  ctx.setLineDash(visual.dash??[])
  if(visual.filled)ctx.fill()
  ctx.stroke()
  ctx.setLineDash([])
  if(visual.badge) {
    ctx.beginPath();ctx.arc(0,0,9,0,Math.PI*2)
    ctx.fillStyle='#16161a';ctx.fill()
    ctx.strokeStyle=visual.stroke??stroke;ctx.lineWidth=1.2;ctx.stroke()
    ctx.fillStyle='#f5f5f2';ctx.font='bold 11px "JetBrains Mono Variable", monospace'
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(visual.badge,0,.5)
  }
  if (g.kind==='surface') {
    ctx.save();ctx.clip()
    const halfWidth=g.width*scale/2, halfHeight=g.height*scale/2
    ctx.beginPath()
    for (let x=-halfWidth-halfHeight*2;x<halfWidth;x+=12) {
      ctx.moveTo(x,halfHeight);ctx.lineTo(x+halfHeight*2,-halfHeight)
    }
    ctx.strokeStyle='#adadb855';ctx.stroke();ctx.restore()
  }
  if (selected) {
    const radius=g.kind==='circle'?g.radius*scale:0
    ctx.strokeStyle='#f5f5f2'
    ctx.lineWidth=dash===undefined?1:2
    ctx.setLineDash(dash===undefined?[4,4]:[8,6])
    ctx.lineDashOffset=dash??0
    ctx.beginPath()
    if (radius) ctx.arc(0,0,radius+6,0,Math.PI*2)
    else if (g.kind==='ellipse') ctx.ellipse(0,0,g.radiusX*scale+6,g.radiusY*scale+6,0,0,Math.PI*2)
    else if (g.kind==='polygon'||g.kind==='freeform') {
      g.vertices.forEach((p,i)=>i===0?ctx.moveTo(p.x*scale*1.08,-p.y*scale*1.08):ctx.lineTo(p.x*scale*1.08,-p.y*scale*1.08))
      ctx.closePath()
    } else if (g.kind==='rectangle'||g.kind==='surface') ctx.rect(-g.width*scale/2-5,-g.height*scale/2-5,g.width*scale+10,g.height*scale+10)
    ctx.stroke()
  }
  ctx.restore()
}

export function drawScene(ctx:CanvasRenderingContext2D, view:View, camera:Camera, scene:Experiment, display:Display, options:{
  physics?:Physics; selected?:string; overlay?:Overlay; trailSince?:number; baseline?:Sample[]; diagram?:boolean; replay?:ReplayView; move?:Map<string,Point>; snap?:SurfaceSnap; highlight?:string; dash?:number
  editing?:string; edit?:{body:BodyConfig;scaleAnchor?:(anchor:Point)=>Point}; rotating?:boolean; hidden?:ReadonlySet<string>; erase?:EraseView
}={}) {
  const {width,height}=view
  const {physics, selected, overlay, baseline, diagram, replay, move, snap, highlight, dash, edit, hidden, erase}=options
  const p=(v:Point)=>screenPoint(v,camera,view)
  ctx.clearRect(0,0,width,height)
  ctx.font=(diagram?'11':'10')+'px "JetBrains Mono Variable", "Microsoft YaHei UI", "PingFang SC", "Noto Sans CJK SC", monospace'
  ctx.lineWidth=1
  const major=coordinateGridStep(camera.scale)
  drawCoordinates(ctx,view,camera,scene.coordinates,display.grid,!diagram)

  if (scene.environment.boundaries) {
    const {minX,maxX,minY,maxY}=scene.environment.worldBounds??DEFAULT_WORLD_BOUNDS
    const a=p({x:minX,y:maxY}), b=p({x:maxX,y:minY})
    ctx.strokeStyle='#bc985f';ctx.setLineDash([5,4]);ctx.strokeRect(a.x,a.y,b.x-a.x,b.y-a.y);ctx.setLineDash([])
  }
  const projectileBody=scene.bodies.find(b=>b.type==='dynamic')
  const referenceDuration=display.reference&&projectileBody&&!physics?.externalForceApplied&&!replay?.externalForceApplied
    ?ballisticDuration(scene,projectileBody):undefined
  if (projectileBody&&referenceDuration!==undefined&&referenceDuration>0) {
    const b=projectileBody
    const g=scene.environment.gravity
    const duration=Math.min(12,referenceDuration)
    const pts=Array.from({length:61},(_,i)=>p(projectile(b.position,b.velocity,g,duration*i/60)))
    ctx.lineWidth=1.6
    path(ctx,pts,'#a6bfff',[4,6])
    const apex=g>0?b.velocity.y/g:-1
    if (apex>0 && apex<duration) {
      const peak=p(projectile(b.position,b.velocity,g,apex))
      ctx.beginPath();ctx.arc(peak.x,peak.y,4,0,2*Math.PI);ctx.fillStyle='#a6bfff';ctx.fill()
      ctx.fillText('最高点',peak.x+10,peak.y-10)
    }
    if(duration===referenceDuration) {
      const end=pts.at(-1)!
      ctx.beginPath();ctx.arc(end.x,end.y,4,0,2*Math.PI);ctx.strokeStyle='#a6bfff';ctx.stroke()
    }
  }
  if(baseline?.length) {
    ctx.lineWidth=1.5
    path(ctx,baseline.map(p),'#d5b8f5',[5,4])
  }
  const tracks=replay?.tracks??physics?.samples
  if(display.trails&&tracks) {
    for(const [id,samples] of tracks) {
      const end=replay?replay.index+1:samples.length
      const trail=samples.slice(Math.max(0,end-450),end).filter(s=>replay||s.time>=(options.trailSince??0))
      ctx.lineWidth=2
      path(ctx,trail.map(p),id===selected?'#a6bfff':'#a6bfff96')
    }
  }
  const configs=new Map(scene.bodies.map(b=>[b.id,b]))
  function anchor(id:string,local:Point) {
    const config=configs.get(id)!
    const pose=replay?.tracks.get(id)?.[replay.index]
    const live=physics?.bodies.get(id)
    const snapped=snap?.bodyId===id?snap:undefined
    const edited=edit?.body.id===id?edit:undefined
    const at=snapped?.position??edited?.body.position??move?.get(id)??pose??live?.getPosition()??config.position
    const offset=rotate(edited?.scaleAnchor?.(local)??local,edited?.body.angle??snapped?.angle??pose?.angle??live?.getAngle()??config.angle)
    return {x:at.x+offset.x,y:at.y+offset.y}
  }
  for (const j of scene.joints) {
    if(hidden?.has(j.a)||hidden?.has(j.b))continue
    const a=p(anchor(j.a,j.anchorA))
    const b=p(anchor(j.b,j.anchorB))
    const len=Math.hypot(b.x-a.x,b.y-a.y)
    if(len<1) continue
    const pts=Array.from({length:23},(_,i)=>{
      const offset=i<2||i>20?0:(i%2?1:-1)*7
      return {x:a.x+(b.x-a.x)*i/22-(b.y-a.y)*offset/len,y:a.y+(b.y-a.y)*i/22+(b.x-a.x)*offset/len}
    })
    ctx.lineWidth=j.id===selected?2.8:1.6
    path(ctx,pts,j.id===selected?'#ffe0a6':'#dcab70')
    if(j.id===highlight) {
      ctx.save()
      ctx.translate(a.x,a.y)
      ctx.rotate(Math.atan2(b.y-a.y,b.x-a.x))
      ctx.strokeStyle='#f5f5f2';ctx.lineWidth=2;ctx.setLineDash([8,6]);ctx.lineDashOffset=dash??0
      ctx.strokeRect(-5,-12,len+10,24)
      ctx.restore()
    }
  }
  const manyBodies=scene.bodies.length>=40
  for (const b of scene.bodies) {
    if(hidden?.has(b.id))continue
    const live=physics?.bodies.get(b.id)
    const pose=replay?.tracks.get(b.id)?.[replay.index]
    const snapped=snap?.bodyId===b.id?snap:undefined
    const edited=edit?.body.id===b.id?edit.body:undefined
    const position=snapped?.position??edited?.position??move?.get(b.id)??pose??live?.getPosition()??b.position
    const at=p(position)
    const angle=edited?.angle??snapped?.angle??pose?.angle??live?.getAngle()??b.angle
    const velocity=pose?{x:pose.vx,y:pose.vy}:live?.getLinearVelocity()??b.velocity
    shape(ctx,edited??b,at,angle,camera.scale,b.id===selected,manyBodies&&b.id!==selected,b.id===highlight?dash:undefined)
    if (b.type==='static') continue
    function drawVector(vector:Point, scale:number, color:string, label:string) {
      const factor=scale*display.vectorScale*camera.scale
      arrow(ctx,at,{x:at.x+vector.x*factor,y:at.y-vector.y*factor},color,manyBodies&&b.id!==selected?'':label)
    }
    if (display.velocity) drawVector(velocity,0.17,'#a6bfff','v')
    if (display.acceleration) drawVector(pose?{x:pose.ax,y:pose.ay}:physics?.acceleration.get(b.id)??{x:0,y:-scene.environment.gravity},0.09,'#f2c38b','a')
    if (display.forces && physics) for(const force of physics.forceVectors(b.id)) drawVector(force.vector,0.075,force.color,force.name)
    if (b.id===selected && !diagram) {
      ctx.fillStyle='#f5f5f2';ctx.fillText(b.name,at.x+22,at.y+25)
      if(scene.coordinates.mode==='cartesian') {
        const display=displayPoint(position,scene.coordinates.origin)
        ctx.fillStyle='#a6a6a6';ctx.fillText('x '+display.x.toFixed(2)+'  y '+display.y.toFixed(2)+' m',at.x+22,at.y+39)
      } else if(scene.coordinates.mode==='polar') {
        const polar=polarPosition(position,scene.coordinates.origin)
        const components=polarComponents(position,velocity,scene.coordinates.origin)
        ctx.fillStyle='#a6a6a6';ctx.fillText('r '+polar.r.toFixed(2)+' m  θ '+(polar.theta===undefined?'—':(polar.theta*180/Math.PI).toFixed(1)+'°'),at.x+22,at.y+39)
        if(components)ctx.fillText('vr '+components.radial.toFixed(2)+'  vt '+components.tangential.toFixed(2)+' m/s',at.x+22,at.y+53)
      }
    }
  }
  if (options.editing) {
    const body=edit?.body??configs.get(options.editing)
    if(body) {
      const live=physics?.bodies.get(body.id)
      const position=snap?.position??edit?.body.position??move?.get(body.id)??live?.getPosition()??body.position
      const angle=edit?.body.angle??snap?.angle??live?.getAngle()??body.angle
      const center=p(position)
      ctx.save()
      ctx.fillStyle='#cceaff';ctx.strokeStyle='#1f5471';ctx.lineWidth=1.5
      for(const h of resizeHandles(body.geometry)) {
        const offset=rotate(h.point,angle)
        const x=center.x+offset.x*camera.scale-3.5,y=center.y-offset.y*camera.scale-3.5
        ctx.fillRect(x,y,7,7);ctx.strokeRect(x,y,7,7)
      }
      const guide=rotationGuide({...body,position,angle},camera.scale)
      drawRotationGrip(ctx,p(guide.edge),p(guide.handle),options.rotating?angle:undefined)
      ctx.restore()
    }
  }
  if (snap) {
    const [a,b]=snap.contact.map(p)
    ctx.save()
    ctx.strokeStyle='#96f2d3'
    ctx.fillStyle='#96f2d3'
    ctx.lineWidth=3
    ctx.lineCap='round'
    ctx.beginPath()
    if (Math.hypot(a.x-b.x,a.y-b.y)<4) {
      ctx.arc(a.x,a.y,3,0,Math.PI*2)
      ctx.fill()
    } else {
      ctx.moveTo(a.x,a.y)
      ctx.lineTo(b.x,b.y)
      ctx.stroke()
    }
    ctx.restore()
  }
  if (overlay) {ctx.lineWidth=overlay.strokeWidth??1.7;ctx.lineCap='round';ctx.lineJoin='round';path(ctx,overlay.points.map(p),overlay.color??'#91d9ff',overlay.dash??(overlay.strokeWidth?[]:[5,4]))}
  if(erase) {
    ctx.save()
    ctx.lineCap='round'
    ctx.lineJoin='round'
    for(const segment of erase.segments) {
      ctx.lineWidth=segment.strokeWidth??2.4
      path(ctx,segment.points.map(p),inkColors(segment.color)[1])
    }
    if(erase.cursor) {
      const at=p(erase.cursor)
      ctx.beginPath()
      ctx.arc(at.x,at.y,erase.radius*camera.scale,0,Math.PI*2)
      ctx.fillStyle='#f5f5f21c'
      ctx.strokeStyle='#f5f5f2aa'
      ctx.lineWidth=1.4
      ctx.setLineDash([5,4])
      ctx.fill();ctx.stroke()
    }
    ctx.restore()
  }
  if (diagram) return
  if(scene.coordinates.mode!=='none') {
    const scaleLength = Math.min(major,1)*camera.scale
    const x=width-scaleLength-23, y=height-20
    ctx.lineWidth=1
    path(ctx,[{x,y:y-4},{x,y},{x:x+scaleLength,y},{x:x+scaleLength,y:y-4}],'#a6a6a6')
    ctx.fillStyle='#d2d2d0';ctx.fillText(Math.min(1,major)+' m',x+5,y-8)
  }
  const lc=worldPoint({x:0,y:0},camera,view)
  if (!Number.isFinite(lc.x)) throw new Error('视图坐标无效。')
}

function drawRotationGrip(ctx:CanvasRenderingContext2D,edge:Point,grip:Point,angle?:number) {
  const active=angle!==undefined
  ctx.lineWidth=1.5
  path(ctx,[edge,grip],active?'#ffd796':'#87c5e9')
  ctx.beginPath();ctx.arc(grip.x,grip.y,10,0,2*Math.PI)
  ctx.fillStyle=active?'#ffd796':'#183651';ctx.fill()
  ctx.strokeStyle=active?'#714f26':'#a6dbf8';ctx.stroke()
  ctx.beginPath();ctx.arc(grip.x,grip.y,4.3,-1.1,3.95);ctx.stroke()
  const x=grip.x+4.3*Math.cos(3.95),y=grip.y+4.3*Math.sin(3.95)
  path(ctx,[{x:x-2,y:y+1},{x,y},{x:x+2.8,y:y+.5}],ctx.strokeStyle)
  if(active) {
    const label=(Math.round(angle*180/Math.PI)||0)+'°'
    ctx.fillStyle='#101b2e'
    ctx.fillRect(grip.x+13,grip.y-9,ctx.measureText(label).width+8,18)
    ctx.fillStyle='#ffd796';ctx.fillText(label,grip.x+17,grip.y+3)
  }
}
