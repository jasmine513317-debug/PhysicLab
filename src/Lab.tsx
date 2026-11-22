import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Check, ChevronDown, CircleHelp, Clock3, Download, FolderOpen, Gauge, History, Pause, Play, Plus, Redo2, RotateCcw, Save, StepForward, Undo2, X } from 'lucide-react'
import { decodeExperiment, type Camera, type Experiment } from './model'
import { Physics } from './physics'
import { TimedRunControls } from './TimedRunControls'
import { Tools, Viewport, type Tool } from './Viewport'
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

const fit=(camera:Camera)=>({...camera,scale:Math.min(camera.scale,Math.max(25,(window.innerWidth-(window.innerWidth>1000?450:80))/10.6))})
type EditSnapshot = {
  scene: Experiment
  selected: string
  resetPhysics: boolean
  resetCamera: boolean
}
const maxUndoSteps = 50
const errorText=(e:unknown)=>e instanceof Error&&'issues' in e?(e.issues as {message:string}[]).map(x=>x.message).join(' · '):e instanceof Error?e.message:'操作未完成，请重试。'

type Props={initial:Experiment;initiallySaved:boolean;active:boolean;updateSavedAddress:(id:string)=>void}

export function Lab({initial,initiallySaved,active,updateSavedAddress}:Props) {
  const [scene,setScene]=useState(initial)
  const [camera,setCamera]=useState(()=>initiallySaved?initial.camera:fit(initial.camera))
  const [engine,setEngine]=useState(()=>new Physics(initial))
  const [selected,select]=useState(initial.bodies.find(b=>b.type==='dynamic')?.id??'')
  const [tool,setTool]=useState<Tool>('select')
  const [display,setDisplay]=useState(defaultDisplay)
  const [running,setRunning]=useState(false)
  const [timerOpen,setTimerOpen]=useState(false)
  const stopTick=useRef<number>(Infinity)
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
  const [mobileInspector,setMobileInspector]=useState(true)
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

  function reset(source=current.current) {
    try {
      const next=new Physics(source)
      const previous=activeEngine.current.captureReplay({...current.current,camera})
      if(previous)setRecentReplay(previous)
      stopTick.current=Infinity
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
      const next=decodeExperiment({...previous,...patch})
      const a=previous.environment.worldBounds,b=next.environment.worldBounds
      const mechanics=patch.bodies||patch.joints||(patch.environment&&(
        previous.environment.gravity!==next.environment.gravity||
        previous.environment.collisions!==next.environment.collisions||
        previous.environment.boundaries!==next.environment.boundaries||
        a?.minX!==b?.minX||a?.minY!==b?.minY||a?.maxX!==b?.maxX||a?.maxY!==b?.maxY))
      if(mechanics) {
        if(!reset(next))return false
        if(engine.time>0)setNotice('参数已更新，模拟已回到初始状态。')
      }
      const history=editHistory.current
      history.undo.push({scene:previous,selected,resetPhysics:Boolean(mechanics),resetCamera:Boolean(patch.camera)})
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
    if(snapshot.resetPhysics&&!reset(snapshot.scene))return
    const destination=direction==='undo'?history.redo:history.undo
    destination.push({...snapshot,scene:current.current,selected})
    source.pop()
    current.current=snapshot.scene
    setScene(snapshot.scene)
    setTitle(snapshot.scene.title)
    select(snapshot.selected)
    if(snapshot.resetCamera)setCamera(fit(snapshot.scene.camera))
    setSaved(snapshot.scene===lastSavedScene.current)
    setError('')
    setNotice(direction==='undo'?'已撤销编辑。':'已重做编辑。')
  }
  function remove(id:string) {
    if(!id)return
    const existing=current.current
    if(change({bodies:existing.bodies.filter(b=>b.id!==id),joints:existing.joints.filter(j=>j.id!==id&&j.a!==id&&j.b!==id)})) {
      if(selected===id||!existing.joints.filter(j=>j.a===id||j.b===id).every(j=>j.id!==selected))select('')
    }
  }
  useEffect(()=>{
    if(!active) {
      if(running){setRunning(false);showTime(engine.time)}
      return
    }
    if(!running)return
    let frame=0,last:number|undefined,lastUI=0
    function tick(now:number) {
      try {
        if(last!==undefined)engine.advance((now-last)/1000,current.current.environment.speed,stopTick.current)
        if(engine.time >= stopTick.current * engine.scene.environment.timeStep) {
          stopTick.current=Infinity
          showTime(engine.time)
          setRunning(false)
          setNotice('定时运行已在 '+engine.time.toFixed(3)+' 秒暂停。')
          return
        }
        last=now
        if(now-lastUI>80) {showTime(engine.time);lastUI=now}
        frame=requestAnimationFrame(tick)
      }catch(e){setRunning(false);setError(errorText(e))}
    }
    frame=requestAnimationFrame(tick)
    return ()=>{cancelAnimationFrame(frame);engine.discardRemainder()}
  },[active,running,engine])
  useEffect(()=>{
    if(!notice)return
    const timer=setTimeout(()=>setNotice(''),3800)
    return ()=>clearTimeout(timer)
  },[notice])
  useEffect(()=>{
    if(!active)return
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
      if(e.key==='Escape'){setTool('select');setHelp(false);setMenu(false)}
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
    stopTick.current=Infinity
    setRunning(!running)
    showTime(engine.time)
  }
  function runToTick(tick:number) {
    if(engine.time >= tick * engine.scene.environment.timeStep && !reset())return
    stopTick.current=tick
    setError('')
    setRunning(true)
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
  return <main className="lab">
    <div className="lab-top">
      <div className="lab-identity">
        <a className="icon back" href={appUrl('/')} aria-label="返回首页"><ArrowLeft size={17}/></a>
        <div className="lab-name"><div className="crumb">实验台</div><input aria-label="实验标题" maxLength={100} value={title} disabled={isReplay} onChange={e=>setTitle(e.target.value)}
          onBlur={()=>{if(title!==scene.title&&!change({title}))setTitle(scene.title)}} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur()}}/></div>
        <button className="icon" aria-label="打开实验菜单" aria-expanded={menu} onClick={()=>setMenu(!menu)}><ChevronDown size={16}/></button>
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
        <button className="icon framed" aria-label="历史回放" title="历史回放" disabled={!hasReplay||isReplay} onClick={()=>openReplay()}><History size={17}/></button>
        <label className="speed"><Gauge size={15}/><select aria-label="播放速度" disabled={isReplay} value={scene.environment.speed} onChange={e=>change({environment:{...scene.environment,speed:+e.target.value}})}>
          {Array.from(new Set([0.25,0.5,1,2,4,scene.environment.speed])).sort((a,b)=>a-b).map(v=><option key={v} value={v}>{v}×</option>)}
        </select></label>
        <button className="button compact timer-toggle" aria-label="定时运行" aria-expanded={timerOpen && !isReplay}
          aria-controls="timed-run-controls" disabled={isReplay} onClick={()=>setTimerOpen(!timerOpen)}>定时</button>
      </div>
      <div className="lab-actions">
        <button className="icon" aria-label="撤销" title="撤销编辑（Ctrl / ⌘ + Z）" disabled={isReplay||!editHistory.current.undo.length} onClick={()=>restoreEdit('undo')}><Undo2 size={17}/></button>
        <button className="icon" aria-label="重做" title="重做编辑（Ctrl + Y 或 Ctrl / ⌘ + Shift + Z）" disabled={isReplay||!editHistory.current.redo.length} onClick={()=>restoreEdit('redo')}><Redo2 size={17}/></button>
        <button className="icon" aria-label="实验台帮助" title="实验台帮助" onClick={()=>setHelp(!help)}><CircleHelp size={19}/></button>
        <button className="button save" disabled={saving||isReplay} aria-label={saving?'正在保存实验':saved?'已保存':'保存实验'} onClick={()=>void save()}>{saved?<Check size={16}/>:<Save size={16}/>}<span>{saving?'保存中…':saved?'已保存':'保存实验'}</span></button>
      </div>
    </div>
    <TimedRunControls open={timerOpen && !isReplay} currentTime={time} timeStep={scene.environment.timeStep}
      running={running} start={runToTick}/>
    {help&&<section className="help-panel" aria-label="实验台帮助"><div><h2>实验台操作</h2><button className="icon" aria-label="关闭帮助" onClick={()=>setHelp(false)}><X size={16}/></button></div>
      <p>选择形状工具，在网格中拖动即可创建物体。在选择工具中，左键拖物体可移动，拖空白处可平移。右键点击或在触屏上长按目标，即可看到删除选项。按 <kbd>R</kbd> 旋转，按 <kbd>Delete</kbd> 删除。滚动滚轮或使用缩放按钮调整视图。</p>
      <p>双击物块显示编辑手柄，拖动圆形手柄可旋转。按 <kbd>Esc</kbd> 退出编辑。</p>
      <p>在两个物体上分别选择连接点，即可添加弹簧。绘制线段或依次点击多边形顶点，查看识别结果后确认，也可改选类型。</p>
      <p>播放快捷键：<kbd>P</kbd> 运行或暂停，<kbd>.</kbd> 单步推进 1/60 s，<kbd>Shift</kbd>+<kbd>R</kbd> 重置模拟。焦点在输入框或按钮上时，快捷键不生效。空格仍用于按住拖动平移画布。</p>
      <p>环境设置中的重力预设可一键切换到地球、月球、火星或失重，用于比较同一场景在不同重力下的运动。修改重力会回到初始状态重新模拟。</p>
      <p>物块与地面或斜面重叠时，会贴到物块中心所在一侧的表面。拖动时可看绿色接触线，按住 <kbd>Alt</kbd> 可自由摆放。</p>
      <p>接触摩擦由引擎近似计算。力矢量显示外力、重力和弹簧力，接触冲量不在其中。斜抛理论轨迹采用恒定重力、忽略空气阻力。</p>
    </section>}
    {error&&<div className="lab-message error-banner" role="alert">{error}<button className="icon" aria-label="关闭错误提示" onClick={()=>setError('')}><X size={15}/></button></div>}
    {notice&&<div className="lab-message toast" role="status"><Check size={16}/>{notice}</div>}
    <div className="workbench">
      <Tools locked={isReplay} tool={tool} setTool={setTool} display={display} toggle={key=>setDisplay({...display,[key]:!display[key]})}/>
      <div className="work-center">
        <Viewport scene={replay?.scene??scene} camera={camera} setCamera={setCamera} physics={engine} resetCamera={()=>setCamera(fit((replay?.scene??scene).camera))} tool={tool} setTool={setTool} selected={selected} running={running} pause={()=>{setRunning(false);showTime(engine.time)}}
          replay={replayTracks?{tracks:replayTracks,index:replayIndex,externalForceApplied:replay?.externalForceApplied}:undefined}
          display={display} setDisplay={setDisplay} trailSince={trailSince} baseline={isReplay?undefined:baseline?.samples} select={select} change={change} remove={remove} report={setError}/>
        {replay&&<ReplayControls replay={replay} index={replayIndex} seek={setReplayIndex} close={closeReplay} save={()=>saveRecording(replay)} active={active}/>}
        <div className="status-bar">
          <span className={running?'sim-status running':'sim-status'}><i/>{status}</span>
          <span><Clock3 size={13}/><time aria-label="模拟时间">{(replayTime??time).toFixed(3)} s</time></span>
          <span className="status-steps">固定步长 · 60 Hz</span>
          {velocity&&!isReplay&&<span className="live-speed">|v| {Math.hypot(velocity.x,velocity.y).toFixed(2)} m/s</span>}
          <button className="text-button trail-clear" disabled={isReplay} onClick={()=>setTrailSince(engine.time+0.000001)}>清除轨迹</button>
        </div>
        <AnalysisPanel scene={replay?.scene??scene} results={replayTracks??engine.samples} selected={selected} select={select}
          baseline={isReplay?undefined:baseline} setBaseline={setBaseline} replay={isReplay}
          externalForceApplied={replay?replay.externalForceApplied:engine.externalForceApplied}/>
      </div>
      <button className="button mobile-inspector" onClick={()=>setMobileInspector(!mobileInspector)} aria-expanded={mobileInspector}>参数 <ChevronDown size={15}/></button>
      <div className={mobileInspector?'inspector-wrap':'inspector-wrap hide-mobile'}>
        <fieldset className="inspector-lock" disabled={isReplay}>
        <Inspector scene={scene} selected={selected} select={select} change={change} force={(id,x,y)=>{try {engine.setForce(id,{x,y});setNotice('已更新本次运行的外力。')}catch(e){setError(errorText(e))}}}/>
        </fieldset>
      </div>
    </div>
  </main>
}
