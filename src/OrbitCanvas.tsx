import { useLayoutEffect, useRef, useState } from 'react'
import { screenPoint, worldPoint, type View } from './coordinates'
import { barycentricPosition, referenceEllipse, TwoBodyOrbit } from './orbital-physics'
import { MAX_ORBIT_AXIS_AU, MIN_ORBIT_AXIS_AU, orbitalPrimary, type AstronomyExperiment, type CelestialBody } from './astronomy'
import { bodyAcceleration, systemCenter, orbitBodies, type AstronomySystem } from './astronomy-system'
import type { Point } from './model'

export type AstronomyViewMode='overview'|'follow'|'earth-moon'
type Props={scene:AstronomyExperiment;orbit?:TwoBodyOrbit;selected:string;setSelected:(id:string)=>void;zoom:number;revision:number;liveBodies:CelestialBody[];system?:AstronomySystem;editBodies:(b:CelestialBody[])=>void;scaleOrbit:(factor:number)=>void;pause:()=>void;followBackground:boolean;running:boolean;active:boolean;fitRevision:number;viewMode:AstronomyViewMode}
type Camera={x:number;y:number;scale:number}
const colors=['#f2c38b','#a6bfff','#79d2b6','#e69ba9','#d7b7ff','#9dd6e8','#e8d18c','#c1d28f']
const bodyColor=(body:CelestialBody,index:number)=>body.kind==='star'?colors[0]:colors[1+(index%(colors.length-1))]

function arrow(ctx:CanvasRenderingContext2D,origin:Point,vector:Point,color:string,length:number,offset:number) {
  const angle=Math.atan2(-vector.y,vector.x),magnitude=Math.hypot(vector.x,vector.y)
  const start={x:origin.x+Math.cos(angle)*offset,y:origin.y+Math.sin(angle)*offset}
  const end={x:start.x+Math.cos(angle)*length,y:start.y+Math.sin(angle)*length}
  stroke(ctx,[start,end],color,1.3)
  for(const direction of [-.55,.55])stroke(ctx,[end,{x:end.x-6*Math.cos(angle+direction),y:end.y-6*Math.sin(angle+direction)}],color,1.3)
  if(magnitude<1e-15)return
}

export function localAnchor(bodies:CelestialBody[],selected:string,mode:AstronomyViewMode) {
  return mode==='earth-moon'?bodies.find(b=>b.name==='地球'):mode==='follow'?bodies.find(b=>b.id===selected):undefined
}

function frameCamera(view:View,scene:AstronomyExperiment,selected:string,zoom:number,orbit:TwoBodyOrbit|undefined,bodies:CelestialBody[],mode:AstronomyViewMode):Camera {
  const anchor=localAnchor(bodies,selected,mode)
  const moon=bodies.find(b=>b.name==='月球')
  if(mode==='earth-moon'&&anchor&&moon) {
    const distance=Math.max(1e-7,Math.hypot(moon.position.x-anchor.position.x,moon.position.y-anchor.position.y))
    return {x:anchor.position.x,y:anchor.position.y,scale:Math.min(view.width,view.height)*.34/distance*zoom}
  }
  const reference=orbit?.elements
  const initialDistance=orbit?Math.hypot(orbit.initial.relative.x,orbit.initial.relative.y):1
  const ellipse=referenceEllipse(reference)
  const radius=Math.max(1e-7,reference?.axis?initialDistance:orbit?.maximumDistance??initialDistance)
  const maxX=ellipse.length?Math.max(radius/20,...ellipse.map(point=>Math.abs(point.x))):radius
  const maxY=ellipse.length?Math.max(radius/20,...ellipse.map(point=>Math.abs(point.y))):radius
  const origin=systemCenter(bodies.length?bodies:scene.bodies)
  const extent=Math.max(.01,...scene.bodies.map(b=>Math.hypot(b.position.x-origin.x,b.position.y-origin.y)))
  const focus=anchor?.position??(zoom>1?(bodies.find(b=>b.id===selected)?.position??scene.bodies.find(b=>b.id===selected)?.position??origin):origin)
  return {x:focus.x,y:focus.y,scale:Math.min(view.width*.42/(orbit?maxX:extent*1.3),view.height*.40/(orbit?maxY:extent*1.3))*zoom}
}

