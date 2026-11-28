import { useEffect,useRef,useState,type PointerEvent } from 'react'
import { add,cross,dot,length,multiply,rotateSpatialVector,subtract,type SpatialPhysics,type SpatialSample,type Vec3 } from './spatialPhysics'
import { meshRadius, spatialMesh, type SpatialGeometry } from './spatialGeometry'
import { inductionLoop } from './spatialFields'
import { vectorsAt,type VectorView } from './spatialVectors'
import { kerrDisk,weakFieldRay } from './blackHolePhysics'
import { horizonRadius } from './celestialPhysics'

const meshes=new WeakMap<SpatialGeometry,ReturnType<typeof spatialMesh>>()

export type SpatialCamera={yaw:number;pitch:number;distance:number;focus:Vec3;mode:'orbit'|'first'|'xy'}
export type SpatialEditAxis='x'|'y'|'z'|'xy'|'xz'|'yz'
export type SpatialGizmo={target:'position'|'force'|'velocity';axis:SpatialEditAxis;local:boolean;value?:Vec3;commit:(value:Vec3)=>void}
export const defaultSpatialCamera:SpatialCamera={yaw:.55,pitch:.32,distance:12,focus:[0,2,0],mode:'orbit'}
type Screen={x:number;y:number;depth:number;scale:number}
type Drawing={plane:'xy'|'xz'|'yz';offset:number;commit:(points:Vec3[])=>void}
function viewAxes(camera:SpatialCamera) {
  const {yaw,pitch,distance,focus,mode}=camera
  const backward:Vec3=[Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch)]
  const right=cross([0,1,0],backward)
  const axis=multiply(right,1/length(right)),up=cross(backward,axis)
  return {backward,axis,up,eye:mode==='first'?focus:add(focus,multiply(backward,distance))}
}
export function changeSpatialView(camera:SpatialCamera,mode:SpatialCamera['mode']):SpatialCamera {
  if(mode===camera.mode)return camera
  const {backward,eye}=viewAxes(camera)
  if(mode==='first')return {...camera,mode,focus:eye}
  if(camera.mode==='first')return {...camera,mode,focus:subtract(eye,multiply(backward,camera.distance))}
  return {...camera,mode}
}

export function zoomSpatialCamera(camera:SpatialCamera,factor:number):SpatialCamera {
  const ratio=Math.max(.2,Math.min(5,factor))
  const distance=Math.max(.1,Math.min(1e14,camera.distance*ratio))
  if(camera.mode!=='first')return {...camera,distance}
  const {backward}=viewAxes(camera)
  return {...camera,distance,focus:add(camera.focus,multiply(backward,distance-camera.distance))}
}

export function moveFirstPerson(camera:SpatialCamera,key:string):SpatialCamera {
  const {axis}=viewAxes(camera)
  const forward:Vec3=[-Math.sin(camera.yaw),0,-Math.cos(camera.yaw)]
  const delta=key==='w'?forward:key==='s'?multiply(forward,-1):key==='d'?axis:key==='a'?multiply(axis,-1):undefined
  return delta?{...camera,focus:add(camera.focus,multiply(delta,camera.distance/12))}:camera
}
function projection(camera:SpatialCamera,width:number,height:number) {
  const {distance,focus,mode}=camera
  const scale=Math.min(width,height)*.8/distance
  if(mode==='xy')return (p:Vec3):Screen=>({x:width/2+(p[0]-focus[0])*scale,y:height/2-(p[1]-focus[1])*scale,depth:distance,scale})
  const {backward:direction,axis,up,eye}=viewAxes(camera)
  const focalLength=Math.min(width,height)*.8
  return (p:Vec3):Screen|undefined=>{
    const offset=subtract(p,eye),depth=-dot(offset,direction)
    if(depth<=.05)return
    const scale=focalLength/depth
    return {x:width/2+dot(offset,axis)*scale,y:height/2-dot(offset,up)*scale,depth,scale}
  }
}

