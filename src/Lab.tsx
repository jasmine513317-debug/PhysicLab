import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Activity, ArrowLeft, Box, Check, ChevronDown, CircleHelp, Clock3, Download, FolderOpen, Gauge, Globe2, History, Maximize2, Minimize2, MoreHorizontal, Pause, Play, Plus, Redo2, RotateCcw, Save, StepForward, Undo2, X } from 'lucide-react'
import { body, decodeExperiment, type Camera, type Experiment, type Point } from './model'
import { Physics } from './physics'
import { Tools, Viewport, type Primitive, type Tool } from './Viewport'
import type { DrawnShape } from './drawnShapes'
import { connectionAssembly,type ConnectionTool } from './springs'
import { Inspector } from './Inspector'
import { AnalysisPanel, type Baseline } from './AnalysisPanel'
import { defaultDisplay } from './render'
import { loadReplay, saveExperiment, saveReplay } from './repository'
import { ReplayControls } from './ReplayControls'
import type { Replay } from './replay'
import { templates } from './templates'
import { extensionUrl } from './extended-experiments'
import { downloadText } from './download'
import { encodeBackup } from './backup'
import { appUrl } from './routes'
import { separateEditedBodies } from './surfaceSnap'
import { loadInkPrefs, normalizeInkPrefs, saveInkPrefs, type InkPrefs } from './inkPrefs'
import type { PhysicalInput, RunTimeline } from './interventions'
import { runSimulationFrames } from './simulation'
import type { DataView,PlanarBranch } from './spatialWorkspace'

const fit=(camera:Camera)=>({...camera,scale:Math.min(camera.scale,Math.max(25,(window.innerWidth-(window.innerWidth>1000?450:80))/10.6))})
const SpatialWorkbench=lazy(async()=>{
  const feature=await import('./SpatialWorkbench')
  await feature.initializeSpatialRigid()
  return feature
})
type EditSnapshot = {
  scene: Experiment
  selected: string
  resetPhysics: boolean
  resetCamera: boolean
  timeline?:RunTimeline
}
const maxUndoSteps = 50
const errorText=(e:unknown)=>e instanceof Error&&'issues' in e?(e.issues as {message:string}[]).map(x=>x.message).join(' · '):e instanceof Error?e.message:'操作未完成，请重试。'

type Props={initial:Experiment;initiallySaved:boolean;active:boolean;spaceAstronomy?:boolean;updateSavedAddress:(id:string)=>void}

