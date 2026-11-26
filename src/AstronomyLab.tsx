import { useEffect, useId, useMemo, useState } from 'react'
import { runFixedSolver } from './simulation'
import { Download, Minus, Pause, Play, Plus, RotateCcw, Save, StepForward, Trash2 } from 'lucide-react'
import { astronomyTemplates, createAstronomyExperiment, createCelestialBody, KM_PER_SECOND_PER_AU_PER_YEAR, SOLAR_GRAVITY, type AstronomyExperiment, type CelestialBody } from './astronomy'
import { centerOfMass, escapeThreshold, orbitCsv, TwoBodyOrbit, verifyKeplerThird, withEscapeSpeed } from './orbital-physics'
import { OrbitCanvas } from './OrbitCanvas'
import { loadAstronomy, saveAstronomy } from './repository'
import { appUrl } from './routes'
import { downloadText } from './download'
import { extendedTemplates, extensionUrl } from './extended-experiments'
import { formatNumber } from './numberFormat'
import { ExperimentData } from './ExperimentData'
import './astronomy.css'

const layerLabels={reference:'理论轨道',trails:'运行轨迹',center:'质心',velocity:'速度矢量',apsides:'近心点与远心点',sweeps:'扫过面积'} as const
const names={star:'恒星',planet:'行星',satellite:'卫星'} as const

function format(value:number|undefined,digits=4) {
  if(value===undefined)return '—'
  return value!==0&&(Math.abs(value)<.001||Math.abs(value)>=1e6)?value.toExponential(3):String(Number(value.toFixed(digits)))
}

