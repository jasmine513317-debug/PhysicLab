import { useLayoutEffect, useRef, type PointerEvent } from 'react'
import { screenPoint, worldPoint, type View } from './coordinates'
import { contourCell, electricFieldLines, sampleElectricField, type ElectrostaticExperiment } from './electrostatics'
import type { Point } from './model'

export type ElectricTool = 'select'|'positive'|'negative'|'probe'|'pan'

const palette={field:'#a8e6cf',positive:'#f2c38b',negative:'#a6bfff',neutral:'#f5f5f2'}

function cameraFor(scene:ElectrostaticExperiment, view:View) {
  return {...scene.camera,scale:scene.camera.scale*Math.min(1,view.width/670)}
}

function arrow(ctx:CanvasRenderingContext2D,point:Point,dx:number,dy:number,color:string) {
  const angle=Math.atan2(dy,dx)
  const end={x:point.x+dx,y:point.y+dy}
  ctx.beginPath();ctx.moveTo(point.x,point.y);ctx.lineTo(end.x,end.y)
  for(const offset of [-.55,.55]) {
    ctx.moveTo(end.x,end.y)
    ctx.lineTo(end.x-5*Math.cos(angle+offset),end.y-5*Math.sin(angle+offset))
  }
  ctx.strokeStyle=color;ctx.stroke()
}

function paintPotential(ctx:CanvasRenderingContext2D,view:View,scene:ElectrostaticExperiment,toWorld:(point:Point)=>Point) {
  const spacing=8
  const columns=Math.ceil(view.width/spacing),rows=Math.ceil(view.height/spacing)
  const values=Array.from({length:rows+1},(_,row)=>Array.from({length:columns+1},(_,column)=>
    sampleElectricField(scene.charges,toWorld({x:column*spacing,y:row*spacing}))?.potential))
  const levels=[-4,-3,-2,-1,0,1,2,3,4].map(index=>index*scene.contourStep)
  const cells:{x:number;y:number;low:number;high:number;values:[number,number,number,number]}[]=[]
  for(let row=0;row<rows;row++)for(let column=0;column<columns;column++) {
    const corners=[values[row][column],values[row][column+1],values[row+1][column+1],values[row+1][column]]
    if(corners.some(value=>value===undefined))continue
    const [a,b,c,d]=corners as [number,number,number,number]
    const potential=(a+b+c+d)/4
    if(scene.layers.heat&&potential!==0) {
      const intensity=Math.min(.7,Math.sqrt(Math.abs(potential)/(4*scene.contourStep))*.7)
      ctx.fillStyle=potential>0?`rgb(210 104 57 / ${intensity})`:`rgb(72 118 212 / ${intensity})`
      ctx.fillRect(column*spacing,row*spacing,spacing,spacing)
    }
    if(scene.layers.contours) {
      const low=Math.min(a,b,c,d),high=Math.max(a,b,c,d)
      if(low!==high)cells.push({x:column*spacing,y:row*spacing,low,high,values:[a,b,c,d]})
    }
  }
  if(!scene.layers.contours)return
  for(const level of levels) {
    ctx.beginPath()
    for(const cell of cells) {
      if(level<cell.low||level>cell.high)continue
      for(const [a,b] of contourCell(cell.values,level)) {
        ctx.moveTo(cell.x+a.x*spacing,cell.y+a.y*spacing)
        ctx.lineTo(cell.x+b.x*spacing,cell.y+b.y*spacing)
      }
    }
    ctx.setLineDash(level===0?[4,4]:[])
    ctx.strokeStyle=level===0?'#f5f5f2aa':level>0?'#f2c38baa':'#a6bfffaa'
    ctx.lineWidth=1;ctx.stroke()
  }
  ctx.setLineDash([])
}