export function Lab({initial,initiallySaved,active,spaceAstronomy=false,updateSavedAddress}:Props) {
  const [scene,setScene]=useState(initial)
  const [spatial,setSpatial]=useState(spaceAstronomy)
  const [spatialBase,setSpatialBase]=useState<{scene:Experiment;physics:Physics}>()
  const [camera,setCamera]=useState(()=>initiallySaved?initial.camera:fit(initial.camera))
  const [engine,setEngine]=useState(()=>new Physics(initial))
  const [selected,select]=useState(initial.bodies.find(b=>b.type==='dynamic')?.id??'')
  const [tool,setTool]=useState<Tool>('select')
  const [drawShape,setDrawShape]=useState<DrawnShape>('circle')
  const [connectionTool,setConnectionTool]=useState<ConnectionTool>('spring')
  const [anglePreview,setAnglePreview]=useState<{id:string;from:number;to:number;start:number}>()
  const [ink,setInkState]=useState<InkPrefs>(loadInkPrefs)
  function setInk(patch:Partial<InkPrefs>) {
    setInkState(previous=>normalizeInkPrefs({...previous,...patch}))
  }
  const [display,setDisplay]=useState(defaultDisplay)
  const [running,setRunning]=useState(false)
  const [panel,setPanel]=useState<'none'|'properties'>('none')
  const [propertyTab,setPropertyTab]=useState<'object'|'world'>('object')
  const [analysisOpen,setAnalysisOpen]=useState(false)
  const [analysisView,setAnalysisView]=useState<DataView>()
  const [immersive,setImmersive]=useState(false)
  const [moreOpen,setMoreOpen]=useState(false)
  const [time,showTime]=useState(0)
  const [baseline,setBaseline]=useState<Baseline>()
  const [recentReplay,setRecentReplay]=useState<Replay>()
  const [savedReplay,setSavedReplay]=useState<Replay>()
  const [replay,setReplay]=useState<Replay>()
  const [replayIndex,setReplayIndex]=useState(0)
  const replayTracks=useMemo(()=>replay?new Map(replay.tracks):undefined,[replay])
  const liveCamera=useRef(camera)
  const [trailSince,setTrailSince]=useState(0)
  const [notice,setNotice]=useState('')
  const [error,setError]=useState('')
  const [saved,setSaved]=useState(initiallySaved)
  const [saving,setSaving]=useState(false)
  const [help,setHelp]=useState(false)
  const [title,setTitle]=useState(initial.title)
  const [menu,setMenu]=useState(false)
  const current=useRef(scene)
  const activeEngine=useRef(engine)
  const busy=useRef(false)
  const editHistory=useRef<{undo:EditSnapshot[];redo:EditSnapshot[]}>({undo:[],redo:[]})
  const lastSavedScene=useRef(initiallySaved?initial:undefined)

  useEffect(()=>{
    if(!initiallySaved)return
    let active=true
    void loadReplay(initial.id,initial.version).then(value=>{if(active)setSavedReplay(value)})
      .catch(e=>{if(active)setError(errorText(e))})
    return ()=>{active=false}
  },[initial.id,initial.version,initiallySaved])

  useEffect(()=>{saveInkPrefs(ink)},[ink])
  useEffect(()=>{
    if(spaceAstronomy||new URLSearchParams(window.location.search).has('spatial')) {
      setSpatialBase({scene:initial,physics:activeEngine.current})
      setSpatial(true)
    }
  },[initial,spaceAstronomy])

  function reset(source=current.current) {
    try {
      const next=new Physics(source)
      const previous=activeEngine.current.captureReplay({...current.current,camera})
      if(previous)setRecentReplay(previous)
      activeEngine.current=next;setEngine(next);setRunning(false);showTime(0);setTrailSince(0)
      return true
    } catch(e) {setError(errorText(e));return false}
  }
  function change(patch:Partial<Experiment>,freePlacement=false) {
    if(replay)return false
    try {
      const previous=current.current
      if(patch.bodies&&!freePlacement)patch={...patch,bodies:separateEditedBodies(previous.bodies,patch.bodies)}
      const unchanged=Object.entries(patch).every(([key,value])=>
        JSON.stringify(previous[key as keyof Experiment])===JSON.stringify(value))
      if(unchanged)return true
      const candidate={...previous,...patch}
      let upgraded=candidate
      if(candidate.version===1&&candidate.bodies.some(b=>b.geometry.kind==='freeform'||b.geometry.kind==='track'))upgraded={...upgraded,version:2}
      if(upgraded.version<3&&(upgraded.physicalMode||upgraded.bodies.some(b=>b.role||b.provenance||b.charge!==undefined||b.geometry.kind==='ellipse'||b.surfaceLine||b.contactSide||b.rail)||upgraded.joints.some(j=>j.role))) {
        upgraded={...upgraded,version:3}
      }
      const next=decodeExperiment(upgraded)
      const a=previous.environment.worldBounds,b=next.environment.worldBounds
      const mechanics=patch.bodies||patch.joints||(patch.environment&&(
        previous.environment.gravity!==next.environment.gravity||
        previous.environment.gravityAngle!==next.environment.gravityAngle||
        previous.environment.linearDrag!==next.environment.linearDrag||
        previous.environment.collisions!==next.environment.collisions||
        previous.environment.boundaries!==next.environment.boundaries||
        a?.minX!==b?.minX||a?.minY!==b?.minY||a?.maxX!==b?.maxX||a?.maxY!==b?.maxY))
      const timeline=mechanics?activeEngine.current.timeline():undefined
      if(mechanics) {
        if(!reset(next))return false
        if(engine.time>0)setNotice('参数已更新，模拟已回到初始状态。')
      }
      const history=editHistory.current
      history.undo.push({scene:previous,selected,resetPhysics:Boolean(mechanics),resetCamera:Boolean(patch.camera),timeline})
      if(history.undo.length>maxUndoSteps)history.undo.shift()
      history.redo.length=0
      current.current=next;setScene(next);setSaved(false);setError('')
      if(patch.camera)setCamera(fit(next.camera))
      if(patch.title!==undefined)setTitle(next.title)
      return true
    } catch(e){setError(errorText(e));return false}
  }
  function restoreEdit(direction:'undo'|'redo') {
    if(replay)return
    const history=editHistory.current
    const source=history[direction]
    const snapshot=source.at(-1)
    if(!snapshot)return
    const timeline=snapshot.resetPhysics?activeEngine.current.timeline():undefined
    if(snapshot.timeline) {
      try {
        const next=Physics.restoreTimeline(snapshot.scene,snapshot.timeline)
        activeEngine.current=next;setEngine(next);setRunning(false);showTime(next.time);setTrailSince(0)
      } catch(e) {setError(errorText(e));return}
    } else if(snapshot.resetPhysics&&!reset(snapshot.scene))return
    const destination=direction==='undo'?history.redo:history.undo
    destination.push({...snapshot,scene:current.current,selected,timeline})
    source.pop()
    current.current=snapshot.scene
    setScene(snapshot.scene)
    setTitle(snapshot.scene.title)
    select(snapshot.selected)
    if(snapshot.resetCamera)setCamera(fit(snapshot.scene.camera))
    setSaved(!snapshot.timeline&&snapshot.scene===lastSavedScene.current)
    setError('')
    setNotice(direction==='undo'?'已撤销编辑。':'已重做编辑。')
  }
  function remove(id:string) {
    if(!id)return
    const existing=current.current
    const groups=new Set(existing.joints.filter(j=>j.group&&(j.group===id||j.id===id||j.a===id||j.b===id)).map(j=>j.group!))
    const removed=new Set([id,...[...groups].flatMap(group=>connectionAssembly(existing,group)?.nodes.map(node=>node.id)??[])])
    const joints=existing.joints.filter(j=>j.id!==id&&!removed.has(j.a)&&!removed.has(j.b)&&!(j.group&&groups.has(j.group)))
    if(change({bodies:existing.bodies.filter(b=>!removed.has(b.id)).map(b=>b.rail&&removed.has(b.rail)?{...b,rail:undefined}:b),joints})) {
      if(removed.has(selected)||groups.has(selected)||existing.joints.some(j=>j.id===selected&&!joints.includes(j)))select('')
    }
  }
  function applyInput(id:string,input:PhysicalInput) {
    try {
      if(input.kind==='velocity'&&current.current.physicalMode!=='free')throw new Error('覆盖速度需要开启自由干预模式。')
      const timeline=activeEngine.current.timeline()
      activeEngine.current.schedule(id,input)
      const history=editHistory.current
      history.undo.push({scene:current.current,selected,resetPhysics:true,resetCamera:false,timeline})
      if(history.undo.length>maxUndoSteps)history.undo.shift()
      history.redo.length=0
      setError('')
      setSaved(false)
      setNotice('干预将在下一个模拟步生效。')
    } catch(e) {setError(errorText(e))}
  }
  function applyVelocity(id:string,value:Point) {
    if(running||engine.time>0)applyInput(id,{kind:'velocity',vector:value})
    else change({bodies:current.current.bodies.map(b=>b.id===id?{...b,velocity:value}:b)},true)
  }
  function applyAngle(id:string,to:number) {
    const from=engine.bodies.get(id)?.getAngle()??0
    if(!change({bodies:current.current.bodies.map(b=>b.id===id?{...b,angle:to}:b)},true))return false
    setAnglePreview({id,from,to,start:performance.now()})
    return true
  }
  function addPrimitive(kind:Primitive) {
    const {x,y}=liveCamera.current
    const created=kind==='circle'?body('圆形刚体',{kind:'circle',radius:.4},x,y)
      :kind==='rectangle'?body('矩形刚体',{kind:'rectangle',width:1,height:.65},x,y)
      :body(kind==='floor'?'地面':'斜面',{kind:'surface',width:5,height:.02},x,y-1,{angle:kind==='ramp'?-.32:0,surfaceLine:true})
    if(change({bodies:[...current.current.bodies,created]}))select(created.id)
  }
  useEffect(()=>{
    if(!active||spatial) {
      if(running){setRunning(false);showTime(engine.time)}
      return
    }
    if(!running)return
    let lastUI=0
    const stop=runSimulationFrames((elapsed,now)=>{
      try {
        if(elapsed)engine.advance(elapsed,current.current.environment.speed)
        if(now-lastUI>80) {showTime(engine.time);lastUI=now}
      }catch(e){setRunning(false);setError(errorText(e));return false}
    },.15)
    return ()=>{stop();engine.discardRemainder()}
  },[active,running,engine,spatial])
  useEffect(()=>{
    if(!notice)return
    const timer=setTimeout(()=>setNotice(''),3800)
    return ()=>clearTimeout(timer)
  },[notice])
  useEffect(()=>{
    if(!active||spatial)return
    function shortcuts(e:KeyboardEvent) {
      if(e.defaultPrevented||e.isComposing)return
      if(e.target instanceof HTMLElement&&e.target.closest('input,textarea,select,[contenteditable]'))return
      if(replay) {
        if(e.key==='Escape')closeReplay()
        return
      }
      if(e.ctrlKey||e.metaKey) {
        const key=e.key.toLowerCase()
        if(!e.altKey&&(key==='z'||(key==='y'&&!e.shiftKey))) {
          e.preventDefault()
          restoreEdit(key==='y'||e.shiftKey?'redo':'undo')
        }
        return
      }
      if(e.altKey||e.target instanceof HTMLElement&&e.target.closest('button'))return
      if(e.key==='Delete')remove(selected)
      // Space stays reserved for drag-to-pan in the viewport.
      if(e.key.toLowerCase()==='p'&&!e.repeat){e.preventDefault();toggleRun();return}
      if(e.key==='.'){e.preventDefault();step();return}
      if(e.key.toLowerCase()==='r'&&e.shiftKey&&!e.repeat){e.preventDefault();reset();return}
      if(e.key.toLowerCase()==='r'&&!e.shiftKey&&!e.repeat) {
        const b=current.current.bodies.find(body=>body.id===selected)
        if(b)change({bodies:current.current.bodies.map(body=>body.id===selected?{...body,angle:body.angle+Math.PI/12}:body)})
      }
      if(e.key==='Escape'){setTool('select');setHelp(false);setMenu(false);setMoreOpen(false)}
    }
    window.addEventListener('keydown',shortcuts)
    return ()=>window.removeEventListener('keydown',shortcuts)
  })

  function openReplay(recording?:Replay) {
    const result=recording??activeEngine.current.captureReplay({...current.current,camera})??recentReplay??savedReplay
    if(!result)return
    liveCamera.current=camera
    setRunning(false)
    setReplayIndex(0)
    setCamera(fit(result.scene.camera))
    setReplay(result)
    setMenu(false)
  }

  function closeReplay() {
    setReplay(undefined)
    setCamera(liveCamera.current)
  }

  async function saveRecording(recording:Replay) {
    const snapshot=current.current
    try {
      const created=await saveReplay({...snapshot,camera:liveCamera.current},recording)
      if(created) {
        lastSavedScene.current=snapshot
        setSaved(current.current===snapshot)
        updateSavedAddress(snapshot.id)
      }
      setSavedReplay(recording)
      setNotice('回放已保存。')
      setError('')
    } catch(e) {setError(errorText(e))}
  }

  async function save() {
    if(busy.current)return
    busy.current=true;setSaving(true)
    const snapshot=current.current
    try {
      await saveExperiment({...snapshot,camera})
      lastSavedScene.current=snapshot
      setSaved(current.current===snapshot)
      updateSavedAddress(snapshot.id)
      setNotice('实验已保存到实验库。');setError('')
    }catch(e){setError(errorText(e))}
    finally {busy.current=false;setSaving(false)}
  }
  function exportScene() {
    downloadText(current.current.title,'json','application/json',JSON.stringify({...current.current,camera:replay?liveCamera.current:camera},null,2))
  }
  async function exportBackup() {
    const scene={...current.current,camera:replay?liveCamera.current:camera}
    try {
      const fallback=replay??savedReplay??activeEngine.current.captureReplay(scene)??recentReplay
      const recording=replay??savedReplay??(initiallySaved?await loadReplay(scene.id,scene.version):undefined)??fallback
      downloadText(scene.title+'-备份','json','application/json',encodeBackup(scene,recording))
    } catch(e){setError(errorText(e))}
  }
  function toggleRun() {
    setRunning(!running)
    showTime(engine.time)
  }
  function step() {
    setRunning(false)
    try {activeEngine.current.step();showTime(activeEngine.current.time)}
    catch(e){setError(errorText(e))}
  }
  const live=engine.bodies.get(selected)
  const isReplay=Boolean(replay)
  const replayTime=replay?.tracks[0][1][replayIndex].time
  const hasReplay=Boolean(recentReplay||savedReplay||(time>0&&engine.samples.size))
  const velocity=live?.getLinearVelocity()
  const status=isReplay?'回放中':running?'运行中':time>0?'已暂停':'编辑模式'
  function enterSpatial() {
    setRunning(false)
    setMoreOpen(false)
    if(!spatialBase)setSpatialBase({scene:current.current,physics:activeEngine.current})
    setSpatial(true)
  }
  function snapshotPlanar():PlanarBranch {
    const timeline=activeEngine.current.timeline()
    return {scene:{...current.current,camera:liveCamera.current},timeline:{...timeline,events:[...timeline.events]},display,analysis:analysisView}
  }
  function restorePlanar(branch:PlanarBranch,asCopy:boolean) {
    const next=asCopy?{...branch.scene,id:crypto.randomUUID()}:branch.scene
    const restored=Physics.restoreTimeline(next,branch.timeline)
    activeEngine.current=restored;current.current=next
    setScene(next);setEngine(restored);setRunning(false);showTime(restored.time);setTrailSince(0)
    setCamera(next.camera);setTitle(next.title);setSaved(false);setRecentReplay(undefined);setSavedReplay(undefined);setReplay(undefined)
    setDisplay(branch.display??defaultDisplay);setAnalysisView(branch.analysis)
    select(next.bodies.find(body=>body.type==='dynamic')?.id??'')
    editHistory.current={undo:[],redo:[]}
  }
  const benchRef=useRef<HTMLDivElement>(null)
  useEffect(()=>{
    const bench=benchRef.current
    const center=bench?.querySelector('.work-center')
    if(!bench||!center) return
    const host=bench.parentElement??bench
    const status=center.querySelector<HTMLElement>('.status-bar')
    const tools=center.querySelector<HTMLElement>('.tools')
    const apply=()=>{
      const height=(status?.offsetHeight??0)+(tools?.offsetHeight??0)
      host.style.setProperty('--lab-footer',`${height}px`)
    }
    apply()
    const observer=new ResizeObserver(apply)
    if(status) observer.observe(status)
    if(tools) observer.observe(tools)
    return ()=>{observer.disconnect();host.style.removeProperty('--lab-footer')}
  },[])
  const secondaryActions=<>
    <button className="button compact" aria-label="切换到三维工作台" title="三维工作台预览" disabled={isReplay} onClick={enterSpatial}>3D</button>
    <button className="icon" aria-label="撤销" title="撤销编辑（Ctrl / ⌘ + Z）" disabled={isReplay||!editHistory.current.undo.length} onClick={()=>restoreEdit('undo')}><Undo2 size={17}/></button>
    <button className="icon" aria-label="重做" title="重做编辑（Ctrl + Y 或 Ctrl / ⌘ + Shift + Z）" disabled={isReplay||!editHistory.current.redo.length} onClick={()=>restoreEdit('redo')}><Redo2 size={17}/></button>
    <button className="button compact" aria-label="属性" title="物体属性" onClick={()=>{setPropertyTab('object');setPanel('properties');setMoreOpen(false)}}><Box size={14}/>属性</button>
    <button className="icon" aria-label="环境" title="环境设置" onClick={()=>{setPropertyTab('world');setPanel('properties');setMoreOpen(false)}}><Globe2 size={17}/></button>
    <button className="button compact" aria-label="分析" title="数据分析" aria-expanded={analysisOpen} aria-controls="analysis-panel" onClick={()=>{setAnalysisOpen(true);setMoreOpen(false)}}><Activity size={15}/>分析</button>
    <button className="icon" aria-label={immersive?'退出沉浸模式':'进入沉浸模式'} title={immersive?'退出沉浸模式':'进入沉浸模式'} aria-pressed={immersive} onClick={()=>setImmersive(value=>!value)}>{immersive?<Minimize2 size={17}/>:<Maximize2 size={17}/>}</button>
    <button className="icon" aria-label="实验台帮助" title="实验台帮助" onClick={()=>{setHelp(!help);setMoreOpen(false)}}><CircleHelp size={19}/></button>
  </>
  return <><main className="lab" data-domain="mechanics" hidden={spatial}>
    <div className="lab-top">
      <div className="lab-identity">
        <a className="icon back" href={appUrl('/')} aria-label="返回首页" title="返回首页"><ArrowLeft size={17}/></a>
        <div className="lab-name"><div className="crumb">实验台</div><input aria-label="实验标题" maxLength={100} value={title} disabled={isReplay} onChange={e=>setTitle(e.target.value)}
          onBlur={()=>{if(title!==scene.title&&!change({title}))setTitle(scene.title)}} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur()}}/></div>
        <button className="icon" aria-label="打开实验菜单" title="实验菜单" aria-expanded={menu} onClick={()=>setMenu(!menu)}><ChevronDown size={16}/></button>
        {menu&&<div className="experiment-menu">
          <a href={appUrl('/lab?new=1')}><Plus size={15}/> 空白实验</a><a href={appUrl('/experiments')}><FolderOpen size={15}/> 打开实验库</a>
          <button onClick={()=>{exportScene();setMenu(false)}}><Download size={15}/> 导出场景 JSON</button>
          <button onClick={()=>{void exportBackup();setMenu(false)}}><Download size={15}/> 导出实验备份</button>
          {savedReplay&&<button disabled={isReplay} onClick={()=>openReplay(savedReplay)}><History size={15}/> 打开已保存的回放</button>}
          <div>实验模板</div>{templates.map(t=><a key={t.id} href={appUrl('/lab?template='+t.id)}>{t.title}</a>)}
          <a href={extensionUrl('pendulum')}>单摆</a>
          <a href={extensionUrl('double-pendulum')}>双摆与混沌</a>
        </div>}
      </div>
      <div className="run-buttons">
        <button className="button primary run" disabled={isReplay} aria-keyshortcuts="P" onClick={toggleRun}>{running?<Pause size={16} fill="currentColor"/>:<Play size={16} fill="currentColor"/>}{running?'暂停':'运行'}</button>
        <button className="icon framed" aria-label="单步运行" title="单步运行（1/60 s，快捷键 .）" aria-keyshortcuts="." disabled={isReplay} onClick={step}><StepForward size={18}/></button>
        <button className="icon framed" aria-label="重置模拟" title="重置模拟（Shift+R）" aria-keyshortcuts="Shift+R" disabled={isReplay} onClick={()=>reset()}><RotateCcw size={16}/></button>
        <div className="desktop-run-extras">
          <button className="icon framed" aria-label="历史回放" title="历史回放" disabled={!hasReplay||isReplay} onClick={()=>openReplay()}><History size={17}/></button>
          <label className="speed"><Gauge size={15}/><select aria-label="播放速度" disabled={isReplay} value={scene.environment.speed} onChange={e=>change({environment:{...scene.environment,speed:+e.target.value}})}>
            {Array.from(new Set([0.25,0.5,1,2,4,scene.environment.speed])).sort((a,b)=>a-b).map(v=><option key={v} value={v}>{v}×</option>)}
          </select></label>
        </div>
      </div>
      <div className="lab-actions"><div className="lab-actions-secondary">{secondaryActions}</div>
        <button className="button save" disabled={saving||isReplay} aria-label="保存实验" title={saving?'正在保存实验':saved?'实验已保存':'保存实验'} onClick={()=>void save()}>{saved?<Check size={16}/>:<Save size={16}/>}<span>{saving?'保存中…':saved?'已保存':'保存实验'}</span></button>
        <button className="icon mobile-more" aria-label="更多" title="更多工作台控制" aria-expanded={moreOpen} aria-controls="workbench-more" onClick={()=>setMoreOpen(!moreOpen)}><MoreHorizontal size={20}/></button>
      </div>
    </div>
    {moreOpen&&<div className="workbench-more" id="workbench-more" aria-label="更多工作台控制"><div>{secondaryActions}</div>
      <button className="icon framed" aria-label="历史回放" title="历史回放" disabled={!hasReplay||isReplay} onClick={()=>{openReplay();setMoreOpen(false)}}><History size={17}/></button>
      <label className="speed"><Gauge size={15}/><select aria-label="播放速度" disabled={isReplay} value={scene.environment.speed} onChange={e=>change({environment:{...scene.environment,speed:+e.target.value}})}>
        {Array.from(new Set([0.25,0.5,1,2,4,scene.environment.speed])).sort((a,b)=>a-b).map(v=><option key={v} value={v}>{v}×</option>)}
      </select></label>
    </div>}
    {help&&<section className="help-panel" aria-label="实验台帮助"><div><h2>实验台操作</h2><button className="icon" aria-label="关闭帮助" title="关闭帮助" onClick={()=>setHelp(false)}><X size={16}/></button></div>
      <p>打开「绘制」，从「图形」选择刚体、线段、光滑曲线或圆弧轨道，在画布上拖出范围。线段可作地面或斜面。</p>
      <p>橡皮提供“按笔画擦除”和“按拖动擦除”两种方式，可切换小、中、大号并选择是否擦完自动回到绘制。选择工具中左键拖动物体移动、拖空白平移；双击打开属性，单击物体显示缩放手柄，拖动圆形手柄旋转。</p>
      <p>连接工具箱支持两个物体间的连接。先点一个物体，再点空白，可创建固定端或轻小物体。有质量连接由多个有质量的节点近似。按 <kbd>Delete</kbd> 删除选中目标。</p>
      <p>播放快捷键：<kbd>P</kbd> 运行或暂停，<kbd>.</kbd> 单步推进 1/60 s，<kbd>Shift</kbd>+<kbd>R</kbd> 重置模拟。焦点在输入框或按钮上时，快捷键不生效。空格仍用于按住拖动平移画布。</p>
      <p>环境设置中的重力预设可一键切换到地球、月球、火星或失重，用于比较同一场景在不同重力下的运动。修改重力会回到初始状态重新模拟。</p>
      <p>物块与地面或斜面重叠时，会贴到物块中心所在一侧的表面。拖动时可看绿色接触线，按住 <kbd>Alt</kbd> 可自由摆放。</p>
      <p>接触力按求解器上一物理步的接触冲量除以步长估算。斜抛理论轨迹采用恒定重力、忽略空气阻力。</p>
    </section>}
    {error&&<div className="lab-message error-banner" role="alert">{error}<button className="icon" aria-label="关闭错误提示" title="关闭错误提示" onClick={()=>setError('')}><X size={15}/></button></div>}
    {notice&&<div className="lab-message toast" role="status"><Check size={16}/>{notice}</div>}
    <div className={'workbench'+(immersive?' immersive':'')} ref={benchRef}>
      <div className="work-center">
        <Viewport scene={replay?.scene??scene} active={active&&!spatial} camera={camera} setCamera={setCamera} physics={engine} resetCamera={()=>setCamera(fit((replay?.scene??scene).camera))} tool={tool} setTool={setTool} selected={selected} running={running} pause={()=>{setRunning(false);showTime(engine.time)}}
          replay={replayTracks?{tracks:replayTracks,index:replayIndex,externalForceApplied:replay?.externalForceApplied}:undefined}
          display={display} setDisplay={setDisplay} trailSince={trailSince} baseline={isReplay?undefined:baseline?.samples} select={select} change={change} remove={remove} report={setError}
          ink={ink} drawShape={drawShape} connectionTool={connectionTool} applyInput={applyInput} applyVelocity={applyVelocity} anglePreview={running?undefined:anglePreview} openProperties={id=>{select(id);setPropertyTab('object');setPanel('properties')}}/>
        {replay&&<ReplayControls replay={replay} index={replayIndex} seek={setReplayIndex} close={closeReplay} save={()=>saveRecording(replay)} active={active}/>}
        <div className="status-bar">
          <span className={running?'sim-status running':'sim-status'}><i/>{status}</span>
          <span className="status-time"><Clock3 size={13}/><time aria-label="模拟时间">{(replayTime??time).toFixed(3)} s</time></span>
          <span className="status-steps">固定步长 · 60 Hz</span>
          {scene.physicalMode==='free'&&!isReplay&&<span>自由干预</span>}
          {velocity&&!isReplay&&<span className="live-speed">|v| {Math.hypot(velocity.x,velocity.y).toFixed(2)} m/s</span>}
          <button className="text-button trail-clear" disabled={isReplay} onClick={()=>setTrailSince(engine.time+0.000001)}>清除轨迹</button>
        </div>
        {analysisOpen&&<div id="analysis-panel"><AnalysisPanel scene={replay?.scene??scene} results={replayTracks??engine.samples} selected={selected} select={select}
          baseline={isReplay?undefined:baseline} setBaseline={setBaseline} replay={isReplay} onClose={()=>setAnalysisOpen(false)}
          settings={analysisView} onSettings={setAnalysisView}
          interventions={replay?replay.interventions:engine.interventions}
          externalForceApplied={replay?replay.externalForceApplied:engine.externalForceApplied}/></div>}
        <Tools locked={isReplay} tool={tool} setTool={setTool} display={display} toggle={key=>setDisplay({...display,[key]:!display[key]})}
          ink={ink} setInk={setInk} addPrimitive={addPrimitive} drawShape={drawShape} setDrawShape={setDrawShape}
          connectionTool={connectionTool} setConnectionTool={setConnectionTool} setVectorEdit={mode=>setDisplay({...display,editForce:mode==='force',editVelocity:mode==='velocity'})}/>
      </div>
      {panel==='properties'&&<div className="inspector-wrap">
        <fieldset className="inspector-lock" disabled={isReplay}>
          <Inspector scene={scene} selected={selected} select={select} change={change} applyAngle={applyAngle} initialTab={propertyTab} onClose={()=>setPanel('none')}
            livePosition={live?live.getPosition():undefined} liveVelocity={velocity}/>
        </fieldset>
      </div>}
    </div>
  </main>
  {spatialBase&&<main className="lab" hidden={!spatial}><Suspense fallback={<p className="muted">正在打开三维工作台…</p>}>
    <SpatialWorkbench source={spatialBase.scene} physics={spatialBase.physics} active={active&&spatial} astronomy={spaceAstronomy} exit={()=>setSpatial(false)}
      snapshotPlanar={snapshotPlanar} restorePlanar={restorePlanar}/>
  </Suspense></main>}</>
}
