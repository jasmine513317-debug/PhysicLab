import { appendCelestial,celestialUnits,orbitInclination,spatialPreset,withOrbitInclination } from './spatialTemplates'
import { useCallback,useEffect,useRef,useState } from 'react'
import { ArrowLeft, Download, Focus, Pause, Play, Plus, Redo2, RotateCcw, Save, StepForward, Undo2, Upload } from 'lucide-react'
import type { Experiment } from './model'
import type { Physics } from './physics'
import { downloadText } from './download'
import { runFixedSolver } from './simulation'
import { appUrl } from './routes'
import { astronomicalUniverse,celestialAssets,insertAsset,phenomenonPreset,referenceOrbit,solarSystem,sourceOrbitScene } from './celestialAssets'
import { densityOf,radiusForDensity } from './celestialPhysics'
import { binaryStrain,kerrDisk,kerrHorizon } from './blackHolePhysics'
import { CelestialDiagnostics } from './CelestialDiagnostics'
import { CelestialPhenomena } from './CelestialPhenomena'
import { sxsMerger } from './celestialMergerReplay'
import { readCelestialModels,storeCelestialModel,writeCelestialModels } from './celestialModelLibrary'
import { liftPlanarExperiment,projectSpatialExperiment,type ProjectionPlane } from './spatialConversion'
import { changeSpatialView,defaultSpatialCamera,moveFirstPerson,SpatialCanvas,zoomSpatialCamera,type SpatialCamera,type SpatialCameraDrag,type SpatialGizmo,type SpatialEditAxis } from './SpatialCanvas'
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
  const surface=scene.celestial?Math.max(...scene.bodies.map(b=>b.visualRadius??b.radius))*5:0
  return {...defaultSpatialCamera,focus,distance:Math.max(11,span*1.9,surface)}
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
    const initial=astronomy?(requested==='solar'?solarSystem():requested&&['orbit','three','escape','assist'].includes(requested)
      ?{...spatialPreset(requested),celestial:astronomicalUniverse().celestial}:phenomenonPreset(requested??'')??astronomicalUniverse()):lifted.scene??emptySpatialScene()
    return {engine:new SpatialPhysics(initial),workspace:undefined}
  })
  const [engine,setEngine]=useState(stored.engine)
  const restoredView=stored.workspace?.view
  const restoredObservation=restoredView?.observation
  const [lensRays,setLensRays]=useState(restoredObservation?.lensRays??false)
  const [savedModels,setSavedModels]=useState(()=>astronomy?readCelestialModels():[])
  const [chosenModel,setChosenModel]=useState('')
  const [camera,setCamera]=useState<SpatialCamera>(()=>restoredView?.camera??(astronomy?sceneCamera(engine.scene):defaultSpatialCamera))
  const [cameraDrag,setCameraDrag]=useState<SpatialCameraDrag>('pan')
  const [paused,setPaused]=useState(true)
  const [revision,redraw]=useState(0)
  const previousPositions=useRef<Map<string,Vec3>>(undefined)
  const interpolation=useRef(1)
  const [selected,select]=useState(()=>engine.bodies.find(b=>b.id===restoredObservation?.selected)?.id??engine.bodies[0]?.id??'')
  const [speed,setSpeed]=useState(1)
  const [trail,setTrail]=useState<'history'|'prediction'|'both'|'off'>(restoredView?.trail??'history')
  const [forecast,setForecast]=useState<Map<string,SpatialSample[]>>()
  const [comparison,setComparison]=useState<Map<string,SpatialSample[]>>()
  const [compare,setCompare]=useState(restoredObservation?.compare??false)
  const [trailWindow,setTrailWindow]=useState(restoredView?.trailWindow??(engine.stepSeconds>1?31557600:120))
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
  const [reference,setReference]=useState<'world'|'com'|'body'|'target'>(restoredObservation?.reference??'world')
  const [originMode,setOriginMode]=useState<'world'|'manual'|'body'>(restoredObservation?.originMode??'world')
  const [axisOrigin,setAxisOrigin]=useState<Vec3>(restoredObservation?.origin??[0,0,0])
  const [gizmoTarget,setGizmoTarget]=useState<'none'|'position'|'force'|'velocity'>('none')
  const [gridChoice,setGridChoice]=useState(restoredObservation?.showGrid)
  const [axesChoice,setAxesChoice]=useState(restoredObservation?.showAxes)
  const [gridOpacity,setGridOpacity]=useState(restoredObservation?.gridOpacity??.55)
  const [axisMode,setAxisMode]=useState<SpatialEditAxis>('xy')
  const [localAxes,setLocalAxes]=useState(false)
  const [free,setFree]=useState(false)
  const [command,setCommand]=useState<SpatialControl['kind']|'acceleration'>('force')
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
  const replay=engine.scene.celestial?.special==='mergerReplay'
  const visibleBodies=replay?engine.bodies.filter(b=>engine.visibleBody(b.id)):engine.bodies
  const body=visibleBodies.find(b=>b.id===selected)??(replay?visibleBodies[0]:undefined)
  const displayPositions=!paused&&astronomy&&!replay&&previousPositions.current
    ?new Map(visibleBodies.map(item=>{
      const previous=previousPositions.current?.get(item.id)
      return [item.id,previous?add(previous,multiply(subtract(item.position,previous),interpolation.current)):item.position]
    })):undefined
  const sourceOrbit=body?.celestial?.preset?referenceOrbit(body.celestial.preset):undefined
  const predictionRevision=paused?revision:0
  const totalMass=engine.bodies.reduce((sum,item)=>sum+item.mass,0)
  const center=totalMass?engine.bodies.reduce((sum,item)=>add(sum,multiply(item.position,item.mass/totalMass)),[0,0,0] as Vec3):undefined
  const following=reference==='com'?center:reference==='body'||reference==='target'?body&&(displayPositions?.get(body.id)??body.position):undefined
  const observation=following&&camera.mode!=='first'?{...camera,focus:reference==='target'?following:add(camera.focus,following)}:camera
  const coil=inductionMeasurements(engine.scene,engine.time)
  const special=engine.scene.celestial?.special
  const gizmo:SpatialGizmo|undefined=gizmoTarget==='none'||!paused||special?undefined:{target:gizmoTarget,axis:axisMode,local:localAxes,
    value:body&&gizmoTarget!=='position'?engine.pendingVector(body.id,gizmoTarget):undefined,
    commit:value=>gizmoTarget==='position'?edit({position:value}):control({kind:gizmoTarget,value})}

  function step() {
    try {engine.step();redraw(value=>value+1)}
    catch(e) {setError(e instanceof Error?e.message:String(e));setPaused(true)}
  }
  useEffect(()=>{
    if(!active||paused)return
    previousPositions.current=undefined
    interpolation.current=1
    const smooth=astronomy&&!replay
    const solver=smooth?{dt:engine.dt,step:()=>{
      previousPositions.current=new Map(engine.bodies.map(item=>[item.id,item.position]))
      return engine.step()
    }}:engine
    return runFixedSolver(solver,{speed,maxSteps:12,maxDelta:.1,updated:()=>{if(!smooth)redraw(value=>value+1)},
      render:smooth?ratio=>{interpolation.current=ratio;redraw(value=>value+1)}:undefined,stopped:()=>setPaused(true),failed:error=>{
      setError(error instanceof Error?error.message:String(error));setPaused(true)
    }})
  },[active,engine,paused,speed,astronomy,replay])
  useEffect(()=>{
    if(!active||replay||trail!=='both'&&trail!=='prediction'){setForecast(undefined);setComparison(undefined);return}
    const overlay=compare&&Boolean(engine.scene.celestial)&&!special
    if(!overlay)setComparison(undefined)
    let pending=false,alive=true
    function calculate() {
      if(pending)return
      function fallback() {
        try {setForecast(engine.prediction());if(overlay)setComparison(engine.prediction(120,true))}
        catch {setForecast(undefined);setComparison(undefined);setError('预测范围内出现数值不稳定。')}
      }
      try {
        pending=compute({kind:'prediction',snapshot:engine.capture(false),compare:overlay},reply=>{
          pending=false
          if(!alive)return
          if(reply.kind==='prediction'){setForecast(reply.forecast);setComparison(reply.comparison)}
          else fallback()
        })
        if(!pending)fallback()
      } catch {fallback()}
    }
    calculate()
    const timer=paused?undefined:setInterval(calculate,500)
    return ()=>{alive=false;clearInterval(timer)}
  },[active,engine,trail,paused,predictionRevision,compute,compare,special,replay])

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
      const state=engine.state()
      const saved=savedModels.find(model=>kind==='saved:'+model.id)
      const next=saved||celestialAssets.some(asset=>asset.id===kind)?insertAsset(state,saved??kind,selected):appendCelestial(state,kind,selected)
      keepAndShow(new SpatialPhysics(next))
      select(next.bodies.at(-1)!.id)
      setPanel('body')
      setCamera(sceneCamera(next))
    } catch(error) {setError(error instanceof Error?error.message:String(error))}
  }
  function loadTemplate(name:string) {
    const template=name==='solar'?solarSystem():name==='universe'?astronomicalUniverse():
      astronomy?phenomenonPreset(name)??(name.startsWith('source:')?sourceOrbitScene(name.slice(7)):undefined)??{...spatialPreset(name),celestial:astronomicalUniverse().celestial}:spatialPreset(name)
    replace(template)
    setCamera(sceneCamera(template))
    if(name==='mergerReplay')setSpeed(.25)
    if(astronomy)setTrailWindow((template.celestial?.secondsPerTick??0)>1?31557600:120)
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
      spatial:engine.capture(),view:{camera,trail,trailWindow,trailCount,vectors,...trace,analysis:analysisView,vectorView,
        observation:{selected,reference,originMode,origin:axisOrigin,gridOpacity,showGrid:gridChoice,showAxes:axesChoice,lensRays,compare}},
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
    const observation=view.observation
    if(observation?.selected&&next.bodies.some(b=>b.id===observation.selected))select(observation.selected)
    setReference(observation?.reference??'world');setOriginMode(observation?.originMode??'world')
    setAxisOrigin(observation?.origin??[0,0,0]);setGridOpacity(observation?.gridOpacity??.55)
    setGridChoice(observation?.showGrid);setAxesChoice(observation?.showAxes)
    setLensRays(observation?.lensRays??false);setCompare(observation?.compare??false)
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
  const latest=engine.contactEvents.at(-1)
  return <section className={astronomy?'spatial-workbench celestial-workbench':'spatial-workbench'} aria-label="三维实验工作台" data-domain="astrophysics">
    <header className="spatial-controls">
      {astronomy?<a className="button compact" href={appUrl('/lab?new=1&choose=1')}><ArrowLeft size={16}/> 实验方向</a>:
        <button className="button compact" onClick={()=>{setPaused(true);exit()}}><ArrowLeft size={16}/> 返回 2D</button>}
      <strong>{engine.scene.title}</strong>
      <button className="button compact primary" disabled={engine.modelEnded} onClick={()=>{setPaused(!paused);setGridChoice(undefined);setAxesChoice(undefined)}}>{paused?<Play size={15}/>:<Pause size={15}/>} {paused?'运行':'暂停'}</button>
      <button className="icon" title="三维单步" aria-label="三维单步" disabled={!paused||engine.modelEnded} onClick={step}><StepForward size={16}/></button>
      <button className="icon" title="重置三维实验" aria-label="重置三维实验" onClick={()=>replace(engine.scene)}><RotateCcw size={16}/></button>
      <button className="icon" aria-label="撤销三维编辑" title="撤销三维编辑" disabled={!edits.current.undo.length} onClick={()=>restoreEdit('undo')}><Undo2 size={16}/></button>
      <button className="icon" aria-label="重做三维编辑" title="重做三维编辑" disabled={!edits.current.redo.length} onClick={()=>restoreEdit('redo')}><Redo2 size={16}/></button>
      <label>速度 <select aria-label="三维播放速度" value={speed} onChange={e=>setSpeed(+e.target.value)}>{[.25,.5,1,2,4].map(value=><option key={value} value={value}>{value}×</option>)}</select></label>
      <button className="icon" aria-label="保存三维实验" title="保存三维实验" onClick={save}><Save size={16}/></button>
      <button type="button" className="button compact" onClick={()=>setPanel(panel==='settings'?'none':'settings')}>环境</button>
      <button type="button" className="button compact" onClick={()=>setPanel(panel==='body'?'none':'body')}>属性</button>
      <button type="button" className="button compact" onClick={()=>setPanel(panel==='data'?'none':'data')}>分析</button>
    </header>
    {error&&<p className="error-banner spatial-message" role="alert">{error}</p>}
    {message&&<p className="spatial-message" role="status">{message}</p>}
    {lifted.unsupported.length>0&&engine.bodies.length===0&&<p className="spatial-message">二维场景已保留。以下对象需要其他三维模型，当前空间从空白开始：{lifted.unsupported.join('、')}</p>}
    {engine.scene.source&&<p className="spatial-message">从二维 {engine.scene.source.time.toFixed(3)} s 的状态创建空间分支，各自计时。</p>}
    <div className="spatial-view stage-bezel">
      <SpatialCanvas {...{engine,select,forecast,comparison,vectors,revision,trailWindow,trailCount,fieldLines,potentialFaces,gizmo,vectorView}}
        selected={body?.id??selected}
        displayPositions={displayPositions}
        camera={observation} cameraDrag={cameraDrag} setCamera={(next,pan)=>{
          if(pan&&reference==='target'){setReference('world');setCamera(next);return}
          setCamera(following&&next.mode!=='first'?{...next,focus:subtract(next.focus,following)}:next)
        }}
        axisOrigin={originMode==='body'?body?.position??axisOrigin:originMode==='manual'?axisOrigin:[0,0,0]}
        showGrid={!astronomy||(gridChoice??paused)} showAxes={!astronomy||(axesChoice??paused)} gridOpacity={astronomy?gridOpacity:1} celestial={astronomy}
        lensRays={lensRays}
        focusBody={id=>{const target=engine.bodies.find(item=>item.id===id);if(target){setReference('world');setCamera({...camera,mode:'orbit',focus:target.position})}}}
        moveAxis={originMode==='manual'?setAxisOrigin:undefined}
        drawing={drawing?{plane:drawingPlane,offset:drawingOffset,commit:points=>{
          try {
            const geometry=spatialRibbon(points,.45,drawingPlane==='xy'?'z':drawingPlane==='yz'?'x':undefined)
            appendObject({...spatialObject('手绘空间轨道'),geometry,fixed:true,radius:meshRadius(geometry),position:[0,0,0]})
            setDrawing(false)
          } catch(error) {setError(error instanceof Error?error.message:String(error))}
        }}:undefined}
        showMagnetic={fields.magnetic} trailColor={trace.color} trailAlpha={trace.alpha} timeMarkers={trace.markers} history={trail==='history'||trail==='both'}/>
      <div className="spatial-camera">
        <select aria-label="三维画布拖动方式" title="空白处拖动，右键旋转，中键平移" value={cameraDrag} onChange={e=>setCameraDrag(e.target.value as SpatialCameraDrag)}>
          <option value="pan">拖动平移</option><option value="rotate">拖动旋转</option>
        </select>
        {astronomy&&<><button className="button compact" aria-pressed={gridChoice??paused} onClick={()=>setGridChoice(!(gridChoice??paused))}>坐标网格</button>
          <button className="button compact" aria-pressed={axesChoice??paused} onClick={()=>setAxesChoice(!(axesChoice??paused))}>坐标轴</button>
          {!replay&&body?.celestial?.kind==='blackHole'&&<button className="button compact" aria-pressed={lensRays}
            title="弱场教学截面。虚线表示无偏折光路，实线表示计算出的光路。" onClick={()=>setLensRays(!lensRays)}>弱场光线</button>}
          <button className="button compact" onClick={()=>{setReference('world');setCamera(sceneCamera(engine.state()))}}>全局观察</button></>}
        <select aria-label="三维坐标参考" value={originMode} onChange={e=>setOriginMode(e.target.value as typeof originMode)}>
          <option value="world">世界原点</option><option value="manual">拖动坐标原点</option><option value="body">坐标跟随选中物体</option>
        </select>
        <select aria-label="三维观察方式" value={camera.mode} onChange={e=>{
          const mode=e.target.value as SpatialCamera['mode']
          const next=changeSpatialView(observation,mode)
          setCamera(following&&next.mode!=='first'?{...next,focus:subtract(next.focus,following)}:next)
        }}><option value="orbit">轨道观察</option><option value="first">第一人称</option><option value="xy">XY 正交观察</option></select>
        <button className="icon" aria-label="聚焦三维物体" title="聚焦三维物体" disabled={!body} onClick={()=>{if(body){setReference('world');setCamera({...camera,mode:'orbit',focus:body.position})}}}><Focus size={17}/></button>
        <button className="icon" aria-label="重置三维视角" title="重置三维视角" onClick={()=>{setReference('world');setCamera(astronomy?sceneCamera(engine.state()):defaultSpatialCamera)}}><RotateCcw size={17}/></button>
        <button className="button compact" aria-label="放近三维视角" onClick={()=>setCamera(zoomSpatialCamera(camera,.8))}>＋</button>
        <button className="button compact" aria-label="拉远三维视角" onClick={()=>setCamera(zoomSpatialCamera(camera,1.25))}>－</button>
        {camera.mode==='first'&&<div className="spatial-movement" role="group" aria-label="第一人称移动">
          {([['w','前进','↑'],['a','左移','←'],['s','后退','↓'],['d','右移','→']] as const).map(([key,label,icon])=>
            <button className="button compact" key={key} aria-label={label} title={label} onClick={()=>setCamera(moveFirstPerson(camera,key))}>{icon}</button>)}
        </div>}
      </div>
      {panel!=='none'&&<aside className="spatial-properties" aria-label={panel==='settings'?'三维环境':panel==='model'?'空间自由建模':panel==='data'?'三维分析':'三维属性'}>
        {panel==='settings'?<>
          {engine.scene.celestial&&!special&&<fieldset className="spatial-intervention">
            <legend>天体积分</legend>
            <label>积分器<select value={engine.scene.celestial.integrator} onChange={e=>update({celestial:{...engine.scene.celestial!,integrator:e.target.value==='rk4'?'rk4':'verlet'}})}>
              <option value="verlet">Velocity Verlet</option><option value="rk4">RK4</option>
            </select></label>
            <DimensionField label="每步模拟时间 (s)" min={.0001} max={2e6} value={engine.stepSeconds} commit={secondsPerTick=>update({celestial:{...engine.scene.celestial!,secondsPerTick}})}/>
            <DimensionField label="最大积分子步 (s)" min={.0001} max={2e6} value={engine.scene.celestial.maxStep} commit={maxStep=>update({celestial:{...engine.scene.celestial!,maxStep}})}/>
            <DimensionField label="数值软化长度 (m)" min={.001} max={1e12} value={engine.scene.celestial.softening} commit={softening=>update({celestial:{...engine.scene.celestial!,softening}})}/>
            <label><input type="checkbox" checked={engine.scene.celestial.adaptive} onChange={e=>update({celestial:{...engine.scene.celestial!,adaptive:e.target.checked}})}/> 自动缩短近距离交会步长</label>
            <label>网格透明度<input type="range" min=".1" max="1" step=".05" value={gridOpacity} onChange={e=>setGridOpacity(+e.target.value)}/></label>
            <small>软化长度用于数值正则化。修改积分设置会从当前状态开始新的运行。</small>
          </fieldset>}
          {!special&&<VectorInput label={engine.scene.celestial?'自定义均匀引力场 (m/s²)':'重力加速度 (m/s²)'} value={engine.scene.gravity} commit={gravity=>update({gravity})}/>}
          {!engine.scene.celestial&&<>
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
          </>}
          {engine.scene.celestial&&!special&&<label><input type="checkbox" checked={engine.scene.collisions} onChange={e=>update({collisions:e.target.checked})}/> 球体碰撞</label>}
          {engine.scene.celestial&&engine.scene.collisions&&<label>碰撞模型<select value={engine.scene.celestial.contact??'bounce'} onChange={e=>update({celestial:{...engine.scene.celestial!,contact:e.target.value as 'bounce'|'merge'|'fragment'}})}>
            <option value="bounce">球体冲量与恢复系数</option><option value="merge">合并 · 体积相加</option><option value="fragment">三等质量碎片 · 教学模型</option>
          </select><small>破碎阈值由材料强度和均匀球引力束缚能估算。法向碰撞比能超过阈值时形成三块等质量碎片。</small></label>}
          <label>跟踪参考系<select value={reference} onChange={e=>{
            const next=e.target.value as typeof reference
            setReference(next)
            setCamera(current=>({...current,mode:next==='target'?'orbit':current.mode,focus:astronomy?[0,0,0]:defaultSpatialCamera.focus}))
          }}><option value="world">世界</option><option value="com">质心</option><option value="body">选中物体</option>{astronomy&&<option value="target">持续面向选中天体</option>}</select></label>
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
          {!engine.scene.celestial&&<small>{engine.usesRigidSolver?'Rapier 刚体、摩擦与连续碰撞检测。':'科学积分器与无摩擦球体接触。'} 四个内部子步，点源力以 0.01 m 软化。</small>}
          {coil&&<small>准静态均匀磁场模型。磁通量 {coil.flux.toPrecision(4)} Wb，感应电动势 {coil.emf.toPrecision(4)} V。</small>}
        </>:panel==='model'?<><label>手绘工作平面<select value={drawingPlane} onChange={e=>setDrawingPlane(e.target.value as typeof drawingPlane)}>
          <option value="xz">XZ</option><option value="xy">XY</option><option value="yz">YZ</option>
        </select></label><label>工作平面深度 (m)<input type="number" step="any" value={drawingOffset} onChange={e=>setDrawingOffset(+e.target.value)}/></label>
        <button className="button compact" aria-pressed={drawing} onClick={()=>{setPaused(true);setDrawing(!drawing)}}>{drawing?'退出路径绘制':'手绘空间路径'}</button>
        {drawing&&<small>在画布上按住拖动。请让工作平面朝向相机。</small>}
        <SpatialModelingPanel report={setError} create={(name,geometry,fixed)=>appendObject({
          ...spatialObject(name),geometry,fixed,radius:meshRadius(geometry),position:fixed?[0,0,0]:[0,3,0],
        })}/></>:panel==='data'?<>{engine.scene.celestial&&!special&&<><CelestialDiagnostics engine={engine} body={body}/><CelestialPhenomena key={body?.id} engine={engine} body={body}/></>}<SpatialData engine={engine} settings={analysisView} onSettings={setAnalysisView}/></>:<>
          <select aria-label="三维对象" value={body?.id??selected} onChange={e=>select(e.target.value)}><option value="">选择物体</option>{visibleBodies.map(item=><option value={item.id} key={item.id}>{item.name}</option>)}</select>
          {body&&special&&<p>{body.name} · {replay?'视界面积等效半径 '+(body.visualRadius??body.radius).toExponential(4)+' m':'质量 '+body.mass.toExponential(4)+' kg · 当前半径 '+body.radius.toExponential(4)+' m'}。此预设使用专用模型和限定的初始条件。</p>}
          {body&&!special&&<>
            <VectorInput label="位置 (m)" value={body.position} commit={position=>edit({position})}/>
            <VectorInput label="速度 (m/s)" value={engine.pendingVector(body.id,'velocity')??body.velocity} commit={velocity=>astronomy?control({kind:'velocity',value:velocity}):edit({velocity})}/>
            <VectorInput label="持续外力 (N)" value={engine.pendingVector(body.id,'force')??body.force} commit={force=>astronomy?control({kind:'force',value:force}):edit({force})}/>
            <VectorInput label="角速度 (rad/s)" value={body.angularVelocity} commit={angularVelocity=>edit({angularVelocity})}/>
            <VectorInput label="姿态欧拉角 (°)" value={angles} commit={value=>{
              const [x,y,z]=value.map(n=>n*Math.PI/360),[a,b,c]=[Math.sin(x),Math.sin(y),Math.sin(z)],[d,e,f]=[Math.cos(x),Math.cos(y),Math.cos(z)]
              setAngles(value);edit({orientation:[a*e*f-d*b*c,d*b*f+a*e*c,d*e*c-a*b*f,d*e*f+a*b*c]})
            }}/>
            <label>空间拖动<select value={gizmoTarget} onChange={e=>{if(e.target.value!=='none')setPaused(true);setGizmoTarget(e.target.value as typeof gizmoTarget)}}>
              <option value="none">关闭</option><option value="position">移动物体</option><option value="force">持续外力端点</option>{astronomy&&<option value="velocity">速度箭头端点</option>}</select></label>
            {gizmoTarget!=='none'&&<>
              <label>工作轴或平面<select value={axisMode} onChange={e=>setAxisMode(e.target.value as SpatialEditAxis)}>
                {(['x','y','z','xy','xz','yz'] as const).map(axis=><option key={axis} value={axis}>{axis.toUpperCase()}</option>)}
              </select></label>
              <label><input type="checkbox" checked={localAxes} onChange={e=>setLocalAxes(e.target.checked)}/> 使用物体局部坐标</label>
              <small>拖动粉色圆点。工作轴与视线重合时可转动视角或使用数值输入。</small>
            </>}
            {([['mass','质量 (kg)'],['radius','半径 (m)'],['charge','电荷 (C)'],['restitution','恢复系数'],['friction','摩擦系数']] as const)
              .filter(([field])=>(field!=='radius'||!body.geometry&&body.celestial?.kind!=='blackHole')&&(!astronomy||field!=='charge'&&field!=='friction')).map(([field,label])=><label key={field}>{label}<input type="number" step="any" key={body[field]} defaultValue={body[field]??.35} onBlur={e=>{
                const value=e.target.valueAsNumber
                if(!Number.isFinite(value)||value===body[field])return
                if(field!=='mass'){edit({[field]:value});return}
                const radius=body.celestial?.kind==='blackHole'?kerrHorizon(value,body.celestial.spin)
                  :body.densityLocked?radiusForDensity(value,densityOf(body.mass,body.radius)):body.radius
                edit({mass:value,radius})
              }}/></label>)}
            {astronomy&&body.celestial&&<fieldset className="spatial-intervention">
              <legend>天体模型</legend>
              <label>名称<input key={body.id+body.name} defaultValue={body.name} maxLength={80} onBlur={e=>{if(e.target.value.trim()&&e.target.value.trim()!==body.name)edit({name:e.target.value.trim()})}}/></label>
              <label>表面颜色<input type="color" value={body.celestial.color} onChange={e=>edit({celestial:{...body.celestial!,color:e.target.value}})}/></label>
              {body.celestial.kind!=='blackHole'&&<label>表面材质<select value={body.celestial.kind} onChange={e=>edit({celestial:{...body.celestial!,preset:undefined,kind:e.target.value as NonNullable<SpatialBody['celestial']>['kind']}})}>
                <option value="rock">岩质</option><option value="gas">气态条带</option><option value="ice">冰质云带</option><option value="star">恒星发光</option><option value="comet">彗核</option>
              </select></label>}
              {body.celestial.kind!=='blackHole'&&<DimensionField label="有符号自转周期 (s)" min={-1e12} max={1e12} value={body.celestial.rotationPeriod??0} commit={period=>edit({
                angularVelocity:[0,period?2*Math.PI/period:0,0],celestial:{...body.celestial!,rotationPeriod:period||undefined},
              })}/>}
              {body.celestial.kind!=='blackHole'&&engine.scene.collisions&&<DimensionField label="材料破碎强度 (J/kg)" min={0} max={1e9}
                value={body.disruptionStrength??(body.celestial.kind==='ice'?5e4:body.celestial.kind==='comet'?1e3:1e5)}
                commit={disruptionStrength=>edit({disruptionStrength})}/>}
              <label><input type="checkbox" checked={body.physicsEnabled!==false} onChange={e=>edit({physicsEnabled:e.target.checked})}/> 参与天体物理计算</label>
              <label><input type="checkbox" checked={body.collisionEnabled!==false} onChange={e=>edit({collisionEnabled:e.target.checked})}/> 参与碰撞</label>
              {engine.scene.title==='太阳系 · J2000'&&<small>初值来自 JPL 近似轨道要素。地球轨道使用地月质心近似，画布上的天体按显示半径放大。</small>}
              {sourceOrbit&&<details>
                <summary>参考轨道与数据来源</summary>
                <p>参考状态 {sourceOrbit.epoch} · 半长轴 {sourceOrbit.axis.toPrecision(6)} AU · 偏心率 {sourceOrbit.e.toPrecision(6)} · 倾角 {sourceOrbit.inclination.toPrecision(6)}°</p>
                <p>载入参考轨道会创建独立的日心双体预设，可用撤销回到当前实验。<a href={sourceOrbit.url} target="_blank" rel="noreferrer">查看 JPL 数据</a></p>
                <button className="button compact" onClick={()=>loadTemplate('source:'+body.celestial?.preset)}>载入参考轨道</button>
              </details>}
              {body.celestial.kind==='blackHole'
                ?<>
                  <DimensionField label="无量纲自旋 χ" min={-.998} max={.998} value={body.celestial.spin??0} commit={spin=>edit({
                    radius:kerrHorizon(body.mass,spin),celestial:{...body.celestial!,spin},
                  })}/>
                  <DimensionField label="吸积盘外缘 / 最内稳定圆轨道" min={1.2} max={12} value={body.celestial.diskExtent??2.4} commit={diskExtent=>edit({celestial:{...body.celestial!,diskExtent}})}/>
                  <small>外视界 {body.radius.toExponential(4)} m · 最内稳定圆轨道 {kerrDisk(body.mass,body.celestial.spin).isco.toExponential(4)} m。自旋用于克尔几何和吸积盘内缘，天体引力采用牛顿外场近似。</small>
                </>
                :<>
                  <label>修改质量时保留<select value={body.densityLocked?'density':'radius'} onChange={e=>edit({densityLocked:e.target.value==='density'})}>
                    <option value="radius">半径</option><option value="density">密度</option>
                  </select></label>
                  <DimensionField label="密度 (kg/m³，保持质量并调整半径)" min={1e-8} value={densityOf(body.mass,body.radius)} commit={density=>edit({radius:radiusForDensity(body.mass,density)})}/>
                </>}
            </fieldset>}
            {astronomy&&<button className="button compact" onClick={()=>{
              try {setSavedModels(storeCelestialModel(body,savedModels));setMessage('已加入我的天体模型。')}
              catch(error){setError(error instanceof Error?error.message:String(error))}
            }}>保存到我的天体模型</button>}
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
            {!astronomy&&<><label>弹簧连接端点<select value={springTarget} onChange={e=>setSpringTarget(e.target.value)}>
              <option value="">选择另一个物体</option>{engine.bodies.filter(item=>item.id!==body.id&&!(body.fixed&&item.fixed)).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
            </select></label>
            <button className="button compact" disabled={!engine.bodies.some(item=>item.id===springTarget&&item.id!==selected&&!(item.fixed&&body.fixed))} onClick={()=>{
              const target=engine.bodies.find(item=>item.id===springTarget)
              if(!target)return
              const restLength=Math.max(.001,Math.hypot(...target.position.map((value,i)=>value-body.position[i])))
              update({springs:[...(engine.scene.springs??[]),{id:crypto.randomUUID(),a:body.id,b:target.id,restLength,stiffness:1,damping:0}]})
            }}>添加弹簧</button></>}
            <button className="button compact" onClick={()=>update({bodies:engine.state().bodies.filter(item=>item.id!==selected),
              springs:engine.scene.springs?.filter(spring=>spring.a!==selected&&spring.b!==selected),
              pivots:engine.scene.pivots?.filter(joint=>joint.a!==selected&&joint.b!==selected)})}>删除选中物体</button>
            <small>这些属性创建新的初始状态。下方运行干预会保留时间和轨迹。</small>
            {!body.fixed&&<fieldset className="spatial-intervention">
              <legend>运行干预</legend>
              <label>物理模式<select value={free?'free':'strict'} onChange={e=>{
                const enabled=e.target.value==='free';setFree(enabled);if(!enabled&&(command==='velocity'||command==='acceleration'))setCommand('force')
              }}><option value="strict">严格物理</option><option value="free">自由干预</option></select></label>
              <label>输入类型<select value={command} onChange={e=>setCommand(e.target.value as typeof command)}>
                <option value="force">持续外力 (N)</option><option value="timed">定时外力 (N)</option>
                <option value="impulse">瞬时冲量 (N·s)</option>{free&&<option value="velocity">覆盖速度 (m/s)</option>}
                {free&&astronomy&&<option value="acceleration">额外加速度 (m/s²)</option>}
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
                if(command==='acceleration')control({kind:'force',value:multiply(value,body.mass)})
                else control(command==='timed'?{kind:command,value,steps:Math.ceil(duration/engine.stepSeconds)}:{kind:command,value})
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
    <div className="spatial-status"><time aria-label="三维模拟时间">{engine.time.toFixed(special==='ringdown'||replay?6:3)} s</time>{body&&<output aria-label="三维观测状态">{body.name}{!replay&&' · '+length(body.velocity).toFixed(2)+' m/s'}{originMode==='body'&&' · XYZ '+body.position.map(value=>value.toPrecision(3)).join(', ')+' m'}</output>}<span>{engine.scene.celestial?'三维 · 每步 '+engine.stepSeconds.toPrecision(3)+' 模拟秒':'三维 · 固定步长 60 Hz · 采样 15 Hz'}</span></div>
    {special&&<SpecialModelStatus key={special} engine={engine} loadScene={loadTemplate}/>}
    {latest&&<details className="celestial-contacts">
      <summary>碰撞记录 · {engine.contactEvents.length} 次 · 最近 {latest.time.toPrecision(4)} s</summary>
      {[...engine.contactEvents.slice(-20)].reverse().map((event,i)=><p key={engine.contactEvents.length-i}>
        {event.time.toPrecision(5)} s · {event.names.join(' / ')} · {({bounce:'碰撞',merge:'合并',fragment:'破碎'})[event.kind]} · 总质量 {event.mass.toPrecision(5)} kg · 平动动能损失 {event.kineticLoss.toPrecision(5)} J
        <br/>碰撞前速度 {event.before.map(v=>'('+v.map(n=>n.toPrecision(3)).join(', ')+')').join(' / ')} m/s
        <br/>碰撞后速度 {event.after.map(v=>'('+v.map(n=>n.toPrecision(3)).join(', ')+')').join(' / ')} m/s
        {event.disruptionThreshold!==undefined&&<><br/>碰撞比能 {event.impactSpecificEnergy?.toPrecision(4)} J/kg · 破碎阈值 {event.disruptionThreshold.toPrecision(4)} J/kg</>}
      </p>)}
    </details>}
    <footer className="spatial-controls">
      {astronomy?<select aria-label="添加天体模型" disabled={Boolean(special)} value="" onChange={e=>{if(e.target.value)addCelestial(e.target.value)}}>
        <option value="">添加天体</option>{[...celestialUnits,...celestialAssets].map(unit=><option key={unit.id} value={unit.id}>{unit.name}</option>)}
        {savedModels.length>0&&<optgroup label="我的天体模型">{savedModels.map(model=><option key={model.id} value={'saved:'+model.id}>{model.name}</option>)}</optgroup>}
      </select>:<>
      <button className="button compact" onClick={()=>create('sphere')}><Plus size={16}/> 球体</button>
      <select aria-label="添加空间几何体" value="" onChange={e=>{if(e.target.value)create(e.target.value)}}>
        <option value="">添加几何体</option><option value="cube">立方体</option><option value="box">长方体</option><option value="cylinder">圆柱体</option>
        <option value="cone">圆锥体</option><option value="plane">平面</option><option value="ramp">斜面</option><option value="charge">点电荷</option><option value="planet">天体</option>
      </select>
      {astronomy&&savedModels.length>0&&<details className="celestial-library">
        <summary>我的天体模型</summary>
        <select aria-label="管理已保存的天体模型" value={chosenModel} onChange={e=>setChosenModel(e.target.value)}>
          <option value="">选择模型</option>{savedModels.map(model=><option key={model.id} value={model.id}>{model.name}</option>)}
        </select>
        <button className="button compact" disabled={!chosenModel} onClick={()=>{
          try {
            const next=savedModels.filter(model=>model.id!==chosenModel)
            writeCelestialModels(next);setSavedModels(next);setChosenModel('');setMessage('已移除保存的模型。')
          } catch {setError('无法修改天体模型库。')}
        }}>移除已选模型</button>
      </details>}
      <button className="button compact" onClick={()=>setPanel(panel==='model'?'none':'model')}>建模</button>
      </>}
      <select aria-label="加载三维模板" value="" onChange={e=>{
        if(e.target.value)loadTemplate(e.target.value)
      }}>
        <option value="">加载模板</option>{astronomy&&<><option value="universe">空白宇宙</option><option value="solar">太阳系 · J2000</option>
          <option value="binary">双星系统</option><option value="impact">行星碰撞</option>
          <option value="tidalCapture">引力捕获 · 三体交换</option><option value="capture">引力捕获 · 人工耗能</option>
          <option value="accretion">黑洞与周围天体</option><option value="blackholes">双黑洞系统 · 牛顿对照</option>
          <option value="binaryPN">双黑洞 · 1PN 圆轨道</option><option value="mergerReplay">双黑洞合并 · SXS 数值回放</option><option value="ringdown">双黑洞合并残骸 · 振铃</option><option value="collapse">均匀无压球坍缩</option>
        </>}{!astronomy&&<><option value="fall">空间自由落体</option><option value="throw">空间抛体</option><option value="spring">空间弹簧振子</option>
        <option value="rigid">空间刚体接触</option><option value="pendulum">球铰空间摆</option><option value="double">空间双摆</option>
        <option value="incline">空间斜面</option><option value="surface">空间曲线轨道</option>
        <option value="helix">均匀磁场螺旋</option>
        <option value="electric">空间偶极子</option><option value="induction">空间电磁感应</option>
        </>}<option value="orbit">倾斜双体轨道</option>
        <option value="three">空间三体</option><option value="escape">空间逃逸</option><option value="assist">空间引力飞掠</option>
      </select>
      <select aria-label="三维轨迹" value={trail} onChange={e=>setTrail(e.target.value as typeof trail)}>
        <option value="off">隐藏轨迹</option><option value="history">历史轨迹</option><option value="prediction">{engine.scene.celestial?'预测 120 步':'预测 2 s'}</option><option value="both">{engine.scene.celestial?'历史与预测 120 步':'历史与预测 2 s'}</option>
      </select>
      {engine.scene.celestial&&!special&&(trail==='prediction'||trail==='both')&&<label title="混沌系统中，预测对初始条件和积分误差敏感。">
        <input type="checkbox" checked={compare} onChange={e=>setCompare(e.target.checked)}/> 对照积分器（蓝线）
      </label>}
      {['history','both'].includes(trail)&&<label>历史区间 <select value={trailWindow} onChange={e=>setTrailWindow(+e.target.value)}>
        {(engine.scene.celestial?[5,15,30,60,120,86400,2592000,31557600]:[5,15,30,60,120]).map(seconds=><option key={seconds} value={seconds}>{seconds>=86400?seconds/86400+' 天':seconds+' s'}</option>)}
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

function SpecialModelStatus({engine,loadScene}:{engine:SpatialPhysics;loadScene:(id:string)=>void}) {
  const [wave,setWave]=useState(false)
  const reading=engine.modelReading
  if(!reading)return null
  const value=(n:number)=>n.toPrecision(4)
  return <details className="celestial-contacts" open>
    <summary>模型读数 · {engine.modelEnded?'已到达计算边界':'演化中可实时观察'}</summary>
    {reading.kind==='binaryPN'?<>
      <p>间距 {value(reading.radius)} m · 引力波频率 {value(reading.frequency)} Hz · 辐射功率 {value(reading.power)} W · 累计辐射能量 {value(reading.radiatedEnergy)} J</p>
      <p>角频率包含谐和坐标下的 1PN 修正，轨道收缩采用最低阶四极辐射。预设在 20 GM/c² 停止。</p>
      <label><input type="checkbox" checked={wave} onChange={e=>setWave(e.target.checked)}/> 显示引力波波形</label>
      {wave&&<BinaryWave engine={engine} frequency={reading.frequency}/>}
      {engine.modelEnded&&<button className="button compact" onClick={()=>loadScene('mergerReplay')}>查看同质量系统的合并回放</button>}
    </>:reading.kind==='collapse'
      ?<p>半径 {value(reading.radius)} m · 密度 {value(reading.density)} kg/m³ · 势能 {value(reading.potential)} J · 表面内落速率 {value(reading.surfaceSpeed)} m/s。初始球体均匀、静止且无压，计算在强场之前停止。</p>
      :reading.kind==='mergerReplay'?<>
        <p>{reading.common?'已形成共同视界':'两个独立视界'} · SXS 数值坐标时间 {reading.sourceTime.toFixed(2)} M</p>
        <p>使用数值相对论的视界中心和面积等效半径。球形标记表示面积尺度，真实视界形状可偏离球形。<a href={sxsMerger.source} target="_blank" rel="noreferrer">SXS:BBH:0180 · CC BY 4.0</a></p>
        {reading.common&&<button className="button compact" onClick={()=>loadScene('ringdown')}>打开合并残骸的振铃实验</button>}
      </>:<>
        <p>残骸质量 {value(engine.bodies[0].mass)} kg · 自旋 χ {value(reading.spin)} · 振铃频率 {value(reading.frequency)} Hz · 衰减时间 {value(reading.tau)} s</p>
        <p>等质量、初始无自旋双黑洞的数值相对论标定。约 4.838% 的初始总质量以引力波能量辐射。时间从振铃起点计，显示主模的相对应变。</p>
        <svg className="celestial-figure" viewBox="0 0 300 70" role="img" aria-label="计算的黑洞振铃波形">
          <path d="M0 35H300" stroke="#63718b"/>
          <polyline points={Array.from({length:100},(_,i)=>{
            const sample=engine.modelReadingAt(engine.time*i/99)
            return [i*300/99,35-29*(sample?.kind==='ringdown'?sample.wave:0)].join(',')
          }).join(' ')} fill="none" stroke="#a5dcff"/>
        </svg>
      </>}
  </details>
}

function BinaryWave({engine,frequency}:{engine:SpatialPhysics;frequency:number}) {
  const [a,b]=engine.bodies
  const duration=Math.min(engine.time,4/frequency)
  if(duration===0)return <p>运行或单步后显示波形。</p>
  const strains=Array.from({length:120},(_,i)=>{
    const reading=engine.modelReadingAt(engine.time-duration+duration*i/119)
    return reading?.kind==='binaryPN'?binaryStrain(a.mass,b.mass,reading.radius,reading.phase,3.085677581e22):0
  })
  const amplitude=Math.max(...strains.map(Math.abs))
  const points=strains.map((strain,i)=>[i*300/119,35-29*strain/amplitude].join(',')).join(' ')
  return <figure>
    <svg className="celestial-figure" viewBox="0 0 300 70" role="img" aria-label="计算的引力波加号偏振应变">
      <path d="M0 35H300" stroke="#63718b"/>
      <polyline points={points} fill="none" stroke="#a5dcff" strokeWidth="1.5"/>
    </svg>
    <figcaption>距离 1 Mpc，沿轨道轴观察。最近 {duration.toPrecision(3)} s，纵轴 ±{amplitude.toExponential(2)} 应变。</figcaption>
  </figure>
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
    markers={engine.interventions.map(event=>event.tick*engine.stepSeconds)}
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
