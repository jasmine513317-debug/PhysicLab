import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { flushSync } from 'react-dom'
import { Check, ChevronsUpDown, Crosshair, Eraser, Grid2X2, LocateFixed, Magnet, Minus, MousePointer2, MoveUpRight, Orbit, PenLine, Plus, Spline, Trash2, Waves, Zap } from 'lucide-react'
import { displayPoint, polarPosition, rotate, screenPoint, worldPoint, zoomAt } from './coordinates'
import { coordinateGridStep } from './coordinateOverlay'
import { type BodyConfig, type Camera, type Coordinates, type Experiment, type Point, type Spring } from './model'
import { defaultDisplay, drawScene, type Display, type EraseView, type Overlay, type ReplayView } from './render'
import type { Sample } from './analysis'
import type { Physics } from './physics'
import { containsPoint } from './freeform'
import { createInk, INK_COLORS } from './ink'
import { InkHold, INK_HOLD_MS, INK_HOLD_TOLERANCE_PX } from './inkHold'
import { eraseBodies, type EraserMode, type EraseResult } from './eraser'
import { INK_ROLES, INK_WIDTHS, MAX_CUSTOM_INKS, type EraserSize, type InkMode, type InkPrefs } from './inkPrefs'
import { findSurfaceSnap, type SurfaceSnap } from './surfaceSnap'
import { resizeBody, resizeCursor, resizeHandleAt } from './resizeBody'
import { pointerBearing, rotationGuide, turnBetween } from './rotationHandle'

const displayLabels = {velocity:'速度矢量',acceleration:'加速度矢量',forces:'力矢量',trails:'运动轨迹',reference:'理论轨迹'} as const
const widthLabels = ['细','中','粗'] as const
const inkModeLabels = [['hold','停留'],['immediate','立即'],['free','关闭']] as const
const inkRoleLabels = {marker:'视觉标记',body:'刚体',boundary:'碰撞边界',track:'轨道',field:'场源'} as const
const inkRoleHints = {
  marker:'只显示，不参与碰撞',body:'参与碰撞并受重力',boundary:'静态碰撞轮廓',track:'静态碰撞轨道',field:'静电场源，不参与碰撞',
} as const

