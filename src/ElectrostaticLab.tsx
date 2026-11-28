import { useEffect, useId, useState, type ReactNode } from 'react'
import { Check, Crosshair, Download, Hand, Minus, MousePointer2, Plus, RotateCcw, Save, Trash2 } from 'lucide-react'
import { ElectrostaticCanvas, type ElectricTool } from './ElectrostaticCanvas'
import { createElectrostaticExperiment, electrostaticTemplates, MAX_CHARGES, sampleElectricField, type ElectrostaticExperiment } from './electrostatics'
import { loadElectrostatic, saveElectrostatic } from './repository'
import { downloadText } from './download'
import { appUrl } from './routes'
import { extendedTemplates, extensionUrl } from './extended-experiments'
import type { Point } from './model'
import { formatNumber } from './numberFormat'
import { ExperimentData } from './ExperimentData'
import './electrostatic.css'

const tools=[
  {id:'select',label:'选择',icon:MousePointer2},{id:'positive',label:'正电荷',icon:Plus},
  {id:'negative',label:'负电荷',icon:Minus},{id:'probe',label:'探针',icon:Crosshair},{id:'pan',label:'平移',icon:Hand},
] as const
const layers={lines:'电场线',vectors:'电场矢量',heat:'电势热力图',contours:'等势线'} as const
const coordinateLimit=10000

function bounded(point:Point) {
  const limit=(number:number)=>Math.max(-coordinateLimit,Math.min(coordinateLimit,number))
  return {x:limit(point.x),y:limit(point.y)}
}

function format(value:number) {
  const magnitude=Math.abs(value)
  return magnitude!==0&&(magnitude<.001||magnitude>=1e5)?value.toExponential(3):String(Number(value.toFixed(3)))
}

function Numeric({label,unit,value,min,max,change}:{label:string;unit:string;value:number;min:number;max:number;change:(value:number)=>void}) {
  const display=formatNumber(value)
  const id=useId()
  const [error,setError]=useState(false)
  return <div className="electric-field"><label htmlFor={id}>{label} <small>{unit}</small></label>
    <input id={id} key={value} type="number" step="any" min={min} max={max} defaultValue={display}
      aria-invalid={error} aria-describedby={error?id+'-error':undefined} onChange={()=>setError(false)}
      onKeyDown={event=>{if(event.key==='Enter')event.currentTarget.blur()}}
      onBlur={event=>{
        const input=event.currentTarget,numeric=input.valueAsNumber
        if(!Number.isFinite(numeric)||numeric<min||numeric>max) {
          setError(true)
          return
        }
        if(numeric!==Number(display))change(numeric)
      }}/>{error&&<small id={id+'-error'} className="electric-input-error">请输入 {min} 至 {max} {unit}。</small>}
  </div>
}

function Coordinates({label,point,change}:{label:string;point:Point;change:(point:Point)=>void}) {
  return <div className="electric-pair">
    <Numeric label={label+' X'} unit="m" value={point.x} min={-coordinateLimit} max={coordinateLimit} change={x=>change({...point,x})}/>
    <Numeric label={label+' Y'} unit="m" value={point.y} min={-coordinateLimit} max={coordinateLimit} change={y=>change({...point,y})}/>
  </div>
}

export function ElectrostaticLab({search,updateSavedAddress}:{search:string;updateSavedAddress:(id:string)=>void}) {
  const [params]=useState(()=>new URLSearchParams(search))
  const id=params.get('id')
  const [scene,setScene]=useState<ElectrostaticExperiment>()
  const [saved,setSaved]=useState<ElectrostaticExperiment>()
  const [loadingError,setLoadingError]=useState('')
  useEffect(()=>{
    let mounted=true
    if(id)void loadElectrostatic(id).then(record=>{
      if(mounted){setScene(record);setSaved(record)}
    }).catch(error=>{if(mounted)setLoadingError(error instanceof Error?error.message:'无法读取静电实验。')})
    else setScene(createElectrostaticExperiment(params.has('new')?null:params.get('preset')??'dipole'))
    return ()=>{mounted=false}
  },[id,params])
  if(!scene)return <main className="page-width library">
    {loadingError?<p className="error-banner" role="alert">{loadingError}</p>:<p className="muted">正在打开静电实验…</p>}
  </main>
  return <ElectrostaticEditor initial={scene} initiallySaved={saved===scene} updateSavedAddress={updateSavedAddress}/>
}