function projectOnPlane(camera:SpatialCamera,{width,height}:{width:number;height:number},x:number,y:number,plane:Drawing['plane'],offset:number) {
  const divisor=Math.min(width,height)*.8
  if(!divisor)return
  const normal=plane==='xy'?2:plane==='xz'?1:0
  if(camera.mode==='xy')return normal===2?
    [camera.focus[0]+(x-width/2)*camera.distance/divisor,camera.focus[1]-(y-height/2)*camera.distance/divisor,offset] as Vec3:undefined
  const {eye,backward,axis,up}=viewAxes(camera)
  const ray=add(multiply(backward,-1),add(multiply(axis,(x-width/2)/divisor),multiply(up,(height/2-y)/divisor)))
  if(Math.abs(ray[normal])<1e-5)return
  const distance=(offset-eye[normal])/ray[normal]
  if(distance>.05&&distance<camera.distance*1000)return add(eye,multiply(ray,distance))
}

type Props={engine:SpatialPhysics;camera:SpatialCamera;setCamera:(camera:SpatialCamera)=>void;selected:string;select:(id:string)=>void;
  forecast?:ReadonlyMap<string,SpatialSample[]>;comparison?:ReadonlyMap<string,SpatialSample[]>;displayPositions?:ReadonlyMap<string,Vec3>;history:boolean;vectors:boolean;revision:number;trailWindow:number;
  fieldLines?:Vec3[][];potentialFaces?:Vec3[][];showMagnetic?:boolean;trailColor?:string;
  trailAlpha?:number;timeMarkers?:boolean;gizmo?:SpatialGizmo;drawing?:Drawing;vectorView?:VectorView;trailCount:number;
  axisOrigin:Vec3;moveAxis?:(origin:Vec3)=>void;showGrid?:boolean;showAxes?:boolean;gridOpacity?:number;celestial?:boolean;lensRays?:boolean;focusBody?:(id:string)=>void}