function stroke(ctx:CanvasRenderingContext2D,points:Point[],color:string,width=1) {
  if(points.length<2)return
  ctx.beginPath();ctx.moveTo(points[0].x,points[0].y)
  for(let index=1;index<points.length;index++)ctx.lineTo(points[index].x,points[index].y)
  ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke()
}

function paint(ctx:CanvasRenderingContext2D,view:View,scene:AstronomyExperiment,selected:string,orbit:TwoBodyOrbit|undefined,bodies:CelestialBody[],camera:Camera,system?:AstronomySystem,anchorId?:string,axisOrigin?:Point) {
  const layers=scene.layers
  const reference=orbit?.elements
  const initialDistance=orbit?Math.hypot(orbit.initial.relative.x,orbit.initial.relative.y):1
  const ellipse=referenceEllipse(reference)
  const origin=systemCenter(bodies.length?bodies:scene.bodies)
  const relativeScreen=(p:Point)=>screenPoint({x:p.x+origin.x,y:p.y+origin.y},camera,view)
  const tracks:Point[][]=[]
  const screen=(point:Point)=>screenPoint(point,camera,view)
  const anchorIndex=bodies.findIndex(b=>b.id===anchorId),anchor=bodies[anchorIndex]
  const center=screen(anchor?.position??origin)
  ctx.fillStyle='#101012';ctx.fillRect(0,0,view.width,view.height)
  const unit=10**Math.round(Math.log10(57/camera.scale)),spacing=unit*camera.scale
  ctx.beginPath()
  const gridOrigin=axisOrigin?screen(axisOrigin):center
  for(let x=gridOrigin.x%spacing;x<view.width;x+=spacing) {ctx.moveTo(x,0);ctx.lineTo(x,view.height)}
  for(let y=gridOrigin.y%spacing;y<view.height;y+=spacing) {ctx.moveTo(0,y);ctx.lineTo(view.width,y)}
  ctx.strokeStyle='#2a2a30';ctx.lineWidth=1;ctx.stroke()
  stroke(ctx,[{x:gridOrigin.x,y:0},{x:gridOrigin.x,y:view.height}],'#4b4b55')
  stroke(ctx,[{x:0,y:gridOrigin.y},{x:view.width,y:gridOrigin.y}],'#4b4b55')

  ctx.font='11px monospace';ctx.textAlign='left';ctx.textBaseline='alphabetic'
  ctx.fillStyle='#bcbcc2';ctx.fillText((anchor?anchor.name+'相对视图':'系统坐标')+' · '+Number(unit.toPrecision(3))+' AU / 格',12,view.height-13)

  if(orbit) {
    const companion=(point:Point)=>relativeScreen(barycentricPosition(point,orbit.bodies,1))
    if(layers.sweeps) {
      const sweeps=[orbit.firstSweep,orbit.lastSweep===orbit.firstSweep?undefined:orbit.lastSweep]
      sweeps.forEach((sweep,index)=>{
        if(!sweep||sweep.samples.length<2)return
        ctx.beginPath();ctx.moveTo(center.x,center.y)
        for(const sample of sweep.samples) {
          const point=companion(sample.relative)
          ctx.lineTo(point.x,point.y)
        }
        ctx.closePath();ctx.fillStyle=index?'#f2c38b45':'#a6bfff45';ctx.fill()
        ctx.strokeStyle=index?'#f2c38b9a':'#a6bfff9a';ctx.lineWidth=1;ctx.stroke()
      })
    }
    for(const index of [0,1] as const) {
      const world=(point:Point)=>relativeScreen(barycentricPosition(point,orbit.bodies,index))
      if(layers.reference&&ellipse.length) {
        ctx.setLineDash([5,5])
        stroke(ctx,ellipse.map(world),colors[index%2]+'94')
        tracks.push(ellipse.map(world))
        ctx.setLineDash([])
      }
      if(layers.trails)stroke(ctx,orbit.history.map(sample=>world(sample.relative)).concat(world(orbit.current.relative)),colors[index%2],1.7)
    }
    if(layers.apsides&&reference?.axis&&reference.eccentricity>1e-6) {
      for(const [distance,label] of [[reference.periapsis,'近心点'],[-reference.apoapsis!,'远心点']] as const) {
        const point=companion({x:Math.cos(reference.direction)*distance,y:Math.sin(reference.direction)*distance})
        ctx.beginPath();ctx.arc(point.x,point.y,3,0,2*Math.PI);ctx.strokeStyle='#d5b8f5';ctx.stroke()
        ctx.textAlign=point.x>view.width-60?'right':'left';ctx.fillStyle='#d5b8f5'
        ctx.fillText(label,point.x+(point.x>view.width-60?-6:6),point.y-7)
      }
    }
  }
  if(system&&layers.trails)system.bodies.forEach((body,i)=>{
    const path=system.history.map(sample=>{
      const point=sample.positions[i],reference=anchor&&sample.positions[anchorIndex]
      return screen(reference?{x:point.x-reference.x+anchor.position.x,y:point.y-reference.y+anchor.position.y}:point)
    })
    stroke(ctx,path.concat(screen(bodies[i].position)),bodyColor(body,i),1.4)
  })
  const selectedBody=bodies.find(body=>body.id===selected)
  const primary=anchor&&anchor.id!==selected?anchor:selectedBody?orbitalPrimary(selectedBody,bodies):undefined
  if(selectedBody&&primary&&layers.center) {
    const a=screen(selectedBody.position),b=screen(primary.position)
    const distance=Math.hypot(selectedBody.position.x-primary.position.x,selectedBody.position.y-primary.position.y)
    if(Math.hypot(a.x-b.x,a.y-b.y)>30) {
      ctx.setLineDash([3,5]);stroke(ctx,[a,b],'#d5b8f580',1);ctx.setLineDash([])
      ctx.font='11px monospace';ctx.textAlign='center';ctx.fillStyle='#d5b8f5'
      ctx.fillText('间距 '+Number(distance.toPrecision(3))+' AU',(a.x+b.x)/2,(a.y+b.y)/2-7)
    }
  }
  const velocityOf=(body:CelestialBody)=>({x:body.velocity.x-(anchor?.velocity.x??0),y:body.velocity.y-(anchor?.velocity.y??0)})
  const visibleBodies=bodies.filter(body=>{const p=screen(body.position);return p.x>=-25&&p.x<=view.width+25&&p.y>=-25&&p.y<=view.height+25})
  const maximumSpeed=Math.max(1e-15,...visibleBodies.map(body=>{const v=velocityOf(body);return Math.hypot(v.x,v.y)}))
  for(let index=0;index<bodies.length;index++) {
    const body=bodies[index]
    if(!body)continue
    const position=screen(body.position),color=bodyColor(body,index)
    const marker=Math.max(body.kind==='star'?8:5,Math.min(25,body.radius*camera.scale))
    if(body.kind==='star') {
      const glow=ctx.createRadialGradient(position.x,position.y,marker*.4,position.x,position.y,marker*2.6)
      glow.addColorStop(0,'#f2c38b70');glow.addColorStop(1,'#f2c38b00')
      ctx.fillStyle=glow;ctx.beginPath();ctx.arc(position.x,position.y,marker*2.6,0,2*Math.PI);ctx.fill()
    }
    const sphere=ctx.createRadialGradient(position.x-marker*.35,position.y-marker*.35,marker*.1,position.x,position.y,marker)
    sphere.addColorStop(0,'#fff8e8');sphere.addColorStop(.35,color);sphere.addColorStop(1,body.kind==='star'?'#b97732':'#303847')
    ctx.fillStyle=sphere;ctx.beginPath();ctx.arc(position.x,position.y,marker,0,2*Math.PI);ctx.fill()
    if(body.id===selected) {
      ctx.beginPath();ctx.arc(position.x,position.y,marker+4,0,2*Math.PI);ctx.strokeStyle=color;ctx.lineWidth=1.5;ctx.stroke()
    }
    if(layers.velocity) {
      const velocity=velocityOf(body)
      const speed=Math.hypot(velocity.x,velocity.y),vectorLength=Math.min(48,48*speed/maximumSpeed)
      if(vectorLength>2)arrow(ctx,position,velocity,color,vectorLength,marker)
      if(body.id===selected) {
        const acceleration=bodyAcceleration(body,bodies)
        if(anchor) {
          const reference=bodyAcceleration(anchor,bodies)
          acceleration.x-=reference.x;acceleration.y-=reference.y
        }
        const magnitude=Math.hypot(acceleration.x,acceleration.y)
        if(magnitude>1e-15)arrow(ctx,position,acceleration,'#e69ba9',Math.min(36,18+12*Math.log10(1+magnitude*1e6)),marker+3)
      }
    }
    ctx.textAlign=position.x>view.width-90?'right':'left'
    ctx.fillStyle=color
    ctx.fillText(body.name,position.x+(position.x>view.width-90?-marker-7:marker+7),position.y+marker+11)
  }
  if(layers.center&&!anchor) {
    const horizontal=[{x:center.x-6,y:center.y},{x:center.x+6,y:center.y}]
    const vertical=[{x:center.x,y:center.y-6},{x:center.x,y:center.y+6}]
    stroke(ctx,horizontal,'#101012',3)
    stroke(ctx,vertical,'#101012',3)
    stroke(ctx,horizontal,'#f5f5f2')
    stroke(ctx,vertical,'#f5f5f2')
    ctx.textAlign='left';ctx.fillStyle='#f5f5f2';ctx.fillText('质心',center.x+10,center.y-11)
  }
  return {camera,tracks,points:bodies.map(body=>({id:body.id,point:screen(body.position),radius:Math.max(body.kind==='star'?8:5,Math.min(25,body.radius*camera.scale))}))}
}