function ElectrostaticEditor({initial,initiallySaved,updateSavedAddress}:{initial:ElectrostaticExperiment;initiallySaved:boolean;updateSavedAddress:(id:string)=>void}) {
  const [scene,setScene]=useState(initial)
  const [saved,setSaved]=useState(initiallySaved?initial:undefined)
  const [tool,setTool]=useState<ElectricTool>('select')
  const [selected,setSelected]=useState(initial.charges[0]?.id??'')
  const [saving,setSaving]=useState(false)
  const [error,setError]=useState('')
  const [variables,setVariables]=useState(false)
  const charge=scene.charges.find(candidate=>candidate.id===selected)
  const field=sampleElectricField(scene.charges,scene.probe)
  const capacity=scene.charges.length>=MAX_CHARGES

  function add(sign:1|-1,position:Point) {
    if(capacity)return
    const next={id:crypto.randomUUID(),position:bounded(position),nanocoulombs:5*sign}
    setScene(current=>current.charges.length>=MAX_CHARGES?current:{...current,charges:[...current.charges,next]})
    setSelected(next.id);setTool('select')
  }
  function changeCharge(id:string,changes:Partial<Pick<NonNullable<typeof charge>,'nanocoulombs'|'position'>>) {
    setScene(current=>({...current,charges:current.charges.map(candidate=>candidate.id===id?{...candidate,...changes}:candidate)}))
  }
  function remove() {
    setScene(current=>({...current,charges:current.charges.filter(candidate=>candidate.id!==selected)}))
    setSelected('')
  }
  function moveProbe(probe:Point) {setScene(current=>({...current,probe:bounded(probe)}))}
  function changeZoom(factor:number) {setScene(current=>({...current,camera:{...current.camera,scale:Math.max(5,Math.min(400,current.camera.scale*factor))}}))}

  async function save() {
    if(saving)return
    setSaving(true);setError('')
    try {
      await saveElectrostatic(scene)
      setSaved(scene)
      updateSavedAddress(scene.id)
    } catch(failure) {setError(failure instanceof Error?failure.message:'无法保存静电实验。')}
    finally {setSaving(false)}
  }

  return <main className="electric-lab page-width" data-domain="electromagnetism">
    <header className="page-mast">
      <div>
        <p className="page-kicker"><span>PhysicLab</span><i aria-hidden="true"/><span>电磁学</span></p>
        <h1>电磁学</h1>
        <p className="page-deck">放置正负点电荷，用场线、等势线与探针观察电场的叠加。</p>
        <label className="electric-name">
          <span>实验名称</span><input aria-label="静电实验名称" key={scene.title} defaultValue={scene.title} maxLength={100}
            onKeyDown={event=>{if(event.key==='Enter')event.currentTarget.blur()}} onBlur={event=>{
              const title=event.currentTarget.value.trim()
              event.currentTarget.value=title||scene.title
              if(title&&title!==scene.title)setScene(current=>({...current,title}))
            }}/>
        </label>
      </div>
      <dl className="page-meta">
        <div><dt>电荷</dt><dd>{String(scene.charges.length).padStart(2,'0')}</dd></div>
        <div><dt>上限</dt><dd>{MAX_CHARGES}</dd></div>
      </dl>
    </header>
    <div className="lab-command">
      <nav className="electric-presets rail" aria-label="静电实验模板">
        <span className="rail-label" aria-hidden="true">模板</span>
        {electrostaticTemplates.map(template=><a className="button compact" key={template.id} href={appUrl('/lab?domain=electromagnetism&preset='+template.id)}>{template.title}</a>)}
        {extendedTemplates.filter(template=>template.domain==='electromagnetism').map(template=><a className="button compact" key={template.id} href={extensionUrl(template.id)}>{template.title}</a>)}
        <a className="button compact" href={appUrl('/lab?domain=electromagnetism&new=1')}><Plus size={14}/> 空白静电实验</a>
      </nav>
      <div className="electric-actions">
        <button className="button compact" onClick={()=>downloadText(scene.title,'json','application/json',JSON.stringify(scene,null,2))}><Download size={15}/> 导出场景 JSON</button>
        <button className="button compact primary" disabled={saving} onClick={()=>void save()}>{saved===scene?<Check size={15}/>:<Save size={15}/>} {saving?'保存中…':saved===scene?'已保存':'保存实验'}</button>
      </div>
    </div>
    {error&&<p role="alert" className="error-banner">{error}</p>}

    <div className="electric-workbench">
      <section className="electric-stage plate" aria-label="静电场视图">
        <div className="electric-toolbar" role="group" aria-label="静电工具">
          {tools.map(({id,label,icon:Icon})=><button className="button compact" key={id} aria-pressed={tool===id}
            disabled={capacity&&(id==='positive'||id==='negative')} onClick={()=>setTool(id)}><Icon size={15} aria-hidden="true"/> {label}</button>)}
        </div>
        <div className="electric-viewport stage-bezel">
          <ElectrostaticCanvas scene={scene} selected={selected} tool={tool} select={setSelected} add={add} probe={moveProbe}
            moveCharge={(id,point)=>changeCharge(id,{position:bounded(point)})}
            moveCamera={point=>setScene(current=>({...current,camera:{...current.camera,...bounded(point)}}))}/>
          <div className="electric-scale" role="group" aria-label="视图缩放">
            <button className="icon framed" aria-label="缩小电场视图" title="缩小电场视图" onClick={()=>changeZoom(1/1.3)}><Minus size={17}/></button>
            <button className="icon framed" aria-label="放大电场视图" title="放大电场视图" onClick={()=>changeZoom(1.3)}><Plus size={17}/></button>
            <button className="icon framed" aria-label="重置电场视图" title="重置电场视图" onClick={()=>setScene(current=>({...current,camera:{x:0,y:0,scale:82}}))}><RotateCcw size={16}/></button>
          </div>
        </div>
        <div className="electric-legend" aria-label="电场图例">
          {(scene.layers.lines||scene.layers.vectors)&&<span className="electric-field-legend">电场方向</span>}
          {(scene.layers.heat||scene.layers.contours)&&<><span className="electric-negative">负电势</span><span className="electric-positive">正电势</span></>}
          {scene.layers.contours&&<span className="electric-zero">零电势等势线</span>}
        </div>
        <section className="electric-readout" aria-label="探针读数">
          <h2><Crosshair size={15}/> 探针读数</h2>
          {field?<dl>
            <Reading label="电势 V">{format(field.potential)} V</Reading>
            <Reading label="电场 |E|">{format(field.magnitude)} N/C</Reading>
            <Reading label="Eₓ">{format(field.x)} N/C</Reading>
            <Reading label="Eᵧ">{format(field.y)} N/C</Reading>
          </dl>:<p role="status" className="muted">探针位于点电荷的奇点，电场与电势无有限读数。</p>}
        </section>
        <button className="button compact" aria-expanded={variables} onClick={()=>setVariables(!variables)}>变量分析</button>
        {variables&&<ExperimentData title={scene.title} mode="静电理论场 · 探针 Y 截线" axis="x"
          variables={[[ 'x','探针 X','m'],['potential','电势','V','理论'],['magnitude','电场强度','N/C','理论'],
            ['ex','电场 X','N/C','理论'],['ey','电场 Y','N/C','理论']]}
          subjects={[{id:'scan',name:'探针截线',rows:Array.from({length:201},(_,i)=>{
            const x=scene.probe.x+(i-100)*.04
            const value=sampleElectricField(scene.charges,{x,y:scene.probe.y})
            return {x,potential:value?.potential,magnitude:value?.magnitude,ex:value?.x,ey:value?.y}
          })}]}/>}
      </section>

      <aside className="electric-sidebar" aria-label="静电参数">
        <section>
          <h2>点电荷 <small>{scene.charges.length} / {MAX_CHARGES}</small></h2>
          {scene.charges.length?<label className="electric-field"><span>选择电荷</span>
            <select aria-label="选择电荷" value={selected} onChange={event=>setSelected(event.target.value)}>
              <option value="">选择电荷…</option>
              {scene.charges.map((candidate,index)=><option key={candidate.id} value={candidate.id}>电荷 {index+1} · {candidate.nanocoulombs} nC</option>)}
            </select></label>:<p className="muted">选择正电荷或负电荷工具，然后点击画布。</p>}
          {charge&&<>
            <Numeric label="电荷量" unit="nC" value={charge.nanocoulombs} min={-100} max={100} change={nanocoulombs=>changeCharge(charge.id,{nanocoulombs})}/>
            <Coordinates label="电荷" point={charge.position} change={position=>changeCharge(charge.id,{position})}/>
            <button className="button compact subtle" onClick={remove}><Trash2 size={15}/> 删除电荷</button>
          </>}
        </section>
        <section>
          <h2>电场与电势</h2>
          <div className="electric-toggles">{(Object.keys(layers) as (keyof typeof layers)[]).map(key=><label key={key}>
            <input type="checkbox" checked={scene.layers[key]} onChange={event=>{
              const checked=event.target.checked
              setScene(current=>({...current,layers:{...current.layers,[key]:checked}}))
            }}/>{layers[key]}</label>)}</div>
          <Numeric label="等势线间隔" unit="V" value={scene.contourStep} min={.1} max={1000} change={contourStep=>setScene(current=>({...current,contourStep}))}/>
          {scene.layers.heat&&<p className="muted">热力图量程 ±{format(4*scene.contourStep)} V</p>}
        </section>
        <section>
          <h2>探针位置</h2>
          <Coordinates label="探针" point={scene.probe} change={moveProbe}/>
          <p className="muted">真空中的固定点电荷。电势以无穷远处为零。</p>
        </section>
      </aside>
    </div>
  </main>
}

function Reading({label,children}:{label:string;children:ReactNode}) {
  return <div><dt>{label}</dt><dd>{children}</dd></div>
}
