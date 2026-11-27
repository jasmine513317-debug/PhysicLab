import { useEffect, useId, useMemo, useState, type ReactNode } from 'react'
import { Download, Minus, Pause, Play, Plus, RotateCcw, Save, StepForward, Trash2, Undo2, Redo2 } from 'lucide-react'
import { astronomySchema, AU_KM, SOLAR_MASS_KG, EARTH_MASS_KG, MOON_MASS_KG, MAX_CELESTIAL_BODIES, MIN_ORBIT_AXIS_AU, MAX_ORBIT_AXIS_AU, astronomyTemplates, planetCatalog, createAstronomyExperiment, createCelestialBody, createPlanetBody, orbitingBody, orbitalPrimary, KM_PER_SECOND_PER_AU_PER_YEAR, METERS_PER_SECOND_SQUARED_PER_AU_PER_YEAR_SQUARED, SOLAR_GRAVITY, type AstronomyExperiment, type CelestialBody } from './astronomy'
import { centerOfMass, escapeThreshold, orbitCsv, TwoBodyOrbit, verifyKeplerThird, withEscapeSpeed } from './orbital-physics'
import { AstronomySystem, bodyAcceleration, orbitBodies } from './astronomy-system'
import { localAnchor, OrbitCanvas, type AstronomyViewMode } from './OrbitCanvas'
import { loadAstronomy, saveAstronomy } from './repository'
import { appUrl } from './routes'
import { downloadText } from './download'
import { extendedTemplates, extensionUrl } from './extended-experiments'
import { ExperimentData } from './ExperimentData'
import { formatNumber } from './numberFormat'
import { runSimulationFrames } from './simulation'
import './astronomy.css'

const layerLabels={reference:'理论轨道',trails:'运行轨迹',center:'质心与间距',velocity:'速度与引力矢量',apsides:'近心点与远心点',sweeps:'扫过面积'} as const
const names={star:'恒星',planet:'行星',satellite:'卫星'} as const

function format(value:number|undefined,digits=4) {
  if(value===undefined)return '—'
  return value!==0&&(Math.abs(value)<.001||Math.abs(value)>=1e6)?value.toExponential(3):String(Number(value.toFixed(digits)))
}

function Disclosure({title,children}:{title:string;children:ReactNode}) {
  return <details className="astronomy-disclosure"><summary>{title}</summary><div className="astronomy-disclosure-body">{children}</div></details>
}

function Numeric({label,unit,value,min,max,change,hint}:{label:string;unit:string;value:number;min:number;max:number;change:(value:number)=>void;hint?:string}) {
  const key=useId()
  const [invalid,setInvalid]=useState(false)
  return <div className="astronomy-field"><label htmlFor={key}>{label} <small>{unit}</small></label>
    <input id={key} key={value} type="number" step="any" min={min} max={max} defaultValue={formatNumber(value)}
      aria-invalid={invalid} aria-describedby={invalid?key+'-error':undefined} onChange={()=>setInvalid(false)}
      onKeyDown={event=>{if(event.key==='Enter')event.currentTarget.blur()}}
      onBlur={event=>{
        const next=event.currentTarget.valueAsNumber
        if(!Number.isFinite(next)||next<min||next>max){setInvalid(true);return}
        if(next!==Number(formatNumber(value)))change(next)
      }} />
    {invalid&&<small id={key+'-error'} className="astronomy-field-error">请输入 {min} 至 {max} {unit}。</small>}
    {hint&&<small className="muted">{hint}</small>}
  </div>
}

