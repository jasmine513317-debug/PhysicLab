import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { Circle, Crosshair, Grid2X2, LocateFixed, Minus, MousePointer2, Plus, Spline, Square, Trash2, Triangle, X, Zap, MoveUpRight, PenLine, Waves, ChevronsUpDown, Orbit } from 'lucide-react'
import { rotate, screenPoint, worldPoint, zoomAt } from './coordinates'
import { body, type BodyConfig, type Camera, type Experiment, type Point, type Spring } from './model'
import { defaultDisplay, drawScene, type Display, type Overlay, type ReplayView } from './render'
import type { Sample } from './analysis'
import type { Physics } from './physics'
import { classifyDrawing, drawingLabels, type DrawingKind } from './drawing'

const displayLabels = {velocity:'速度矢量',acceleration:'加速度矢量',forces:'力矢量',trails:'运动轨迹',reference:'理论轨迹'} as const

export type Tool = 'select'|'circle'|'rectangle'|'ground'|'ramp'|'draw'|'spring'
const tools = [
  ['select','选择',MousePointer2],['circle','圆形',Circle],['rectangle','矩形',Square],
  ['ground','地面',Minus],['ramp','斜面',Triangle],['draw','绘制',PenLine],['spring','弹簧',Waves],
] as const
export function Tools({tool,setTool,display,toggle,locked=false}:{locked?:boolean;tool:Tool;setTool:(t:Tool)=>void;display:Display;toggle:(key:'forces'|'trails')=>void}) {
  return <aside className="tools" aria-label="场景工具">
    {tools.map(([key,label,Icon])=><button key={key} className={tool===key?'tool active':'tool'} aria-pressed={tool===key} title={key==='select'?'选择 · 拖物体移动，拖空白平移，右键查看操作':label} disabled={locked} onClick={()=>setTool(key)}><Icon size={17}/><span>{label}</span></button>)}
    <div className="tool-rule"/>
    <button className={display.forces?'tool toggled':'tool'} aria-pressed={display.forces} disabled={locked} onClick={()=>toggle('forces')}><Zap size={17}/><span>力矢量</span></button>
    <button className={display.trails?'tool toggled':'tool'} aria-pressed={display.trails} onClick={()=>toggle('trails')}><Spline size={17}/><span>轨迹</span></button>
  </aside>
}

type Drag = {pointer:number;from:Point;pixel:Point;now:Point;camera:Camera;type:Tool|'pan';positions:Map<string,Point>;moved?:boolean}
type Target = {id:string;name:string;at:Point;body?:BodyConfig;joint?:Spring}
type TargetMenu = {target:Target;pixel:Point}
const interaction: Record<Tool,string> = {
  select:'拖物体移动 · 拖空白平移 · 右键操作',circle:'拖动以设置圆形半径',
  rectangle:'从一个角拖动到对角',ground:'水平拖动以放置地面',ramp:'从起点拖动到终点以放置斜面',
  draw:'点击顶点或拖出线段，再选择图形类型',spring:'在不同的物体上各选一个连接点',
}

function local(point:Point,position:Point,angle:number) {
  return rotate({x:point.x-position.x,y:point.y-position.y},-angle)
}
function contains(b:BodyConfig,p:Point,position:Point,angle:number,tolerance:number) {
  const q=local(p,position,angle),g=b.geometry
  if (g.kind==='circle') return Math.hypot(q.x,q.y)<=g.radius+tolerance
  if (g.kind!=='polygon') return Math.abs(q.x)<=g.width/2+tolerance&&Math.abs(q.y)<=g.height/2+tolerance
  let inside=false
  g.vertices.forEach((v,i)=>{
    const w=g.vertices[(i+1)%g.vertices.length]
    if ((v.y>q.y)!==(w.y>q.y) && q.x<(w.x-v.x)*(q.y-v.y)/(w.y-v.y)+v.x) inside=!inside
  })
  return inside
}
function segment(a:Point,b:Point,horizontal=false) {
  const dy=horizontal?0:b.y-a.y, dx=b.x-a.x
  return body(horizontal?'地面':'静态线段',{kind:'surface',width:Math.max(0.2,Math.hypot(dx,dy)),height:0.18},
    (a.x+b.x)/2,a.y+dy/2,{angle:Math.atan2(dy,dx)})
}

