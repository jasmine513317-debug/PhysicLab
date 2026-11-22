import { useLayoutEffect, useRef } from 'react'
import { screenPoint, type View } from './coordinates'
import { barycentricPosition, referenceEllipse, type TwoBodyOrbit } from './orbital-physics'
import type { AstronomyExperiment } from './astronomy'
import type { Point } from './model'

type Props={scene:AstronomyExperiment;orbit?:TwoBodyOrbit;selected:string;setSelected:(id:string)=>void;zoom:number;revision:number}
const colors=['#f2c38b','#a6bfff']

function stroke(ctx:CanvasRenderingContext2D,points:Point[],color:string,width=1) {
  if(points.length<2)return
  ctx.beginPath();ctx.moveTo(points[0].x,points[0].y)
  for(let index=1;index<points.length;index++)ctx.lineTo(points[index].x,points[index].y)
  ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke()
}

function paint(ctx:CanvasRenderingContext2D,view:View,scene:AstronomyExperiment,selected:string,zoom:number,orbit?:TwoBodyOrbit) {
  const layers=scene.layers
  const reference=orbit?.elements
  const initialDistance=orbit?Math.hypot(orbit.initial.relative.x,orbit.initial.relative.y):1
  const ellipse=referenceEllipse(reference)
  const radius=Math.max(1e-7,reference?.axis?initialDistance:orbit?.maximumDistance??initialDistance)
  const maxX=ellipse.length?Math.max(radius/20,...ellipse.map(point=>Math.abs(point.x))):radius
  const maxY=ellipse.length?Math.max(radius/20,...ellipse.map(point=>Math.abs(point.y))):radius
  const camera={x:0,y:0,scale:Math.min(view.width*.42/maxX,view.height*.40/maxY)*zoom}
  const screen=(point:Point)=>screenPoint(point,camera,view)
  const center=screen({x:0,y:0})
  ctx.fillStyle='#101012';ctx.fillRect(0,0,view.width,view.height)
  const unit=10**Math.round(Math.log10(57/camera.scale)),spacing=unit*camera.scale
  ctx.beginPath()
  for(let x=center.x%spacing;x<view.width;x+=spacing) {ctx.moveTo(x,0);ctx.lineTo(x,view.height)}
  for(let y=center.y%spacing;y<view.height;y+=spacing) {ctx.moveTo(0,y);ctx.lineTo(view.width,y)}
  ctx.strokeStyle='#2a2a30';ctx.lineWidth=1;ctx.stroke()
  stroke(ctx,[{x:center.x,y:0},{x:center.x,y:view.height}],'#4b4b55')
  stroke(ctx,[{x:0,y:center.y},{x:view.width,y:center.y}],'#4b4b55')

  ctx.font='11px monospace';ctx.textAlign='left';ctx.textBaseline='alphabetic'
  ctx.fillStyle='#bcbcc2';ctx.fillText('质心参考系 · '+Number(unit.toPrecision(3))+' AU / 格',12,view.height-13)

  if(orbit) {
    const companion=(point:Point)=>screen(barycentricPosition(point,orbit.bodies,1))
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
      const world=(point:Point)=>screen(barycentricPosition(point,orbit.bodies,index))
      if(layers.reference&&ellipse.length) {
        ctx.setLineDash([5,5])
        stroke(ctx,ellipse.map(world),colors[index]+'94')
        ctx.setLineDash([])
      }
      if(layers.trails)stroke(ctx,orbit.history.map(sample=>world(sample.relative)).concat(world(orbit.current.relative)),colors[index],1.7)
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
  for(const index of [0,1] as const) {
    const body=scene.bodies[index]
    if(!body)continue
    const position=orbit?screen(barycentricPosition(orbit.current.relative,orbit.bodies,index)):center
    const marker=Math.max(body.kind==='star'?8:5,Math.min(25,body.radius*camera.scale))
    ctx.beginPath();ctx.arc(position.x,position.y,marker,0,2*Math.PI);ctx.fillStyle=colors[index];ctx.fill()
    if(body.id===selected) {
      ctx.beginPath();ctx.arc(position.x,position.y,marker+4,0,2*Math.PI);ctx.strokeStyle=colors[index];ctx.stroke()
    }
    if(layers.velocity&&orbit) {
      const vector=barycentricPosition(orbit.current.velocity,orbit.bodies,index)
      const speed=Math.hypot(vector.x,vector.y)
      const vectorLength=Math.min(48,camera.scale*speed*((reference?.period??orbit.dt*4096)*.035))
      if(vectorLength>2) {
        const angle=Math.atan2(-vector.y,vector.x)
        const start={x:position.x+Math.cos(angle)*marker,y:position.y+Math.sin(angle)*marker}
        const end={x:start.x+Math.cos(angle)*vectorLength,y:start.y+Math.sin(angle)*vectorLength}
        stroke(ctx,[start,end],colors[index],1.3)
        for(const offset of [-.55,.55])stroke(ctx,[end,{x:end.x-6*Math.cos(angle+offset),y:end.y-6*Math.sin(angle+offset)}],colors[index])
      }
    }
    ctx.textAlign=position.x>view.width-90?'right':'left'
    ctx.fillStyle=colors[index]
    ctx.fillText(body.name,position.x+(position.x>view.width-90?-marker-7:marker+7),position.y+marker+11)
  }
  if(layers.center&&orbit) {
    const horizontal=[{x:center.x-6,y:center.y},{x:center.x+6,y:center.y}]
    const vertical=[{x:center.x,y:center.y-6},{x:center.x,y:center.y+6}]
    stroke(ctx,horizontal,'#101012',3)
    stroke(ctx,vertical,'#101012',3)
    stroke(ctx,horizontal,'#f5f5f2')
    stroke(ctx,vertical,'#f5f5f2')
    ctx.textAlign='left';ctx.fillStyle='#f5f5f2';ctx.fillText('质心',center.x+10,center.y-11)
  }
  return scene.bodies.map((body,index)=>({id:body.id,point:orbit?screen(barycentricPosition(orbit.current.relative,orbit.bodies,index as 0|1)):center}))
}

export function OrbitCanvas(props:Props) {
  const element=useRef<HTMLCanvasElement>(null)
  const current=useRef(props)
  const points=useRef<ReturnType<typeof paint>>([])
  function draw() {
    const canvas=element.current,ctx=canvas?.getContext('2d')
    if(!canvas||!ctx||!canvas.clientWidth||!canvas.clientHeight)return
    const view={width:canvas.clientWidth,height:canvas.clientHeight},ratio=Math.min(devicePixelRatio,2)
    const width=Math.round(view.width*ratio),height=Math.round(view.height*ratio)
    if(canvas.width!==width)canvas.width=width
    if(canvas.height!==height)canvas.height=height
    ctx.setTransform(ratio,0,0,ratio,0,0)
    const {scene,selected,zoom,orbit}=current.current
    points.current=paint(ctx,view,scene,selected,zoom,orbit)
  }
  useLayoutEffect(()=>{current.current=props;draw()},[props])
  useLayoutEffect(()=>{
    const observer=new ResizeObserver(draw)
    observer.observe(element.current!)
    return ()=>observer.disconnect()
  },[])
  return <canvas ref={element} aria-label="轨道画布" className="astronomy-canvas" onClick={event=>{
    const bounds=event.currentTarget.getBoundingClientRect()
    const x=event.clientX-bounds.left,y=event.clientY-bounds.top
    const nearest=points.current.map(item=>({id:item.id,distance:Math.hypot(x-item.point.x,y-item.point.y)})).sort((a,b)=>a.distance-b.distance)[0]
    if(nearest&&nearest.distance<=20)props.setSelected(nearest.id)
  }}/>
}