function OrbitAnalysis({orbit}:{orbit:TwoBodyOrbit}) {
  const [variables,setVariables]=useState(false)
  const [comparison,setComparison]=useState<ReturnType<typeof verifyKeplerThird>>()
  const [error,setError]=useState('')
  const elements=orbit.elements
  const ratio=orbit.bodies[0].mass/(orbit.bodies[0].mass+orbit.bodies[1].mass)
  const first=orbit.firstSweep?.area, last=orbit.firstSweep!==orbit.lastSweep?orbit.lastSweep?.area:undefined
  const elapsed=orbit.current.time>0
  const measured=orbit.measuredPeriod!==undefined
  const measuredAxis=measured?(orbit.minimumDistance+orbit.maximumDistance)/2:undefined
  const measuredEccentricity=measured?(orbit.maximumDistance-orbit.minimumDistance)/(orbit.maximumDistance+orbit.minimumDistance):undefined
  return <section className="astronomy-analysis" aria-label="轨道分析">
    <h2>轨道分析</h2>
    <button className="button compact" onClick={()=>setVariables(!variables)} aria-expanded={variables}>变量分析</button>
    {variables&&<ExperimentData title="双体轨道" variables={[
      ['time','模拟时间','年'],['radius','相对距离','AU'],['speed','相对速率','AU/年'],
      ['energy','轨道能量','M☉·AU²/年²'],['energyError','能量漂移','M☉·AU²/年²','误差'],
      ['angular','轨道角动量','M☉·AU²/年'],['angularError','角动量漂移','M☉·AU²/年','误差'],
    ]} subjects={[{id:'orbit',name:'双体系统',rows:orbit.history.map(sample=>({
      time:sample.time,radius:Math.hypot(sample.relative.x,sample.relative.y),speed:Math.hypot(sample.velocity.x,sample.velocity.y),
      energy:sample.energy,angular:sample.angularMomentum,energyError:sample.energy-orbit.initial.energy,
      angularError:sample.angularMomentum-orbit.initial.angularMomentum,
    }))}]}/>}
    <p className="muted">轨道要素使用双体间的相对位置。实测值来自积分轨迹。</p>
    <div className="astronomy-table-wrap">
      <table><thead><tr><th>轨道要素</th><th>理论值</th><th>实测值</th></tr></thead>
        <tbody>
          <tr><th>半长轴（AU）</th><td>{format(elements?.axis)}</td><td>{format(measuredAxis)}</td></tr>
          <tr><th>偏心率</th><td>{format(elements?.eccentricity)}</td><td>{format(measuredEccentricity)}</td></tr>
          <tr><th>近心距（AU）</th><td>{format(elements?.periapsis)}</td><td>{format(elapsed?orbit.minimumDistance:undefined)}</td></tr>
          <tr><th>远心距（AU）</th><td>{format(elements?.apoapsis)}</td><td>{format(measured?orbit.maximumDistance:undefined)}</td></tr>
          <tr><th>周期（年）</th><td>{format(elements?.period,6)}</td><td>{format(orbit.measuredPeriod,6)}</td></tr>
        </tbody>
      </table>
    </div>
    <section className="astronomy-law" aria-label="等时扫过面积">
      <h3>等时扫过面积</h3>
      <p className="muted">第二个天体绕质心，每段 {(orbit.sweepSteps*orbit.dt).toPrecision(4)} 年。打开「扫过面积」可在画布查看扇形。</p>
      <dl className="astronomy-metrics">
        <div><dt>首段</dt><dd>{format(first===undefined?undefined:first*ratio**2)} AU²</dd></div>
        <div><dt>最近一段</dt><dd>{format(last===undefined?undefined:last*ratio**2)} AU²</dd></div>
        <div><dt>相对差</dt><dd>{format(first&&last!==undefined?Math.abs(last/first-1)*100:undefined)} %</dd></div>
      </dl>
    </section>
    <section className="astronomy-law" aria-label="开普勒第三定律">
      <h3>开普勒第三定律</h3>
      <button className="button compact" disabled={!elements?.axis} onClick={()=>{
        setError('')
        try {setComparison(verifyKeplerThird(orbit))}
        catch(failure){setComparison(undefined);setError(failure instanceof Error?failure.message:'无法完成周期对比。')}
      }}>验证开普勒第三定律</button>
      {error&&<p role="alert" className="error-banner">{error}</p>}
      {comparison&&<><p className="muted">质量与偏心率固定。理论 T²/a³ 为 {format(4*Math.PI**2/orbit.mu,6)} 年²/AU³。</p>
        <div className="astronomy-table-wrap"><table><thead><tr><th>a（AU）</th><th>理论 T（年）</th><th>实测 T（年）</th><th>实测 T²/a³（年²/AU³）</th><th>周期误差</th></tr></thead>
          <tbody>{comparison.map(row=><tr key={row.axis}><td>{format(row.axis)}</td><td>{format(row.expected,6)}</td><td>{format(row.period,6)}</td><td>{format(row.ratio,6)}</td><td>{format(row.relativeError*100)} %</td></tr>)}</tbody>
        </table></div>
      </>}
    </section>
  </section>
}

export function AstronomyLab({search,active,updateSavedAddress}:{search:string;active:boolean;updateSavedAddress:(id:string)=>void}) {
  const [params]=useState(()=>new URLSearchParams(search))
  const id=params.get('id')
  const [initial,setInitial]=useState<AstronomyExperiment>()
  const [error,setError]=useState('')
  useEffect(()=>{
    let mounted=true
    if(id) void loadAstronomy(id).then(scene=>{if(mounted)setInitial(scene)}).catch(failure=>{
      if(mounted)setError(failure instanceof Error?failure.message:'无法读取天体实验。')
    })
    else setInitial(createAstronomyExperiment(params.has('new')?null:params.get('preset')??'ellipse'))
    return ()=>{mounted=false}
  },[id,params])
  if(!initial)return <main className="page-width library">{error?<p role="alert" className="error-banner">{error}</p>:<p className="muted">正在打开天体实验…</p>}</main>
  return <AstronomyEditor initial={initial} initiallySaved={Boolean(id)} active={active} updateSavedAddress={updateSavedAddress}/>
}