interface ViewportProps {
  scene:Experiment
  camera:Camera
  setCamera:(value:Camera)=>void
  physics:Physics
  resetCamera:()=>void
  tool:Tool
  selected:string
  running:boolean
  pause:()=>void
  display:Display
  setDisplay:(display:Display)=>void
  trailSince:number
  baseline?:Sample[]
  replay?:ReplayView
  select:(id:string)=>void
  change:(changes:Partial<Experiment>)=>boolean
  remove:(id:string)=>void
  report:(message:string)=>void
}
export function Viewport(props:ViewportProps) {
  const {scene,camera,setCamera,physics,tool,selected,display,setDisplay,change,select,remove,report}=props
  const canvas=useRef<HTMLCanvasElement>(null)
  const latest=useRef(props)
  latest.current=props
  const drag=useRef<Drag|null>(null)
  const space=useRef(false)
  const hold=useRef<ReturnType<typeof setTimeout>|null>(null)
  const menuRef=useRef<HTMLDivElement>(null)
  const [targetMenu,setTargetMenu]=useState<TargetMenu|null>(null)
  const [position,setPosition]=useState<Point>({x:0,y:0})
  const [anchor,setAnchor]=useState<{id:string; local:Point; world:Point}|null>(null)
  const [draft,setDraft]=useState<Point[]>([])
  const [closed,setClosed]=useState(false)
  const suggestion=classifyDrawing(draft)
  const isReplay=Boolean(props.replay)
  const [displayMenu,setDisplayMenu]=useState(false)
  const stageState=useRef({anchor,draft,position,closed,targetMenu})
  stageState.current={anchor,draft,position,closed,targetMenu}
  useEffect(()=>{
    cancelDrag()
    setAnchor(null);setDraft([]);setClosed(false);setTargetMenu(null)
  },[tool,physics,isReplay])
  useEffect(()=>{
    if(!targetMenu)return
    const dismiss=(e:PointerEvent)=>{
      if(!menuRef.current?.contains(e.target as Node))setTargetMenu(null)
    }
    window.addEventListener('pointerdown',dismiss)
    return ()=>window.removeEventListener('pointerdown',dismiss)
  },[targetMenu])
  useEffect(()=>{
    const el=canvas.current!
    const ctx=el.getContext('2d')
    if (!ctx) {latest.current.report('当前浏览器无法使用画布渲染。');return}
    const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)')
    let frame=0, failed=false, lastDraw=0, previousTime=-1
    let previousProps:ViewportProps|undefined, previousStage:typeof stageState.current|undefined, previousDrag:Drag|null=null
    function draw(now:number) {
      const current=latest.current
      const {camera,scene,physics,display,selected,trailSince,baseline,replay}=current
      const view={width:el.clientWidth,height:el.clientHeight}
      const dpr=Math.min(2,window.devicePixelRatio||1)
      const w=Math.round(view.width*dpr),h=Math.round(view.height*dpr)
      const resized=el.width!==w||el.height!==h
      const d=drag.current
      const stage=stageState.current
      const time=replay?replay.index:physics.time
      // Idle views only repaint on changes. Busy scenes keep physics at 60 Hz and paint at up to 30 Hz.
      const highlight=stage.targetMenu?.target.id
      const animate=Boolean(highlight&&!reducedMotion.matches)
      const dirty=resized||animate||current!==previousProps||stage!==previousStage||d!==previousDrag||time!==previousTime
      if(!dirty||(scene.bodies.length>=40&&current.running&&!resized&&now-lastDraw<32)) {
        frame=requestAnimationFrame(draw)
        return
      }
      if(resized) {el.width=w;el.height=h}
      previousProps=current;previousStage=stage;previousDrag=d;previousTime=time;lastDraw=now
      const {draft,anchor,position,closed}=stageState.current
      let overlay:Overlay|undefined=draft.length?{points:closed?[...draft,draft[0]]:draft}:undefined
      if(anchor) overlay={points:[anchor.world,position],color:'#e8b779'}
      const move=d?.type==='select'&&d.moved?draggedPositions(d,d.now):undefined
      if(d && d.type!=='pan' && d.type!=='select') {
        const a=d.from,b=d.now
        if(d.type==='rectangle') overlay={points:[a,{x:b.x,y:a.y},b,{x:a.x,y:b.y},a]}
        else if(d.type==='ground') overlay={points:[a,{x:b.x,y:a.y}]}
        else if(d.type==='circle') {
          const radius=Math.hypot(a.x-b.x,a.y-b.y)
          overlay={points:Array.from({length:37},(_,i)=>({x:a.x+radius*Math.cos(i*Math.PI/18),y:a.y+radius*Math.sin(i*Math.PI/18)}))}
        } else if(d.type==='ramp'||d.type==='draw') overlay={points:[...draft,a,b]}
      }
      try {
        ctx!.setTransform(dpr,0,0,dpr,0,0)
        drawScene(ctx!,view,camera,scene,display,{physics:replay?undefined:physics,selected,overlay,trailSince,baseline,replay,move,highlight,dash:animate?-(now*.034)%14:0})
      } catch {
        if(!failed) latest.current.report('无法绘制当前场景。请重置视图或重新加载实验。')
        failed=true
        return
      }
      frame=requestAnimationFrame(draw)
    }
    frame=requestAnimationFrame(draw)
    function wheel(e:WheelEvent) {
      e.preventDefault()
      const r=el.getBoundingClientRect()
      const {camera,setCamera}=latest.current
      setCamera(zoomAt(camera,r,{x:e.clientX-r.left,y:e.clientY-r.top},Math.exp(-Math.max(-150,Math.min(150,e.deltaY))*0.002)))
    }
    const down=(e:KeyboardEvent)=>{
      if(e.target instanceof HTMLElement && e.target.closest('input, textarea, select, button, [contenteditable]')) return
      if(e.code==='Space') {space.current=true;e.preventDefault()}
      if(e.key==='Escape') {cancelDrag();setDraft([]);setAnchor(null);setClosed(false);setTargetMenu(null)}
    }
    const up=(e:KeyboardEvent)=>{if(e.code==='Space')space.current=false}
    const blur=()=>{space.current=false}
    el.addEventListener('wheel',wheel,{passive:false})
    window.addEventListener('keydown',down);window.addEventListener('keyup',up);window.addEventListener('blur',blur)
    return ()=>{
      cancelHold();cancelAnimationFrame(frame);el.removeEventListener('wheel',wheel)
      window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);window.removeEventListener('blur',blur)
    }
  },[])
  function points(e:ReactMouseEvent<HTMLCanvasElement>) {
    const rect=e.currentTarget.getBoundingClientRect(), pixel={x:e.clientX-rect.left,y:e.clientY-rect.top}
    return {pixel,world:worldPoint(pixel,camera,rect)}
  }
  function cancelHold() {
    if(hold.current!==null)clearTimeout(hold.current)
    hold.current=null
  }
  function cancelDrag() {
    drag.current=null
    cancelHold()
  }
  function targetById(id:string):Target|undefined {
    const config=scene.bodies.find(b=>b.id===id)
    if(config) {
      const at=physics.bodies.get(id)?.getPosition()??config.position
      return {id,name:config.name,at,body:config}
    }
    const index=scene.joints.findIndex(j=>j.id===id)
    const joint=physics.springJoints.get(id)
    if(index===-1||!joint)return
    const a=joint.getAnchorA(),b=joint.getAnchorB()
    return {id,name:'弹簧 '+(index+1),at:{x:(a.x+b.x)/2,y:(a.y+b.y)/2},joint:scene.joints[index]}
  }
  function hitTarget(world:Point,bodiesOnly=false):Target|undefined {
    for(let i=scene.bodies.length-1;i>=0;i--) {
      const body=scene.bodies[i]
      const live=physics.bodies.get(body.id)
      const at=live?.getPosition()??body.position
      if(contains(body,world,at,live?.getAngle()??body.angle,4/camera.scale)) {
        return {id:body.id,name:body.name,at,body}
      }
    }
    if(bodiesOnly)return
    for(const j of scene.joints) {
      const joint=physics.springJoints.get(j.id)!
      const a=joint.getAnchorA(),b=joint.getAnchorB(),dx=b.x-a.x,dy=b.y-a.y
      const lengthSquared=dx*dx+dy*dy
      const t=lengthSquared?Math.max(0,Math.min(1,((world.x-a.x)*dx+(world.y-a.y)*dy)/lengthSquared)):0
      if(Math.hypot(world.x-a.x-t*dx,world.y-a.y-t*dy)<9/camera.scale)return targetById(j.id)
    }
  }
  function showTarget(target:Target,pixel:Point) {
    select(target.id)
    setDisplayMenu(false)
    setTargetMenu({target,pixel})
  }
  function onContext(e:ReactMouseEvent<HTMLCanvasElement>) {
    if(isReplay||tool!=='select')return
    e.preventDefault()
    const {pixel,world}=points(e)
    const target=hitTarget(world)
    if(target)showTarget(target,pixel)
    else {select('');setTargetMenu(null)}
  }
  function attachSpring(hit:BodyConfig,world:Point) {
    if(!anchor) {setAnchor({id:hit.id,world,local:local(world,hit.position,hit.angle)});return}
    if(anchor.id===hit.id)return
    const j:Spring={id:crypto.randomUUID(),a:anchor.id,b:hit.id,anchorA:anchor.local,anchorB:local(world,hit.position,hit.angle),
      restLength:Math.max(0.1,Math.hypot(world.x-anchor.world.x,world.y-anchor.world.y)),stiffness:40,damping:0.15}
    if(change({joints:[...scene.joints,j]})) {setAnchor(null);select(j.id)}
  }
  function onDown(e:ReactPointerEvent<HTMLCanvasElement>) {
    if((e.button!==0&&e.button!==1)||drag.current)return
    e.preventDefault()
    e.currentTarget.focus()
    const {pixel,world}=points(e)
    const forcedPan=e.button===1||space.current||isReplay
    const type=forcedPan?'pan':tool
    if(props.running&&type!=='select'&&type!=='pan') {report('请先暂停模拟，再编辑场景。');return}
    if(type==='spring') {
      const hit=hitTarget(world,true)?.body
      if(hit)attachSpring(hit,world)
      return
    }
    const target=type==='select'?hitTarget(world):undefined
    if(type==='select')select(target?.id??'')
    const positions=new Map<string,Point>()
    if(target) {
      const ids=target.joint?[target.joint.a,target.joint.b]:[target.id]
      for(const id of ids) {
        const at=physics.bodies.get(id)?.getPosition()
        if(at)positions.set(id,{x:at.x,y:at.y})
      }
    }
    drag.current={pointer:e.pointerId,from:world,now:world,pixel,camera,
      type:type==='select'&&!target?'pan':type,positions}
    e.currentTarget.setPointerCapture(e.pointerId)
    if(target&&e.pointerType==='touch') hold.current=setTimeout(()=>{
      drag.current=null
      hold.current=null
      showTarget(target,pixel)
    },500)
  }
  function onMove(e:ReactPointerEvent<HTMLCanvasElement>) {
    const {pixel,world}=points(e)
    setPosition(world)
    const d=drag.current
    if(!d||d.pointer!==e.pointerId)return
    d.now=world
    if(Math.hypot(pixel.x-d.pixel.x,pixel.y-d.pixel.y)>5&&!d.moved) {
      d.moved=true
      cancelHold()
      if(d.type==='select'&&props.running)props.pause()
    }
    if(d.type==='pan'&&d.moved) setCamera({...d.camera,x:d.camera.x-(pixel.x-d.pixel.x)/d.camera.scale,y:d.camera.y+(pixel.y-d.pixel.y)/d.camera.scale})
  }
  function add(config:BodyConfig) {
    if(!change({bodies:[...scene.bodies,config]}))return false
    select(config.id)
    return true
  }
  function onUp(e:ReactPointerEvent<HTMLCanvasElement>) {
    const d=drag.current
    if(!d||d.pointer!==e.pointerId)return
    cancelDrag()
    if(d.type==='pan') {
      const {pixel}=points(e)
      if(Math.hypot(pixel.x-d.pixel.x,pixel.y-d.pixel.y)>5) {
        setCamera({...d.camera,x:d.camera.x-(pixel.x-d.pixel.x)/d.camera.scale,y:d.camera.y+(pixel.y-d.pixel.y)/d.camera.scale})
      }
      return
    }
    const {pixel,world:b}=points(e),a=d.from
    const moved=Math.hypot(pixel.x-d.pixel.x,pixel.y-d.pixel.y)>5
    if(d.type==='select') {
      if(moved) {
        const positions=draggedPositions(d,b)
        change({bodies:scene.bodies.map(body=>{
          const position=positions.get(body.id)
          return position?{...body,position}:body
        })})
      }
    } else if(d.type==='circle') {
      add(body('圆形',{kind:'circle',radius:moved?Math.max(0.08,Math.hypot(b.x-a.x,b.y-a.y)):0.3},a.x,a.y))
    } else if(d.type==='rectangle') {
      add(body('矩形',{kind:'rectangle',width:moved?Math.max(0.1,Math.abs(b.x-a.x)):0.8,height:moved?Math.max(0.1,Math.abs(b.y-a.y)):0.6},
        moved?(a.x+b.x)/2:a.x,moved?(a.y+b.y)/2:a.y,{color:'blue'}))
    } else if(d.type==='ground'||d.type==='ramp') {
      const end=moved?b:{x:a.x+3,y:a.y+(d.type==='ramp'?-1.2:0)}
      const result=segment(a,end,d.type==='ground')
      add({...result,name:d.type==='ramp'?'斜面':'地面'})
    } else if(d.type==='draw') {
      if(moved) {setDraft([a,b]);setClosed(false);return}
      if(closed)return
      if(draft.length>=3&&Math.hypot(a.x-draft[0].x,a.y-draft[0].y)*camera.scale<12) {setClosed(true);return}
      setDraft([...draft,a].slice(0,8))
    }
  }
  function confirmDrawing(kind:DrawingKind) {
    if(draft.length<2)return
    let config:BodyConfig
    if(kind==='polygon') {
      const c=draft.reduce((s,p)=>({x:s.x+p.x/draft.length,y:s.y+p.y/draft.length}),{x:0,y:0})
      config=body('多边形',{kind:'polygon',vertices:draft.map(p=>({x:p.x-c.x,y:p.y-c.y}))},c.x,c.y,{type:'static',color:'slate'})
    } else {
      const b=segment(draft[0],draft.at(-1)!,kind==='ground')
      config={...b,name:kind==='ground'?'静态边界':kind==='ramp'?'斜面':b.name}
    }
    if(add(config)) {setDraft([]);setClosed(false)}
  }
  function doZoom(factor:number) {
    const el=canvas.current!
    const view={width:el.clientWidth,height:el.clientHeight}
    setCamera(zoomAt(camera,view,{x:view.width/2,y:view.height/2},factor))
  }
  return <section className="viewport" aria-label="模拟视图">
    <canvas ref={canvas} tabIndex={0} aria-label="物理场景" data-tool={isReplay?'pan':tool}
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={cancelDrag}
      onLostPointerCapture={e=>{if(drag.current?.pointer===e.pointerId)cancelDrag()}}
      onContextMenu={onContext} onKeyDown={e=>{
        if((e.key!=='ContextMenu'&&!(e.shiftKey&&e.key==='F10'))||tool!=='select'||isReplay)return
        const target=targetById(selected)
        if(!target)return
        e.preventDefault()
        showTarget(target,screenPoint(target.at,camera,{width:e.currentTarget.clientWidth,height:e.currentTarget.clientHeight}))
        requestAnimationFrame(()=>menuRef.current?.querySelector('button')?.focus())
      }}/>
    {targetMenu&&<div ref={menuRef} className="target-menu" role="group" aria-label="目标操作"
      style={{left:'clamp(8px, '+(targetMenu.pixel.x+12)+'px, calc(100% - 123px))',top:'clamp(48px, '+(targetMenu.pixel.y+12)+'px, calc(100% - 48px))'}}
      onKeyDown={e=>{if(e.key==='Escape'){setTargetMenu(null);canvas.current?.focus()}}}>
      <button type="button" aria-label={'删除 '+targetMenu.target.name} onClick={()=>{
        remove(targetMenu.target.id)
        setTargetMenu(null)
        canvas.current?.focus()
      }}><Trash2 size={16}/> 删除目标</button>
    </div>}
    <div className="view-heading"><span className="view-tag"><Crosshair size={13}/> {isReplay?'历史回放':'模拟视图'}</span>
      <div className="view-actions">
        <button className={display.grid?'icon on':'icon'} title="切换坐标网格" aria-label="切换坐标网格" aria-pressed={display.grid} onClick={()=>setDisplay({...display,grid:!display.grid})}><Grid2X2 size={16}/></button>
        <button className={displayMenu?'icon on':'icon'} title="显示选项" aria-label="显示选项" aria-expanded={displayMenu} onClick={()=>setDisplayMenu(!displayMenu)}><ChevronsUpDown size={16}/></button>
      </div>
    </div>
    {displayMenu&&<div className="view-menu">
      {(['velocity','acceleration','forces','trails','reference'] as const).map(key=><label key={key}><input type="checkbox" disabled={isReplay&&key==='forces'} checked={display[key]} onChange={e=>setDisplay({...display,[key]:e.target.checked})}/>{displayLabels[key]}</label>)}
      <label>矢量比例 <input aria-label="矢量比例" type="range" min=".1" max="3" step=".1" value={display.vectorScale} onChange={e=>setDisplay({...display,vectorScale:+e.target.value})}/></label>
    </div>}
    <div className="viewport-footer" style={{right: Math.max(48,Math.min(1,Math.pow(2,Math.ceil(Math.log2(62/camera.scale))))*camera.scale+34)}}>
      <div className="coordinates"><MoveUpRight size={13}/> X {position.x.toFixed(2)} &nbsp; Y {position.y.toFixed(2)} m</div>
      <div className="zoom">
        <button className="icon" aria-label="缩小" onClick={()=>doZoom(0.8)}><Minus size={16}/></button>
        <span>{Math.round(camera.scale/80*100)}%</span>
        <button className="icon" aria-label="放大" onClick={()=>doZoom(1.25)}><Plus size={16}/></button>
        <button className="icon" aria-label="重置视图" onClick={props.resetCamera}><LocateFixed size={17}/></button>
      </div>
    </div>
    {!isReplay&&tool!=='select'&&<div className="tool-hint">{anchor?'请选择第二个连接点':interaction[tool]}
      {draft.length>=2&&<>
        <div className="draw-suggestion" role="status">{suggestion?'识别为：'+drawingLabels[suggestion]:'顶点未组成简单凸多边形，可重画或选择线段。'}</div>
        <div className="draw-actions">
          {suggestion&&<button className="button primary" onClick={()=>confirmDrawing(suggestion)}>确认创建</button>}
          {(['ground','ramp','segment','polygon'] as const).filter(kind=>kind!=='polygon'||suggestion==='polygon').map(kind=>
            <button key={kind} onClick={()=>confirmDrawing(kind)}>{drawingLabels[kind]}</button>)}
          <button className="icon" aria-label="取消绘制" onClick={()=>{setDraft([]);setClosed(false)}}><X size={14}/></button>
        </div>
      </>}
    </div>}
    {!isReplay&&tool==='select'&&scene.bodies.length>0&&<span className="select-hint">拖物体移动 <i/> 拖空白平移 <i/> 右键或长按操作</span>}
    {scene.bodies.length===0&&tool==='select'&&<div className="canvas-empty"><Orbit size={25}/><strong>当前场景为空</strong><span>在工具栏中选择一种物体，开始搭建场景。</span></div>}
  </section>
}

