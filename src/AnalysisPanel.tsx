import { MeasurementChart } from './MeasurementChart'
import { useEffect, useRef, useState } from 'react'
import { Activity, ChevronsDown, ChevronsUp, Download, GitCompareArrows, Maximize2, Minimize2, Pin, X } from 'lucide-react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ballisticDuration, ballisticReference, metrics, momentumCsv, momentumSamples, projectile, springPeriodReference, toCsv, type Sample } from './analysis'
import type { BodyConfig, Experiment } from './model'
import { downloadText } from './download'
import { RunComparison } from './RunComparison'
import type { Intervention } from './interventions'
import { ExperimentData,type Variable } from './ExperimentData'
import type { DataView } from './spatialWorkspace'

const groups = {
  Position:[['x','X 坐标','var(--soft)'],['y','Y 坐标','var(--trajectory)','5 3']],
  Velocity:[['vx','X 方向速度','var(--trajectory)'],['vy','Y 方向速度','var(--trajectory)','5 3'],['speed','速率','var(--text)','2 2']],
  Acceleration:[['ax','X 方向加速度','var(--energy)'],['ay','Y 方向加速度','var(--energy)','5 3']],
  Energy:[['kinetic','动能','var(--energy)'],['potential','重力势能','var(--energy)','5 3'],['spring','分摊的弹性势能','var(--comparison)','2 2'],['total','记录的机械能','var(--text)']],
  Momentum:[['px','X 方向动量','var(--trajectory)'],['py','Y 方向动量','var(--energy)','5 3']],
} as const
type Tab = keyof typeof groups | 'Compare'|'Variables'
const tabLabels: Record<Tab,string> = {Position:'位置',Velocity:'速度',Acceleration:'加速度',Energy:'能量',Momentum:'动量',Compare:'对比',Variables:'变量'}
const selectedVariables:Variable[]=[
  ['time','模拟时间','s'],['y','Y 坐标','m'],['x','X 坐标','m'],['dx','X 位移','m','派生'],['dy','Y 位移','m','派生'],
  ['distance','采样路径长度','m','派生'],['vx','X 速度','m/s'],['vy','Y 速度','m/s'],['speed','速率','m/s'],
  ['ax','X 加速度','m/s²'],['ay','Y 加速度','m/s²'],['px','X 动量','kg·m/s','派生'],['py','Y 动量','kg·m/s','派生'],
  ['fx','X 合力','N','派生'],['fy','Y 合力','N','派生'],['kinetic','动能','J'],['potential','重力势能','J'],['spring','弹性势能','J'],['total','机械能','J'],
]
const metricLabels: Record<string,string> = {'Final speed':'末速','Final velocity X':'末速度 X','Final velocity Y':'末速度 Y','Energy change':'机械能变化','Peak height':'最高点高度','Horizontal range':'水平射程','Flight time':'飞行时间','Oscillation period':'振动周期','Trajectory RMS error':'轨迹均方根误差','Reference time':'参考采样时刻','Vertical position':'竖直位置','Vertical velocity':'竖直速度'}
const units={Position:'m',Velocity:'m/s',Acceleration:'m/s²',Energy:'J',Momentum:'kg·m/s',Compare:'m'}
export type Baseline = {scene:Experiment;body:BodyConfig;samples:Sample[]}
interface Props {
  scene:Experiment; results:Map<string,Sample[]>; selected:string; select:(id:string)=>void
  baseline?:Baseline; setBaseline:(b:Baseline|undefined)=>void; replay?:boolean; externalForceApplied?:boolean; onClose?:()=>void
  interventions?:readonly Intervention[]
  settings?:DataView;onSettings?:(settings:DataView)=>void
}
function landing(scene:Experiment,body:BodyConfig) {
  if(!scene.environment.collisions||body.geometry.kind!=='circle')return
  const ground=scene.bodies.find(b=>b.geometry.kind==='surface'&&b.angle===0)
  if(ground?.geometry.kind==='surface') return ground.position.y+ground.geometry.height/2+body.geometry.radius
}
export function AnalysisPanel({scene,results,selected,select,baseline,setBaseline,replay,externalForceApplied,onClose,interventions,settings,onSettings}:Props) {
  const [tab,setTab]=useState<Tab>('Position')
  const [systemMomentum,setSystemMomentum]=useState(true)
  const [collapsed,setCollapsed]=useState(false)
  const [full,setFull]=useState(false)
  const [desktop,setDesktop]=useState(()=>matchMedia('(min-width: 901px)').matches)
  const [width,setWidth]=useState(410)
  const [height,setHeight]=useState(270)
  const [range,setRange]=useState({start:'',end:''})
  useEffect(()=>{
    const query=matchMedia('(min-width: 901px)')
    const update=()=>setDesktop(query.matches)
    query.addEventListener('change',update)
    return ()=>query.removeEventListener('change',update)
  },[])
  const panel=useRef<HTMLElement>(null)
  const resize=useRef<{position:number;size:number}|null>(null)
  const [hidden,setHidden]=useState<string[]>([])
  const bodies=scene.bodies.filter(b=>b.type==='dynamic')
  const body=bodies.find(b=>b.id===selected)??bodies[0]
  const data=(body&&results.get(body.id))||[]
  const start=range.start===''?-Infinity:Number(range.start)
  const end=range.end===''?Infinity:Number(range.end)
  const inRange=(sample:{time:number})=>sample.time>=start&&sample.time<=end
  const samples=range.start||range.end?data.filter(inRange):data
  const events=interventions?.filter(event=>event.bodyId===body?.id&&inRange(event))??[]
  const series=tab==='Compare'||tab==='Variables'?[]:groups[tab]
  const viewingMomentum=tab==='Momentum'
  const viewingSystem=viewingMomentum&&systemMomentum
  const minHeight=viewingMomentum?238:175
  const size=desktop?width:height
  const minSize=desktop?320:minHeight,maxSize=desktop?720:540
  function resizeTo(px:number) {(desktop?setWidth:setHeight)(Math.max(minSize,Math.min(maxSize,px)))}
  const momentum=viewingMomentum?momentumSamples(bodies,results,viewingSystem?undefined:body?.id,750).filter(inRange):[]
  const firstMomentum=momentum[0],lastMomentum=momentum.at(-1)
  const stride=Math.max(1,Math.ceil(samples.length/750))
  const points:{time:number}[]=viewingMomentum?momentum:samples.filter((_,i)=>i%stride===0||i===samples.length-1)
  const comparison=tab==='Compare'&&body?metrics(samples,scene.kind,landing(scene,body)) : {}
  const previous=tab==='Compare'&&baseline?metrics(baseline.samples,baseline.scene.kind,landing(baseline.scene,baseline.body)) : {}
  const theoretical=tab==='Compare'&&body&&!externalForceApplied?ballisticReference(scene,body,samples):undefined
  const springPeriod=tab==='Compare'&&body&&!externalForceApplied?springPeriodReference(scene,body):undefined
  const reference:Record<string,string>=theoretical?.values??(springPeriod===undefined?{}:{'Oscillation period':springPeriod.toFixed(3)+' s'})
  const hasReference=Boolean(theoretical)||springPeriod!==undefined
  const canCompare=tab==='Variables'&&!externalForceApplied&&bodies.some(item=>ballisticDuration(scene,item)!==undefined)
  function rows(item:BodyConfig) {
    let distance=0,previous:Sample|undefined
    const duration=canCompare?ballisticDuration(scene,item):undefined
    return (results.get(item.id)??[]).map(sample=>{
      if(previous)distance+=Math.hypot(sample.x-previous.x,sample.y-previous.y)
      previous=sample
      const ideal=duration!==undefined&&sample.time<=duration?projectile(item.position,item.velocity,scene.environment.gravity,sample.time):undefined
      return {...sample,bodyId:undefined,dx:sample.x-item.position.x,dy:sample.y-item.position.y,distance,
        px:item.mass*sample.vx,py:item.mass*sample.vy,fx:item.mass*sample.ax,fy:item.mass*sample.ay,
        theoryY:ideal?.y,errorY:ideal?sample.y-ideal.y:undefined}
    })
  }
  if(theoretical) {
    if(theoretical.last) {
      comparison['Reference time']=theoretical.last.time.toFixed(3)+' s'
      comparison['Vertical position']=theoretical.last.y.toFixed(3)+' m'
      comparison['Vertical velocity']=theoretical.last.vy.toFixed(3)+' m/s'
    }
    comparison['Trajectory RMS error']=theoretical.rmse===undefined?'样本不足':theoretical.rmse.toFixed(3)+' m'
  }
  const comparisonKeys=[...new Set([...Object.keys(comparison),...Object.keys(previous),...Object.keys(reference)])]
  function exportCsv() {
    if(viewingMomentum) {
      const subject=viewingSystem?'系统':body?.name??'物体'
      downloadText(scene.title+' · '+subject+'动量','csv','text/csv;charset=utf-8',momentumCsv(momentumSamples(bodies,results,viewingSystem?undefined:body?.id).filter(inRange)))
      return
    }
    const samples=[...results.values()].flat().filter(inRange).sort((a,b)=>a.time-b.time)
    downloadText(scene.title,'csv','text/csv;charset=utf-8',toCsv(samples))
  }
  return <section ref={panel} className={'analysis-panel'+(collapsed?' collapsed':viewingMomentum?' momentum-panel':'')+(full?' analysis-full':'')}
    aria-label="数据分析" style={full?undefined:desktop?{width}:{height:collapsed?44:height}}>
    {!collapsed&&!full&&<div className="analysis-resizer" tabIndex={0} role="separator" aria-label={'调整分析面板'+(desktop?'宽度':'高度')} aria-orientation={desktop?'vertical':'horizontal'}
      aria-valuemin={minSize} aria-valuemax={maxSize} aria-valuenow={size}
      onPointerDown={e=>{
        if(e.button!==0)return
        e.preventDefault()
        e.currentTarget.focus()
        resize.current={position:desktop?e.clientX:e.clientY,size:desktop?panel.current!.offsetWidth:panel.current!.offsetHeight}
        e.currentTarget.setPointerCapture(e.pointerId)
      }}
      onPointerMove={e=>{
        const start=resize.current
        if(start)resizeTo(start.size+start.position-(desktop?e.clientX:e.clientY))
      }}
      onLostPointerCapture={()=>{resize.current=null}}
      onKeyDown={e=>{
        const delta=e.key===(desktop?'ArrowLeft':'ArrowUp')?24:e.key===(desktop?'ArrowRight':'ArrowDown')?-24:0
        if(delta) {e.preventDefault();resizeTo(size+delta)}
      }}
    />}
    <div className="analysis-heading"><div className="panel-title"><Activity size={16}/> 数据分析</div><div className="analysis-actions">
      <button className="button compact subtle" aria-label="设为基准" title={viewingSystem?'选择单个物体以设置基准':undefined} disabled={replay||viewingSystem||!body||samples.length<2} onClick={()=>{setBaseline({scene,body:body!,samples:samples.slice()});setTab('Compare');setCollapsed(false)}}><Pin size={14}/><span>设为基准</span></button>
      <button className="button compact" aria-label={viewingMomentum?'导出动量 CSV':'导出 CSV'} disabled={viewingMomentum?!momentum.length:!samples.length} onClick={exportCsv}><Download size={14}/><span>{viewingMomentum?'导出动量 CSV':'导出 CSV'}</span></button>
      <button className="icon" aria-label={full?'恢复分析尺寸':'全屏查看分析'} title={full?'恢复分析尺寸':'全屏查看分析'} onClick={()=>{setFull(!full);setCollapsed(false)}}>{full?<Minimize2 size={16}/>:<Maximize2 size={16}/>}</button>
      <button className="icon analysis-collapse" aria-label={collapsed?'展开分析面板':'收起分析面板'} onClick={()=>{setCollapsed(!collapsed);setFull(false)}}>{collapsed?<ChevronsUp size={16}/>:<ChevronsDown size={16}/>}</button>
      {onClose&&<button className="icon" aria-label="关闭分析面板" title="关闭分析面板" onClick={onClose}><X size={16}/></button>}
    </div></div>
    {!collapsed&&<>
      <div className="analysis-tabs-row"><div className="tabs analysis-tabs">
        {(['Position','Velocity','Acceleration','Energy','Momentum','Compare','Variables'] as const).map(t=><button key={t} className={t===tab?'chosen':''} aria-pressed={tab===t} onClick={()=>setTab(t)}>{t==='Compare'&&<GitCompareArrows size={13}/>} {tabLabels[t]}</button>)}
      </div><select aria-label="分析对象" value={viewingSystem||!body?'':body.id} onChange={e=>{
        if(viewingMomentum)setSystemMomentum(!e.target.value)
        if(e.target.value)select(e.target.value)
      }}>{viewingMomentum&&body&&<option value="">全体动态物体</option>}{!body&&<option value="">没有动态物体</option>}{bodies.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
      <div className="analysis-range">
        <label>起点 (s) <input aria-label="分析起点时间" type="number" min="0" step="any" value={range.start} onChange={e=>setRange({...range,start:e.target.value})}/></label>
        <label>终点 (s) <input aria-label="分析终点时间" type="number" min="0" step="any" value={range.end} onChange={e=>setRange({...range,end:e.target.value})}/></label>
        {events.length>0&&<details><summary>干预 {events.length} 次</summary><ul>{events.map((event,i)=><li key={i}>{event.time.toFixed(3)} s · {{
          continuous:'持续力调整',timed:'定时力设置',impulse:'瞬时冲量',velocity:'人工覆盖速度',
        }[event.input.kind]}</li>)}</ul></details>}
      </div>
      {tab==='Variables'?<ExperimentData title={scene.title} mode={scene.physicalMode==='free'?'自由干预':'严格物理'}
        settings={settings} onSettings={onSettings}
        variables={canCompare?[...selectedVariables,['theoryY','解析 Y 坐标','m','理论'],['errorY','Y 位置误差','m','误差']]:selectedVariables}
        subjects={bodies.map(item=>({id:item.id,name:item.name,rows:rows(item)}))} markers={events.map(event=>event.time)}/>
      :tab==='Compare'?<div className="comparison">
        {baseline&&<div className="baseline-label"><span className="dot lavender"/>{baseline.scene.title} · {baseline.body.name}<button className="text-button" onClick={()=>setBaseline(undefined)}>清除基准</button></div>}
        {externalForceApplied&&(scene.kind==='fall'||scene.kind==='projectile')&&<p className="muted">本次运行施加过外力，重力解析参考已停用。</p>}
        {baseline&&body&&<RunComparison scene={scene} samples={samples} bodyName={body.name} baseline={baseline}/>}
        {!baseline&&!hasReference&&<p className="muted">{replay?'退出回放后可设置基准。':'记录一次运行并设为基准，就可以比较不同参数下的结果。基准轨迹会显示在画布上。'}</p>}
        {springPeriod!==undefined&&<p className="muted">理论周期适用于无接触的一维欠阻尼振动。</p>}
        {(baseline||hasReference)&&<table><thead><tr><th>指标</th><th>本次运行</th>{baseline&&<th>基准</th>}{hasReference&&<th>理论参考值</th>}</tr></thead>
          <tbody>{comparisonKeys.map(key=><tr key={key}><th>{metricLabels[key]}</th><td>{comparison[key]??'—'}</td>{baseline&&<td>{previous[key]??'—'}</td>}{hasReference&&<td>{reference[key]??'—'}</td>}</tr>)}</tbody>
        </table>}
      </div>:tab!=='Momentum'?<MeasurementChart key={tab+'-'+(body?.id??'empty')+'-'+range.start+'-'+range.end} group={tab} title={tabLabels[tab]} samples={samples} source={data} hasBody={Boolean(body)} events={events} hidden={hidden} toggleSeries={key=>setHidden(old=>old.includes(key)?old.filter(k=>k!==key):[...old,key])}/>:<>
        <div className="chart-wrap" aria-label={tabLabels[tab]+'随模拟时间变化'}>
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={110}>
            <LineChart data={points} margin={{left:0,right:16,top:8,bottom:2}}>
              <CartesianGrid stroke="var(--line)" vertical={false} strokeDasharray="3 4"/>
              <XAxis dataKey="time" type="number" domain={[points[0]?.time??0,Math.max(1,points.at(-1)?.time??0)]} tickFormatter={x=>Number(x.toFixed(2))+' s'} tick={{fill:'var(--dim)',fontSize:10}} tickLine={false} axisLine={{stroke:'var(--line-strong)'}}/>
              <YAxis width={viewingMomentum?84:55} tickFormatter={x=>Number(x.toFixed(2))+' '+units[tab]} tick={{fill:'var(--dim)',fontSize:10}} tickLine={false} axisLine={false}/>
              <Tooltip labelFormatter={t=>Number(t).toFixed(3)+' s'} formatter={value=>typeof value==='number'?value.toFixed(3)+' '+units[tab]:String(value)} contentStyle={{background:'var(--raised)',border:'1px solid var(--line-strong)',borderRadius:6,fontSize:12}}/>
              {series.map(([key,label,color,dash])=><Line key={key} type="linear" name={label} dataKey={key} stroke={color} strokeDasharray={dash} strokeWidth={1.6} dot={false} isAnimationActive={false} hide={hidden.includes(key)}/>)}
            </LineChart>
          </ResponsiveContainer>
          {points.length<2&&<div className="chart-empty">{body?'运行模拟后即可查看数据':'添加动态物体以记录数据'}</div>}
        </div>
        {viewingMomentum&&momentum.length>1&&firstMomentum&&lastMomentum&&<dl className="momentum-summary" aria-label="动量变化摘要">
          <div><dt>采样区间</dt><dd>{firstMomentum.time.toFixed(2)}–{lastMomentum.time.toFixed(2)} s</dd></div>
          <div><dt>Δpₓ</dt><dd>{(lastMomentum.px-firstMomentum.px).toFixed(3)} kg·m/s</dd></div>
          <div><dt>Δpᵧ</dt><dd>{(lastMomentum.py-firstMomentum.py).toFixed(3)} kg·m/s</dd></div>
          <div><dt>Δ动能</dt><dd>{(lastMomentum.kinetic-firstMomentum.kinetic).toFixed(3)} J</dd></div>
        </dl>}
        <div className="series">{series.map(([key,label,color,dash])=><button key={key} className={hidden.includes(key)?'series-hidden':''} aria-pressed={!hidden.includes(key)} onClick={()=>setHidden(hidden.includes(key)?hidden.filter(k=>k!==key):[...hidden,key])}><span className="series-line" style={{borderTopColor:color,borderTopStyle:dash?.startsWith('2')?'dotted':dash?'dashed':'solid'}}/>{label}</button>)}
        </div>
      </>}
    </>}
  </section>
}