export type Tool = 'select'|'draw'|'eraser'|'spring'
const tools = [
  ['select','选择',MousePointer2],['draw','绘制',PenLine],['eraser','橡皮',Eraser],['spring','弹簧',Waves],
] as const
type ToolsProps = {
  locked?:boolean; tool:Tool; setTool:(t:Tool)=>void; display:Display; toggle:(key:'forces'|'trails')=>void
  ink:InkPrefs; setInk:(patch:Partial<InkPrefs>)=>void
}
export function Tools({tool,setTool,display,toggle,locked=false,ink,setInk}:ToolsProps) {
  const [paletteOpen,setPaletteOpen]=useState(false)
  const [eraserOpen,setEraserOpen]=useState(false)
  useEffect(()=>{
    if(tool!=='draw')setPaletteOpen(false)
    if(tool!=='eraser')setEraserOpen(false)
  },[tool])
  function choose(key:Tool) {
    if(key==='draw'&&tool==='draw') {setPaletteOpen(open=>!open);return}
    if(key==='eraser'&&tool==='eraser') {setEraserOpen(open=>!open);return}
    setTool(key)
  }
  function addCustomInk(color:string) {
    const value=color.toLowerCase()
    setInk({color:value,customInks:[...new Set([...ink.customInks.filter(item=>item!==value),value])].slice(-MAX_CUSTOM_INKS)})
  }
  const custom=ink.customInks.filter(color=>!INK_COLORS.some(base=>base.value.toLowerCase()===color.toLowerCase()))
  const currentCustom=custom.find(color=>color.toLowerCase()===ink.color.toLowerCase())
  return <aside className="tools" aria-label="场景工具">
    <div className="tool-strip">
      {tools.map(([key,label,Icon])=><button key={key} className={tool===key?'tool active':'tool'} aria-pressed={tool===key} aria-expanded={key==='draw'&&tool==='draw'?paletteOpen:key==='eraser'&&tool==='eraser'?eraserOpen:undefined}
        title={key==='select'?'选择 · 拖物体移动，拖空白平移，右键查看操作':key==='draw'?'绘制 · 左键或触控笔画线，右侧可调颜色、粗细和规整':key==='eraser'?'橡皮 · 右侧可调方式和大小':'弹簧 · 连接两个物体'} disabled={locked} onClick={()=>choose(key)}><Icon size={17}/><span>{label}</span></button>)}
    </div>
    <div className="tool-rule"/>
    <div className="tool-strip tool-display">
      <button className={display.forces?'tool toggled':'tool'} aria-pressed={display.forces} disabled={locked} onClick={()=>toggle('forces')}><Zap size={17}/><span>力矢量</span></button>
      <button className={display.trails?'tool toggled':'tool'} aria-pressed={display.trails} onClick={()=>toggle('trails')}><Spline size={17}/><span>轨迹</span></button>
    </div>
    <div className="tool-context">
      {tool==='draw'&&<>
        <div className="context-group" role="group" aria-label="快捷颜色">
          <span className="context-label">颜色</span>
          {INK_COLORS.map(color=><button key={color.value} type="button" className={'context-swatch'+(ink.color.toLowerCase()===color.value?' chosen':'')}
            style={{background:color.value}} aria-label={'快捷颜色 '+color.label} aria-pressed={ink.color.toLowerCase()===color.value}
            title={color.label} disabled={locked} onClick={()=>setInk({color:color.value})}/>)}
          {currentCustom&&<button type="button" className="context-swatch chosen" style={{background:currentCustom}}
            aria-label="当前自定义颜色" aria-pressed="true" title="当前自定义颜色" disabled={locked} onClick={()=>setInk({color:currentCustom})}/>}
          <button type="button" className="context-more" aria-expanded={paletteOpen} disabled={locked} onClick={()=>setPaletteOpen(open=>!open)}>更多</button>
        </div>
        <span className="context-sep"/>
        <div className="context-group" role="group" aria-label="画笔粗细">
          <span className="context-label">粗细</span>
          {INK_WIDTHS.map((width,index)=><button key={width} type="button" className={'context-chip'+(ink.width===width?' chosen':'')}
            aria-label={'画笔粗细 '+widthLabels[index]} aria-pressed={ink.width===width} title={widthLabels[index]+' · '+width+' px'}
            disabled={locked} onClick={()=>setInk({width})}><i className={'width-bar w'+(index+1)}/>{widthLabels[index]}</button>)}
        </div>
        <span className="context-sep"/>
        <div className="context-group" role="group" aria-label="绘制用途">
          <span className="context-label">用途</span>
          {INK_ROLES.map(role=><button key={role} type="button" className={'context-chip'+(ink.role===role?' chosen':'')}
            aria-label={'绘制用途 '+inkRoleLabels[role]} aria-pressed={ink.role===role} title={inkRoleHints[role]}
            disabled={locked} onClick={()=>setInk({role})}>{inkRoleLabels[role]}</button>)}
        </div>
        <span className="context-sep"/>
        <div className="context-group" role="group" aria-label="自动规整">
          <span className="context-label">规整</span>
          {inkModeLabels.map(([value,label])=><button key={value} type="button" className={'context-chip'+(ink.mode===value?' chosen':'')}
            aria-label={'自动规整 '+label} aria-pressed={ink.mode===value} title={value==='hold'?'笔画末端停留 '+(INK_HOLD_MS/1000)+' 秒后规整':value==='immediate'?'松开立即规整':''}
            disabled={locked} onClick={()=>setInk({mode:value as InkMode})}>{label}</button>)}
        </div>
      </>}
      {tool==='eraser'&&<>
        <div className="context-group" role="group" aria-label="橡皮方式">
          <span className="context-label">方式</span>
          <button type="button" className={'context-chip'+(ink.eraserMode==='stroke'?' chosen':'')} aria-pressed={ink.eraserMode==='stroke'}
            disabled={locked} onClick={()=>setInk({eraserMode:'stroke'})}>按笔画</button>
          <button type="button" className={'context-chip'+(ink.eraserMode==='drag'?' chosen':'')} aria-pressed={ink.eraserMode==='drag'}
            disabled={locked} onClick={()=>setInk({eraserMode:'drag'})}>按拖动</button>
        </div>
        <span className="context-sep"/>
        <div className="context-group" role="group" aria-label="橡皮大小">
          <span className="context-label">大小</span>
          {(['small','medium','large'] as const).map((size,index)=><button key={size} type="button" className={'context-chip'+(ink.eraserSize===size?' chosen':'')}
            aria-label={'橡皮大小 '+['小','中','大'][index]} aria-pressed={ink.eraserSize===size} disabled={locked} onClick={()=>setInk({eraserSize:size})}>{['小','中','大'][index]}</button>)}
        </div>
        <span className="context-sep"/>
        <button type="button" className={'context-toggle'+(ink.eraserReturn?' chosen':'')} aria-pressed={ink.eraserReturn}
          disabled={locked} onClick={()=>setInk({eraserReturn:!ink.eraserReturn})}><Check size={12}/>擦完回绘制</button>
      </>}
      {tool==='select'&&<span className="context-hint">{locked?'回放中不可编辑':'双击属性 · 右键变换/删除'}</span>}
      {tool==='spring'&&<span className="context-hint">在两个物体上各点一次连接点</span>}
    </div>
    {paletteOpen&&tool==='draw'&&<div className="ink-palette" role="group" aria-label="画笔颜色">
      <span className="palette-title">画笔颜色 · 自定义色会自动收藏</span>
      <div className="ink-swatches">
        {INK_COLORS.map(color=><button key={color.value} type="button" className={'ink-swatch'+(ink.color.toLowerCase()===color.value?' chosen':'')}
          style={{background:color.value}} aria-label={'画笔颜色 '+color.label} aria-pressed={ink.color.toLowerCase()===color.value} title={color.label}
          onClick={()=>setInk({color:color.value})}/>)}
        {custom.map((color,index)=><button key={color} type="button" className={'ink-swatch'+(ink.color.toLowerCase()===color.toLowerCase()?' chosen':'')}
          style={{background:color}} aria-label={'自定义画笔颜色 '+(index+1)} aria-pressed={ink.color.toLowerCase()===color.toLowerCase()}
          title={'自定义颜色 '+(index+1)} onClick={()=>setInk({color})}/>)}
        <label className="ink-swatch custom" title="自定义颜色">
          <Plus size={11}/>
          <input type="color" aria-label="自定义画笔颜色" value={/^#[0-9a-fA-F]{6}$/.test(ink.color)?ink.color:'#ff5a5a'}
            onChange={e=>addCustomInk(e.target.value)}/>
        </label>
      </div>
    </div>}
    {eraserOpen&&tool==='eraser'&&<div className="eraser-menu">
      <span className="palette-title">橡皮设置</span>
      <div className="eraser-mode-row" role="group" aria-label="橡皮模式">
        <button type="button" className={ink.eraserMode==='stroke'?'chosen':''} aria-pressed={ink.eraserMode==='stroke'} onClick={()=>setInk({eraserMode:'stroke'})}>按笔画擦除</button>
        <button type="button" className={ink.eraserMode==='drag'?'chosen':''} aria-pressed={ink.eraserMode==='drag'} onClick={()=>setInk({eraserMode:'drag'})}>按拖动擦除</button>
      </div>
      <span className="context-label">橡皮大小</span>
      <div className="context-segmented" role="group" aria-label="橡皮大小设置">
        {(['small','medium','large'] as const).map((size,index)=><button key={size} type="button" className={'context-chip'+(ink.eraserSize===size?' chosen':'')}
          aria-pressed={ink.eraserSize===size} onClick={()=>setInk({eraserSize:size})}>{['小','中','大'][index]}</button>)}
      </div>
      <button type="button" className={'eraser-return'+(ink.eraserReturn?' chosen':'')} aria-pressed={ink.eraserReturn}
        onClick={()=>setInk({eraserReturn:!ink.eraserReturn})}><Check size={12}/>擦完回到绘制</button>
    </div>}
  </aside>
}

type ResizeHandle = NonNullable<ReturnType<typeof resizeHandleAt>>
type Drag = {pointer:number;from:Point;pixel:Point;now:Point;camera:Camera;type:Tool|'pan'|'resize'|'rotate'|'erase'|'origin';positions:Map<string,Point>;moved?:boolean;body?:BodyConfig;snap?:SurfaceSnap;handle?:ResizeHandle;rotation?:{angle:number;bearing:number};ink?:Point[];erase?:EraseResult;holdReady?:boolean}
type Target = {id:string;name:string;at:Point;body?:BodyConfig;joint?:Spring}
type TargetMenu = {target:Target;pixel:Point}
const interaction: Record<Tool,string> = {
  select:'拖物体移动 · 拖空白平移 · 右键操作',
  draw:'按住鼠标左键绘制 · 触屏/触控笔直接画',
  eraser:'按住鼠标左键擦除 · 右侧可调方式和大小',
  spring:'在不同的物体上各选一个连接点',
}
const eraserRadii:Record<EraserSize,Record<EraserMode,number>>={
  small:{stroke:0.09,drag:0.16},
  medium:{stroke:0.13,drag:0.22},
  large:{stroke:0.19,drag:0.30},
}
const eraserRadius=(mode:EraserMode,size:EraserSize)=>eraserRadii[size][mode]
const drawHint=(mode:InkMode)=>mode==='hold'?'按住不动 0.9 秒可自动规整':mode==='immediate'?'松开后立即规整':'自由手绘 · 松开不自动规整'

function local(point:Point,position:Point,angle:number) {
  return rotate({x:point.x-position.x,y:point.y-position.y},-angle)
}

interface ViewportProps {
  scene:Experiment
  camera:Camera
  setCamera:(value:Camera)=>void
  physics:Physics
  resetCamera:()=>void
  tool:Tool
  setTool:(tool:Tool)=>void
  selected:string
  running:boolean
  pause:()=>void
  display:Display
  setDisplay:(display:Display)=>void
  trailSince:number
  baseline?:Sample[]
  replay?:ReplayView
  select:(id:string)=>void
  change:(changes:Partial<Experiment>,freePlacement?:boolean)=>boolean
  remove:(id:string)=>void
  report:(message:string)=>void
  ink:InkPrefs
  openProperties?:(id:string)=>void
}
export function Viewport(props:ViewportProps) {
  const {scene,camera,setCamera,physics,tool,selected,display,setDisplay,change,select,remove,report}=props
  const canvas=useRef<HTMLCanvasElement>(null)
  const latest=useRef(props)
  latest.current=props
  const drag=useRef<Drag|null>(null)
  const space=useRef(false)
  const hold=useRef<ReturnType<typeof setTimeout>|null>(null)
  const holdReady=useRef(false)
  const inkHold=useRef(new InkHold(INK_HOLD_TOLERANCE_PX,()=>{
    const d=drag.current
    if(!d||d.type!=='draw'||latest.current.ink.mode!=='hold')return
    holdReady.current=true
    d.holdReady=true
    setHoldPreview(true)
  }))
  const inkPath=useRef<Point[]>([])
  const eraserPath=useRef<Point[]>([])
  const menuRef=useRef<HTMLDivElement>(null)
  const [targetMenu,setTargetMenu]=useState<TargetMenu|null>(null)
  const [snapLabel,setSnapLabel]=useState<string>()
  const [editingId,setEditingId]=useState('')
  const editing=tool==='select' && selected===editingId && !props.running && !props.replay ? editingId : ''
  const [cursor,setCursor]=useState('')
  const lastTap=useRef<{id:string;pixel:Point;time:number;single?:()=>void;timer?:ReturnType<typeof setTimeout>}|null>(null)
  const [position,setPosition]=useState<Point>({x:0,y:0})
  const [anchor,setAnchor]=useState<{id:string; local:Point; world:Point}|null>(null)
  const [draft,setDraft]=useState<Point[]>([])
  const [holdPreview,setHoldPreview]=useState(false)
  const [erasePreview,setErasePreview]=useState<EraseResult>()
  const isReplay=Boolean(props.replay)
  const [displayMenu,setDisplayMenu]=useState(false)
  const [originEditing,setOriginEditing]=useState(false)
  const [originPreview,setOriginPreview]=useState<Coordinates>()
  const stageState=useRef({anchor,draft,position,targetMenu,editing,erasePreview,holdPreview,originPreview})
  stageState.current={anchor,draft,position,targetMenu,editing,erasePreview,holdPreview,originPreview}
  useEffect(()=>{
    if(!editing)setEditingId('')
    setCursor('')
  },[editing])
  useEffect(()=>{
    cancelDrag()
    setAnchor(null);setDraft([]);setTargetMenu(null);setErasePreview(undefined);setHoldPreview(false);setOriginEditing(false);setOriginPreview(undefined)
    return clearTap
  },[tool,physics,isReplay])
  useEffect(()=>{
    if(props.running) {clearTap();cancelDrag();setEditingId('')}
  },[props.running])
  useEffect(()=>{
    function flushPlacement(e:PointerEvent) {
      const tap=lastTap.current
      if(!tap?.single)return
      const rect=canvas.current!.getBoundingClientRect()
      if(e.target===canvas.current && e.button===0 && Math.hypot(e.clientX-rect.left-tap.pixel.x,e.clientY-rect.top-tap.pixel.y)<12)return
      clearTap()
      flushSync(tap.single)
    }
    window.addEventListener('pointerdown',flushPlacement,true)
    return ()=>window.removeEventListener('pointerdown',flushPlacement,true)
  },[])
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
      const {draft,anchor,position,erasePreview,holdPreview}=stageState.current
      let overlay:Overlay|undefined=draft.length?{points:draft,color:holdPreview?'#ffd796':current.ink.color,strokeWidth:current.ink.width}:undefined
      if(anchor) overlay={points:[anchor.world,position],color:'#e8b779',dash:[5,4]}
      const move=d?.type==='select'&&d.moved?draggedPositions(d,d.now):undefined
      const edit=d?.body&&d.moved?transformBody(d,d.now):undefined
      const eraserView:EraseView|undefined=current.tool==='eraser'&&!current.replay?{
        segments:erasePreview?.segments??[],cursor:position,radius:eraserRadius(current.ink.eraserMode,current.ink.eraserSize),
      }:undefined
      try {
        ctx!.setTransform(dpr,0,0,dpr,0,0)
        drawScene(ctx!,view,camera,originPreview?{...scene,coordinates:originPreview}:scene,display,{physics:replay?undefined:physics,selected,overlay,trailSince,baseline,replay,move,snap:d?.snap,editing:stage.editing,edit,rotating:d?.type==='rotate'&&d.moved,highlight,dash:animate?-(now*.034)%14:0,hidden:erasePreview?.hidden,erase:eraserView})
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
      if(e.key==='Escape') {cancelDrag();clearTap();setEditingId('');setDraft([]);setAnchor(null);setTargetMenu(null);setOriginEditing(false);setOriginPreview(undefined)}
      if(e.key==='Alt'&&drag.current?.moved&&drag.current.body) {
        e.preventDefault()
        updateSnap(drag.current.now,true)
      }
    }
    const up=(e:KeyboardEvent)=>{
      if(e.code==='Space')space.current=false
      if(e.key==='Alt'&&drag.current?.moved&&drag.current.body)updateSnap(drag.current.now,e.altKey)
    }
    const blur=()=>{space.current=false;cancelDrag()}
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
    const active=drag.current
    drag.current=null
    setSnapLabel(undefined)
    inkHold.current.cancel()
    cancelHold()
    holdReady.current=false
    if(active?.type==='draw') {
      inkPath.current=[]
      setDraft([])
      setHoldPreview(false)
    }
    if(active?.type==='erase') {
      eraserPath.current=[]
      setErasePreview(undefined)
    }
    if(active?.type==='origin')setOriginPreview(undefined)
  }
  function clearTap() {
    if(lastTap.current?.timer!==undefined)clearTimeout(lastTap.current.timer)
    lastTap.current=null
  }
  function editBody(id:string) {
    if(latest.current.running)latest.current.pause()
    latest.current.setTool('select')
    select(id)
    setTargetMenu(null)
    if(latest.current.openProperties)latest.current.openProperties(id)
    else setEditingId(id)
  }
  function beginTransform(id:string) {
    if(latest.current.running)latest.current.pause()
    latest.current.setTool('select')
    select(id)
    setEditingId(id)
    setTargetMenu(null)
    canvas.current?.focus()
  }
  function tapBody(id:string,pixel:Point,single?:()=>void) {
    const previous=lastTap.current
    const now=performance.now()
    if(previous?.id===id && now-previous.time<400 && Math.hypot(pixel.x-previous.pixel.x,pixel.y-previous.pixel.y)<12) {
      clearTap()
      editBody(id)
      return
    }
    clearTap()
    // Defer a placement on an existing body until we know whether this is a double tap.
    const timer=single?setTimeout(()=>{lastTap.current=null;single()},400):undefined
    lastTap.current={id,pixel,time:now,timer,single}
  }
  function editingBody() {
    const b=editing && scene.bodies.find(body=>body.id===editing)
    if(!b)return
    const live=physics.bodies.get(b.id)
    return live?{...b,position:{...live.getPosition()},angle:live.getAngle()}:b
  }
  function hitsRotation(body:BodyConfig,point:Point,tolerance:number) {
    const {handle}=rotationGuide(body,camera.scale)
    return Math.hypot(point.x-handle.x,point.y-handle.y)*camera.scale<=tolerance
  }
  function snapAt(d:Drag, point:Point, bypass:boolean) {
    const {scene,camera}=latest.current
    if(bypass||!d.body)return
    const edit=transformBody(d,point)
    if(edit) {
      return findSurfaceSnap(edit.body,edit.body.position,scene.bodies,camera.scale,{overlapOnly:true,keepAngle:true,previousPosition:d.body.position})
    }
    if(d.type!=='select')return
    const start=d.positions.get(d.body.id)
    if(start)return findSurfaceSnap(d.body,translatedPosition(d,point,start),scene.bodies,camera.scale,
      {previousPosition:start,overlapOnly:scene.kind!=='custom'})
  }
  function updateSnap(point:Point,bypass:boolean) {
    const d=drag.current
    if(!d?.body||!d.moved)return
    const snap=snapAt(d,point,bypass)
    drag.current={...d,snap}
    setSnapLabel(snap?snap.surfaceName+(snap.side==='above'?'上表面':'下表面'):undefined)
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
      if(containsPoint({...body,position:at,angle:live?.getAngle()??body.angle},world,4/camera.scale)) {
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
    if(isReplay)return
    if(tool==='draw') {e.preventDefault();return}
    if(tool!=='select')return
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
      restLength:Math.max(0.1,Math.hypot(world.x-anchor.world.x,world.y-anchor.world.y)),stiffness:40,damping:0.15,role:'constraint'}
    if(change({joints:[...scene.joints,j]})) {setAnchor(null);select(j.id)}
  }
  function onDown(e:ReactPointerEvent<HTMLCanvasElement>) {
    if(drag.current)return
    const drawPointer=tool==='draw'&&!isReplay&&e.button===0
    const erasePointer=tool==='eraser'&&!isReplay&&e.button===0
    if(!drawPointer&&!erasePointer&&e.button!==0&&e.button!==1)return
    e.preventDefault()
    e.currentTarget.focus()
    const {pixel,world}=points(e)
    const forcedPan=e.button===1||space.current||isReplay
    const type=originEditing&&!isReplay&&e.button===0?'origin':forcedPan?'pan':drawPointer?'draw':erasePointer?'erase':tool
    const edited=type==='select'?editingBody():undefined
    if(edited&&hitsRotation(edited,world,e.pointerType==='touch'?16:11)) {
      clearTap()
      drag.current={pointer:e.pointerId,from:world,now:world,pixel,camera,type:'rotate',positions:new Map(),body:edited,
        rotation:{angle:edited.angle,bearing:pointerBearing(edited.position,world)}}
      setCursor('grabbing')
      e.currentTarget.setPointerCapture(e.pointerId)
      return
    }
    const handle=edited&&resizeHandleAt(edited,world,(e.pointerType==='touch'?13:7)/camera.scale)
    if(edited&&handle) {
      clearTap()
      drag.current={pointer:e.pointerId,from:world,now:world,pixel,camera,type:'resize',positions:new Map(),body:edited,handle}
      setCursor(resizeCursor(handle,edited.angle))
      e.currentTarget.setPointerCapture(e.pointerId)
      return
    }
    if(props.running&&type!=='select'&&type!=='pan'&&type!=='origin') {report('请先暂停模拟，再编辑场景。');return}
    if(type==='origin') {
      drag.current={pointer:e.pointerId,from:world,now:world,pixel,camera,type:'origin',positions:new Map()}
      setCursor('crosshair')
      e.currentTarget.setPointerCapture(e.pointerId)
      return
    }
    if(type==='draw') {
      inkPath.current=[world]
      holdReady.current=false
      setHoldPreview(false)
      setDraft([world])
      drag.current={pointer:e.pointerId,from:world,now:world,pixel,camera,type:'draw',positions:new Map(),ink:inkPath.current}
      e.currentTarget.setPointerCapture(e.pointerId)
      if(props.ink.mode==='hold')inkHold.current.start(pixel)
      return
    }
    if(type==='erase') {
      eraserPath.current=[world]
      drag.current={pointer:e.pointerId,from:world,now:world,pixel,camera,type:'erase',positions:new Map()}
      const preview=eraseBodies(scene.bodies,eraserPath.current,eraserRadius(props.ink.eraserMode,props.ink.eraserSize),props.ink.eraserMode)
      setErasePreview(preview.changed?preview:undefined)
      e.currentTarget.setPointerCapture(e.pointerId)
      return
    }
    if(type==='spring') {
      const hit=hitTarget(world,true)?.body
      if(hit)attachSpring(hit,world)
      return
    }
    const insideEdited=edited&&containsPoint(edited,world)
    const target=type==='select'?(insideEdited?targetById(edited!.id):hitTarget(world)):undefined
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
      type:type==='select'&&!target?'pan':type,positions,
      body:target?.body?{...target.body,angle:physics.bodies.get(target.id)?.getAngle()??target.body.angle}:undefined}
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
    if(!d && editing) {
      const body=editingBody()
      const handle=body&&resizeHandleAt(body,world,7/camera.scale)
      setCursor(body&&hitsRotation(body,world,11)?'grab':handle&&body?resizeCursor(handle,body.angle):'')
    }
    if(!d||d.pointer!==e.pointerId)return
    d.now=world
    if(d.type==='origin') {
      if(Math.hypot(pixel.x-d.pixel.x,pixel.y-d.pixel.y)>5)d.moved=true
      if(d.moved)setOriginPreview({...latest.current.scene.coordinates,origin:{
        x:latest.current.scene.coordinates.origin.x+(world.x-d.from.x),
        y:latest.current.scene.coordinates.origin.y+(world.y-d.from.y),
      }})
      return
    }
    if(d.type==='draw') {
      const moved=inkHold.current.move(pixel)
      if(moved) {
        holdReady.current=false
        d.holdReady=false
        setHoldPreview(false)
      }
      const last=inkPath.current.at(-1)
      if(!last||Math.hypot(world.x-last.x,world.y-last.y)>=2/d.camera.scale) {
        inkPath.current.push(world)
        setDraft([...inkPath.current])
      }
      return
    }
    if(d.type==='erase') {
      const last=eraserPath.current.at(-1)
      if(!last||Math.hypot(world.x-last.x,world.y-last.y)>=1.5/d.camera.scale) {
        eraserPath.current.push(world)
        const preview=eraseBodies(scene.bodies,eraserPath.current,eraserRadius(props.ink.eraserMode,props.ink.eraserSize),props.ink.eraserMode)
        setErasePreview(preview.changed?preview:undefined)
      }
      return
    }
    if(Math.hypot(pixel.x-d.pixel.x,pixel.y-d.pixel.y)>5&&!d.moved) {
      d.moved=true
      clearTap()
      if(d.type==='select'&&props.running)props.pause()
    }
    if(d.rotation&&d.body&&d.moved)d.rotation=rotationAt(d.body,d.rotation,world,d.camera.scale)
    if(d.type==='pan'&&d.moved) setCamera({...d.camera,x:d.camera.x-(pixel.x-d.pixel.x)/d.camera.scale,y:d.camera.y+(pixel.y-d.pixel.y)/d.camera.scale})
    if(d.type==='select'||d.type==='resize'||d.type==='rotate')updateSnap(world,e.altKey)
  }
  function add(config:BodyConfig,freePlacement=false) {
    if(!change({bodies:[...scene.bodies,config]},freePlacement))return false
    select(config.id)
    return true
  }
  function onUp(e:ReactPointerEvent<HTMLCanvasElement>) {
    const d=drag.current
    if(!d||d.pointer!==e.pointerId)return
    const {pixel,world:b}=points(e)
    if(d.type==='origin') {
      const base=latest.current.scene.coordinates
      const coordinates={...base,origin:{x:base.origin.x+b.x-d.from.x,y:base.origin.y+b.y-d.from.y}}
      cancelDrag()
      if(Math.hypot(pixel.x-d.pixel.x,pixel.y-d.pixel.y)>5) {
        change({coordinates:{...coordinates,origin:{
          x:Math.round(coordinates.origin.x*1e9)/1e9,
          y:Math.round(coordinates.origin.y*1e9)/1e9,
        }}})
      }
      setOriginEditing(false)
      return
    }
    if(d.type==='draw') {
      const path=[...inkPath.current]
      if(!path.at(-1)||Math.hypot(b.x-path.at(-1)!.x,b.y-path.at(-1)!.y)>1e-6)path.push(b)
      const mode=props.ink.mode
      const regularize=mode==='immediate'||(mode==='hold'&&Boolean(d.holdReady||holdReady.current))
      cancelDrag()
      const result=createInk(path,props.ink.color,regularize,props.ink.width,props.ink.role)
      if('error' in result)report(result.error)
      else add(result.body,true)
      return
    }
    if(d.type==='erase') {
      const path=[...eraserPath.current]
      const mode=props.ink.eraserMode
      const result=eraseBodies(scene.bodies,path,eraserRadius(mode,props.ink.eraserSize),mode)
      cancelDrag()
      if(result.changed) {
        const joints=scene.joints.filter(j=>!result.removed.has(j.a)&&!result.removed.has(j.b))
        if(change({bodies:result.bodies,joints},true)) {
          if(result.removed.has(selected))select('')
          if(props.ink.eraserReturn)props.setTool('draw')
        }
      }
      return
    }
    cancelDrag()
    if(d.type==='pan') {
      if(Math.hypot(pixel.x-d.pixel.x,pixel.y-d.pixel.y)>5) {
        setCamera({...d.camera,x:d.camera.x-(pixel.x-d.pixel.x)/d.camera.scale,y:d.camera.y+(pixel.y-d.pixel.y)/d.camera.scale})
      }
      return
    }
    const moved=Math.hypot(pixel.x-d.pixel.x,pixel.y-d.pixel.y)>5
    if(d.type==='resize'||d.type==='rotate') {
      if(!moved)return
      const edit=transformBody(d,b)
      if(!edit)return
      const snap=snapAt(d,b,e.altKey)
      const body={...edit.body,position:snap?.position??edit.body.position}
      const bodies=scene.bodies.map(original=>original.id===body.id?body:original)
      const scaleAnchor=edit.scaleAnchor
      if(scaleAnchor) {
        const joints=scene.joints.map(j=>{
          if(j.a===body.id)return {...j,anchorA:scaleAnchor(j.anchorA)}
          if(j.b===body.id)return {...j,anchorB:scaleAnchor(j.anchorB)}
          return j
        })
        change({bodies,joints},e.altKey)
      } else change({bodies},e.altKey)
      setCursor('')
    } else if(d.type==='select') {
      if(moved) {
        const positions=draggedPositions(d,b)
        const snap=snapAt(d,b,e.altKey)
        change({bodies:scene.bodies.map(body=>{
          if(snap?.bodyId===body.id)return {...body,position:snap.position,angle:snap.angle}
          const position=positions.get(body.id)
          return position?{...body,position,angle:d.body?.id===body.id?d.body.angle:body.angle}:body
        })},e.altKey)
      } else if(d.body)tapBody(d.body.id,pixel)
      else clearTap()
    }
  }
  function doZoom(factor:number) {
    const el=canvas.current!
    const view={width:el.clientWidth,height:el.clientHeight}
    setCamera(zoomAt(camera,view,{x:view.width/2,y:view.height/2},factor))
  }
  const coordinates=originPreview??scene.coordinates
  const displayPosition=displayPoint(position,coordinates.origin)
  const cursorPolar=polarPosition(position,coordinates.origin)
  const coordinateReadout=coordinates.mode==='none'?'无坐标系':coordinates.mode==='polar'
    ?<>θ {cursorPolar.theta===undefined?'—':(cursorPolar.theta*180/Math.PI).toFixed(1)+'°'} &nbsp; r {cursorPolar.r.toFixed(2)} m</>
    :<>X {displayPosition.x.toFixed(2)} &nbsp; Y {displayPosition.y.toFixed(2)} m</>
  return <section className="viewport" aria-label="模拟视图">
    <canvas ref={canvas} tabIndex={0} aria-label="物理场景" data-tool={isReplay?'pan':originEditing?'origin':tool}
      style={tool==='draw'?{cursor:'crosshair'}:tool==='eraser'?{cursor:'none'}:originEditing||editing&&cursor?{cursor:originEditing?'crosshair':cursor}:undefined}
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={cancelDrag}
      onLostPointerCapture={e=>{if(drag.current?.pointer===e.pointerId)cancelDrag()}}
      onContextMenu={onContext} onKeyDown={e=>{
        if(e.key==='Enter'&&tool==='select'&&!isReplay&&targetById(selected)?.body) {
          e.preventDefault()
          editBody(selected)
          return
        }
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
      {targetMenu.target.body&&<button type="button" aria-label="变换物体" onClick={()=>beginTransform(targetMenu.target.id)}><MoveUpRight size={16}/> 变换物体</button>}
    </div>}
    <div className="view-heading"><div className="view-heading-left">
      <span className="view-tag"><Crosshair size={13}/> {isReplay?'历史回放':'模拟视图'}</span>
      <label className="coordinate-picker"><span>坐标系</span><select aria-label="坐标系" disabled={isReplay} value={scene.coordinates.mode} onChange={e=>{
        change({coordinates:{...scene.coordinates,mode:e.target.value as Coordinates['mode']}})
        setOriginEditing(false);setOriginPreview(undefined);setDisplayMenu(false)
      }}>
        <option value="cartesian">直角坐标</option><option value="polar">极坐标</option><option value="none">无坐标系</option>
      </select></label>
      {scene.coordinates.mode!=='none'&&!isReplay&&<button type="button" className={'icon coordinate-origin'+(originEditing?' on':'')} title="移动坐标原点" aria-label="移动坐标原点" aria-pressed={originEditing}
        onClick={()=>{setOriginEditing(value=>!value);setOriginPreview(undefined);setDisplayMenu(false)}}><LocateFixed size={15}/></button>}
    </div>
      <div className="view-actions">
        {scene.coordinates.mode!=='none'&&<button className={display.grid?'icon on':'icon'} title="切换坐标网格" aria-label="切换坐标网格" aria-pressed={display.grid} onClick={()=>setDisplay({...display,grid:!display.grid})}><Grid2X2 size={16}/></button>}
        <button className={displayMenu?'icon on':'icon'} title="显示选项" aria-label="显示选项" aria-expanded={displayMenu} onClick={()=>setDisplayMenu(!displayMenu)}><ChevronsUpDown size={16}/></button>
      </div>
    </div>
    {displayMenu&&<div className="view-menu">
      {(['velocity','acceleration','forces','trails','reference'] as const).map(key=><label key={key}><input type="checkbox" disabled={isReplay&&key==='forces'} checked={display[key]} onChange={e=>setDisplay({...display,[key]:e.target.checked})}/>{displayLabels[key]}</label>)}
      <label>矢量比例 <input aria-label="矢量比例" type="range" min=".1" max="3" step=".1" value={display.vectorScale} onChange={e=>setDisplay({...display,vectorScale:+e.target.value})}/></label>
    </div>}
    <div className="viewport-footer" style={{right: Math.max(48,Math.min(1,coordinateGridStep(camera.scale))*camera.scale+34)}}>
      <div className="coordinates" aria-label="坐标读数">{coordinateReadout}</div>
      <div className="zoom">
        <button className="icon" aria-label="缩小" title="缩小视图" onClick={()=>doZoom(0.8)}><Minus size={16}/></button>
        <span>{Math.round(camera.scale/80*100)}%</span>
        <button className="icon" aria-label="放大" title="放大视图" onClick={()=>doZoom(1.25)}><Plus size={16}/></button>
        <button className="icon" aria-label="重置视图" title="重置视图" onClick={props.resetCamera}><LocateFixed size={17}/></button>
      </div>
    </div>
    {!isReplay&&originEditing&&<div className="tool-hint" role="status">移动坐标原点 · 拖动改变测量基准，不移动物体</div>}
    {!isReplay&&!originEditing&&tool!=='select'&&<div className="tool-hint">{anchor?'请选择第二个连接点':interaction[tool]}
      {tool==='draw'&&<span className="ink-status" role="status">{draft.length>0?(holdPreview?'已停留 0.9 秒 · 松开自动规整':drawHint(props.ink.mode)):drawHint(props.ink.mode)}</span>}
      {tool==='eraser'&&<span className="ink-status" role="status">{props.ink.eraserMode==='stroke'?'整笔删除':'拖动擦除可切断曲线'} · {props.ink.eraserSize==='small'?'小':props.ink.eraserSize==='medium'?'中':'大'}号</span>}
    </div>}
    {!isReplay&&!originEditing&&tool==='select'&&scene.bodies.length>0&&<span className="select-hint">{editing?'拖内部移动 · 拖边缘缩放 · 拖圆形手柄旋转':'拖物体移动 · 双击属性 · 右键变换/删除'}</span>}
    {snapLabel&&<div className="snap-hint" role="status"><Magnet size={14}/> 松手贴合 {snapLabel}</div>}
    {scene.bodies.length===0&&tool==='select'&&<div className="canvas-empty"><Orbit size={25}/><strong>当前场景为空</strong><span>使用底部的绘制工具，在画布上勾勒场景。</span></div>}
  </section>
}

function rotationAt(body:BodyConfig,rotation:{angle:number;bearing:number},point:Point,scale:number) {
  if(Math.hypot(point.x-body.position.x,point.y-body.position.y)*scale<8)return rotation
  const bearing=pointerBearing(body.position,point)
  return {angle:rotation.angle+turnBetween(rotation.bearing,bearing),bearing}
}

function transformBody(drag:Drag,point:Point):{body:BodyConfig;scaleAnchor?:(anchor:Point)=>Point}|undefined {
  const {body,handle,rotation}=drag
  if(!body)return
  if(handle)return resizeBody(body,handle,drag.from,point)
  if(rotation) {
    const angle=rotationAt(body,rotation,point,drag.camera.scale).angle
    return {body:{...body,angle:Math.abs(angle)>10000?angle%(2*Math.PI):angle}}
  }
}

function translatedPosition(drag:Drag,point:Point,start:Point) {
  return {x:start.x+point.x-drag.from.x,y:start.y+point.y-drag.from.y}
}
function draggedPositions(drag:Drag,point:Point) {
  return new Map([...drag.positions].map(([id,p])=>[id,translatedPosition(drag,point,p)]))
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