function Numeric({label,unit,value,min,max,change}:{label:string;unit:string;value:number;min:number;max:number;change:(value:number)=>void}) {
  const key=useId()
  const display=formatNumber(value)
  const [invalid,setInvalid]=useState(false)
  return <div className="astronomy-field"><label htmlFor={key}>{label} <small>{unit}</small></label>
    <input id={key} key={value} type="number" step="any" min={min} max={max} defaultValue={display}
      aria-invalid={invalid} aria-describedby={invalid?key+'-error':undefined} onChange={()=>setInvalid(false)}
      onKeyDown={event=>{if(event.key==='Enter')event.currentTarget.blur()}}
      onBlur={event=>{
        const next=event.currentTarget.valueAsNumber
        if(!Number.isFinite(next)||next<min||next>max){setInvalid(true);return}
        if(next!==Number(display))change(next)
      }} />
    {invalid&&<small id={key+'-error'} className="astronomy-field-error">请输入 {min} 至 {max} {unit}。</small>}
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
      if(mounted)setError(failure instanceof Error?failure.message:'无法读取双体实验。')
    })
    else setInitial(createAstronomyExperiment(params.has('new')?null:params.get('preset')??'ellipse'))
    return ()=>{mounted=false}
  },[id,params])
  if(!initial)return <main className="page-width library">{error?<p role="alert" className="error-banner">{error}</p>:<p className="muted">正在打开双体实验…</p>}</main>
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
  const [generation,reset]=useState(0)
  const [revision,redraw]=useState(0)
  const result=useMemo(()=>{
    if(scene.bodies.length!==2)return {error:'',orbit:undefined}
    try {return {error:'',orbit:new TwoBodyOrbit([scene.bodies[0],scene.bodies[1]])}}
    catch(failure){return {orbit:undefined,error:failure instanceof Error?failure.message:'无法计算轨道。'}}
  },[scene.bodies,generation])
  const orbit=result.orbit
  const body=scene.bodies.find(candidate=>candidate.id===selected)
  const center=orbit?centerOfMass(orbit.bodies):undefined

  useEffect(()=>{
    if(!active) {if(running)setRunning(false);return}
    if(!running||!orbit)return
    return runFixedSolver(orbit,{speed:speed*orbit.playbackRate,maxDelta:.05,maxSteps:180,
      updated:()=>redraw(value=>value+1),stopped:()=>setRunning(false)})
  },[active,orbit,running,speed])

  function changeBody(patch:Partial<CelestialBody>) {
    setRunning(false)
    reset(value=>value+1)
    setScene(current=>({...current,bodies:current.bodies.map(item=>item.id===selected?{...item,...patch}:item)}))
  }
  function add(kind:CelestialBody['kind']) {
    if(scene.bodies.length===2)return
    const primary=scene.bodies[0]
    const offset=primary&&primary.position.x>9999?-1:1
    const x=primary?primary.position.x+offset:0
    const newBody=createCelestialBody(kind,{x,y:primary?.position.y??0})
    if(primary)newBody.velocity.y=offset*Math.sqrt(SOLAR_GRAVITY*(primary.mass+newBody.mass))
    setScene(current=>({...current,bodies:[...current.bodies,newBody]}))
    setSelected(newBody.id)
    reset(value=>value+1)
  }
  function remove() {
    setRunning(false)
    setScene(current=>({...current,bodies:current.bodies.filter(item=>item.id!==selected)}))
    setSelected('');reset(value=>value+1)
  }
  async function save() {
    setSaving(true);setSaveError('')
    try {await saveAstronomy(scene);setSaved(scene);updateSavedAddress(scene.id)}
    catch(failure){setSaveError(failure instanceof Error?failure.message:'无法保存双体实验。')}
    finally {setSaving(false)}
  }

  const energyDrift=orbit&&orbit.initial.energy!==0?(orbit.current.energy-orbit.initial.energy)/Math.abs(orbit.initial.energy)*100:undefined
  const escapeSpeed=orbit?escapeThreshold(orbit):undefined
  const initialSpeed=orbit?Math.hypot(orbit.initial.velocity.x,orbit.initial.velocity.y):undefined
  const escapeRatio=initialSpeed!==undefined&&escapeSpeed!==undefined?initialSpeed/escapeSpeed:undefined
  return <main className="astronomy-lab page-width">
    <header className="astronomy-heading"><div><h1>天体物理</h1><label className="astronomy-name">实验名称
      <input aria-label="双体实验名称" key={scene.title} defaultValue={scene.title} maxLength={100}
        onKeyDown={event=>{if(event.key==='Enter')event.currentTarget.blur()}} onBlur={event=>{
          const value=event.currentTarget.value.trim()
          event.currentTarget.value=value||scene.title
          if(value&&value!==scene.title)setScene(current=>({...current,title:value}))
        }}/></label></div>
      <div className="astronomy-actions">
        <button className="button" onClick={()=>downloadText(scene.title,'json','application/json',JSON.stringify(scene,null,2))}><Download size={16}/> 导出场景 JSON</button>
        <button className="button primary" disabled={saving} onClick={()=>void save()}><Save size={16}/> {saving?'保存中…':saved===scene?'已保存':'保存实验'}</button>
      </div>
    </header>
    <nav className="astronomy-presets" aria-label="双体实验模板">
      {astronomyTemplates.map(template=><a key={template.id} className="button compact" href={appUrl('/lab?domain=astrophysics&preset='+template.id)}>{template.title}</a>)}
      {extendedTemplates.filter(template=>template.domain==='astrophysics').map(template=><a key={template.id} className="button compact" href={extensionUrl(template.id)}>{template.title}</a>)}
      <a className="button compact" href={appUrl('/lab?domain=astrophysics&new=1')}><Plus size={14}/> 空白双体实验</a>
    </nav>
    {saveError&&<p role="alert" className="error-banner">{saveError}</p>}
    <div className="astronomy-workbench">
      <div className="astronomy-main">
        <section className="astronomy-stage" aria-label="双体轨道视图">
          <div className="astronomy-toolbar">
            <button className="button primary compact" disabled={!orbit||Boolean(orbit.stopped)} onClick={()=>setRunning(!running)}>{running?<Pause size={15}/>:<Play size={15}/>} {running?'暂停轨道':'运行轨道'}</button>
            <button className="icon framed" aria-label="单步推进" disabled={!orbit||Boolean(orbit.stopped)} onClick={()=>{
              setRunning(false);orbit?.step();redraw(value=>value+1)
            }}><StepForward size={17}/></button>
            <button className="icon framed" aria-label="重置轨道" disabled={!orbit} onClick={()=>{setRunning(false);reset(value=>value+1)}}><RotateCcw size={16}/></button>
            <select aria-label="轨道播放速度" value={speed} onChange={event=>setSpeed(+event.target.value)}>{[.25,1,2,4,8].map(value=><option key={value} value={value}>{value}×</option>)}</select>
            <button className="button compact" disabled={!orbit?.current.time} onClick={()=>{if(orbit)downloadText(scene.title+' · 轨道','csv','text/csv;charset=utf-8',orbitCsv(orbit))}}><Download size={15}/> 导出轨道 CSV</button>
          </div>
          <div className="astronomy-viewport">
            <OrbitCanvas scene={scene} orbit={orbit} selected={selected} setSelected={setSelected} zoom={zoom} revision={revision}/>
            {!orbit&&<p className="astronomy-canvas-note">{result.error||'添加两个天体以运行轨道。'}</p>}
            <div className="astronomy-zoom" role="group" aria-label="轨道视图缩放">
              <button className="icon framed" aria-label="缩小轨道视图" title="缩小轨道视图" onClick={()=>setZoom(value=>Math.max(.05,value/1.3))}><Minus size={17}/></button>
              <button className="icon framed" aria-label="放大轨道视图" title="放大轨道视图" onClick={()=>setZoom(value=>Math.min(15,value*1.3))}><Plus size={17}/></button>
              <button className="icon framed" aria-label="重置轨道视图" title="重置轨道视图" onClick={()=>setZoom(1)}><RotateCcw size={16}/></button>
            </div>
          </div>
          <div className="astronomy-status"><span>模拟时间 <output aria-label="轨道模拟时间">{format(orbit?.current.time??0,6)} 年</output></span>
            {orbit&&<span>积分步长 {format(orbit.dt,7)} 年</span>}
          </div>
          {orbit?.stopped&&<p role="status" className="astronomy-stop">{orbit.stopped}</p>}
        </section>
        {orbit&&<OrbitAnalysis key={generation} orbit={orbit}/>}
      </div>

      <aside className="astronomy-sidebar" aria-label="双体参数">
        <section><h2>天体 <small>{scene.bodies.length} / 2</small></h2>
          {scene.bodies.length<2&&<div className="astronomy-add">{(['star','planet','satellite'] as const).map(kind=><button key={kind} className="button compact" onClick={()=>add(kind)}>添加{names[kind]}</button>)}</div>}
          {scene.bodies.length>0&&<label className="astronomy-field"><span>选择天体</span><select aria-label="选择天体" value={selected} onChange={event=>setSelected(event.target.value)}>
            <option value="">选择天体…</option>{scene.bodies.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
          </select></label>}
          {body&&<>
            <Numeric label="质量" unit="M☉" value={body.mass} min={1e-15} max={1000} change={mass=>changeBody({mass})}/>
            <Numeric label="半径" unit="AU" value={body.radius} min={1e-10} max={100} change={radius=>changeBody({radius})}/>
            <div className="astronomy-pair">{(['x','y'] as const).map(axis=><Numeric key={axis} label={'初始 '+axis.toUpperCase()} unit="AU" value={body.position[axis]} min={-10000} max={10000}
              change={value=>changeBody({position:{...body.position,[axis]:value}})}/>)}</div>
            <div className="astronomy-pair">{(['x','y'] as const).map(axis=><Numeric key={axis} label={'初速度 '+axis.toUpperCase()} unit="km/s" value={body.velocity[axis]*KM_PER_SECOND_PER_AU_PER_YEAR}
              min={-10000*KM_PER_SECOND_PER_AU_PER_YEAR} max={10000*KM_PER_SECOND_PER_AU_PER_YEAR} change={value=>changeBody({velocity:{...body.velocity,[axis]:value/KM_PER_SECOND_PER_AU_PER_YEAR}})}/>)}</div>
            <button className="button compact" onClick={remove}><Trash2 size={15}/> 删除天体</button>
          </>}
        </section>
        <section><h2>绘图图层</h2><div className="astronomy-layers">{(Object.keys(layerLabels) as (keyof typeof layerLabels)[]).map(key=><label key={key}>
          <input type="checkbox" checked={scene.layers[key]} onChange={event=>{
            const checked=event.target.checked
            setScene(current=>({...current,layers:{...current.layers,[key]:checked}}))
          }}/>{layerLabels[key]}</label>)}</div></section>
        {orbit&&<section aria-label="守恒量"><h2>守恒量</h2>
          <dl className="astronomy-invariants">
            <div><dt>质心系能量</dt><dd>{format(orbit.current.energy)} M☉·AU²/年²</dd></div>
            <div><dt>相对能量偏差</dt><dd>{format(energyDrift)} %</dd></div>
            <div><dt>角动量</dt><dd>{format(orbit.current.angularMomentum)} M☉·AU²/年</dd></div>
            <div><dt>初始质心</dt><dd>({format(center?.x)}, {format(center?.y)}) AU</dd></div>
          </dl>
        </section>}
        {orbit&&escapeRatio!==undefined&&<section aria-label="逃逸速度"><h2>逃逸速度</h2>
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
              setSaveError('');setRunning(false);reset(value=>value+1);setScene(current=>({...current,bodies}))
            }}>{factor}× 逃逸速度</button>)}</div>
          <p className="muted">快捷按钮沿初始间距的切线设置相对速度。</p>
        </section>}
        <section><p className="muted">牛顿双体模型，采用固定步长 Velocity Verlet 积分。天体标记有最小显示尺寸。</p></section>
      </aside>
    </div>
  </main>
}