type Drag = {
  pointer:number
  id?:string
  start:Point
  pixel:Point
  now:Point
  bodies:CelestialBody[]
  camera:Camera
  factor?:number
  preview?:CelestialBody[]
}

export function OrbitCanvas(props:Props) {
  const [axisMode,setAxisMode]=useState<'world'|'manual'|'body'>('world')
  const axisModeRef=useRef(axisMode)
  axisModeRef.current=axisMode
  const axisOrigin=useRef<Point>({x:0,y:0})
  const axisDrag=useRef<{pointer:number;pixel:Point;origin:Point;scale:number}>(undefined)
  const element=useRef<HTMLCanvasElement>(null)
  const current=useRef(props)
  const painted=useRef<ReturnType<typeof paint>|undefined>(undefined)
  const camera=useRef<Camera|undefined>(undefined)
  const target=useRef<Camera|undefined>(undefined)
  const animation=useRef<number|undefined>(undefined)
  const previousFrame=useRef(0)
  const drag=useRef<Drag|undefined>(undefined)
  const followed=useRef<{id:string;position:Point}|undefined>(undefined)
  const lastView=useRef({zoom:props.zoom,fit:props.fitRevision,width:0,height:0})

  function liveBodies() {
    const p=current.current
    return p.system?.bodies??(p.orbit?orbitBodies(p.orbit):p.scene.bodies)
  }
  function schedule() {
    if(animation.current!==undefined)return
    animation.current=requestAnimationFrame(now=>{
      animation.current=undefined
      render(now)
    })
  }
  function render(now:number) {
    const canvas=element.current,ctx=canvas?.getContext('2d')
    if(!canvas||!ctx||!canvas.clientWidth||!canvas.clientHeight)return
    const p=current.current
    const view={width:canvas.clientWidth,height:canvas.clientHeight}
    const ratio=Math.min(devicePixelRatio||1,2)
    if(canvas.width!==Math.round(view.width*ratio))canvas.width=Math.round(view.width*ratio)
    if(canvas.height!==Math.round(view.height*ratio))canvas.height=Math.round(view.height*ratio)
    ctx.setTransform(ratio,0,0,ratio,0,0)
    const bodies=liveBodies()
    const old=lastView.current
    if(!camera.current)camera.current=frameCamera(view,p.scene,p.selected,p.zoom,p.orbit,bodies,p.viewMode)
    if(!target.current)target.current={...camera.current}
    if(old.fit!==p.fitRevision)target.current=frameCamera(view,p.scene,p.selected,p.zoom,p.orbit,bodies,p.viewMode)
    else if(old.zoom!==p.zoom) {
      const center=bodies.find(b=>b.id===p.selected)?.position??camera.current
      target.current={x:center.x,y:center.y,scale:target.current.scale*p.zoom/old.zoom}
    }
    lastView.current={zoom:p.zoom,fit:p.fitRevision,...view}
    const d=drag.current
    const anchor=localAnchor(bodies,p.selected,p.viewMode)
    if(anchor&&!d) {
      const previous=followed.current
      if(previous?.id===anchor.id) {
        // Carry the camera with the body exactly; smooth only the remaining view offset.
        camera.current.x+=anchor.position.x-previous.position.x
        camera.current.y+=anchor.position.y-previous.position.y
      }
      followed.current={id:anchor.id,position:{...anchor.position}}
      target.current={...target.current,x:anchor.position.x,y:anchor.position.y}
    } else followed.current=undefined
    if(d) {
      const dx=(d.now.x-d.pixel.x)/d.camera.scale,dy=-(d.now.y-d.pixel.y)/d.camera.scale
      target.current={...d.camera,x:d.camera.x+(p.followBackground&&d.id?dx*.2:0),y:d.camera.y+(p.followBackground&&d.id?dy*.2:0)}
    }
    const elapsed=previousFrame.current?Math.max(0,now-previousFrame.current):16
    previousFrame.current=now
    const amount=window.matchMedia('(prefers-reduced-motion: reduce)').matches?1:1-Math.exp(-Math.min(elapsed,50)/65)
    const c=camera.current,t=target.current
    const scale=c.scale+(t.scale-c.scale)*amount
    camera.current=anchor&&!d?{
      x:anchor.position.x-(anchor.position.x-c.x)*c.scale*(1-amount)/scale,
      y:anchor.position.y-(anchor.position.y-c.y)*c.scale*(1-amount)/scale,scale,
    }:{x:c.x+(t.x-c.x)*amount,y:c.y+(t.y-c.y)*amount,scale}
    let drawing=bodies,reference=p.orbit
    if(d) {
      const world=worldPoint(d.now,camera.current,view)
      if(d.id) {
        drawing=d.bodies.map(b=>b.id===d.id?{...b,position:{x:b.position.x+world.x-d.start.x,y:b.position.y+world.y-d.start.y}}:b)
      } else {
        const origin=systemCenter(d.bodies)
        const distance=Math.hypot(d.start.x-origin.x,d.start.y-origin.y)
        const axis=p.orbit?.elements?.axis??1
        d.factor=Math.max(MIN_ORBIT_AXIS_AU/axis,Math.min(MAX_ORBIT_AXIS_AU/axis,Math.hypot(world.x-origin.x,world.y-origin.y)/Math.max(distance,1e-12)))
        const mass=d.bodies.reduce((sum,b)=>sum+b.mass,0)
        const cv=d.bodies.reduce((v,b)=>({x:v.x+b.velocity.x*b.mass/mass,y:v.y+b.velocity.y*b.mass/mass}),{x:0,y:0})
        drawing=d.bodies.map(b=>({...b,position:{x:origin.x+(b.position.x-origin.x)*d.factor!,y:origin.y+(b.position.y-origin.y)*d.factor!},
          velocity:{x:cv.x+(b.velocity.x-cv.x)/Math.sqrt(d.factor!),y:cv.y+(b.velocity.y-cv.y)/Math.sqrt(d.factor!)}}))
      }
      d.preview=drawing
      if(drawing.length===2) {
        try {reference=new TwoBodyOrbit([drawing[0],drawing[1]])}catch{reference=undefined}
      }
    }
    const origin=axisModeRef.current==='manual'?axisOrigin.current:axisModeRef.current==='body'?drawing.find(body=>body.id===p.selected)?.position:undefined
    painted.current=paint(ctx,view,p.scene,p.selected,reference,drawing,camera.current,d?undefined:p.system,p.system?anchor?.id:undefined,origin)
    const moving=Math.abs(t.x-camera.current.x)+Math.abs(t.y-camera.current.y)+Math.abs(t.scale-camera.current.scale)/Math.max(1,t.scale)>.000001
    if(p.active&&(p.running||d||moving))schedule()
  }
  useLayoutEffect(()=>{current.current=props;schedule()},[props])
  useLayoutEffect(()=>{schedule()},[axisMode])
  useLayoutEffect(()=>{
    const observer=new ResizeObserver(schedule)
    observer.observe(element.current!)
    schedule()
    return ()=>{
      observer.disconnect()
      if(animation.current!==undefined)cancelAnimationFrame(animation.current)
      // StrictMode starts effects again after cleanup; a cancelled frame must not block scheduling.
      animation.current=undefined
      previousFrame.current=0
    }
  },[])

  function pixel(event:{clientX:number;clientY:number}) {
    const r=element.current!.getBoundingClientRect()
    return {x:event.clientX-r.left,y:event.clientY-r.top}
  }
  function cancel() {
    axisDrag.current=undefined
    drag.current=undefined
    if(camera.current)target.current={...camera.current}
    schedule()
  }
  function moveAxis(event:{pointerId:number;clientX:number;clientY:number}) {
    const d=axisDrag.current
    if(!d||d.pointer!==event.pointerId)return false
    const point=pixel(event)
    axisOrigin.current={x:d.origin.x+(point.x-d.pixel.x)/d.scale,y:d.origin.y-(point.y-d.pixel.y)/d.scale}
    schedule()
    return true
  }
  return <>
    <select className="orbit-axis-control" aria-label="轨道坐标参考" value={axisMode} onChange={event=>setAxisMode(event.target.value as typeof axisMode)}>
      <option value="world">默认原点</option><option value="manual">拖动坐标原点</option><option value="body">坐标跟随选中天体</option>
    </select>
    <canvas ref={element} tabIndex={0} aria-label="轨道画布" className="astronomy-canvas"
      onKeyDown={e=>{if(e.key==='Escape')cancel()}}
      onPointerDown={e=>{
        if(e.button!==0||drag.current||!painted.current)return
        const point=pixel(e),frame=painted.current
        if(axisMode==='manual'){
          axisDrag.current={pointer:e.pointerId,pixel:point,origin:axisOrigin.current,scale:frame.camera.scale}
          e.currentTarget.setPointerCapture(e.pointerId)
          return
        }
        const body=[...frame.points].reverse().find(b=>Math.hypot(point.x-b.point.x,point.y-b.point.y)<=b.radius+9)
        const onTrack=frame.tracks.some(points=>points.some((b,i)=>{
          if(!i)return false
          const a=points[i-1],dx=b.x-a.x,dy=b.y-a.y
          const fraction=Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.y-a.y)*dy)/(dx*dx+dy*dy||1)))
          return Math.hypot(point.x-a.x-fraction*dx,point.y-a.y-fraction*dy)<8
        }))
        if(!body&&!onTrack)return
        e.preventDefault();e.currentTarget.focus();props.pause()
        if(body)props.setSelected(body.id)
        const camera={...frame.camera}
        drag.current={pointer:e.pointerId,id:body?.id,pixel:point,now:point,
          start:worldPoint(point,camera,{width:e.currentTarget.clientWidth,height:e.currentTarget.clientHeight}),bodies:structuredClone(liveBodies()),camera}
        e.currentTarget.setPointerCapture(e.pointerId)
        schedule()
      }}
      onPointerMove={e=>{if(!moveAxis(e)&&drag.current?.pointer===e.pointerId){drag.current.now=pixel(e);schedule()}}}
      onPointerUp={e=>{
        if(moveAxis(e)){axisDrag.current=undefined;return}
        const d=drag.current
        if(!d||d.pointer!==e.pointerId)return
        d.now=pixel(e)
        render(performance.now())
        const moved=Math.hypot(d.now.x-d.pixel.x,d.now.y-d.pixel.y)>4
        if(moved&&d.preview)current.current.editBodies(d.preview)
        cancel()
      }} onPointerCancel={cancel} onLostPointerCapture={cancel}/>
    <div className="astronomy-canvas-legend" aria-hidden="true">
      <span><i className="legend-track"/>运行轨迹</span><span><i className="legend-reference"/>理论轨道</span>
      <span><i className="legend-velocity"/>速度</span><span><i className="legend-gravity"/>{props.system&&props.viewMode!=='overview'?'相对加速度':'合引力方向'}</span>
    </div>
  </>
}
