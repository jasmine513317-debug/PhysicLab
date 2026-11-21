import { useRef, useState } from 'react'
import { Activity, ChevronsDown, ChevronsUp, Download, GitCompareArrows, Pin } from 'lucide-react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { flightTime, metrics, projectile, toCsv, type Sample } from './analysis'
import type { BodyConfig, Experiment } from './model'
import { downloadText } from './download'

const groups = {
  Position:[['x','X 坐标','#8bdaff'],['y','Y 坐标','#a6a8ff']],
  Velocity:[['vx','X 方向速度','#8bdaff'],['vy','Y 方向速度','#a6a8ff'],['speed','速率','#ebba75']],
  Acceleration:[['ax','X 方向加速度','#8bdaff'],['ay','Y 方向加速度','#a6a8ff']],
  Energy:[['kinetic','动能','#8bdaff'],['potential','重力势能','#a6a8ff'],['spring','分摊的弹性势能','#ebba75'],['total','记录的机械能','#c8a5f6']],
} as const
type Tab = keyof typeof groups | 'Compare'
const tabLabels: Record<Tab,string> = {Position:'位置',Velocity:'速度',Acceleration:'加速度',Energy:'能量',Compare:'对比'}
const metricLabels: Record<string,string> = {'Final speed':'末速','Final velocity X':'末速度 X','Final velocity Y':'末速度 Y','Energy change':'机械能变化','Peak height':'最高点高度','Horizontal range':'水平射程','Flight time':'飞行时间','Oscillation period':'振动周期','Trajectory RMS error':'轨迹均方根误差'}
const units={Position:'m',Velocity:'m/s',Acceleration:'m/s²',Energy:'J',Compare:'m'}
export type Baseline = {scene:Experiment;body:BodyConfig;samples:Sample[]}
interface Props {
  scene:Experiment; results:Map<string,Sample[]>; selected:string; select:(id:string)=>void
  baseline?:Baseline; setBaseline:(b:Baseline|undefined)=>void; replay?:boolean
}
function landing(scene:Experiment,body:BodyConfig) {
  if(!scene.environment.collisions||body.geometry.kind!=='circle')return
  const ground=scene.bodies.find(b=>b.geometry.kind==='surface'&&b.angle===0)
  if(ground?.geometry.kind==='surface') return ground.position.y+ground.geometry.height/2+body.geometry.radius
}
export function AnalysisPanel({scene,results,selected,select,baseline,setBaseline,replay}:Props) {
  const [tab,setTab]=useState<Tab>('Position')
  const [collapsed,setCollapsed]=useState(false)
  const [height,setHeight]=useState<number>()
  const panel=useRef<HTMLElement>(null)
  const resize=useRef<{y:number;height:number}|null>(null)
  function resizeTo(px:number) {setHeight(Math.max(175,Math.min(420,px)))}
  const [hidden,setHidden]=useState<string[]>([])
  const bodies=scene.bodies.filter(b=>b.type==='dynamic')
  const body=bodies.find(b=>b.id===selected)??bodies[0]
  const samples=(body&&results.get(body.id))||[]
  const series=tab==='Compare'?[]:groups[tab]
  const stride=Math.max(1,Math.ceil(samples.length/750))
  const points=samples.filter((_,i)=>i%stride===0||i===samples.length-1)
  const comparison=body?metrics(samples,scene.kind,landing(scene,body)):{}
  const previous=baseline?metrics(baseline.samples,baseline.scene.kind,landing(baseline.scene,baseline.body)):{}
  const impact=body?landing(scene,body):undefined
  const time=body&&impact!==undefined?flightTime(body.position.y-impact,body.velocity.y,scene.environment.gravity):Infinity
  const theoretical=scene.kind==='projectile'&&body&&time>0&&Number.isFinite(time)?{
    time, range:Math.abs(projectile(body.position,body.velocity,scene.environment.gravity,time).x-body.position.x),
    peak:projectile(body.position,body.velocity,scene.environment.gravity,scene.environment.gravity>0?Math.max(0,Math.min(time,body.velocity.y/scene.environment.gravity)):time).y,
    rmse:Math.sqrt(samples.filter(s=>s.time<=time).reduce((sum,s)=>{
      const ref=projectile(body.position,body.velocity,scene.environment.gravity,s.time)
      return sum+(s.x-ref.x)**2+(s.y-ref.y)**2
    },0)/Math.max(1,samples.filter(s=>s.time<=time).length)),
  }:undefined
  function exportCsv() {
    const data=[...results.values()].flat().sort((a,b)=>a.time-b.time)
    downloadText(scene.title,'csv','text/csv;charset=utf-8',toCsv(data))
  }
  return <section ref={panel} className={'analysis-panel'+(collapsed?' collapsed':'')} aria-label="数据分析" style={collapsed?undefined:{flexBasis:height}}>
    {!collapsed&&<div className="analysis-resizer" tabIndex={0} role="separator" aria-label="调整分析面板高度" aria-orientation="horizontal"
      aria-valuemin={175} aria-valuemax={420} aria-valuenow={height??244} title="拖动调整分析面板高度"
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
      <button className="button compact subtle" aria-label="设为基准" disabled={replay||!body||samples.length<2} onClick={()=>{setBaseline({scene,body:body!,samples:samples.slice()});setTab('Compare');setCollapsed(false)}}><Pin size={14}/><span>设为基准</span></button>
      <button className="button compact" aria-label="导出 CSV" disabled={!samples.length} onClick={exportCsv}><Download size={14}/><span>导出 CSV</span></button>
      <button className="icon" aria-label={collapsed?'展开分析面板':'收起分析面板'} onClick={()=>setCollapsed(!collapsed)}>{collapsed?<ChevronsUp size={16}/>:<ChevronsDown size={16}/>}</button>
    </div></div>
    {!collapsed&&<>
      <div className="analysis-tabs-row"><div className="tabs analysis-tabs">
        {(['Position','Velocity','Acceleration','Energy','Compare'] as const).map(t=><button key={t} className={t===tab?'chosen':''} onClick={()=>setTab(t)}>{t==='Compare'&&<GitCompareArrows size={13}/>} {tabLabels[t]}</button>)}
      </div><select aria-label="分析对象" value={body?.id??''} onChange={e=>select(e.target.value)}>{!body&&<option value="">没有动态物体</option>}{bodies.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
      {tab==='Compare'?<div className="comparison">
        {baseline&&<div className="baseline-label"><span className="dot lavender"/>{baseline.scene.title} · {baseline.body.name}<button className="text-button" onClick={()=>setBaseline(undefined)}>清除基准</button></div>}
        {!baseline&&!theoretical&&<p className="muted">{replay?'退出回放后可设置基准。':'记录一次运行并设为基准，就可以比较不同参数下的结果。基准轨迹会显示在画布上。'}</p>}
        {(baseline||theoretical)&&<table><thead><tr><th>指标</th><th>本次运行</th>{baseline&&<th>基准</th>}{theoretical&&<th>理论参考值</th>}</tr></thead>
          <tbody>{[...new Set([...Object.keys(comparison),...Object.keys(previous),...(theoretical?['Peak height','Horizontal range','Flight time','Trajectory RMS error']:[])])].map(key=><tr key={key}><th>{metricLabels[key]}</th><td>{key==='Trajectory RMS error'&&theoretical&&samples.length>1?theoretical.rmse.toFixed(3)+' m':comparison[key]??'—'}</td>{baseline&&<td>{previous[key]??'—'}</td>}{theoretical&&<td>{key==='Peak height'?theoretical.peak.toFixed(2)+' m':key==='Horizontal range'?theoretical.range.toFixed(2)+' m':key==='Flight time'?theoretical.time.toFixed(2)+' s':'—'}</td>}</tr>)}</tbody>
        </table>}
      </div>:<>
        <div className="chart-wrap" aria-label={tabLabels[tab]+'随模拟时间变化'}>
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={110}>
            <LineChart data={points} margin={{left:0,right:16,top:8,bottom:2}}>
              <CartesianGrid stroke="#273651" vertical={false} strokeDasharray="3 4"/>
              <XAxis dataKey="time" type="number" domain={[0,Math.max(1,samples.at(-1)?.time??0)]} tickFormatter={x=>Number(x.toFixed(2))+' s'} tick={{fill:'#a2b3cb',fontSize:10}} tickLine={false} axisLine={{stroke:'#3a4b67'}}/>
              <YAxis width={55} tickFormatter={x=>Number(x.toFixed(2))+' '+units[tab]} tick={{fill:'#a2b3cb',fontSize:10}} tickLine={false} axisLine={false}/>
              <Tooltip labelFormatter={t=>Number(t).toFixed(3)+' s'} formatter={value=>typeof value==='number'?value.toFixed(3)+' '+units[tab]:String(value)} contentStyle={{background:'#1b263c',border:'1px solid #415575',borderRadius:8,fontSize:12}}/>
              {series.map(([key,label,color])=><Line key={key} type="linear" name={label} dataKey={key} stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} hide={hidden.includes(key)}/>)}
            </LineChart>
          </ResponsiveContainer>
          {samples.length<2&&<div className="chart-empty">{body?'运行模拟后即可查看数据':'添加动态物体以记录数据'}</div>}
        </div>
        <div className="series">{series.map(([key,label,color])=><button key={key} className={hidden.includes(key)?'series-hidden':''} aria-pressed={!hidden.includes(key)} onClick={()=>setHidden(hidden.includes(key)?hidden.filter(k=>k!==key):[...hidden,key])}><span className="dot" style={{background:color}}/>{label}</button>)}
          {tab==='Energy'&&<small>按物体统计并计入分摊的弹性势能。摩擦、阻尼和外力做功会改变机械能。</small>}
        </div>
      </>}
    </>}
  </section>
}