export function SpatialCanvas({engine,camera,setCamera,selected,select,forecast,comparison,displayPositions,history,vectors,revision,trailWindow,
  fieldLines,potentialFaces,showMagnetic,trailColor,trailAlpha,timeMarkers,gizmo,drawing,vectorView,trailCount,axisOrigin,moveAxis,
  showGrid=true,showAxes=true,gridOpacity=1,celestial,lensRays,focusBody}:Props) {
  const canvas=useRef<HTMLCanvasElement>(null)
  const gesture=useRef<{x:number;y:number;pointer:number;camera:SpatialCamera;pan:boolean;moved:boolean}|undefined>(undefined)
  const edit=useRef<{pointer:number;x:number;y:number;start:Vec3;solve:(x:number,y:number)=>Vec3;commit:(value:Vec3)=>void}|undefined>(undefined)
  const [preview,setPreview]=useState<Vec3>()
  const stroke=useRef<{id:number;points:Vec3[]}|undefined>(undefined)
  const [draft,setDraft]=useState<Vec3[]>([])
  const fingers=useRef(new Map<number,[number,number]>())
  const pinch=useRef<{distance:number;camera:SpatialCamera}|undefined>(undefined)
  const [size,resize]=useState({width:0,height:0})
  const target=engine.bodies.find(body=>body.id===selected)
  const forceUnits=celestial?camera.distance/(6*Math.max(1,length(target?.force??[0,0,0]),(target?.mass??1)*.001)):.15
  const velocityUnits=camera.distance/(6*Math.max(1,length(target?.velocity??[0,0,0])))
  const editScale=gizmo?.target==='force'?forceUnits:gizmo?.target==='velocity'?velocityUnits:1
  const editValue=gizmo?.value??(target&&(gizmo?.target==='force'?target.force:gizmo?.target==='velocity'?target.velocity:target.position))
  const axesFor=(mode:SpatialGizmo)=>[...'xyz'].flatMap((name,i)=>{
    if(!mode.axis.includes(name))return []
    const axis:Vec3=[0,0,0];axis[i]=1
    return [mode.local&&target?rotateSpatialVector(axis,target.orientation):axis]
  })
  useEffect(()=>{
    const el=canvas.current!
    const observer=new ResizeObserver(([entry])=>resize({width:entry.contentRect.width,height:entry.contentRect.height}))
    observer.observe(el)
    return ()=>observer.disconnect()
  },[])
  useEffect(()=>{
    const el=canvas.current!,ctx=el.getContext('2d')
    const {width,height}=size
    if(!ctx||!width||!height)return
    const dpr=Math.min(2,devicePixelRatio)
    const pixelsX=Math.round(width*dpr),pixelsY=Math.round(height*dpr)
    if(el.width!==pixelsX||el.height!==pixelsY){el.width=pixelsX;el.height=pixelsY}
    ctx.setTransform(dpr,0,0,dpr,0,0)
    ctx.clearRect(0,0,width,height)
    if(celestial) {
      for(let i=0;i<86;i++) {
        const x=(Math.sin(i*231.7)*.5+.5)*width,y=(Math.sin(i*97.3+1)*.5+.5)*height
        ctx.fillStyle=i%13===0?'#e2cf9f80':'#b8cfff44'
        ctx.fillRect(x,y,i%13===0?1.6:1,i%13===0?1.6:1)
      }
    }
    const project=projection(camera,width,height)
    function segment(a:Vec3,b:Vec3,color:string,dash:number[]=[]) {
      const start=project(a),end=project(b)
      if(!start||!end)return
      ctx!.strokeStyle=color;ctx!.setLineDash(dash);ctx!.beginPath()
      ctx!.moveTo(start.x,start.y);ctx!.lineTo(end.x,end.y);ctx!.stroke();ctx!.setLineDash([])
    }
    function curve(points:Vec3[],color:string) {
      ctx!.strokeStyle=color;ctx!.beginPath()
      let open=false
      for(const position of points) {
        const point=project(position)
        if(!point){open=false;continue}
        if(open)ctx!.lineTo(point.x,point.y)
        else ctx!.moveTo(point.x,point.y)
        open=true
      }
      ctx!.stroke()
    }
    function arrow(origin:Vec3,vector:Vec3,factor:number,color:string,label:string) {
      const end=add(origin,multiply(vector,factor)),p=project(origin),tip=project(end)
      if(!p||!tip||Math.hypot(p.x-tip.x,p.y-tip.y)<1)return
      segment(origin,end,color)
      const theta=Math.atan2(tip.y-p.y,tip.x-p.x)
      ctx!.beginPath();ctx!.moveTo(tip.x,tip.y)
      for(const angle of [-.48,.48])ctx!.lineTo(tip.x-8*Math.cos(theta+angle),tip.y-8*Math.sin(theta+angle))
      ctx!.closePath();ctx!.fillStyle=color;ctx!.fill()
      if(label)ctx!.fillText(label,tip.x+4,tip.y-4)
    }
    const origin=moveAxis&&preview?preview:axisOrigin
    const grid=celestial?10**Math.floor(Math.log10(camera.distance/4)):camera.distance/6,range=celestial?camera.distance*2:grid*6
    if(showGrid&&!celestial)for(let i=-6;i<=6;i++) {
      segment(add(origin,[i*grid,0,-range]),add(origin,[i*grid,0,range]),'#303034')
      segment(add(origin,[-range,0,i*grid]),add(origin,[range,0,i*grid]),'#303034')
    }
    if(showGrid&&celestial) {
      const plane=(x:number,z:number):Vec3=>camera.mode==='xy'?[x,z,0]:[x,0,z]
      const j=Math.round((camera.focus[0]-origin[0])/grid)
      const vertical=camera.mode==='xy'?1:2,k=Math.round((camera.focus[vertical]-origin[vertical])/grid)
      ctx.globalAlpha=gridOpacity
      for(let i=-24;i<=24;i++) {
        segment(add(origin,plane((j+i)*grid,(k-24)*grid)),add(origin,plane((j+i)*grid,(k+24)*grid)),'#43557055')
        segment(add(origin,plane((j-24)*grid,(k+i)*grid)),add(origin,plane((j+24)*grid,(k+i)*grid)),'#43557055')
      }
      ctx.globalAlpha=1
    }
    for(const path of fieldLines??[])curve(path,'#9cb9df72')
    curve(draft,'#f3d1a6')
    for(const face of potentialFaces??[])curve([...face,face[0]],'#d1b69324')
    const loop=inductionLoop(engine)
    if(loop.length)curve(loop,'#d6bf88')
    if(showMagnetic) {
      const rate=engine.scene.induction?.rate
      const magnetic=rate?add(engine.scene.magnetic,multiply(rate,engine.time)):engine.scene.magnetic
      const strength=length(magnetic)
      if(strength>0) {
        const direction=multiply(magnetic,grid*.68/strength)
        for(const x of [-2,0,2])for(const z of [-2,0,2]) {
          const at:Vec3=[x*grid,grid,z*grid],end=add(at,direction)
          segment(at,end,'#a7b996')
          const p=project(at),q=project(end)
          if(p&&q) {
            const angle=Math.atan2(q.y-p.y,q.x-p.x)
            ctx.strokeStyle='#a7b996';ctx.beginPath()
            for(const delta of [-.5,.5]){ctx.moveTo(q.x,q.y);ctx.lineTo(q.x-6*Math.cos(angle+delta),q.y-6*Math.sin(angle+delta))}
            ctx.stroke()
          }
        }
      }
    }
    const axes:[Vec3,string][]=[[[range,0,0],'X'],[[0,range,0],'Y'],[[0,0,range],'Z']]
    ctx.font='12px system-ui'
    if(showAxes)for(const [axis,name] of axes) {
      const labelDistance=celestial?.18:1
      const end=add(origin,axis),at=project(add(origin,multiply(axis,labelDistance)))
      segment(origin,end,'#a1a1a7')
      if(at){ctx.fillStyle='#dfdfe3';ctx.fillText(name,at.x+3,at.y-3)}
      if(celestial) {
        const start=add(origin,multiply(axis,-1)),negative=project(add(origin,multiply(axis,-labelDistance)))
        const tick=project(add(origin,multiply(axis,grid/range)))
        segment(start,origin,'#7b88a3',[4,4])
        if(negative)ctx.fillText('−'+name,negative.x+3,negative.y)
        if(tick)ctx.fillText(grid.toExponential(0)+' m',tick.x+2,tick.y-4)
      }
    }
    const zero=showAxes&&celestial&&project(origin)
    if(zero)ctx.fillText('O',zero.x+3,zero.y+12)
    function trajectory(samples:SpatialSample[]|undefined,color:string,dash:number[]=[],markTime=false) {
      if(!samples||samples.length<2)return
      ctx!.strokeStyle=color;ctx!.setLineDash(dash);ctx!.beginPath()
      let visible=false
      const stride=Math.max(1,Math.ceil(samples.length/600))
      for(let i=0;i<samples.length;i++) {
        if(i%stride&&i!==samples.length-1)continue
        const point=project(samples[i].position)
        if(!point){visible=false;continue}
        if(visible)ctx!.lineTo(point.x,point.y)
        else ctx!.moveTo(point.x,point.y)
        visible=true
      }
      ctx!.stroke();ctx!.setLineDash([])
      if(markTime)for(const sample of samples) {
        if(Math.abs(sample.time/2-Math.round(sample.time/2))>1e-6)continue
        const p=project(sample.position)
        if(p){
          ctx!.fillStyle=color;ctx!.fillRect(p.x-2,p.y-2,4,4);ctx!.fillText(sample.time.toFixed(0)+' s',p.x+5,p.y-5)
          if(length(sample.velocity)>1e-10)arrow(sample.position,sample.velocity,7/(p.scale*length(sample.velocity)),color,'')
        }
      }
    }
    const ordered=engine.bodies.flatMap(body=>{
      if(!engine.visibleBody(body.id))return []
      const position=displayPositions?.get(body.id)??body.position
      const p=project(position)
      return p?[{body,p,position}]:[]
    }).sort((a,b)=>b.p.depth-a.p.depth)
    if(lensRays&&target?.celestial?.kind==='blackHole') {
      // Teaching section through the hole, parallel to the viewing plane.
      const {axis,up}=camera.mode==='xy'?{axis:[1,0,0] as Vec3,up:[0,1,0] as Vec3}:viewAxes(camera)
      for(const sign of [-1,1]) {
        const impact=sign*22*horizonRadius(target.mass),start=-4*Math.abs(impact),end=-start
        const point=(x:number,y:number)=>add(target.position,add(multiply(axis,x),multiply(up,y)))
        segment(point(start,impact),point(end,impact),'#92b0d077',[3,5])
        const ray=Array.from({length:33},(_,i)=>{
          const x=start+(end-start)*i/32
          return point(x,weakFieldRay(target.mass,impact,x)??impact)
        })
        curve(ray,'#a5dcff')
      }
    }
    const positions=new Map(engine.bodies.map(body=>[body.id,body.position]))
    for(const spring of engine.scene.springs??[])segment(positions.get(spring.a)!,positions.get(spring.b)!,'#d3bf91',[4,3])
    for(const joint of engine.scene.pivots??[]) {
      const a=engine.bodies.find(body=>body.id===joint.a)!,b=engine.bodies.find(body=>body.id===joint.b)!
      const pivot=add(a.position,rotateSpatialVector(joint.anchorA,a.orientation))
      segment(pivot,b.position,'#d3bf91')
    }
    for(const {body,p,position} of ordered) {
      if(history) {
        ctx.globalAlpha=trailAlpha??1
        trajectory(engine.history.get(body.id)?.slice(-trailCount).filter(sample=>sample.time>=engine.time-trailWindow),trailColor??(body.id===selected?'#9ab8db':'#5e6b7c'),[],timeMarkers&&body.id===selected)
        ctx.globalAlpha=1
      }
      trajectory(forecast?.get(body.id),'#d3bf91',[5,4])
      trajectory(comparison?.get(body.id),'#9eaafc',[2,6])
      const radius=Math.max(3,Math.min(2*Math.max(width,height),p.scale*(body.geometry?meshRadius(body.geometry):body.visualRadius??body.radius)))
      if(body.geometry) {
        let mesh=meshes.get(body.geometry)
        if(!mesh){mesh=spatialMesh(body.geometry);meshes.set(body.geometry,mesh)}
        const world=mesh.vertices.map(v=>add(body.position,rotateSpatialVector(v,body.orientation)))
        const points=world.map(project)
        const faces:{points:Screen[];depth:number;shade:number}[]=[]
        for(let i=0;i<mesh.indices.length;i+=3) {
          const [a,b,c]=mesh.indices.slice(i,i+3)
          const face=[points[a],points[b],points[c]]
          if(!face.every((x):x is Screen=>Boolean(x)))continue
          const normal=cross(subtract(world[b],world[a]),subtract(world[c],world[a]))
          const shade=length(normal)?Math.abs(dot(normal,[.4,.8,.3])/length(normal)):0
          faces.push({points:face,depth:face.reduce((sum,x)=>sum+x.depth,0),shade})
        }
        for(const face of faces.sort((a,b)=>b.depth-a.depth)) {
          const light=Math.round(66+108*face.shade)
          ctx.fillStyle=`rgb(${light} ${light} ${light+3})`
          ctx.strokeStyle=body.id===selected?'#dcdce488':'#09090b44'
          ctx.beginPath()
          face.points.forEach((at,i)=>i?ctx.lineTo(at.x,at.y):ctx.moveTo(at.x,at.y))
          ctx.closePath();ctx.fill();ctx.stroke()
        }
      } else if(celestial&&body.celestial) {
        const {kind,color,preset,rotationPeriod,spin,diskExtent}=body.celestial
        const star=kind==='star',hole=kind==='blackHole'
        const lamp=ordered.find(entry=>entry.body.id!==body.id&&entry.body.celestial?.kind==='star')?.p
        const delta=lamp?[lamp.x-p.x,lamp.y-p.y]:[-1,-1],light=Math.max(1,Math.hypot(...delta))
        const phase=rotationPeriod?engine.time/rotationPeriod*2*Math.PI:0
        if(hole||preset==='saturn') {
          ctx.save();ctx.translate(p.x,p.y);ctx.rotate(-.28)
          const disk=hole?kerrDisk(body.mass,spin):undefined
          const inner=disk?disk.isco/body.radius:1.3
          const outer=disk?inner*(diskExtent??2.4):2.06
          const diskRadius=(i:number)=>radius*(inner+(outer-inner)*i/4)
          for(let i=0;i<5;i++) {
            ctx.strokeStyle=hole?(i%2?'#ffa758':'#6645a8'):'#d7ba8666'
            ctx.beginPath();ctx.ellipse(0,0,diskRadius(i),diskRadius(i)*.27,0,0,2*Math.PI);ctx.stroke()
          }
          if(disk) {
            const diskPhase=engine.time*disk.omega%(2*Math.PI)
            ctx.strokeStyle='#fff0b8';ctx.beginPath();ctx.ellipse(0,0,diskRadius(0),diskRadius(0)*.27,0,diskPhase,diskPhase+.6);ctx.stroke()
          }
          ctx.restore()
        }
        const surface=ctx.createRadialGradient(p.x+delta[0]/light*radius*.45,p.y+delta[1]/light*radius*.45,0,p.x,p.y,radius)
        surface.addColorStop(0,star?'#fff4d9':hole?'#000':color)
        surface.addColorStop(1,star?color:hole?'#000':'#0f1426')
        ctx.fillStyle=surface;ctx.beginPath()
        if(kind==='comet'||preset==='asteroid') {
          for(let i=0;i<16;i++){
            const angle=i*Math.PI/8,edge=radius*(.86+.08*Math.sin(i*7.86)+.06*Math.cos(i*.91))
            ctx.lineTo(p.x+edge*Math.cos(angle+phase),p.y+edge*Math.sin(angle+phase))
          }
          ctx.closePath()
        } else ctx.arc(p.x,p.y,radius,0,2*Math.PI)
        ctx.fill()
        if(!hole&&radius>6) {
          ctx.save();ctx.clip()
          for(let i=0;i<10;i++) {
            const yy=p.y+(i-4.5)*radius*.21
            ctx.strokeStyle=i%2?'#edf2ff26':'#09142645'
            ctx.beginPath();ctx.ellipse(p.x+Math.sin(phase+i)*radius*.25,yy,radius,radius*(kind==='gas'||kind==='ice'?.08:.19),-.15,0,Math.PI);ctx.stroke()
          }
          ctx.restore()
        }
        if(body.id===selected){ctx.strokeStyle='#f0f4ff';ctx.beginPath();ctx.arc(p.x,p.y,radius+2,0,2*Math.PI);ctx.stroke()}
      } else {
        const sphere=ctx.createRadialGradient(p.x-radius*.3,p.y-radius*.3,0,p.x,p.y,radius)
        sphere.addColorStop(0,'#dedee4');sphere.addColorStop(1,'#45454c')
        ctx.fillStyle=sphere;ctx.strokeStyle=body.id===selected?'#fff':'#a5a5ab'
        ctx.beginPath();ctx.arc(p.x,p.y,radius,0,2*Math.PI);ctx.fill();ctx.stroke()
        const marker=add(body.position,rotateSpatialVector([body.radius,0,0],body.orientation))
        segment(body.position,marker,'#252528')
      }
      if(vectors)arrow(position,body.velocity,(celestial?camera.distance/(8*Math.max(1,length(body.velocity))):.2)*(vectorView?.scales['m/s']??1),'#9ab8db','v '+length(body.velocity).toPrecision(3)+' m/s')
      if(vectorView?.kinds.length)for(const {style:[name,unit,factor,color],value} of vectorsAt(engine,body,vectorView.kinds)) {
        const label=vectorView.labels==='none'?'':vectorView.labels==='name'?name:vectorView.labels==='size'
          ?name+' '+length(value).toPrecision(3)+' '+unit:name+' ('+value.map(n=>n.toPrecision(3)).join(', ')+') '+unit
        const drawScale=celestial?camera.distance/(10*length(value)):factor
        arrow(position,value,drawScale*(vectorView.scales[unit]??1),color,body.id===selected?label:'')
      }
      if(body.id===selected||celestial&&showGrid){ctx.fillStyle='#f5f5f5';ctx.fillText(body.name,p.x+radius+6,p.y+5)}
    }
    const contact=celestial&&engine.contactEvents.at(-1)
    if(contact&&engine.time-contact.time<engine.stepSeconds*24) {
      const at=project(contact.position)
      const progress=Math.max(0,(engine.time-contact.time)/(engine.stepSeconds*24))
      if(at) {
        ctx.globalAlpha=1-progress
        ctx.strokeStyle='#ffba83';ctx.beginPath();ctx.arc(at.x,at.y,9+30*progress,0,Math.PI*2);ctx.stroke()
        ctx.fillStyle='#ffdfbc';ctx.fillText(({bounce:'碰撞',merge:'合并',fragment:'破碎'})[contact.kind],at.x+13,at.y-12)
        ctx.globalAlpha=1
      }
    }
    if(gizmo&&target&&editValue) {
      const at=gizmo.target==='position'?preview??editValue:add(target.position,multiply(preview??editValue,editScale))
      if(gizmo.target!=='position')arrow(target.position,preview??editValue,editScale,'#e9b5bd','')
      for(const axis of axesFor(gizmo)) {
        segment(add(at,multiply(axis,-grid*.4)),add(at,multiply(axis,grid*.4)),'#e9b5bd',[4,3])
      }
      const p=project(at)
      if(p) {
        ctx.beginPath();ctx.arc(p.x,p.y,8,0,2*Math.PI);ctx.strokeStyle='#e9b5bd';ctx.stroke()
        ctx.fillStyle='#f8d0d6'
        ctx.fillText(gizmo.target==='position'?gizmo.axis.toUpperCase():(preview??editValue).map(value=>value.toPrecision(3)).join(', ')+(gizmo.target==='force'?' N':' m/s'),p.x+11,p.y+17)
      }
    }
  },[camera,engine,forecast,comparison,displayPositions,history,revision,selected,size,vectors,trailWindow,fieldLines,potentialFaces,showMagnetic,trailColor,trailAlpha,timeMarkers,gizmo,preview,target,draft,vectorView,trailCount,axisOrigin,moveAxis,showGrid,showAxes,gridOpacity,celestial,lensRays,editValue,editScale])

  function drag(event:PointerEvent<HTMLCanvasElement>) {
    if(fingers.current.has(event.pointerId)) {
      fingers.current.set(event.pointerId,[event.clientX,event.clientY])
      const start=pinch.current
      if(start&&fingers.current.size>=2) {
        const [a,b]=fingers.current.values()
        const distance=Math.max(5,Math.hypot(a[0]-b[0],a[1]-b[1]))
        setCamera(zoomSpatialCamera(start.camera,start.distance/distance))
        return
      }
    }
    if(stroke.current?.id===event.pointerId&&drawing) {
      const rect=event.currentTarget.getBoundingClientRect()
      const next=projectOnPlane(camera,size,event.clientX-rect.left,event.clientY-rect.top,drawing.plane,drawing.offset)
      const points=stroke.current.points
      if(next&&points.length<220&&length(subtract(next,points.at(-1)!))>.018) {points.push(next);setDraft(points.slice())}
      return
    }
    const move=edit.current
    if(move?.pointer===event.pointerId) {
      setPreview(add(move.start,move.solve(event.clientX-move.x,event.clientY-move.y)))
      return
    }
    const current=gesture.current
    if(!current||current.pointer!==event.pointerId)return
    const dx=event.clientX-current.x,dy=event.clientY-current.y
    if(Math.hypot(dx,dy)<3&&!current.moved)return
    current.moved=true
    const previous=current.camera
    if(current.pan||previous.mode==='xy') {
      const k=previous.distance/Math.max(1,size.height)
      const right:Vec3=previous.mode==='xy'?[1,0,0]:[Math.cos(previous.yaw),0,-Math.sin(previous.yaw)]
      setCamera({...previous,focus:add(previous.focus,add(multiply(right,-dx*k),[0,dy*k,0]))})
    } else setCamera({...previous,yaw:previous.yaw-dx*.008,pitch:Math.max(-1.45,Math.min(1.45,previous.pitch+dy*.008))})
  }

  function beginEdit(event:PointerEvent<HTMLCanvasElement>) {
    if(!gizmo||!target||!editValue)return false
    const start=editValue
    const at=gizmo.target==='position'?start:add(target.position,multiply(start,editScale))
    const project=projection(camera,size.width,size.height),origin=project(at)
    const rect=event.currentTarget.getBoundingClientRect()
    if(!origin||Math.hypot(event.clientX-rect.left-origin.x,event.clientY-rect.top-origin.y)>22)return false
    const axes=axesFor(gizmo)
    const measure=Math.max(.005,camera.distance/300)
    const screen=axes.map(axis=>{
      const p=project(add(at,multiply(axis,measure)))
      return p?{x:(p.x-origin.x)/measure,y:(p.y-origin.y)/measure}:{x:0,y:0}
    })
    const [a,b]=screen,scale=1/editScale
    const denominator=a.x*a.x+a.y*a.y
    const det=b?a.x*b.y-a.y*b.x:0
    if(denominator===0||b&&Math.abs(det)<=Math.hypot(a.x,a.y)*Math.hypot(b.x,b.y)*.025)return false
    function solve(x:number,y:number) {
      return !b?multiply(axes[0],scale*(x*a.x+y*a.y)/denominator)
        :multiply(add(multiply(axes[0],(x*b.y-y*b.x)/det),multiply(axes[1],(a.x*y-a.y*x)/det)),scale)
    }
    edit.current={pointer:event.pointerId,x:event.clientX,y:event.clientY,start,solve,commit:gizmo.commit}
    event.currentTarget.setPointerCapture(event.pointerId)
    return true
  }

  return <canvas ref={canvas} className="spatial-canvas" aria-label="三维实验画布" tabIndex={0}
    onDoubleClick={()=>{if(selected)focusBody?.(selected)}}
    onWheel={event=>setCamera(zoomSpatialCamera(camera,Math.exp(event.deltaY*.001)))}
    onPointerDown={event=>{
      if(!drawing&&event.pointerType==='touch') {
        fingers.current.set(event.pointerId,[event.clientX,event.clientY])
        if(fingers.current.size>=2) {
          const [a,b]=fingers.current.values()
          gesture.current=undefined;edit.current=undefined;setPreview(undefined)
          pinch.current={distance:Math.max(5,Math.hypot(a[0]-b[0],a[1]-b[1])),camera}
          event.currentTarget.setPointerCapture(event.pointerId)
          return
        }
      }
      if(gesture.current||event.button!==0)return
      event.currentTarget.focus()
      if(drawing) {
        const rect=event.currentTarget.getBoundingClientRect()
        const point=projectOnPlane(camera,size,event.clientX-rect.left,event.clientY-rect.top,drawing.plane,drawing.offset)
        if(point){stroke.current={id:event.pointerId,points:[point]};setDraft([point]);event.currentTarget.setPointerCapture(event.pointerId)}
        return
      }
      if(moveAxis) {
        const {axis,up}=camera.mode==='xy'?{axis:[1,0,0] as Vec3,up:[0,1,0] as Vec3}:viewAxes(camera)
        const scale=projection(camera,size.width,size.height)(axisOrigin)?.scale??Math.max(1,size.width/camera.distance)
        edit.current={pointer:event.pointerId,x:event.clientX,y:event.clientY,start:axisOrigin,
          solve:(x,y)=>add(multiply(axis,x/scale),multiply(up,-y/scale)),commit:moveAxis}
        event.currentTarget.setPointerCapture(event.pointerId)
        return
      }
      if(beginEdit(event))return
      gesture.current={x:event.clientX,y:event.clientY,pointer:event.pointerId,camera,pan:event.shiftKey,moved:false}
      event.currentTarget.setPointerCapture(event.pointerId)
    }} onPointerMove={drag} onPointerCancel={event=>{
      fingers.current.delete(event.pointerId);pinch.current=undefined
      gesture.current=undefined;edit.current=undefined;stroke.current=undefined;setPreview(undefined);setDraft([])
    }} onPointerUp={event=>{
      fingers.current.delete(event.pointerId)
      if(pinch.current){if(fingers.current.size<2)pinch.current=undefined;return}
      if(stroke.current?.id===event.pointerId) {
        const {points}=stroke.current
        stroke.current=undefined;setDraft([])
        if(points.length>=2)drawing?.commit(points)
        return
      }
      const move=edit.current
      if(move?.pointer===event.pointerId) {
        const dx=event.clientX-move.x,dy=event.clientY-move.y
        edit.current=undefined;setPreview(undefined)
        if(Math.hypot(dx,dy)>2)move.commit(add(move.start,move.solve(dx,dy)))
        return
      }
      const current=gesture.current
      if(!current||current.pointer!==event.pointerId)return
      gesture.current=undefined
      if(current.moved)return
      const rect=event.currentTarget.getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top
      const project=projection(camera,size.width,size.height)
      const hit=engine.bodies.flatMap(body=>{
        if(!engine.visibleBody(body.id))return []
        const p=project(displayPositions?.get(body.id)??body.position)
        return p&&Math.hypot(p.x-x,p.y-y)<=Math.max(10,p.scale*(body.geometry?meshRadius(body.geometry):body.visualRadius??body.radius))?([{id:body.id,depth:p.depth}]):[]
      }).sort((a,b)=>a.depth-b.depth)[0]
      select(hit?.id??'')
    }} onKeyDown={event=>{
      if(camera.mode!=='first')return
      const next=moveFirstPerson(camera,event.key.toLowerCase())
      if(next!==camera){event.preventDefault();setCamera(next)}
    }}/>
}
