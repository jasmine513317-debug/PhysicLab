import { useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { Minus, Plus, RotateCcw } from 'lucide-react'
import { screenPoint, worldPoint, type View } from './coordinates'
import { corner, fitStroke, moveNode, type CurveNode, type Mesh, type Vector3 } from './geometry'
import type { Camera, Point } from './model'

function useCanvas(draw:(ctx:CanvasRenderingContext2D,view:View)=>void) {
  const ref=useRef<HTMLCanvasElement>(null)
  const paint=useRef(draw)
  function render() {
    const canvas=ref.current,ctx=canvas?.getContext('2d')
    if(!canvas||!ctx)return
    const width=canvas.clientWidth,height=canvas.clientHeight
    if(!width||!height)return
    const dpr=Math.min(window.devicePixelRatio||1,2)
    const w=Math.round(width*dpr),h=Math.round(height*dpr)
    if(canvas.width!==w)canvas.width=w
    if(canvas.height!==h)canvas.height=h
    ctx.setTransform(dpr,0,0,dpr,0,0)
    ctx.clearRect(0,0,width,height)
    paint.current(ctx,{width,height})
  }
  useLayoutEffect(()=>{paint.current=draw;render()},[draw])
  useLayoutEffect(()=>{
    const observer=new ResizeObserver(render)
    observer.observe(ref.current!)
    return ()=>observer.disconnect()
  },[])
  return ref
}

function line(ctx:CanvasRenderingContext2D,points:Point[],color:string,width=1) {
  if(!points.length)return
  ctx.beginPath();ctx.moveTo(points[0].x,points[0].y)
  for(let i=1;i<points.length;i++)ctx.lineTo(points[i].x,points[i].y)
  ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke()
}

function dot(ctx:CanvasRenderingContext2D,p:Point,radius:number,color:string) {
  ctx.beginPath();ctx.arc(p.x,p.y,radius,0,2*Math.PI);ctx.fillStyle=color;ctx.fill()
}

function arrowDirection(e:KeyboardEvent<HTMLCanvasElement>) {
  if(e.ctrlKey||e.metaKey||e.altKey)return
  const x=Number(e.key==='ArrowRight')-Number(e.key==='ArrowLeft')
  const y=Number(e.key==='ArrowDown')-Number(e.key==='ArrowUp')
  if(!x&&!y)return
  e.preventDefault()
  return {x,y}
}

function curveCamera(view:View,center:Point,width:number,zoom:number):Camera {
  return {...center,scale:Math.max(0.01,Math.min(view.width/width,view.height/(width*0.65)))*zoom}
}

type CurveTool='node'|'draw'|'pan'
type Drag={id:number;start:Point;camera:Camera;center:Point;target?:{i:number;key:keyof CurveNode};ink:Point[];modified?:CurveNode[];moved:boolean}
interface CurveProps {
  paths:Point[][];nodes?:CurveNode[];closed:boolean;selected:number;tool:CurveTool;dashed:boolean
  select:(index:number)=>void;edit:(nodes:CurveNode[],closed:boolean)=>void
}

export function CurveCanvas({paths,nodes,closed,selected,tool,dashed,select,edit}:CurveProps) {
  const [view,setView]=useState({center:{x:0,y:1},width:12,zoom:1})
  const [overlay,setOverlay]=useState<{nodes?:CurveNode[];ink?:Point[]}>({})
  const drag=useRef<Drag|null>(null)
  const ref=useCanvas((ctx,size)=>{
    const camera=curveCamera(size,view.center,view.width,view.zoom)
    const screen=(point:Point)=>screenPoint(point,camera,size)
    const origin=screen({x:0,y:0})
    const unit=10**Math.round(Math.log10(52/camera.scale)),stride=unit*camera.scale
    for(let x=(origin.x%stride+stride)%stride;x<size.width;x+=stride)line(ctx,[{x,y:0},{x,y:size.height}],'#242429')
    for(let y=(origin.y%stride+stride)%stride;y<size.height;y+=stride)line(ctx,[{x:0,y},{x:size.width,y}],'#242429')
    line(ctx,[{x:0,y:origin.y},{x:size.width,y:origin.y}],'#55555e')
    line(ctx,[{x:origin.x,y:0},{x:origin.x,y:size.height}],'#55555e')
    ctx.font='11px monospace';ctx.fillStyle='#a6a6a6';ctx.fillText('X / Y · '+Number(unit.toPrecision(3))+' m / 格',13,size.height-14)

    const controls=overlay.nodes??nodes
    ctx.setLineDash(dashed?[8,5]:[])
    if(overlay.nodes&&controls) {
      if(controls.length) {
        ctx.beginPath()
        const from=screen(controls[0].point);ctx.moveTo(from.x,from.y)
        for(let i=0;i<controls.length-(closed?0:1);i++) {
          const a=screen(controls[i].out),b=screen(controls[(i+1)%controls.length].in),p=screen(controls[(i+1)%controls.length].point)
          ctx.bezierCurveTo(a.x,a.y,b.x,b.y,p.x,p.y)
        }
        ctx.strokeStyle='#a6bfff';ctx.lineWidth=2;ctx.stroke()
      }
    } else for(const path of paths) {
      if(path.length===1)dot(ctx,screen(path[0]),3,'#a6bfff')
      else line(ctx,path.map(screen),'#a6bfff',2)
    }
    ctx.setLineDash([])
    if(overlay.ink)line(ctx,overlay.ink.map(screen),'#f5f5f2',1.8)
    if(tool==='node')controls?.forEach((node,i)=>{
      const p=screen(node.point)
      if(i===selected)for(const key of ['in','out'] as const) {
        const handle=screen(node[key])
        if(Math.hypot(handle.x-p.x,handle.y-p.y)<2)continue
        line(ctx,[p,handle],'#858591');dot(ctx,handle,4,'#f2c38b')
      }
      dot(ctx,p,i===selected?5:3.5,i===selected?'#f5f5f2':'#a6bfff')
    })
  })

  function pointer(e:PointerEvent<HTMLCanvasElement>) {
    const box=e.currentTarget.getBoundingClientRect()
    return {size:box,pixel:{x:e.clientX-box.left,y:e.clientY-box.top}}
  }
  function start(e:PointerEvent<HTMLCanvasElement>) {
    if(e.button!==0||drag.current)return
    e.currentTarget.focus({preventScroll:true})
    const {size,pixel}=pointer(e),camera=curveCamera(size,view.center,view.width,view.zoom)
    let target:Drag['target']
    if(nodes&&tool==='node') {
      const hit=(p:Point,r=12)=>{const q=screenPoint(p,camera,size);return Math.hypot(q.x-pixel.x,q.y-pixel.y)<=r}
      const i=nodes.findIndex(node=>hit(node.point,10))
      if(i!==-1)target={i,key:'point'}
      else if(nodes[selected])for(const key of ['in','out'] as const)if(hit(nodes[selected][key])) {target={i:selected,key};break}
      if(target)select(target.i)
    }
    const ink=tool==='draw'?[worldPoint(pixel,camera,size)]:[]
    drag.current={id:e.pointerId,start:pixel,camera,center:view.center,target,ink,moved:false}
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  function move(e:PointerEvent<HTMLCanvasElement>) {
    const d=drag.current
    if(!d||d.id!==e.pointerId)return
    const {size,pixel}=pointer(e)
    const dx=pixel.x-d.start.x,dy=pixel.y-d.start.y
    if(Math.hypot(dx,dy)<3&&!d.moved)return
    d.moved=true
    const p=worldPoint(pixel,d.camera,size)
    if(tool==='pan'||!nodes) {
      setView(current=>({...current,center:{x:d.center.x-dx/d.camera.scale,y:d.center.y+dy/d.camera.scale}}))
    } else if(tool==='draw'&&d.ink.length<1600) {
      d.ink.push(p);setOverlay({ink:[...d.ink]})
    } else if(d.target) {
      const {i,key}=d.target
      d.modified=nodes.map((node,j)=>i===j?moveNode(node,key,p):node)
      setOverlay({nodes:d.modified})
    }
  }
  function finish(e:PointerEvent<HTMLCanvasElement>,cancel=false) {
    const d=drag.current
    if(!d||d.id!==e.pointerId)return
    drag.current=null;setOverlay({})
    if(cancel||!nodes)return
    if(tool==='draw') {
      const fitted=fitStroke(d.ink)
      if(fitted.length>=2) {edit(fitted,false);select(0)}
    } else if(d.modified)edit(d.modified,closed)
    else if(tool==='node'&&!d.target&&!d.moved&&nodes.length<128) {
      const {size,pixel}=pointer(e),point=worldPoint(pixel,d.camera,size)
      edit([...nodes,corner(point)],closed);select(nodes.length)
    }
  }
  function fit() {
    const positions=paths.flat()
    if(!positions.length){setView({center:{x:0,y:1},width:12,zoom:1});return}
    const xs=positions.map(p=>p.x),ys=positions.map(p=>p.y)
    const x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys)
    setView({center:{x:(x0+x1)/2,y:(y0+y1)/2},width:Math.max(3,x1-x0,(y1-y0)/0.65)*1.24,zoom:1})
  }
  return <>
    <canvas ref={ref} tabIndex={0} aria-label="二维几何画布" className={'geometry-canvas '+(tool==='pan'||!nodes?'geometry-pan':'')}
      onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={e=>finish(e,true)} onLostPointerCapture={e=>finish(e,true)}
      onKeyDown={e=>{
        const direction=arrowDirection(e)
        if(!direction)return
        setView(v=>({...v,center:{x:v.center.x+direction.x*v.width/v.zoom*.035,y:v.center.y-direction.y*v.width/v.zoom*.035}}))
      }}/>
    <div className="geometry-camera" role="group" aria-label="二维视图">
      <button className="icon framed" aria-label="缩小视图" onClick={()=>setView(v=>({...v,zoom:Math.max(.1,v.zoom/1.3)}))}><Minus size={17}/></button>
      <button className="icon framed" aria-label="放大视图" onClick={()=>setView(v=>({...v,zoom:Math.min(30,v.zoom*1.3)}))}><Plus size={17}/></button>
      <button className="button compact" onClick={fit}>适应画布</button>
    </div>
  </>
}

const defaultView={yaw:-0.63,pitch:0.52,zoom:1,x:0,y:0}

export function SurfaceCanvas({mesh,grid,shade,normals,pan}:{mesh?:Mesh;grid:boolean;shade:boolean;normals:boolean;pan:boolean}) {
  const [view,setView]=useState(defaultView)
  const drag=useRef<{id:number;x:number;y:number;view:typeof defaultView;pan:boolean}|null>(null)
  const ref=useCanvas((ctx,size)=>{
    if(!mesh)return
    const points=mesh.vertices.filter(p=>p!==null)
    const bounds=(key:keyof Vector3)=>{
      const values=points.map(p=>p[key]), lo=Math.min(...values), hi=Math.max(...values)
      return {mid:(lo+hi)/2,span:hi-lo}
    }
    const x=bounds('x'),y=bounds('y'),z=bounds('z')
    const scale=Math.min(size.width,size.height)*0.64/Math.max(x.span,y.span,z.span,0.01)*view.zoom
    const a=Math.cos(view.yaw),b=Math.sin(view.yaw),s=Math.sin(view.pitch),c=Math.cos(view.pitch)
    const project=(p:Vector3)=>{
      const u=p.x-x.mid,v=p.y-y.mid,w=p.z-z.mid,q=b*u+a*v
      return {x:size.width/2+view.x+scale*(a*u-b*v),y:size.height/2+view.y-scale*(q*s+w*c),z:q*c-w*s}
    }
    const projected=mesh.vertices.map(p=>p?project(p):null)
    const sorted=mesh.faces.map(face=>({face,depth:face.reduce((total,i)=>total+projected[i]!.z,0)})).sort((l,r)=>r.depth-l.depth)
    const normal=(face:number[])=>{
      const [p,q,r]=face.map(i=>mesh.vertices[i]!)
      const u={x:q.x-p.x,y:q.y-p.y,z:q.z-p.z},v={x:r.x-p.x,y:r.y-p.y,z:r.z-p.z}
      const n={x:u.y*v.z-u.z*v.y,y:u.z*v.x-u.x*v.z,z:u.x*v.y-u.y*v.x},len=Math.hypot(n.x,n.y,n.z)||1
      return {x:n.x/len,y:n.y/len,z:n.z/len}
    }
    for(const {face} of sorted) {
      const [p,q,r]=face.map(i=>projected[i]!)
      ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);ctx.lineTo(r.x,r.y);ctx.closePath()
      if(shade) {
        const n=normal(face),light=36+Math.round(Math.abs(n.x*.39+n.y*.26+n.z*.82)*113)
        ctx.fillStyle='rgb('+light+' '+light+' '+(light+4)+')';ctx.fill()
      }
      if(grid) {ctx.strokeStyle=shade?'#b4b4c16b':'#a6bfff80';ctx.lineWidth=.75;ctx.stroke()}
    }
    if(normals)for(let i=0;i<mesh.faces.length;i+=Math.ceil(mesh.faces.length/36)) {
      const face=mesh.faces[i],p=mesh.vertices[face[0]]!,n=normal(face),length=Math.max(x.span,y.span,z.span)*.048
      const a=project(p),b=project({x:p.x+n.x*length,y:p.y+n.y*length,z:p.z+n.z*length})
      line(ctx,[a,b],'#f2c38b',1.2);dot(ctx,b,2,'#f2c38b')
    }
  })
  return <>
    <canvas ref={ref} tabIndex={0} aria-label="三维曲面画布" className="geometry-canvas geometry-pan"
      onPointerDown={e=>{
        if(e.button!==0||drag.current)return
        e.currentTarget.focus({preventScroll:true})
        drag.current={id:e.pointerId,x:e.clientX,y:e.clientY,view,pan:pan||e.shiftKey}
        e.currentTarget.setPointerCapture(e.pointerId)
      }} onPointerMove={e=>{
        const d=drag.current
        if(!d||d.id!==e.pointerId)return
        const dx=e.clientX-d.x,dy=e.clientY-d.y
        setView(d.pan?{...d.view,x:d.view.x+dx,y:d.view.y+dy}:
          {...d.view,yaw:d.view.yaw+dx*.01,pitch:Math.max(-1.53,Math.min(1.53,d.view.pitch-dy*.009))})
      }} onPointerUp={e=>{if(drag.current?.id===e.pointerId)drag.current=null}}
      onLostPointerCapture={e=>{if(drag.current?.id===e.pointerId)drag.current=null}}
      onKeyDown={e=>{
        const direction=arrowDirection(e)
        if(!direction)return
        setView(v=>pan||e.shiftKey?{...v,x:v.x+direction.x*16,y:v.y+direction.y*16}:
          {...v,yaw:v.yaw+direction.x*.12,pitch:Math.max(-1.53,Math.min(1.53,v.pitch-direction.y*.12))})
      }}/>
    <div className="geometry-camera" role="group" aria-label="三维视图">
      <button className="icon framed" aria-label="缩小曲面" onClick={()=>setView(v=>({...v,zoom:Math.max(.2,v.zoom/1.3)}))}><Minus size={17}/></button>
      <button className="icon framed" aria-label="放大曲面" onClick={()=>setView(v=>({...v,zoom:Math.min(6,v.zoom*1.3)}))}><Plus size={17}/></button>
      <button className="icon framed" aria-label="重置三维视图" onClick={()=>setView(defaultView)}><RotateCcw size={17}/></button>
    </div>
  </>
}