function draggedPositions(drag:Drag,point:Point) {
  return new Map([...drag.positions].map(([id,p])=>[id,{x:p.x+point.x-drag.from.x,y:p.y+point.y-drag.from.y}]))
}

export function SceneDiagram({scene,scale=1}:{scene:Experiment;scale?:number}) {
  const canvas=useRef<HTMLCanvasElement>(null)
  useEffect(()=>{
    const el=canvas.current!,ctx=el.getContext('2d')
    if(!ctx)return
    const draw=()=>{
      const view={width:el.clientWidth,height:el.clientHeight}
      const dpr=Math.min(2,window.devicePixelRatio||1)
      el.width=view.width*dpr;el.height=view.height*dpr
      ctx.setTransform(dpr,0,0,dpr,0,0)
      const camera={...scene.camera,x:scene.camera.x,
        y:scene.kind==='projectile'?1.75:scene.camera.y,
        scale:Math.min(view.width/11,view.height/(scene.kind==='fall'?11.5:4.8))*scale}
      if(camera.scale>0) drawScene(ctx,view,camera,scene,defaultDisplay,{diagram:true})
    }
    const observer=new ResizeObserver(draw)
    observer.observe(el);draw()
    return ()=>observer.disconnect()
  },[scene,scale])
  return <canvas ref={canvas} className="scene-diagram" aria-hidden="true"/>
}
