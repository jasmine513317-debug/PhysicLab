import { appendCelestial,astronomyScene,celestialUnits,orbitInclination,spatialPreset,withOrbitInclination } from './spatialTemplates'
import { useCallback,useEffect,useRef,useState } from 'react'
import { ArrowLeft, Download, Focus, Pause, Play, Plus, Redo2, RotateCcw, Save, StepForward, Undo2, Upload } from 'lucide-react'
import type { Experiment } from './model'
import type { Physics } from './physics'
import { downloadText } from './download'
import { runFixedSolver } from './simulation'
import { appUrl } from './routes'
import { liftPlanarExperiment,projectSpatialExperiment,type ProjectionPlane } from './spatialConversion'
import { changeSpatialView,defaultSpatialCamera,moveFirstPerson,SpatialCanvas,zoomSpatialCamera,type SpatialCamera,type SpatialGizmo,type SpatialEditAxis } from './SpatialCanvas'
import { meshRadius,spatialGeometrySchema,spatialMesh,spatialRibbon,type SpatialGeometry } from './spatialGeometry'
import { SpatialModelingPanel } from './SpatialModelingPanel'
import { ExperimentData,type Variable } from './ExperimentData'
import { equipotentialSurface,spaceFieldLines } from './spatialFields'
import type { SpatialWorkerReply,SpatialWorkerRequest } from './spatialWorker'
import { workspaceSchema,type DataView,type PlanarBranch,type SpatialWorkspace } from './spatialWorkspace'
import { defaultVectorView,vectorKinds,vectorStyles,type VectorView } from './spatialVectors'
export { initializeSpatialRigid } from './spatialRigid'
import {
  add, dot, emptySpatialScene,inductionMeasurements,length,multiply,rotateSpatialVector,SpatialPhysics,spatialObject,spatialSceneSchema,SPATIAL_DT,subtract,
  type SpatialBody,type SpatialScene,type SpatialSample,type SpatialControl,type Vec3,
} from './spatialPhysics'

const axis=['X','Y','Z'] as const
function useSpatialWorker() {
  const worker=useRef<Worker>(undefined)
  const requests=useRef(new Map<number,(reply:SpatialWorkerReply)=>void>())
  const serial=useRef(0)
  useEffect(()=>()=>{worker.current?.terminate();worker.current=undefined;requests.current.clear()},[])
  return useCallback((task:SpatialWorkerRequest,reply:(message:SpatialWorkerReply)=>void)=>{
    if(typeof Worker==='undefined')return false
    try {
      if(!worker.current) {
        const background=new Worker(new URL('./spatialWorker.ts',import.meta.url),{type:'module'})
        background.onmessage=(event:MessageEvent<SpatialWorkerReply>)=>{
          requests.current.get(event.data.id)?.(event.data)
          requests.current.delete(event.data.id)
        }
        background.onerror=()=>{
          for(const [id,receive] of requests.current)receive({id,kind:'error',error:'后台计算不可用。'})
          requests.current.clear();background.terminate();worker.current=undefined
        }
        worker.current=background
      }
      const id=++serial.current
      requests.current.set(id,reply)
      worker.current.postMessage({...task,id})
      return true
    } catch {return false}
  },[])
}
function restoreSpatial(value:unknown) {
  if(value&&typeof value==='object'&&'kind' in value&&value.kind==='physiclab-spatial-run')return SpatialPhysics.restore(value)
  return new SpatialPhysics(spatialSceneSchema.parse(value))
}
function VectorInput({label,value,commit}:{label:string;value:Vec3;commit:(vector:Vec3)=>void}) {
  return <fieldset className="spatial-vector"><legend>{label}</legend>
    {axis.map((name,i)=><label key={name}>{name}<input aria-label={label+' '+name} type="number" step="any" key={value[i]} defaultValue={value[i]} onBlur={e=>{
      if(e.target.value.trim()===''||!Number.isFinite(e.target.valueAsNumber)) {e.target.value=String(value[i]);return}
      if(e.target.valueAsNumber===value[i])return
      const next=[...value] as Vec3
      next[i]=e.target.valueAsNumber
      commit(next)
    }} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur()}}/></label>)}
  </fieldset>
}

function DimensionField({label,value,commit,min=.002,max}:{label:string;value:number;commit:(value:number)=>void;min?:number;max?:number}) {
  return <label>{label}<input key={value} type="number" min={min} max={max} step="any" defaultValue={value}
    onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur()}} onBlur={e=>{
      const input=e.currentTarget
      if(!Number.isFinite(input.valueAsNumber)||!input.validity.valid)input.value=String(value)
      else if(input.valueAsNumber!==value)commit(input.valueAsNumber)
    }}/></label>
}

type Props={source:Experiment;physics:Physics;active:boolean;astronomy?:boolean;exit:()=>void;
  snapshotPlanar:()=>PlanarBranch;restorePlanar:(branch:PlanarBranch,copy:boolean)=>void}

function sceneCamera(scene:SpatialScene):SpatialCamera {
  if(!scene.mutualGravity||!scene.bodies.length)return defaultSpatialCamera
  const minimum=[0,1,2].map(i=>Math.min(...scene.bodies.map(item=>item.position[i])))
  const maximum=[0,1,2].map(i=>Math.max(...scene.bodies.map(item=>item.position[i])))
  const focus=minimum.map((value,i)=>(value+maximum[i])/2) as Vec3
  const span=Math.max(...maximum.map((value,i)=>value-minimum[i]))
  return {...defaultSpatialCamera,focus,distance:Math.max(11,span*1.9)}
}