function paint(ctx:CanvasRenderingContext2D,view:View,scene:ElectrostaticExperiment,selected:string,axisOrigin:Point) {
  const camera=cameraFor(scene,view)
  const toWorld=(point:Point)=>worldPoint(point,camera,view)
  const toScreen=(point:Point)=>screenPoint(point,camera,view)
  ctx.fillStyle='#101012';ctx.fillRect(0,0,view.width,view.height)
  if(scene.charges.length&&(scene.layers.heat||scene.layers.contours))paintPotential(ctx,view,scene,toWorld)
  const origin=toScreen(axisOrigin)
  const gridUnit=10**Math.round(Math.log10(52/camera.scale)),spacing=gridUnit*camera.scale
  ctx.beginPath()
  for(let x=(origin.x%spacing+spacing)%spacing;x<view.width;x+=spacing) {ctx.moveTo(x,0);ctx.lineTo(x,view.height)}
  for(let y=(origin.y%spacing+spacing)%spacing;y<view.height;y+=spacing) {ctx.moveTo(0,y);ctx.lineTo(view.width,y)}
  ctx.lineWidth=1;ctx.strokeStyle='#9292a126';ctx.stroke()
  ctx.beginPath();ctx.moveTo(origin.x,0);ctx.lineTo(origin.x,view.height);ctx.moveTo(0,origin.y);ctx.lineTo(view.width,origin.y)
  ctx.strokeStyle='#a6a6a659';ctx.stroke()

  if(scene.layers.lines) {
    const topLeft=toWorld({x:0,y:0}),bottomRight=toWorld({x:view.width,y:view.height})
    const bounds={left:topLeft.x,right:bottomRight.x,bottom:bottomRight.y,top:topLeft.y}
    for(const line of electricFieldLines(scene.charges,bounds,camera.scale)) {
      const points=line.map(toScreen)
      ctx.beginPath();ctx.moveTo(points[0].x,points[0].y)
      for(const point of points.slice(1))ctx.lineTo(point.x,point.y)
      ctx.strokeStyle='#a8e6cf99';ctx.lineWidth=1.2;ctx.stroke()
      const index=Math.floor(points.length/2)
      const before=points[index-1],after=points[index]
      arrow(ctx,before,after.x-before.x,after.y-before.y,palette.field)
    }
  }

  if(scene.layers.vectors) {
    for(let y=22;y<view.height;y+=44)for(let x=22;x<view.width;x+=44) {
      const point={x,y}, world=toWorld(point)
      if(scene.charges.some(charge=>Math.hypot(world.x-charge.position.x,world.y-charge.position.y)*camera.scale<17))continue
      const field=sampleElectricField(scene.charges,world)
      if(!field||field.magnitude<1e-10)continue
      const length=Math.min(21,6+5*Math.log1p(field.magnitude))
      arrow(ctx,point,length*field.x/field.magnitude,-length*field.y/field.magnitude,palette.field)
    }
  }

  for(const charge of scene.charges) {
    const position=toScreen(charge.position)
    const color=charge.nanocoulombs>0?palette.positive:charge.nanocoulombs<0?palette.negative:palette.neutral
    ctx.beginPath();ctx.arc(position.x,position.y,charge.id===selected?13:10,0,2*Math.PI)
    ctx.fillStyle=color;ctx.fill()
    if(charge.id===selected) {
      ctx.beginPath();ctx.arc(position.x,position.y,17,0,2*Math.PI);ctx.strokeStyle=color;ctx.stroke()
    }
    ctx.font='bold 14px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#151517'
    ctx.fillText(charge.nanocoulombs>0?'+':charge.nanocoulombs<0?'−':'0',position.x,position.y)
  }
  const target=toScreen(scene.probe)
  ctx.beginPath();ctx.moveTo(target.x-7,target.y);ctx.lineTo(target.x+7,target.y);ctx.moveTo(target.x,target.y-7);ctx.lineTo(target.x,target.y+7)
  ctx.strokeStyle='#101012';ctx.lineWidth=4;ctx.stroke()
  ctx.strokeStyle=palette.neutral;ctx.lineWidth=1.4;ctx.stroke()
  ctx.font='11px monospace';ctx.textBaseline='alphabetic';ctx.textAlign='left';ctx.fillStyle='#cacacd'
  ctx.fillText('X / Y · '+Number(gridUnit.toPrecision(3))+' m / 格',13,view.height-14)
}

