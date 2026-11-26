import { MeasurementChart } from './MeasurementChart'
import { useRef, useState } from 'react'
import { Activity, ChevronsDown, ChevronsUp, Download, GitCompareArrows, Pin } from 'lucide-react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ballisticReference, metrics, momentumCsv, momentumSamples, springPeriodReference, toCsv, type Sample } from './analysis'
import type { BodyConfig, Experiment } from './model'
import { downloadText } from './download'
import { RunComparison } from './RunComparison'

const groups = {
  Position:[['x','X 坐标','var(--soft)'],['y','Y 坐标','var(--trajectory)','5 3']],
  Velocity:[['vx','X 方向速度','var(--trajectory)'],['vy','Y 方向速度','var(--trajectory)','5 3'],['speed','速率','var(--text)','2 2']],
  Acceleration:[['ax','X 方向加速度','var(--energy)'],['ay','Y 方向加速度','var(--energy)','5 3']],
  Energy:[['kinetic','动能','var(--energy)'],['potential','重力势能','var(--energy)','5 3'],['spring','分摊的弹性势能','var(--comparison)','2 2'],['total','记录的机械能','var(--text)']],
  Momentum:[['px','X 方向动量','var(--trajectory)'],['py','Y 方向动量','var(--energy)','5 3']],
} as const
type Tab = keyof typeof groups | 'Compare'
const tabLabels: Record<Tab,string> = {Position:'位置',Velocity:'速度',Acceleration:'加速度',Energy:'能量',Momentum:'动量',Compare:'对比'}
const metricLabels: Record<string,string> = {'Final speed':'末速','Final velocity X':'末速度 X','Final velocity Y':'末速度 Y','Energy change':'机械能变化','Peak height':'最高点高度','Horizontal range':'水平射程','Flight time':'飞行时间','Oscillation period':'振动周期','Trajectory RMS error':'轨迹均方根误差','Reference time':'参考采样时刻','Vertical position':'竖直位置','Vertical velocity':'竖直速度'}
const units={Position:'m',Velocity:'m/s',Acceleration:'m/s²',Energy:'J',Momentum:'kg·m/s',Compare:'m'}
export type Baseline = {scene:Experiment;body:BodyConfig;samples:Sample[]}
interface Props {
  scene:Experiment; results:Map<string,Sample[]>; selected:string; select:(id:string)=>void
  baseline?:Baseline; setBaseline:(b:Baseline|undefined)=>void; replay?:boolean; externalForceApplied?:boolean; onClose?:()=>void
}
function landing(scene:Experiment,body:BodyConfig) {
  if(!scene.environment.collisions||body.geometry.kind!=='circle')return
  const ground=scene.bodies.find(b=>b.geometry.kind==='surface'&&b.angle===0)
  if(ground?.geometry.kind==='surface') return ground.position.y+ground.geometry.height/2+body.geometry.radius
}
export function AnalysisPanel({scene,results,selected,select,baseline,setBaseline,replay,externalForceApplied,onClose}:Props) {
  const [tab,setTab]=useState<Tab>('Position')
  const [systemMomentum,setSystemMomentum]=useState(true)
  const [collapsed,setCollapsed]=useState(false)
  const [height,setHeight]=useState<number>()
  const panel=useRef<HTMLElement>(null)
  const resize=useRef<{y:number;height:number}|null>(null)
  const [hidden,setHidden]=useState<string[]>([])
  const bodies=scene.bodies.filter(b=>b.type==='dynamic')
  const body=bodies.find(b=>b.id===selected)??bodies[0]
  const samples=(body&&results.get(body.id))||[]
  const series=tab==='Compare'?[]:groups[tab]
  const viewingMomentum=tab==='Momentum'
  const viewingSystem=viewingMomentum&&systemMomentum
  const minHeight=viewingMomentum?238:175
  const panelHeight=height===undefined?undefined:Math.max(minHeight,height)
  function resizeTo(px:number) {setHeight(Math.max(minHeight,Math.min(420,px)))}
  const momentum=viewingMomentum?momentumSamples(bodies,results,viewingSystem?undefined:body?.id,750):[]
  const firstMomentum=momentum[0],lastMomentum=momentum.at(-1)
  const stride=Math.max(1,Math.ceil(samples.length/750))
  const points:{time:number}[]=viewingMomentum?momentum:samples.filter((_,i)=>i%stride===0||i===samples.length-1)
  const comparison=tab==='Compare'&&body?metrics(samples,scene.kind,landing(scene,body)) : {}
  const previous=tab==='Compare'&&baseline?metrics(baseline.samples,baseline.scene.kind,landing(baseline.scene,baseline.body)) : {}
  const theoretical=tab==='Compare'&&body&&!externalForceApplied?ballisticReference(scene,body,samples):undefined
  const springPeriod=tab==='Compare'&&body&&!externalForceApplied?springPeriodReference(scene,body):undefined
  const reference:Record<string,string>=theoretical?.values??(springPeriod===undefined?{}:{'Oscillation period':springPeriod.toFixed(3)+' s'})
  const hasReference=Boolean(theoretical)||springPeriod!==undefined
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
      downloadText(scene.title+' · '+subject+'动量','csv','text/csv;charset=utf-8',momentumCsv(momentumSamples(bodies,results,viewingSystem?undefined:body?.id)))
      return
    }
    const data=[...results.values()].flat().sort((a,b)=>a.time-b.time)
    downloadText(scene.title,'csv','text/csv;charset=utf-8',toCsv(data))
  }
  return <section ref={panel} className={'analysis-panel'+(collapsed?' collapsed':viewingMomentum?' momentum-panel':'')} aria-label="数据分析" style={collapsed?undefined:{flexBasis:panelHeight}}>
    {!collapsed&&<div className="analysis-resizer" tabIndex={0} role="separator" aria-label="调整分析面板高度" aria-orientation="horizontal"
      aria-valuemin={minHeight} aria-valuemax={420} aria-valuenow={panelHeight??(viewingMomentum?270:244)} title="拖动调整分析面板高度"
      onPointerDown={e=>{
        if(e.button!==0)return
        e.preventDefault()
        e.currentTarget.focus()
        resize.current={y:e.clientY,height:panel.current!.offsetHeight}
        e.currentTarget.setPointerCapture(e.pointerId)
      }}
      onPointerMove={e=>{
        const start=resize.current
        if(start)resizeTo(start.height+start.y-e.clientY)
      }}
      onLostPointerCapture={()=>{resize.current=null}}
      onKeyDown={e=>{
        const delta=e.key==='ArrowUp'?24:e.key==='ArrowDown'?-24:0
        if(delta) {e.preventDefault();resizeTo(panel.current!.offsetHeight+delta)}
      }}
    />}
    <div className="analysis-heading"><div className="panel-title"><Activity size={16}/> 数据分析</div><div className="analysis-actions">
      <button className="button compact subtle" aria-label="设为基准" title={viewingSystem?'选择单个物体以设置基准':undefined} disabled={replay||viewingSystem||!body||samples.length<2} onClick={()=>{setBaseline({scene,body:body!,samples:samples.slice()});setTab('Compare');setCollapsed(false)}}><Pin size={14}/><span>设为基准</span></button>
      <button className="button compact" aria-label={viewingMomentum?'导出动量 CSV':'导出 CSV'} disabled={viewingMomentum?!momentum.length:!samples.length} onClick={exportCsv}><Download size={14}/><span>{viewingMomentum?'导出动量 CSV':'导出 CSV'}</span></button>
      <button className="icon" aria-label={onClose?'关闭分析面板':collapsed?'展开分析面板':'收起分析面板'} title={onClose?'关闭分析面板':collapsed?'展开分析面板':'收起分析面板'} onClick={onClose??(()=>setCollapsed(!collapsed))}>{collapsed?<ChevronsUp size={16}/>:<ChevronsDown size={16}/>}</button>
    </div></div>
    {!collapsed&&<>
      <div className="analysis-tabs-row"><div className="tabs analysis-tabs">
        {(['Position','Velocity','Acceleration','Energy','Momentum','Compare'] as const).map(t=><button key={t} className={t===tab?'chosen':''} aria-pressed={tab===t} onClick={()=>setTab(t)}>{t==='Compare'&&<GitCompareArrows size={13}/>} {tabLabels[t]}</button>)}
      </div><select aria-label="分析对象" value={viewingSystem||!body?'':body.id} onChange={e=>{
        if(viewingMomentum)setSystemMomentum(!e.target.value)
        if(e.target.value)select(e.target.value)
      }}>{viewingMomentum&&body&&<option value="">全体动态物体</option>}{!body&&<option value="">没有动态物体</option>}{bodies.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
      {tab==='Compare'?<div className="comparison">
        {baseline&&<div className="baseline-label"><span className="dot lavender"/>{baseline.scene.title} · {baseline.body.name}<button className="text-button" onClick={()=>setBaseline(undefined)}>清除基准</button></div>}
        {externalForceApplied&&(scene.kind==='fall'||scene.kind==='projectile')&&<p className="muted">本次运行施加过外力，重力解析参考已停用。</p>}
        {baseline&&body&&<RunComparison scene={scene} samples={samples} bodyName={body.name} baseline={baseline}/>}
        {!baseline&&!hasReference&&<p className="muted">{replay?'退出回放后可设置基准。':'记录一次运行并设为基准，就可以比较不同参数下的结果。基准轨迹会显示在画布上。'}</p>}
        {springPeriod!==undefined&&<p className="muted">理论周期适用于无接触的一维欠阻尼振动。</p>}
        {(baseline||hasReference)&&<table><thead><tr><th>指标</th><th>本次运行</th>{baseline&&<th>基准</th>}{hasReference&&<th>理论参考值</th>}</tr></thead>
          <tbody>{comparisonKeys.map(key=><tr key={key}><th>{metricLabels[key]}</th><td>{comparison[key]??'—'}</td>{baseline&&<td>{previous[key]??'—'}</td>}{hasReference&&<td>{reference[key]??'—'}</td>}</tr>)}</tbody>
        </table>}
      </div>:tab!=='Momentum'?<MeasurementChart key={tab+'-'+(body?.id??'empty')} group={tab} title={tabLabels[tab]} samples={samples} hasBody={Boolean(body)} hidden={hidden} toggleSeries={key=>setHidden(old=>old.includes(key)?old.filter(k=>k!==key):[...old,key])}/>:<>
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