export default function SpatialWorkbench({source,physics,active,astronomy=false,exit,snapshotPlanar,restorePlanar}:Props) {
  const [lifted]=useState(()=>liftPlanarExperiment(source,physics))
  const [storageId]=useState(()=>new URLSearchParams(window.location.search).get('spatial')||source.id)
  const key='physiclab-spatial-v1:'+storageId
  const [stored]=useState(()=>{
    try {
      const text=localStorage.getItem(key)
      if(text) {
        const value:unknown=JSON.parse(text)
        const parsed=workspaceSchema.safeParse(value)
        if(parsed.success)return {engine:SpatialPhysics.restore(parsed.data.spatial),workspace:parsed.data}
        return {engine:restoreSpatial(value),workspace:undefined}
      }
    } catch {}
    const requested=new URLSearchParams(location.search).get('spaceModel')
    const initial=astronomy?(requested&&['orbit','three','escape','assist'].includes(requested)?spatialPreset(requested):astronomyScene()):lifted.scene??emptySpatialScene()
    return {engine:new SpatialPhysics(initial),workspace:undefined}
  })
  const [engine,setEngine]=useState(stored.engine)
  const restoredView=stored.workspace?.view
  const [camera,setCamera]=useState<SpatialCamera>(()=>restoredView?.camera??(astronomy?sceneCamera(engine.scene):defaultSpatialCamera))
  const [paused,setPaused]=useState(true)
  const [revision,redraw]=useState(0)
  const [selected,select]=useState(()=>engine.bodies[0]?.id??'')
  const [speed,setSpeed]=useState(1)
  const [trail,setTrail]=useState<'history'|'prediction'|'both'|'off'>(restoredView?.trail??'history')
  const [forecast,setForecast]=useState<Map<string,SpatialSample[]>>()
  const [trailWindow,setTrailWindow]=useState(restoredView?.trailWindow??120)
  const [trailCount,setTrailCount]=useState(restoredView?.trailCount??1800)
  const [vectors,setVectors]=useState(restoredView?.vectors??true)
  const [vectorView,setVectorView]=useState<VectorView>(restoredView?.vectorView??defaultVectorView)
  const [analysisView,setAnalysisView]=useState<DataView|undefined>(restoredView?.analysis)
  const [panel,setPanel]=useState<'body'|'settings'|'model'|'data'|'none'>('none')
  const [conversion,setConversion]=useState(false)
  const [plane,setPlane]=useState<ProjectionPlane>('xy')
  const [section,setSection]=useState('')
  const [springTarget,setSpringTarget]=useState('')
  const [combineTarget,setCombineTarget]=useState('')
  const [angles,setAngles]=useState<Vec3>([0,0,0])
  const [message,setMessage]=useState('')
  const [error,setError]=useState('')
  const [fields,setFields]=useState({electric:false,potential:false,magnetic:false,level:4500})
  const [fieldLines,setFieldLines]=useState<Vec3[][]>()
  const [potentialFaces,setPotentialFaces]=useState<Vec3[][]>()
  const [trace,setTrace]=useState({color:restoredView?.color??'#9ab8db',alpha:restoredView?.alpha??.75,markers:restoredView?.markers??false})
  const [reference,setReference]=useState<'world'|'com'|'body'>('world')
  const [gizmoTarget,setGizmoTarget]=useState<'none'|'position'|'force'>('none')
  const [axisMode,setAxisMode]=useState<SpatialEditAxis>('xy')
  const [localAxes,setLocalAxes]=useState(false)
  const [free,setFree]=useState(false)
  const [command,setCommand]=useState<SpatialControl['kind']>('force')
  const [input,setInput]=useState<Vec3>([0,0,0])
  const [duration,setDuration]=useState(1)
  const [entry,setEntry]=useState<'cartesian'|'direction'>('cartesian')
  const [drawing,setDrawing]=useState(false)
  const [drawingPlane,setDrawingPlane]=useState<'xy'|'xz'|'yz'>('xz')
  const [drawingOffset,setDrawingOffset]=useState(0)
  const file=useRef<HTMLInputElement>(null)
  const edits=useRef<{undo:SpatialPhysics[];redo:SpatialPhysics[]}>({undo:[],redo:[]})
  const liveEngine=useRef(engine)
  liveEngine.current=engine
  const lifecycle=useRef(0)
  const compute=useSpatialWorker()
  const restoredPlanar=useRef(false)
  useEffect(()=>{
    if(restoredPlanar.current||!stored.workspace)return
    restoredPlanar.current=true
    try {restorePlanar(stored.workspace.planar,false)}
    catch(error) {setError(error instanceof Error?error.message:String(error))}
  },[stored.workspace,restorePlanar])
  useEffect(()=>{
    const mount=++lifecycle.current
    return ()=>queueMicrotask(()=>{
      if(mount!==lifecycle.current)return
      for(const item of [liveEngine.current,...edits.current.undo,...edits.current.redo])item.dispose()
    })
  },[])
  const body=engine.bodies.find(b=>b.id===selected)
  const predictionRevision=paused?revision:0
  const totalMass=engine.bodies.reduce((sum,item)=>sum+item.mass,0)
  const center=totalMass?engine.bodies.reduce((sum,item)=>add(sum,multiply(item.position,item.mass/totalMass)),[0,0,0] as Vec3):undefined
  const following=reference==='com'?center:reference==='body'?body?.position:undefined
  const observation=following&&camera.mode!=='first'?{...camera,focus:add(camera.focus,following)}:camera
  const coil=inductionMeasurements(engine.scene,engine.time)
  const gizmo:SpatialGizmo|undefined=gizmoTarget==='none'||gizmoTarget==='position'&&!paused?undefined:{target:gizmoTarget,axis:axisMode,local:localAxes,
    commit:value=>gizmoTarget==='position'?edit({position:value}):control({kind:'force',value})}

  function step() {
    try {engine.step();redraw(value=>value+1)}
    catch(e) {setError(e instanceof Error?e.message:String(e));setPaused(true)}
  }
  useEffect(()=>{
    if(!active||paused)return
    return runFixedSolver(engine,{speed,maxSteps:12,maxDelta:.1,updated:()=>redraw(value=>value+1),failed:error=>{
      setError(error instanceof Error?error.message:String(error));setPaused(true)
    }})
  },[active,engine,paused,speed])
  useEffect(()=>{
    if(!active||trail!=='both'&&trail!=='prediction'){setForecast(undefined);return}
    let pending=false,alive=true
    function calculate() {
      if(pending)return
      function fallback() {
        try {setForecast(engine.prediction())}
        catch {setForecast(undefined);setError('预测范围内出现数值不稳定。')}
      }
      try {
        pending=compute({kind:'prediction',snapshot:engine.capture(false)},reply=>{
          pending=false
          if(!alive)return
          if(reply.kind==='prediction')setForecast(reply.forecast)
          else fallback()
        })
        if(!pending)fallback()
      } catch {fallback()}
    }
    calculate()
    const timer=paused?undefined:setInterval(calculate,500)
    return ()=>{alive=false;clearInterval(timer)}
  },[active,engine,trail,paused,predictionRevision,compute])

  useEffect(()=>{
    if(!active||!fields.electric&&!fields.potential){setFieldLines(undefined);setPotentialFaces(undefined);return}
    let pending=false,alive=true
    const draw=()=>{
      if(pending)return
      const extent=observation.distance*.75
      function fallback() {
        setFieldLines(fields.electric?spaceFieldLines(engine,observation.focus,extent):undefined)
        setPotentialFaces(fields.potential?equipotentialSurface(engine,observation.focus,extent,fields.level):undefined)
      }
      try {
        pending=compute({kind:'fields',scene:engine.state(),center:observation.focus,extent,
          lines:fields.electric,surface:fields.potential,level:fields.level},reply=>{
          pending=false
          if(!alive)return
          if(reply.kind==='fields'){setFieldLines(reply.lines);setPotentialFaces(reply.faces)}
          else fallback()
        })
        if(!pending)fallback()
      } catch(error) {setError(error instanceof Error?error.message:String(error))}
    }
    draw()
    const timer=paused?undefined:setInterval(draw,750)
    return ()=>{alive=false;clearInterval(timer)}
  },[active,engine,fields,paused,camera,reference,predictionRevision,compute])

  function show(replacement:SpatialPhysics) {
    setPaused(true);setEngine(replacement);setError('');setMessage('')
    if(!replacement.bodies.some(b=>b.id===selected))select(replacement.bodies[0]?.id??'')
  }
  function keepAndShow(replacement:SpatialPhysics) {
    const history=edits.current
    history.undo.push(engine)
    if(history.undo.length>12)history.undo.shift()?.dispose()
    for(const discarded of history.redo.splice(0))discarded.dispose()
    show(replacement)
  }
  function restoreEdit(direction:'undo'|'redo') {
    const history=edits.current
    const next=history[direction].pop()
    if(!next)return
    history[direction==='undo'?'redo':'undo'].push(engine)
    show(next)
  }
  function replace(next:SpatialScene) {
    try {
      keepAndShow(new SpatialPhysics(next))
    }catch(e) {setError(e instanceof Error?e.message:String(e))}
  }
  function update(patch:Partial<SpatialScene>) {replace({...engine.state(),...patch})}
  const inclination=panel==='settings'?orbitInclination(engine.scene):undefined
  function edit(patch:Partial<SpatialBody>) {
    update({bodies:engine.state().bodies.map(item=>item.id===selected?{...item,...patch}:item)})
  }
  function combine() {
    const peer=engine.bodies.find(item=>item.id===combineTarget&&item.id!==selected)
    if(!body?.geometry||!peer?.geometry)return
    try {
      const ids=new Set([body.id,peer.id])
      if([...engine.scene.springs??[],...engine.scene.pivots??[]].some(joint=>ids.has(joint.a)||ids.has(joint.b)))
        throw new Error('请先移除连接到这些物体的弹簧和球铰。')
      const vertices:Vec3[]=[],indices:number[]=[]
      for(const part of [body,peer]) {
        const mesh=spatialMesh(part.geometry!)
        const offset=vertices.length
        indices.push(...mesh.indices.map(index=>index+offset))
        vertices.push(...mesh.vertices.map(vertex=>add(subtract(part.position,body.position),rotateSpatialVector(vertex,part.orientation))))
      }
      const geometry=spatialGeometrySchema.parse({kind:'mesh',vertices,indices})
      const mass=body.mass+peer.mass
      const next={...body,geometry,mass,radius:meshRadius(geometry),orientation:[0,0,0,1] as [number,number,number,number],
        name:(body.name+' + '+peer.name).slice(0,80),fixed:body.fixed&&peer.fixed,
        velocity:add(multiply(body.velocity,body.mass/mass),multiply(peer.velocity,peer.mass/mass))}
      keepAndShow(new SpatialPhysics({...engine.state(),bodies:engine.state().bodies.filter(item=>item.id!==peer.id)
        .map(item=>item.id===body.id?next:item)}))
    } catch(error) {setError(error instanceof Error?error.message:String(error))}
  }
  function appendObject(next:SpatialBody) {
    try {
      keepAndShow(new SpatialPhysics({...engine.state(),bodies:[...engine.state().bodies,next]}))
      select(next.id);setPanel('body')
    } catch(error) {setError(error instanceof Error?error.message:String(error))}
  }
  function create(kind:string) {
    const next=spatialObject()
    const x=Math.min(4,engine.bodies.length*.7)
    next.position=[x,3,0]
    const shapes:Record<string,{name:string;geometry:SpatialGeometry}> = {
      cube:{name:'立方体',geometry:{kind:'box',size:[1,1,1]}},
      box:{name:'长方体',geometry:{kind:'box',size:[1.4,.7,.9]}},
      cylinder:{name:'圆柱体',geometry:{kind:'cylinder',radius:.45,height:1.15}},
      cone:{name:'圆锥体',geometry:{kind:'cone',radius:.5,height:1.25}},
      plane:{name:'平面',geometry:{kind:'box',size:[6,.04,4]}},
      ramp:{name:'斜面',geometry:{kind:'box',size:[5,.06,3]}},
    }
    if(kind==='charge')Object.assign(next,{name:'点电荷',charge:1e-6,fixed:true})
    if(kind==='planet')Object.assign(next,{name:'天体',mass:1e11})
    if(shapes[kind])Object.assign(next,shapes[kind])
    if(kind==='plane'||kind==='ramp')Object.assign(next,{fixed:true,position:[0,0,0],orientation:kind==='ramp'?[0,0,-.16,Math.sqrt(1-.16**2)]:[0,0,0,1]})
    appendObject(next)
  }
  function addCelestial(kind:string) {
    try {
      const next=appendCelestial(engine.state(),kind,selected)
      keepAndShow(new SpatialPhysics(next))
      select(next.bodies.at(-1)!.id)
      setPanel('body')
      setCamera(sceneCamera(next))
    } catch(error) {setError(error instanceof Error?error.message:String(error))}
  }
  function loadTemplate(name:string) {
    const template=spatialPreset(name)
    replace(template)
    setCamera(sceneCamera(template))
    setFields({...fields,electric:name==='electric',magnetic:name==='induction'})
  }
  function save() {
    try {
      localStorage.setItem(key,JSON.stringify(captureWorkspace()))
      const address=new URL(window.location.href)
      address.searchParams.set('spatial',storageId)
      window.history.replaceState(window.history.state,'',address)
      setMessage('已保存三维场景、模拟时间和轨迹。')
    } catch {setError('浏览器无法保存，可导出三维场景 JSON。')}
  }
  function captureWorkspace() {
    return workspaceSchema.parse({kind:'physiclab-unified-workspace',version:1,planar:snapshotPlanar(),
      spatial:engine.capture(),view:{camera,trail,trailWindow,trailCount,vectors,...trace,analysis:analysisView,vectorView},
      numerics:{fixedStepSeconds:SPATIAL_DT,rigidSubsteps:4,randomSeed:null}})
  }
  function applyWorkspace(workspace:SpatialWorkspace) {
    const next=SpatialPhysics.restore(workspace.spatial)
    restorePlanar(workspace.planar,true)
    keepAndShow(next)
    const {view}=workspace
    setCamera(view.camera);setTrail(view.trail);setTrailWindow(view.trailWindow);setVectors(view.vectors)
    setTrailCount(view.trailCount??1800);setVectorView(view.vectorView??defaultVectorView)
    setTrace({color:view.color,alpha:view.alpha,markers:view.markers})
    setAnalysisView(view.analysis)
  }
  function control(input:SpatialControl) {
    if(!body)return
    try {
      const previous=SpatialPhysics.restore(engine.capture())
      engine.schedule(body.id,input)
      const history=edits.current
      history.undo.push(previous)
      if(history.undo.length>12)history.undo.shift()?.dispose()
      for(const discarded of history.redo.splice(0))discarded.dispose()
      setMessage('干预已排入下一模拟步。');setError('');redraw(value=>value+1)
    } catch(error) {setError(error instanceof Error?error.message:String(error))}
  }
  function csv() {
    const rows=['body_id,time_s,x_m,y_m,z_m,vx_m_s,vy_m_s,vz_m_s']
    for(const [id,samples] of engine.history)for(const sample of samples)rows.push([
      '"'+id.replaceAll('"','""')+'"',sample.time,...sample.position,...sample.velocity,
    ].join(','))
    downloadText(engine.scene.title,'csv','text/csv;charset=utf-8',rows.join('\r\n'))
  }
  return <section className="spatial-workbench" aria-label="三维实验工作台">
    <header className="spatial-controls">
      {astronomy?<a className="button compact" href={appUrl('/lab?new=1&choose=1')}><ArrowLeft size={16}/> 实验方向</a>:
        <button className="button compact" onClick={()=>{setPaused(true);exit()}}><ArrowLeft size={16}/> 返回 2D</button>}
      <strong>{engine.scene.title}</strong>
      <button className="button compact primary" onClick={()=>setPaused(!paused)}>{paused?<Play size={15}/>:<Pause size={15}/>} {paused?'运行':'暂停'}</button>
      <button className="icon" title="三维单步" aria-label="三维单步" disabled={!paused} onClick={step}><StepForward size={16}/></button>
      <button className="icon" title="重置三维实验" aria-label="重置三维实验" onClick={()=>replace(engine.scene)}><RotateCcw size={16}/></button>
      <button className="icon" aria-label="撤销三维编辑" title="撤销三维编辑" disabled={!edits.current.undo.length} onClick={()=>restoreEdit('undo')}><Undo2 size={16}/></button>
      <button className="icon" aria-label="重做三维编辑" title="重做三维编辑" disabled={!edits.current.redo.length} onClick={()=>restoreEdit('redo')}><Redo2 size={16}/></button>
      <label>速度 <select value={speed} onChange={e=>setSpeed(+e.target.value)}>{[.25,.5,1,2,4].map(value=><option key={value} value={value}>{value}×</option>)}</select></label>
      <button className="icon" aria-label="保存三维实验" title="保存三维实验" onClick={save}><Save size={16}/></button>
      <button type="button" className="button compact" onClick={()=>setPanel(panel==='settings'?'none':'settings')}>环境</button>
      <button type="button" className="button compact" onClick={()=>setPanel(panel==='body'?'none':'body')}>属性</button>
      <button type="button" className="button compact" onClick={()=>setPanel(panel==='data'?'none':'data')}>分析</button>
    </header>
    {error&&<p className="error-banner spatial-message" role="alert">{error}</p>}
    {message&&<p className="spatial-message" role="status">{message}</p>}
    {lifted.unsupported.length>0&&engine.bodies.length===0&&<p className="spatial-message">二维场景已保留。以下对象需要其他三维模型，当前空间从空白开始：{lifted.unsupported.join('、')}</p>}
    {engine.scene.source&&<p className="spatial-message">从二维 {engine.scene.source.time.toFixed(3)} s 的状态创建空间分支，各自计时。</p>}
    <div className="spatial-view">
      <SpatialCanvas {...{engine,selected,select,forecast,vectors,revision,trailWindow,trailCount,fieldLines,potentialFaces,gizmo,vectorView}}
        camera={observation} setCamera={next=>setCamera(following&&next.mode!=='first'?{...next,focus:add(next.focus,multiply(following,-1))}:next)}
        drawing={drawing?{plane:drawingPlane,offset:drawingOffset,commit:points=>{
          try {
            const geometry=spatialRibbon(points,.45,drawingPlane==='xy'?'z':drawingPlane==='yz'?'x':undefined)
            appendObject({...spatialObject('手绘空间轨道'),geometry,fixed:true,radius:meshRadius(geometry),position:[0,0,0]})
            setDrawing(false)
          } catch(error) {setError(error instanceof Error?error.message:String(error))}
        }}:undefined}
        showMagnetic={fields.magnetic} trailColor={trace.color} trailAlpha={trace.alpha} timeMarkers={trace.markers} history={trail==='history'||trail==='both'}/>
      <div className="spatial-camera">
        <select aria-label="三维观察方式" value={camera.mode} onChange={e=>{
          const mode=e.target.value as SpatialCamera['mode']
          const next=changeSpatialView(observation,mode)
          setCamera(following&&next.mode!=='first'?{...next,focus:subtract(next.focus,following)}:next)
        }}><option value="orbit">轨道观察</option><option value="first">第一人称</option><option value="xy">XY 正交观察</option></select>
        <button className="icon" aria-label="聚焦三维物体" title="聚焦三维物体" disabled={!body} onClick={()=>body&&setCamera({...camera,mode:'orbit',focus:body.position})}><Focus size={17}/></button>
        <button className="icon" aria-label="重置三维视角" title="重置三维视角" onClick={()=>setCamera(defaultSpatialCamera)}><RotateCcw size={17}/></button>
        <button className="button compact" aria-label="放近三维视角" onClick={()=>setCamera(zoomSpatialCamera(camera,.8))}>＋</button>
        <button className="button compact" aria-label="拉远三维视角" onClick={()=>setCamera(zoomSpatialCamera(camera,1.25))}>－</button>
        {camera.mode==='first'&&<div className="spatial-movement" role="group" aria-label="第一人称移动">
          {([['w','前进','↑'],['a','左移','←'],['s','后退','↓'],['d','右移','→']] as const).map(([key,label,icon])=>
            <button className="button compact" key={key} aria-label={label} title={label} onClick={()=>setCamera(moveFirstPerson(camera,key))}>{icon}</button>)}
        </div>}
      </div>
      {panel!=='none'&&<aside className="spatial-properties" aria-label={panel==='settings'?'三维环境':panel==='model'?'空间自由建模':panel==='data'?'三维分析':'三维属性'}>
        {panel==='settings'?<>
          <VectorInput label="重力加速度 (m/s²)" value={engine.scene.gravity} commit={gravity=>update({gravity})}/>
          <VectorInput label="均匀电场 (N/C)" value={engine.scene.electric} commit={electric=>update({electric})}/>
          <VectorInput label="均匀磁场 (T)" value={engine.scene.magnetic} commit={magnetic=>update({magnetic})}/>
          <label><input type="checkbox" checked={engine.scene.ground} onChange={e=>update({ground:e.target.checked})}/> 地面 y = 0</label>
          <label><input type="checkbox" checked={engine.scene.collisions} onChange={e=>update({collisions:e.target.checked})}/> 球体碰撞</label>
          <label><input type="checkbox" checked={engine.scene.mutualGravity} onChange={e=>update({mutualGravity:e.target.checked})}/> 两两引力</label>
          {inclination&&<DimensionField label="初始轨道倾角 (°)" min={0} max={180}
            value={Number((inclination.radians*180/Math.PI).toFixed(4))} commit={degrees=>{
              try {replace(withOrbitInclination(engine.scene,degrees))}
              catch(error) {setError(error instanceof Error?error.message:String(error))}
            }}/>}
          <label><input type="checkbox" checked={engine.scene.mutualElectric??false} onChange={e=>update({mutualElectric:e.target.checked})}/> 点电荷间库仑力</label>
          <label><input type="checkbox" checked={fields.electric} onChange={e=>setFields({...fields,electric:e.target.checked})}/> 静电场线</label>
          <label><input type="checkbox" checked={fields.potential} onChange={e=>setFields({...fields,potential:e.target.checked})}/> 等势面</label>
          {fields.potential&&<label>等势值 (V)<input type="number" step="any" value={fields.level} onChange={e=>setFields({...fields,level:+e.target.value})}/></label>}
          <label><input type="checkbox" checked={fields.magnetic} onChange={e=>setFields({...fields,magnetic:e.target.checked})}/> 磁场方向阵列</label>
          <label>跟踪参考系<select value={reference} onChange={e=>{
            setReference(e.target.value as typeof reference);setCamera(current=>({...current,focus:defaultSpatialCamera.focus}))
          }}><option value="world">世界</option><option value="com">质心</option><option value="body">选中物体</option></select></label>
          <label>轨迹颜色<input type="color" value={trace.color} onChange={e=>setTrace({...trace,color:e.target.value})}/></label>
          <label>轨迹透明度<input type="range" min=".15" max="1" step=".05" value={trace.alpha} onChange={e=>setTrace({...trace,alpha:+e.target.value})}/></label>
          <label><input type="checkbox" checked={trace.markers} onChange={e=>setTrace({...trace,markers:e.target.checked})}/> 轨迹时间标记</label>
          <label>轨迹点数 <select value={trailCount} onChange={e=>setTrailCount(+e.target.value)}>
            {[90,300,900,1800].map(count=><option key={count} value={count}>{count}</option>)}
          </select></label>
          <details className="spatial-vector-options"><summary>矢量显示</summary>
            {vectorKinds.map(kind=><label key={kind}><input type="checkbox" checked={vectorView.kinds.includes(kind)}
              onChange={e=>setVectorView({...vectorView,kinds:e.target.checked?[...vectorView.kinds,kind]:vectorView.kinds.filter(item=>item!==kind)})}/>
              {vectorStyles[kind][0]}</label>)}
            <label>标签<select value={vectorView.labels} onChange={e=>setVectorView({...vectorView,labels:e.target.value as VectorView['labels']})}>
              <option value="name">名称</option><option value="size">大小和单位</option><option value="components">分量和单位</option><option value="none">关闭</option>
            </select></label>
            {[...new Set(['m/s',...vectorView.kinds.map(kind=>vectorStyles[kind][1])])].map(unit=><label key={unit}>比例 ({unit})
              <input aria-label={'三维矢量比例 '+unit} type="range" min=".05" max="5" step=".05" value={vectorView.scales[unit]??1}
                onChange={e=>setVectorView({...vectorView,scales:{...vectorView.scales,[unit]:+e.target.value}})}/></label>)}
          </details>
          <small>{engine.usesRigidSolver?'Rapier 刚体、摩擦与连续碰撞检测。':'科学积分器与无摩擦球体接触。'} 四个内部子步，点源力以 0.01 m 软化。</small>
          {coil&&<small>准静态均匀磁场模型。磁通量 {coil.flux.toPrecision(4)} Wb，感应电动势 {coil.emf.toPrecision(4)} V。</small>}
        </>:panel==='model'?<><label>手绘工作平面<select value={drawingPlane} onChange={e=>setDrawingPlane(e.target.value as typeof drawingPlane)}>
          <option value="xz">XZ</option><option value="xy">XY</option><option value="yz">YZ</option>
        </select></label><label>工作平面深度 (m)<input type="number" step="any" value={drawingOffset} onChange={e=>setDrawingOffset(+e.target.value)}/></label>
        <button className="button compact" aria-pressed={drawing} onClick={()=>{setPaused(true);setDrawing(!drawing)}}>{drawing?'退出路径绘制':'手绘空间路径'}</button>
        {drawing&&<small>在画布上按住拖动。请让工作平面朝向相机。</small>}
        <SpatialModelingPanel report={setError} create={(name,geometry,fixed)=>appendObject({
          ...spatialObject(name),geometry,fixed,radius:meshRadius(geometry),position:fixed?[0,0,0]:[0,3,0],
        })}/></>:panel==='data'?<SpatialData engine={engine} settings={analysisView} onSettings={setAnalysisView}/>:<>
          <select aria-label="三维对象" value={selected} onChange={e=>select(e.target.value)}><option value="">选择物体</option>{engine.bodies.map(item=><option value={item.id} key={item.id}>{item.name}</option>)}</select>
          {body&&<>
            <VectorInput label="位置 (m)" value={body.position} commit={position=>edit({position})}/>
            <VectorInput label="速度 (m/s)" value={body.velocity} commit={velocity=>edit({velocity})}/>
            <VectorInput label="持续外力 (N)" value={body.force} commit={force=>edit({force})}/>
            <VectorInput label="角速度 (rad/s)" value={body.angularVelocity} commit={angularVelocity=>edit({angularVelocity})}/>
            <VectorInput label="姿态欧拉角 (°)" value={angles} commit={value=>{
              const [x,y,z]=value.map(n=>n*Math.PI/360),[a,b,c]=[Math.sin(x),Math.sin(y),Math.sin(z)],[d,e,f]=[Math.cos(x),Math.cos(y),Math.cos(z)]
              setAngles(value);edit({orientation:[a*e*f-d*b*c,d*b*f+a*e*c,d*e*c-a*b*f,d*e*f+a*b*c]})
            }}/>
            <label>空间拖动<select value={gizmoTarget} onChange={e=>{if(e.target.value==='position')setPaused(true);setGizmoTarget(e.target.value as typeof gizmoTarget)}}>
              <option value="none">关闭</option><option value="position">移动物体</option><option value="force">持续外力端点</option></select></label>
            {gizmoTarget!=='none'&&<>
              <label>工作轴或平面<select value={axisMode} onChange={e=>setAxisMode(e.target.value as SpatialEditAxis)}>
                {(['x','y','z','xy','xz','yz'] as const).map(axis=><option key={axis} value={axis}>{axis.toUpperCase()}</option>)}
              </select></label>
              <label><input type="checkbox" checked={localAxes} onChange={e=>setLocalAxes(e.target.checked)}/> 使用物体局部坐标</label>
              <small>拖动粉色圆点。工作轴与视线重合时可转动视角或使用数值输入。</small>
            </>}
            {([['mass','质量 (kg)'],['radius','半径 (m)'],['charge','电荷 (C)'],['restitution','恢复系数'],['friction','摩擦系数']] as const)
              .filter(([field])=>field!=='radius'||!body.geometry).map(([field,label])=><label key={field}>{label}<input type="number" step="any" key={body[field]} defaultValue={body[field]??.35} onBlur={e=>{if(Number.isFinite(e.target.valueAsNumber)&&e.target.valueAsNumber!==body[field])edit({[field]:e.target.valueAsNumber})}}/></label>)}
            {!body.geometry&&(engine.scene.mutualGravity||body.visualRadius!==undefined)&&
              <DimensionField label="显示半径 (m)" min={.001} max={1e15} value={body.visualRadius??body.radius}
                commit={visualRadius=>edit({visualRadius})}/>}
            {body.geometry?.kind==='box'&&<VectorInput label="尺寸 (m)" value={body.geometry.size} commit={size=>edit({geometry:{kind:'box',size}})}/>}
            {(body.geometry?.kind==='cone'||body.geometry?.kind==='cylinder')&&<>
              <DimensionField label="圆截面半径 (m)" value={body.geometry.radius} commit={radius=>{
                const geometry=body.geometry
                if(geometry?.kind==='cone'||geometry?.kind==='cylinder')edit({geometry:{...geometry,radius}})
              }}/>
              <DimensionField label="高度 (m)" value={body.geometry.height} commit={height=>{
                const geometry=body.geometry
                if(geometry?.kind==='cone'||geometry?.kind==='cylinder')edit({geometry:{...geometry,height}})
              }}/>
            </>}
            {body.geometry&&<><label>组合对象<select value={combineTarget} onChange={e=>setCombineTarget(e.target.value)}>
              <option value="">选择其他几何体</option>{engine.bodies.filter(item=>item.id!==selected&&item.geometry).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
            </select></label><button className="button compact" disabled={!combineTarget} onClick={combine}>合并为一个物体</button></>}
            <label><input type="checkbox" checked={body.fixed} onChange={e=>edit({fixed:e.target.checked})}/> 固定物体</label>
            <label>弹簧连接端点<select value={springTarget} onChange={e=>setSpringTarget(e.target.value)}>
              <option value="">选择另一个物体</option>{engine.bodies.filter(item=>item.id!==body.id&&!(body.fixed&&item.fixed)).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
            </select></label>
            <button className="button compact" disabled={!engine.bodies.some(item=>item.id===springTarget&&item.id!==selected&&!(item.fixed&&body.fixed))} onClick={()=>{
              const target=engine.bodies.find(item=>item.id===springTarget)
              if(!target)return
              const restLength=Math.max(.001,Math.hypot(...target.position.map((value,i)=>value-body.position[i])))
              update({springs:[...(engine.scene.springs??[]),{id:crypto.randomUUID(),a:body.id,b:target.id,restLength,stiffness:1,damping:0}]})
            }}>添加弹簧</button>
            <button className="button compact" onClick={()=>update({bodies:engine.state().bodies.filter(item=>item.id!==selected),
              springs:engine.scene.springs?.filter(spring=>spring.a!==selected&&spring.b!==selected),
              pivots:engine.scene.pivots?.filter(joint=>joint.a!==selected&&joint.b!==selected)})}>删除选中物体</button>
            <small>这些属性创建新的初始状态。下方运行干预会保留时间和轨迹。</small>
            {!body.fixed&&<fieldset className="spatial-intervention">
              <legend>运行干预</legend>
              <label>物理模式<select value={free?'free':'strict'} onChange={e=>{
                const enabled=e.target.value==='free';setFree(enabled);if(!enabled&&command==='velocity')setCommand('force')
              }}><option value="strict">严格物理</option><option value="free">自由干预</option></select></label>
              <label>输入类型<select value={command} onChange={e=>setCommand(e.target.value as SpatialControl['kind'])}>
                <option value="force">持续外力 (N)</option><option value="timed">定时外力 (N)</option>
                <option value="impulse">瞬时冲量 (N·s)</option>{free&&<option value="velocity">覆盖速度 (m/s)</option>}
              </select></label>
              <label>输入形式<select value={entry} onChange={e=>{setEntry(e.target.value as typeof entry);setInput([0,0,0])}}>
                <option value="cartesian">XYZ 分量</option><option value="direction">大小、方位角、仰角</option>
              </select></label>
              <VectorInput label={entry==='cartesian'?'矢量分量':'大小 / 方位角 ° / 仰角 °'} value={input} commit={setInput}/>
              {command==='timed'&&<label>持续时间 (s)<input type="number" min=".017" step="any" value={duration} onChange={e=>setDuration(+e.target.value)}/></label>}
              {free&&<small>直接覆盖速度属于人工干预，能量与动量守恒可能不适用。</small>}
              <button type="button" className="button compact" onClick={()=>{
                const [m,az,el]=input,theta=az*Math.PI/180,phi=el*Math.PI/180
                const value:Vec3=entry==='cartesian'?input:[m*Math.cos(phi)*Math.cos(theta),m*Math.sin(phi),m*Math.cos(phi)*Math.sin(theta)]
                control(command==='timed'?{kind:command,value,steps:Math.ceil(duration/SPATIAL_DT)}:{kind:command,value})
              }}>应用运行干预</button>
            </fieldset>}
          </>}
        </>}
      </aside>}
      {conversion&&<aside className="spatial-properties" aria-label="生成二维副本">
        <label>平面<select value={plane} onChange={e=>setPlane(e.target.value as ProjectionPlane)}>
          <option value="xy">XY</option><option value="xz">XZ</option><option value="yz">YZ</option>
        </select></label>
        <label>截面深度 (m)<input type="number" step="any" placeholder="留空为投影" value={section} onChange={e=>setSection(e.target.value)}/></label>
        <p>生成独立二维文件。深度、面外速度、三维场、地面、约束、时间和轨迹会留在三维实验中。截面只包含与平面相交且可被二维引擎表示的球体。</p>
        <button className="button compact" onClick={()=>{
          try {
            const next=projectSpatialExperiment(engine,plane,section===''?undefined:Number(section))
            downloadText(next.title,'json','application/json',JSON.stringify(next,null,2))
            setConversion(false)
          } catch {setError('场景的尺寸、质量、位置或速度超出二维实验格式支持的范围。')}
        }}>确认导出二维副本</button>
        <button className="button compact" onClick={()=>setConversion(false)}>取消</button>
      </aside>}
    </div>
    <div className="spatial-status"><time aria-label="三维模拟时间">{engine.time.toFixed(3)} s</time>{body&&<span>{body.name} · {length(body.velocity).toFixed(2)} m/s</span>}<span>三维 · 固定步长 60 Hz · 采样 15 Hz</span></div>
    <footer className="spatial-controls">
      {astronomy?<select aria-label="添加天体模型" value="" onChange={e=>{if(e.target.value)addCelestial(e.target.value)}}>
        <option value="">添加天体</option>{celestialUnits.map(unit=><option key={unit.id} value={unit.id}>{unit.name}</option>)}
      </select>:<>
      <button className="button compact" onClick={()=>create('sphere')}><Plus size={16}/> 球体</button>
      <select aria-label="添加空间几何体" value="" onChange={e=>{if(e.target.value)create(e.target.value)}}>
        <option value="">添加几何体</option><option value="cube">立方体</option><option value="box">长方体</option><option value="cylinder">圆柱体</option>
        <option value="cone">圆锥体</option><option value="plane">平面</option><option value="ramp">斜面</option><option value="charge">点电荷</option><option value="planet">天体</option>
      </select>
      <button className="button compact" onClick={()=>setPanel(panel==='model'?'none':'model')}>建模</button>
      </>}
      <select aria-label="加载三维模板" value="" onChange={e=>{
        if(e.target.value)loadTemplate(e.target.value)
      }}>
        <option value="">加载模板</option>{!astronomy&&<><option value="fall">空间自由落体</option><option value="throw">空间抛体</option><option value="spring">空间弹簧振子</option>
        <option value="rigid">空间刚体接触</option><option value="pendulum">球铰空间摆</option><option value="double">空间双摆</option>
        <option value="incline">空间斜面</option><option value="surface">空间曲线轨道</option>
        <option value="helix">均匀磁场螺旋</option>
        <option value="electric">空间偶极子</option><option value="induction">空间电磁感应</option>
        </>}<option value="orbit">倾斜双体轨道</option>
        <option value="three">空间三体</option><option value="escape">空间逃逸</option><option value="assist">空间引力飞掠</option>
      </select>
      <select aria-label="三维轨迹" value={trail} onChange={e=>setTrail(e.target.value as typeof trail)}>
        <option value="off">隐藏轨迹</option><option value="history">历史轨迹</option><option value="prediction">预测 2 s</option><option value="both">历史与预测 2 s</option>
      </select>
      {['history','both'].includes(trail)&&<label>历史区间 <select value={trailWindow} onChange={e=>setTrailWindow(+e.target.value)}>
        {[5,15,30,60,120].map(seconds=><option key={seconds} value={seconds}>{seconds} s</option>)}
      </select></label>}
      <label><input type="checkbox" checked={vectors} onChange={e=>setVectors(e.target.checked)}/> 速度矢量</label>
      <button className="button compact" onClick={csv} disabled={!engine.bodies.length}><Download size={16}/> 轨迹 CSV</button>
      <button className="button compact" disabled={!engine.bodies.length} onClick={()=>{engine.clearHistory();redraw(value=>value+1)}}>清除轨迹</button>
      <button className="button compact" onClick={()=>downloadText(engine.scene.title,'json','application/json',JSON.stringify(engine.capture(),null,2))}>实验 JSON</button>
      <button className="button compact" onClick={()=>{
        try {downloadText(engine.scene.title+' · 跨维工作包','json','application/json',JSON.stringify(captureWorkspace()))}
        catch(error) {setError(error instanceof Error?error.message:String(error))}
      }}>跨维工作包</button>
      <button className="button compact" onClick={()=>{setPaused(true);setPanel('none');setConversion(!conversion)}}>生成二维副本</button>
      <button className="icon" aria-label="导入三维场景" title="导入三维场景" onClick={()=>file.current?.click()}><Upload size={16}/></button>
      <input ref={file} type="file" accept=".json,application/json" hidden onChange={async e=>{
        const selected=e.target.files?.[0]
        e.target.value=''
        if(!selected)return
        try {
          if(selected.size>24_000_000)throw new Error('文件过大')
          const value:unknown=JSON.parse(await selected.text())
          const workspace=workspaceSchema.safeParse(value)
          if(workspace.success)applyWorkspace(workspace.data)
          else keepAndShow(restoreSpatial(value))
        }
        catch {setError('请选择有效的三维场景 JSON。')}
      }}/>
    </footer>
  </section>
}

function SpatialData({engine,settings,onSettings}:{engine:SpatialPhysics;settings?:DataView;onSettings:(settings:DataView)=>void}) {
  const variables:Variable[]=[
    ['time','模拟时间','s'],['y','Y 坐标','m'],['x','X 坐标','m'],['z','Z 坐标','m'],
    ['vx','X 速度','m/s'],['vy','Y 速度','m/s'],['vz','Z 速度','m/s'],['speed','速率','m/s','派生'],
    ['ax','X 加速度','m/s²'],['ay','Y 加速度','m/s²'],['az','Z 加速度','m/s²'],
    ['omega','角速率','rad/s','派生'],['kinetic','平动动能','J','派生'],['gravity','均匀重力势能','J','派生'],
    ['fx','X 合力','N','派生'],['fy','Y 合力','N','派生'],['fz','Z 合力','N','派生'],
  ]
  if(engine.scene.induction)variables.push(['flux','磁通量','Wb','理论'],['emf','感应电动势','V','理论'])
  const gravity=engine.scene.mutualGravity
  const primary=engine.bodies[0],secondary=engine.bodies[1]
  const mainSamples=new Map((engine.history.get(primary?.id)??[]).map(sample=>[sample.time,sample]))
  const secondSamples=new Map((engine.history.get(secondary?.id)??[]).map(sample=>[sample.time,sample]))
  if(gravity)variables.push(['distancePrimary','到首个天体的距离','m','派生'],['speedPrimary','首天体系速率','m/s','派生'],
    ['speedSecondary','第二天体系速率','m/s','派生'])
  return <ExperimentData title={engine.scene.title} variables={variables}
    settings={settings} onSettings={onSettings}
    markers={engine.interventions.map(event=>event.tick*SPATIAL_DT)}
    mode={engine.interventions.some(event=>event.control.kind==='velocity')?'含人工速度覆盖':'严格物理'}
    subjects={engine.bodies.map(item=>({id:item.id,name:item.name,
    rows:(engine.history.get(item.id)??[]).map(sample=>{
      const main=mainSamples.get(sample.time),second=secondSamples.get(sample.time)
      return ({
      time:sample.time,x:sample.position[0],y:sample.position[1],z:sample.position[2],
      vx:sample.velocity[0],vy:sample.velocity[1],vz:sample.velocity[2],speed:length(sample.velocity),
      ax:sample.acceleration?.[0],ay:sample.acceleration?.[1],az:sample.acceleration?.[2],
      omega:sample.angularVelocity?length(sample.angularVelocity):undefined,kinetic:.5*item.mass*length(sample.velocity)**2,
      gravity:-item.mass*dot(engine.scene.gravity,sample.position),
      fx:sample.acceleration?sample.acceleration[0]*item.mass:undefined,fy:sample.acceleration?sample.acceleration[1]*item.mass:undefined,
      fz:sample.acceleration?sample.acceleration[2]*item.mass:undefined,
      distancePrimary:main?length(subtract(main.position,sample.position)):undefined,
      speedPrimary:main?length(subtract(main.velocity,sample.velocity)):undefined,
      speedSecondary:second?length(subtract(second.velocity,sample.velocity)):undefined,
      ...inductionMeasurements(engine.scene,sample.time),
    })}),
  }))}/>
}