interface Props {
  scene:ElectrostaticExperiment
  selected:string
  tool:ElectricTool
  select:(id:string)=>void
  add:(sign:1|-1,point:Point)=>void
  probe:(point:Point)=>void
  moveCharge:(id:string,point:Point)=>void
  moveCamera:(point:Point)=>void
  axisOrigin:Point
  moveOrigin?:(point:Point)=>void
}

export function ElectrostaticCanvas({scene,selected,tool,select,add,probe,moveCharge,moveCamera,axisOrigin,moveOrigin}:Props) {
  const canvas=useRef<HTMLCanvasElement>(null)
  const latest=useRef({scene,selected,axisOrigin})
  const frame=useRef(0)
  const drag=useRef<{pointer:number;start:Point;origin:Point;scale:number;charge?:string;axis?:boolean}|null>(null)
  function schedulePaint() {
    if(frame.current)return
    frame.current=requestAnimationFrame(()=>{
      frame.current=0
      const element=canvas.current,ctx=element?.getContext('2d')
      if(!element||!ctx||!element.clientWidth||!element.clientHeight)return
      const view={width:element.clientWidth,height:element.clientHeight},dpr=Math.min(devicePixelRatio,2)
      const width=Math.round(view.width*dpr),height=Math.round(view.height*dpr)
      if(element.width!==width)element.width=width
      if(element.height!==height)element.height=height
      ctx.setTransform(dpr,0,0,dpr,0,0)
      paint(ctx,view,latest.current.scene,latest.current.selected,latest.current.axisOrigin)
    })
  }
  useLayoutEffect(()=>{latest.current={scene,selected,axisOrigin};schedulePaint()},[scene,selected,axisOrigin])
  useLayoutEffect(()=>{
    const observer=new ResizeObserver(schedulePaint)
    observer.observe(canvas.current!)
    return ()=>{observer.disconnect();cancelAnimationFrame(frame.current);frame.current=0}
  },[])

  function position(event:PointerEvent<HTMLCanvasElement>) {
    const view=event.currentTarget.getBoundingClientRect()
    return {view,pixel:{x:event.clientX-view.left,y:event.clientY-view.top}}
  }
  function down(event:PointerEvent<HTMLCanvasElement>) {
    if(event.button!==0||drag.current)return
    event.currentTarget.focus({preventScroll:true})
    const {view,pixel}=position(event),camera=cameraFor(scene,view),world=worldPoint(pixel,camera,view)
    if(moveOrigin) {
      drag.current={pointer:event.pointerId,start:pixel,origin:axisOrigin,scale:camera.scale,axis:true}
      event.currentTarget.setPointerCapture(event.pointerId)
      return
    }
    if(tool==='positive'||tool==='negative') {add(tool==='positive'?1:-1,world);return}
    if(tool==='probe') {probe(world);return}
    const charge=tool==='select'?[...scene.charges].reverse().find(candidate=>{
      const point=screenPoint(candidate.position,camera,view)
      return Math.hypot(point.x-pixel.x,point.y-pixel.y)<=17
    }):undefined
    if(!charge&&tool==='select') {probe(world);return}
    if(charge)select(charge.id)
    drag.current={pointer:event.pointerId,start:pixel,origin:charge?.position??camera,scale:camera.scale,charge:charge?.id}
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  function move(event:PointerEvent<HTMLCanvasElement>) {
    const active=drag.current
    if(!active||active.pointer!==event.pointerId)return
    const {pixel}=position(event)
    const dx=(pixel.x-active.start.x)/active.scale,dy=(active.start.y-pixel.y)/active.scale
    if(active.axis)moveOrigin?.({x:active.origin.x+dx,y:active.origin.y+dy})
    else if(active.charge)moveCharge(active.charge,{x:active.origin.x+dx,y:active.origin.y+dy})
    else moveCamera({x:active.origin.x-dx,y:active.origin.y-dy})
  }
  function end(event:PointerEvent<HTMLCanvasElement>) {
    if(drag.current?.pointer===event.pointerId)drag.current=null
  }
  return <canvas ref={canvas} className={'electric-canvas'+(tool==='pan'?' electric-pan':'')} tabIndex={0} aria-label="电场画布"
    onPointerDown={down} onPointerMove={move} onPointerUp={end} onLostPointerCapture={end} onPointerCancel={end}/>
}