function AstronomyEditor({initial,initiallySaved,active,updateSavedAddress}:{initial:AstronomyExperiment;initiallySaved:boolean;active:boolean;updateSavedAddress:(id:string)=>void}) {
  const [scene,setScene]=useState(initial)
  const [saved,setSaved]=useState(initiallySaved?initial:undefined)
  const [selected,setSelected]=useState(initial.bodies[1]?.id??initial.bodies[0]?.id??'')
  const [saving,setSaving]=useState(false)
  const [saveError,setSaveError]=useState('')
  const [running,setRunning]=useState(false)
  const [speed,setSpeed]=useState(1)
  const [zoom,setZoom]=useState(1)
  const [viewMode,setViewMode]=useState<AstronomyViewMode>('overview')
  const [history,setHistory]=useState<{past:AstronomyExperiment[];future:AstronomyExperiment[]}>({past:[],future:[]})
  const [fitRevision,setFitRevision]=useState(0)
  const [followBackground,setFollowBackground]=useState(true)
  const [generation,reset]=useState(0)
  const [revision,redraw]=useState(0)
  const result=useMemo(()=>{
    if(scene.bodies.length!==2)return {error:'',orbit:undefined}
    try {return {error:'',orbit:new TwoBodyOrbit([scene.bodies[0],scene.bodies[1]])}}
    catch(failure){return {orbit:undefined,error:failure instanceof Error?failure.message:'无法计算轨道。'}}
  },[scene.bodies,generation])
  const systemResult=useMemo(()=>{
    if(scene.bodies.length<3)return {system:undefined,error:''}
    try{return {system:new AstronomySystem(scene.bodies),error:''}}
    catch(e){return {system:undefined,error:e instanceof Error?e.message:'无法计算多体轨道。'}}
  },[scene.bodies,generation])
  const system=systemResult.system
  const orbit=result.orbit
  const simulation=system??orbit
  const body=scene.bodies.find(candidate=>candidate.id===selected)
  const center=orbit?centerOfMass(orbit.bodies):undefined

  useEffect(()=>{
    if(!active) {if(running)setRunning(false);return}
    if(!running||!simulation)return
    let remaining=0,lastUI=0
    return runSimulationFrames((elapsed,now)=>{
      remaining+=elapsed*speed*simulation.playbackRate
      const started=performance.now()
      let count=0
      while(remaining>=simulation.dt && count<256 && performance.now()-started<7) {
        const before=system?.time??orbit!.current.time
        if(!simulation.step()){setRunning(false);redraw(value=>value+1);return false}
        remaining-=((system?.time??orbit!.current.time)-before)
        count++
      }
      remaining=Math.min(remaining,simulation.dt*256)
      if(count&&now-lastUI>=65){redraw(value=>value+1);lastUI=now}
    },.05)
  },[active,simulation,running,speed])

  const liveBodies=system?.bodies??(orbit?orbitBodies(orbit):scene.bodies)
  function commitScene(next:AstronomyExperiment) {
    setHistory(current=>({past:[...current.past,scene].slice(-50),future:[]}))
    setScene(next)
  }
  function restoreScene(next:AstronomyExperiment) {
    setRunning(false);reset(value=>value+1);setSaveError('');setScene(next)
    setSelected(current=>next.bodies.some(b=>b.id===current)?current:next.bodies.at(-1)?.id??'')
    setZoom(1);setViewMode('overview');setFitRevision(value=>value+1)
  }
  function undo() {
    const previous=history.past.at(-1)
    if(!previous)return
    setHistory({past:history.past.slice(0,-1),future:[scene,...history.future]})
    restoreScene(previous)
  }
  function redo() {
    const next=history.future[0]
    if(!next)return
    setHistory({past:[...history.past,scene],future:history.future.slice(1)})
    restoreScene(next)
  }
  function fitView(mode:AstronomyViewMode='overview') {
    setZoom(1);setViewMode(mode);setFitRevision(value=>value+1)
  }
  function editBodies(bodies:CelestialBody[]) {
    try {
      astronomySchema.parse({...scene,bodies})
      if(bodies.length===2)new TwoBodyOrbit([bodies[0],bodies[1]])
      if(bodies.length>2)new AstronomySystem(bodies)
      setRunning(false);reset(value=>value+1)
      commitScene({...scene,bodies});setSaveError('')
      if(viewMode==='earth-moon'&&(!bodies.some(b=>b.name==='地球')||!bodies.some(b=>b.name==='月球')))fitView()
      return true
    } catch(e){setSaveError(e instanceof Error?e.message:'天体位置无效。');return false}
  }
  function changeBody(patch:Partial<CelestialBody>) {
    editBodies(liveBodies.map(item=>item.id===selected?{...item,...patch}:item))
  }
  function add(kind:CelestialBody['kind']) {
    if(scene.bodies.length>=MAX_CELESTIAL_BODIES)return
    const parent=kind==='satellite'?(liveBodies.find(b=>b.id===selected&&b.kind!=='star')??liveBodies.find(b=>b.kind==='planet'))
      :(liveBodies.find(b=>b.kind==='star')??liveBodies[0])
    const selectedPlanet=planetCatalog.findIndex(candidate=>candidate.name===liveBodies.find(body=>body.id===selected)?.name)
    const definition=kind==='planet'?(planetCatalog.slice(selectedPlanet+1).find(candidate=>!liveBodies.some(body=>body.name===candidate.name))??planetCatalog.find(candidate=>!liveBodies.some(body=>body.name===candidate.name))):undefined
    let newBody=definition?createPlanetBody(definition,parent?.position??{x:0,y:0}):createCelestialBody(kind,parent?.position??{x:0,y:0})
    const count=scene.bodies.filter(body=>body.kind===kind).length
    if(kind==='star'&&count) {newBody.name='伴星';newBody.mass=.8;newBody.radius*=.8}
    if(kind==='satellite'&&count)newBody.name='卫星 '+(count+1)
    if(kind==='planet'&&!definition)newBody.name='行星 '+(count+1)
    if(parent) {
      if(definition)newBody=orbitingBody(newBody,parent,definition.axis,definition.eccentricity,definition.phase)
      else if(kind==='satellite') {
        const moon=parent.name==='地球'&&count===0
        const radius=moon?.00257:Math.max(.00257*(count+1),parent.radius*6)
        newBody=orbitingBody(newBody,parent,radius,moon?.0549:0,.7)
      } else {
        const radius=Math.max(1,...liveBodies.map(body=>Math.hypot(body.position.x-parent.position.x,body.position.y-parent.position.y)*1.6))
        const speed=Math.sqrt(SOLAR_GRAVITY*(parent.mass+newBody.mass)/radius)
        newBody={...newBody,position:{x:parent.position.x+radius,y:parent.position.y},velocity:{x:parent.velocity.x,y:parent.velocity.y+speed}}
      }
    } else if(definition)newBody.position={x:definition.axis,y:0}
    if(editBodies([...liveBodies,newBody])){setSelected(newBody.id);fitView()}
  }
  function scaleOrbit(factor:number) {
    if(!orbit||!Number.isFinite(factor)||factor<=0)return
    const currentAxis=orbit.elements?.axis
    if(!currentAxis)return
    const axis=currentAxis*factor
    if(axis<MIN_ORBIT_AXIS_AU||axis>MAX_ORBIT_AXIS_AU){setSaveError(`轨道半长轴需在 ${MIN_ORBIT_AXIS_AU} 至 ${MAX_ORBIT_AXIS_AU} AU 之间。`);return}
    const pair=[liveBodies[0],liveBodies[1]] as [CelestialBody,CelestialBody]
    const origin=centerOfMass(pair),a=pair[0],b=pair[1],mass=a.mass+b.mass
    const cv={x:(a.mass*a.velocity.x+b.mass*b.velocity.x)/mass,y:(a.mass*a.velocity.y+b.mass*b.velocity.y)/mass}
    editBodies(pair.map(body=>({...body,
      position:{x:origin.x+(body.position.x-origin.x)*factor,y:origin.y+(body.position.y-origin.y)*factor},
      velocity:{x:cv.x+(body.velocity.x-cv.x)/Math.sqrt(factor),y:cv.y+(body.velocity.y-cv.y)/Math.sqrt(factor)}})))
  }
  function remove() {
    setRunning(false)
    if(editBodies(liveBodies.filter(item=>item.id!==selected))){setSelected('');fitView()}
  }
  async function save() {
    setSaving(true);setSaveError('')
    try {await saveAstronomy(scene);setSaved(scene);updateSavedAddress(scene.id)}
    catch(failure){setSaveError(failure instanceof Error?failure.message:'无法保存天体实验。')}
    finally {setSaving(false)}
  }

  const energyDrift=orbit&&orbit.initial.energy!==0?(orbit.current.energy-orbit.initial.energy)/Math.abs(orbit.initial.energy)*100:undefined
  const escapeSpeed=orbit?escapeThreshold(orbit):undefined
  const initialSpeed=orbit?Math.hypot(orbit.initial.velocity.x,orbit.initial.velocity.y):undefined
  const escapeRatio=initialSpeed!==undefined&&escapeSpeed!==undefined?initialSpeed/escapeSpeed:undefined
  const selectedLive=liveBodies.find(item=>item.id===selected)
  const viewAnchor=system?localAnchor(liveBodies,selected,viewMode):undefined
  const primaryBody=viewAnchor&&viewAnchor.id!==selected?viewAnchor:selectedLive?orbitalPrimary(selectedLive,liveBodies):undefined
  const separation=selectedLive&&primaryBody?Math.hypot(selectedLive.position.x-primaryBody.position.x,selectedLive.position.y-primaryBody.position.y):undefined
  const liveSpeed=selectedLive?Math.hypot(selectedLive.velocity.x-(viewAnchor?.velocity.x??0),selectedLive.velocity.y-(viewAnchor?.velocity.y??0))*KM_PER_SECOND_PER_AU_PER_YEAR:undefined
  const liveAcceleration=selectedLive?bodyAcceleration(selectedLive,liveBodies):undefined
  if(liveAcceleration&&viewAnchor) {
    const reference=bodyAcceleration(viewAnchor,liveBodies)
    liveAcceleration.x-=reference.x;liveAcceleration.y-=reference.y
  }
  const accelerationMagnitude=liveAcceleration?Math.hypot(liveAcceleration.x,liveAcceleration.y)*METERS_PER_SECOND_SQUARED_PER_AU_PER_YEAR_SQUARED:undefined
  const massReference=body?.kind==='star'?1:body?.kind==='satellite'?MOON_MASS_KG/SOLAR_MASS_KG:EARTH_MASS_KG/SOLAR_MASS_KG
  const massUnit=body?.kind==='star'?'太阳质量 M☉':body?.kind==='satellite'?'月球质量 M☾':'地球质量 M⊕'
  const modelLabel=system?'多体数值模型':orbit?'双体模型 · 开普勒理论':'等待至少两个天体'
  const earthMoon=scene.bodies.some(b=>b.name==='地球')&&scene.bodies.some(b=>b.name==='月球')
  const lesson=earthMoon?'先预测：月球绕地球一圈时，地球会走到哪里？运行后切换「地月近景」验证。'
    :initial.title==='开普勒定律'?'先预测：行星在近日点还是远日点更快？运行观察，再展开「开普勒定律与轨道数据」验证。'
    :initial.title==='逃逸速度'?'先预测：速度达到多少会逃逸？在「逃逸速度实验」中分别试用 0.8、1、1.2 倍逃逸速度。'
    :scene.bodies.length>3?'先预测：相同时间里，内侧与外侧行星谁转过的角度更大？运行并选择天体放大观察。'
    :scene.bodies.length<2?'先添加恒星，再添加行星，点击运行。暂停后只改变一个条件，比较轨迹。'
    :'先预测：速度沿切线而引力指向主天体，行星为什么会转弯？运行后暂停，拖动行星再试。'
  const explanation=earthMoon?'太阳同时吸引地球和月球；月球也与地球互相吸引。近景把地球作为观察原点，显示相对轨迹、速度和加速度，物理模拟本身没有改变。月球公转周期约 27.3 天。'
    :initial.title==='开普勒定律'?'在同一椭圆轨道上，行星靠近主天体时更快，远离时更慢；相同时间扫过的面积相等。固定总质量时，周期满足 T² ∝ a³。'
    :initial.title==='逃逸速度'?'双体相对速度小于逃逸速度时总能量为负；达到阈值为临界轨道，超过阈值则可逃逸。这里的阈值取决于当前质量和起始间距。'
    :scene.bodies.length>3?'在主恒星质量占优时，离恒星越远，绕转周期通常越长。全景使用相同的距离比例；内侧行星在全景里靠得很近，可以选中后放大。'
    :'引力持续改变速度，轨道由位置和初速度共同决定。只把行星拖远而保留速度，通常会改变轨道形状；「重置为圆轨道初速度」才会重新配速。'
  return <main className="astronomy-lab page-width">
    <header className="astronomy-heading"><div><h1>天体物理</h1><label className="astronomy-name">实验名称
      <input aria-label="天体实验名称" key={scene.title} defaultValue={scene.title} maxLength={100}
        onKeyDown={event=>{if(event.key==='Enter')event.currentTarget.blur()}} onBlur={event=>{
          const value=event.currentTarget.value.trim()
          event.currentTarget.value=value||scene.title
          if(value&&value!==scene.title)commitScene({...scene,title:value})
        }}/></label></div>
      <div className="astronomy-actions">
        <button className="button" onClick={()=>downloadText(scene.title,'json','application/json',JSON.stringify(scene,null,2))}><Download size={16}/> 导出场景 JSON</button>
        <button className="button primary" disabled={saving} onClick={()=>void save()}><Save size={16}/> {saving?'保存中…':saved===scene?'已保存':'保存实验'}</button>
      </div>
    </header>
    <nav className="astronomy-presets" aria-label="天体实验模板">
      {astronomyTemplates.map(template=><a key={template.id} className="button compact" href={appUrl('/lab?domain=astrophysics&preset='+template.id)}>{template.title}</a>)}
      {extendedTemplates.filter(template=>template.domain==='astrophysics').map(template=><a key={template.id} className="button compact" href={extensionUrl(template.id)}>{template.title}</a>)}
      <a className="button compact" href={appUrl('/lab?domain=astrophysics&new=1')}><Plus size={14}/> 空白天体实验</a>
    </nav>
    <section className="astronomy-guide" aria-label="观察任务">
      <div><strong>观察任务</strong><p>{lesson}</p><details><summary>理解这个现象</summary><p>{explanation}</p></details></div>
      {earthMoon&&<button className="button compact" onClick={()=>{setSelected(scene.bodies.find(b=>b.name==='月球')!.id);fitView('earth-moon')}}>观察地月近景</button>}
    </section>
    {saveError&&<p role="alert" className="error-banner">{saveError}</p>}
    <div className="astronomy-workbench">
      <div className="astronomy-main">
        <section className="astronomy-stage" aria-label="天体轨道视图">
          <div className="astronomy-model-strip" aria-label="模型与实时数据">
            <div className="astronomy-model-badges"><strong>{modelLabel}</strong><span>平面 · 牛顿引力</span><span>天体图标非真实比例</span></div>
            <dl className="astronomy-live-metrics">
              <div><dt>{selectedLive?.name??'未选择天体'} · {viewAnchor?'相对'+viewAnchor.name:'惯性系'}速率</dt><dd>{format(liveSpeed,2)} km/s</dd></div>
              <div><dt>与{primaryBody?.name??'主天体'}间距</dt><dd>{separation===undefined?'—':format(separation)+' AU'}</dd></div>
              <div><dt>{viewAnchor?'相对加速度':'合引力加速度'}</dt><dd>{accelerationMagnitude===undefined?'—':format(accelerationMagnitude,3)+' m/s²'}</dd></div>
            </dl>
          </div>
          <div className="astronomy-toolbar">
            <button className="button primary compact" disabled={!simulation||Boolean(simulation.stopped)} onClick={()=>setRunning(!running)}>{running?<Pause size={15}/>:<Play size={15}/>} {running?'暂停轨道':'运行轨道'}</button>
            <button className="icon framed" aria-label="单步推进" disabled={!simulation||Boolean(simulation.stopped)} onClick={()=>{
              setRunning(false);simulation?.step();redraw(value=>value+1)
            }}><StepForward size={17}/></button>
            <button className="button compact" aria-label="重置轨道" title="时间归零并恢复全景，保留已调整的参数" disabled={!simulation} onClick={()=>{setRunning(false);reset(value=>value+1);fitView()}}><RotateCcw size={16}/> 重置运行</button>
            <button className="button compact" aria-label="撤销调整" title="撤销上一步参数、位置或天体增删；最多回到本次打开时的状态" disabled={!history.past.length} onClick={undo}><Undo2 size={16}/> 撤销</button>
            <button className="button compact" aria-label="重做调整" title="恢复刚撤销的一步调整" disabled={!history.future.length} onClick={redo}><Redo2 size={16}/> 重做</button>
            <select aria-label="轨道播放速度" value={speed} onChange={event=>setSpeed(+event.target.value)}>{[.25,1,2,4,8].map(value=><option key={value} value={value}>{value}×</option>)}</select>
            <button className="button compact" aria-pressed={followBackground} onClick={()=>setFollowBackground(value=>!value)}>背景跟随{followBackground?'：开':'：关'}</button>
            <button className="button compact" disabled={!(system?.time??orbit?.current.time)} onClick={()=>{if(orbit)downloadText(scene.title+' · 轨道','csv','text/csv;charset=utf-8',orbitCsv(orbit));else if(system)downloadText(scene.title+' · 多体轨道','csv','text/csv;charset=utf-8',system.csv())}}><Download size={15}/> 导出轨道 CSV</button>
          </div>
          <div className="astronomy-view-controls">
            <label>观察视角 <select aria-label="观察视角" value={viewMode} onChange={event=>fitView(event.target.value as AstronomyViewMode)}>
              <option value="overview">系统全景</option><option value="follow" disabled={!selectedLive}>跟随选中天体</option>{earthMoon&&<option value="earth-moon">地月近景</option>}
            </select></label>
            <span>{running?'运行中 · 拖动天体会自动暂停':'已暂停 · 拖动天体改变位置；虚线可调整双体轨道'}</span>
          </div>
          <div className="astronomy-viewport">
            <OrbitCanvas scene={scene} orbit={orbit} selected={selected} setSelected={setSelected} zoom={zoom} revision={revision} liveBodies={liveBodies} system={system} editBodies={editBodies} scaleOrbit={scaleOrbit} pause={()=>setRunning(false)} followBackground={followBackground} running={running} active={active} fitRevision={fitRevision} viewMode={viewMode}/>
            {!simulation&&<p className="astronomy-canvas-note">{result.error||systemResult.error||'添加至少两个天体以运行轨道。'}</p>}
            <div className="astronomy-zoom" role="group" aria-label="轨道视图缩放">
              <button className="icon framed" aria-label="缩小轨道视图" title="缩小视图" disabled={zoom<=.05} onClick={()=>setZoom(value=>Math.max(.05,value/1.3))}><Minus size={17}/></button>
              <button className="icon framed" aria-label="放大轨道视图" title="放大当前视图；全景时聚焦选中天体" disabled={zoom>=10000} onClick={()=>setZoom(value=>Math.min(10000,value*1.3))}><Plus size={17}/></button>
              <button className="icon framed" aria-label="重置轨道视图" title="恢复系统全景" onClick={()=>fitView()}><RotateCcw size={16}/></button>
            </div>
          </div>
          <div className="astronomy-status"><span>模拟时间 <output aria-label="轨道模拟天数">{format((system?.time??orbit?.current.time??0)*365.25,1)} 天</output> · <output aria-label="轨道模拟时间">{format(system?.time??orbit?.current.time??0,6)} 年</output></span>
            {simulation&&<span title="目标播放速率；近距离相遇时可能因积分计算量降低">1 秒 ≈ {format(simulation.playbackRate*speed*365.25,1)} 天</span>}
            {simulation&&<details className="astronomy-status-details"><summary>积分信息</summary><span>积分步长 {format(simulation.dt,7)} 年</span><span>{system?'按最近距离动态缩小步长':'固定步长数值积分'}</span></details>}
          </div>
          {simulation?.stopped&&<p role="status" className="astronomy-stop">{simulation.stopped}</p>}
        </section>
        {system&&<section className="astronomy-analysis" aria-label="多体系统"><h2>多体系统 · {system.bodies.length} 个天体</h2><p>所有天体相互施加引力。新增天体采用绕主天体的局部轨道初速度，后续轨迹由相互引力决定，不再套用固定双体椭圆。</p>
          <Disclosure title="数值诊断"><dl className="astronomy-invariants">
            <div><dt>质心系总能量</dt><dd>{format(system.energy())} M☉·AU²/年²</dd></div>
            <div><dt>能量相对偏差</dt><dd>{format((system.energy()-system.initialEnergy)/Math.max(Math.abs(system.initialEnergy),1e-30)*100)} %</dd></div>
            <div><dt>总动量</dt><dd>({format(system.momentum().x)}, {format(system.momentum().y)}) M☉·AU/年</dd></div>
            <div><dt>总角动量</dt><dd>{format(system.angularMomentum())} M☉·AU²/年</dd></div>
          </dl></Disclosure>
        </section>}
        {orbit&&<Disclosure title="开普勒定律与轨道数据"><OrbitAnalysis key={generation} orbit={orbit}/></Disclosure>}
      </div>

      <aside className="astronomy-sidebar" aria-label="天体参数">
        <section><h2>天体 <small>{scene.bodies.length} / {MAX_CELESTIAL_BODIES}</small></h2>
          {scene.bodies.length<MAX_CELESTIAL_BODIES&&<div className="astronomy-add">{(['star','planet','satellite'] as const).map(kind=><button key={kind} className="button compact" onClick={()=>add(kind)}>添加{names[kind]}</button>)}</div>}
          {scene.bodies.length>0&&<label className="astronomy-field"><span>选择天体</span><select aria-label="选择天体" value={selected} onChange={event=>setSelected(event.target.value)}>
            <option value="">选择天体…</option>{scene.bodies.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
          </select></label>}
          {orbit?.elements?.axis&&<Numeric label="轨道半长轴" unit="AU" value={orbit.elements.axis} min={MIN_ORBIT_AXIS_AU} max={MAX_ORBIT_AXIS_AU} change={axis=>scaleOrbit(axis/orbit.elements!.axis!)} hint="同步缩放轨道与速度，保持轨道形状。"/>}
          {body&&<>
            <label className="astronomy-field"><span>天体名称</span><input aria-label="天体名称" key={body.id+body.name} defaultValue={body.name} maxLength={60}
              onBlur={e=>{const name=e.currentTarget.value.trim();if(name&&name!==body.name)changeBody({name})}}/></label>
            <Numeric label="质量" unit={massUnit} value={body.mass/massReference} min={1e-15/massReference} max={1000/massReference} change={value=>changeBody({mass:value*massReference})} hint={`折合 ${format(body.mass*SOLAR_MASS_KG)} kg。`}/>
            <Numeric label="半径" unit="km" value={body.radius*AU_KM} min={1e-10*AU_KM} max={100*AU_KM} change={value=>changeBody({radius:value/AU_KM})} hint="平均半径；接触判断使用真实半径，画布图标另行放大。"/>
            <Disclosure title="精确位置与速度"><div className="astronomy-pair">{(['x','y'] as const).map(axis=><Numeric key={axis} label={'初始 '+axis.toUpperCase()} unit="AU" value={body.position[axis]} min={-10000} max={10000}
              change={value=>changeBody({position:{...liveBodies.find(b=>b.id===body.id)!.position,[axis]:value}})}/>)}</div>
            <div className="astronomy-pair">{(['x','y'] as const).map(axis=><Numeric key={axis} label={'初速度 '+axis.toUpperCase()} unit="km/s" value={body.velocity[axis]*KM_PER_SECOND_PER_AU_PER_YEAR}
              min={-10000*KM_PER_SECOND_PER_AU_PER_YEAR} max={10000*KM_PER_SECOND_PER_AU_PER_YEAR} change={value=>changeBody({velocity:{...liveBodies.find(b=>b.id===body.id)!.velocity,[axis]:value/KM_PER_SECOND_PER_AU_PER_YEAR}})}/>)}</div></Disclosure>
            {liveBodies.length>1&&<button className="button compact" onClick={()=>{
              const target=liveBodies.find(b=>b.id===selected)!
              const primary=orbitalPrimary(target,liveBodies)!
              const dx=target.position.x-primary.position.x,dy=target.position.y-primary.position.y,r=Math.hypot(dx,dy)
              if(r<=primary.radius+target.radius){setSaveError('天体已经接触，请先增大间距。');return}
              const speed=Math.sqrt(SOLAR_GRAVITY*(primary.mass+target.mass)/r)
              changeBody({velocity:{x:primary.velocity.x-dy/r*speed,y:primary.velocity.y+dx/r*speed}})
            }}>重置为圆轨道初速度</button>}
            <button className="button compact" onClick={remove}><Trash2 size={15}/> 删除天体</button>
          </>}
        </section>
        <section><Disclosure title="绘图图层"><div className="astronomy-layers">{(Object.keys(layerLabels) as (keyof typeof layerLabels)[]).map(key=><label key={key}>
          <input type="checkbox" checked={scene.layers[key]} onChange={event=>{
            const checked=event.target.checked
            commitScene({...scene,layers:{...scene.layers,[key]:checked}})
          }}/>{layerLabels[key]}</label>)}</div></Disclosure></section>
        {orbit&&<section aria-label="守恒量"><Disclosure title="守恒量与数值误差">
          <dl className="astronomy-invariants">
            <div><dt>质心系能量</dt><dd>{format(orbit.current.energy)} M☉·AU²/年²</dd></div>
            <div><dt>相对能量偏差</dt><dd>{format(energyDrift)} %</dd></div>
            <div><dt>角动量</dt><dd>{format(orbit.current.angularMomentum)} M☉·AU²/年</dd></div>
            <div><dt>初始质心</dt><dd>({format(center?.x)}, {format(center?.y)}) AU</dd></div>
          </dl>
        </Disclosure></section>}
        {orbit&&escapeRatio!==undefined&&<section aria-label="逃逸速度"><Disclosure title="逃逸速度实验">
          <dl className="astronomy-invariants">
            <div><dt>初始间距</dt><dd>{format(Math.hypot(orbit.initial.relative.x,orbit.initial.relative.y))} AU</dd></div>
            <div><dt>初始相对速度</dt><dd>{format(initialSpeed!*KM_PER_SECOND_PER_AU_PER_YEAR)} km/s</dd></div>
            <div><dt>理论逃逸速度</dt><dd>{format(escapeSpeed!*KM_PER_SECOND_PER_AU_PER_YEAR)} km/s</dd></div>
            <div><dt>初始能量判据</dt><dd>{Math.abs(escapeRatio-1)<1e-9?'临界抛物线':escapeRatio<1?'束缚轨道':'逃逸轨道'}</dd></div>
          </dl>
          <div className="astronomy-add" role="group" aria-label="应用切向初速度">{[.8,1,1.2].map(factor=>
            <button key={factor} className="button compact" onClick={()=>{
              const bodies=withEscapeSpeed(orbit,factor)
              if(bodies.some(item=>Math.abs(item.velocity.x)>10000||Math.abs(item.velocity.y)>10000)){
                setSaveError('计算出的初速度超出输入范围。请降低质量或增大初始间距。');return
              }
              editBodies(bodies)
            }}>{factor}× 逃逸速度</button>)}</div>
          <p className="muted">快捷按钮沿初始间距的切线设置相对速度。</p>
        </Disclosure></section>}
        <section><Disclosure title="操作与单位说明"><p className="muted">拖动天体只改变位置，保留速度；拖动双体虚线或修改半长轴会同步调整速度，保持轨道形状。调整后从第 0 天重新计算，可用「撤销／重做」找回上一步。</p><p className="muted">「重置运行」保留当前参数、时间归零；右下角复位只恢复全景，不改变模拟时间。背景跟随会平滑移动网格与其他天体。</p><p className="muted">1 AU ≈ 1.496 亿 km；M☉ 为太阳质量，M⊕ 为地球质量，M☾ 为月球质量。近景保持真实间距比例，只放大图标；切换视角不改变模拟结果。多体跟随视图的轨迹、速度和加速度均相对被跟随天体。</p></Disclosure>
          <Disclosure title="模型假设、比例与数据来源"><p className="muted">采用平面牛顿万有引力。双体使用固定步长积分并显示开普勒理论椭圆；多体使用按最近距离缩小步长的 Velocity Verlet。达到真实半径之和时暂停，不模拟碰撞合并。</p><p className="muted">距离按统一比例绘制，天体图标单独放大。箭头长度经过视觉缩放，仅用于比较方向，不是统一力值比例；多体相对视图的粉色箭头为相对加速度。</p><p className="muted">太阳、地球、月球和八大行星采用近似真实质量、平均半径、半长轴与偏心率。太阳系模板的相位为教学示意，忽略轨道倾角，并非精密星历。开普勒与逃逸模板使用较大偏心率演示规律。1 AU ≈ 1.496 亿 km。<a href="https://nssdc.gsfc.nasa.gov/planetary/factsheet/" target="_blank" rel="noreferrer">NASA 天体参数</a> · <a href="https://science.nasa.gov/moon/top-moon-questions/" target="_blank" rel="noreferrer">NASA 月球运动解释</a></p><p className="muted">延伸探究：<a href="https://phet.colorado.edu/en/simulations/gravity-and-orbits" target="_blank" rel="noreferrer">PhET 引力与轨道</a>、<a href="https://phet.colorado.edu/en/simulations/my-solar-system" target="_blank" rel="noreferrer">PhET 我的太阳系</a>。</p></Disclosure>
        </section>
      </aside>
    </div>
  </main>
}
