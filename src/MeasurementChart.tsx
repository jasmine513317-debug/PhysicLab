import { useState } from 'react'
import { Ruler } from 'lucide-react'
import { CartesianGrid, Line, LineChart, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, ZIndexLayer, usePlotArea } from 'recharts'
import type { Sample } from './analysis'
import { measureInterval, nearestSample, type MeasuredQuantity } from './chartMeasurement'
import { formatNumber } from './numberFormat'
import './measurementChart.css'

export const groups = {
  Position:[['x','X 坐标','#8bdaff'],['y','Y 坐标','#a6a8ff']],
  Velocity:[['vx','X 方向速度','#8bdaff'],['vy','Y 方向速度','#a6a8ff'],['speed','速率','#ebba75']],
  Acceleration:[['ax','X 方向加速度','#8bdaff'],['ay','Y 方向加速度','#a6a8ff']],
  Energy:[['kinetic','动能','#8bdaff'],['potential','重力势能','#a6a8ff'],['spring','分摊的弹性势能','#ebba75'],['total','记录的机械能','#c8a5f6']],
} as const
type Group = keyof typeof groups
type Marker = 'A' | 'B'
const markers = ['A', 'B'] as const
const markerColors = {A:'#8bdaff', B:'#ffd295'}
const units = {Position:'m', Velocity:'m/s', Acceleration:'m/s²', Energy:'J'}
const slopeUnits = {Position:'m/s', Velocity:'m/s²', Acceleration:'m/s³', Energy:'W'}
const rounded = (value:number) => Number(value.toFixed(3)).toString()

function PlotPicker({start,end,pick}:{start:number;end:number;pick:(time:number)=>void}) {
  const plot = usePlotArea()
  if (!plot || !plot.width || !plot.height) return null
  return <ZIndexLayer zIndex={3000}><rect x={plot.x} y={plot.y} width={plot.width} height={plot.height} fill="transparent"
    aria-hidden="true" style={{cursor:'crosshair'}} onClick={event=>{
      const bounds = event.currentTarget.getBoundingClientRect()
      if (bounds.width) pick(start + (event.clientX - bounds.left) / bounds.width * (end - start))
    }}/></ZIndexLayer>
}

interface Props {
  group:Group; title:string; samples:Sample[]; hasBody:boolean
  hidden:string[]; toggleSeries:(key:string)=>void
  source?:Sample[]
  events?:readonly {time:number}[]
}

export function MeasurementChart({group,title,samples,hasBody,hidden,toggleSeries,source=samples,events}:Props) {
  const [enabled,setEnabled] = useState(false)
  const [quantity,setQuantity] = useState<MeasuredQuantity>(group==='Velocity'?'vy':groups[group][0][0])
  const [target,setTarget] = useState<Marker>('A')
  const [selection,setSelection] = useState<{source:Sample[]; A?:Sample; B?:Sample}>()
  const visible = groups[group].filter(([key])=>!hidden.includes(key))
  const series = visible.find(([key])=>key===quantity) ?? visible[0]
  const unit = units[group]
  const start = samples[0]?.time ?? 0
  const lastTime = samples.at(-1)?.time ?? 0
  const end = Math.max(start+1, lastTime)
  const stride = Math.max(1,Math.ceil(samples.length/750))
  const points = samples.filter((_,i)=>i%stride===0||i===samples.length-1)
  const retained = (point?:Sample) => selection?.source===source && point && point.time>=start ? point : undefined
  const a = retained(selection?.A), b = retained(selection?.B)
  const interval = a && b && series ? measureInterval(a,b,series[0]) : undefined
  const active = enabled && samples.length>=2
  const next = !a && !b ? 'A' : target

  function pick(time:number, marker:Marker=next) {
    const point = nearestSample(samples,time)
    if (!point) return
    setSelection({source,A:a,B:b,[marker]:point})
    setTarget(marker==='A'?'B':'A')
  }

  return <div className={'measured-chart'+(active?' chart-ruler-active':'')}>
    <div className="chart-wrap" aria-label={title+'随模拟时间变化'}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={110}>
        <LineChart data={points} margin={{left:0,right:16,top:8,bottom:2}}>
          <CartesianGrid stroke="#273651" vertical={false} strokeDasharray="3 4"/>
          <XAxis dataKey="time" type="number" domain={[start,end]} allowDataOverflow tickFormatter={x=>Number(x.toFixed(2))+' s'} tick={{fill:'#a2b3cb',fontSize:10}} tickLine={false} axisLine={{stroke:'#3a4b67'}}/>
          <YAxis width={55} tickFormatter={x=>Number(x.toFixed(2))+' '+unit} tick={{fill:'#a2b3cb',fontSize:10}} tickLine={false} axisLine={false}/>
          <Tooltip labelFormatter={t=>Number(t).toFixed(3)+' s'} formatter={value=>typeof value==='number'?value.toFixed(3)+' '+unit:String(value)}
            contentStyle={{background:'var(--raised)',border:'1px solid var(--line)',borderRadius:'var(--radius-md)',fontSize:'var(--text-xs)',color:'var(--text)'}}
            itemStyle={{color:'var(--text)'}} labelStyle={{color:'var(--soft)'}}/>
          {groups[group].map(([key,label,color])=><Line key={key} type="linear" name={label} dataKey={key} stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} hide={hidden.includes(key)}/>)}
          {events?.slice(-100).map((event,i)=><ReferenceLine key={i} x={event.time} stroke="var(--comparison)" strokeDasharray="3 3"/>)}
          {active && series && markers.map(marker=>{
            const point = marker==='A'?a:b
            return point && <ReferenceLine key={marker} x={point.time} stroke={markerColors[marker]} strokeDasharray="3 3"/>
          })}
          {active && series && markers.map(marker=>{
            const point = marker==='A'?a:b
            return point && <ReferenceDot key={marker} x={point.time} y={point[series[0]]} r={4} fill={markerColors[marker]} stroke="#172236"
              ifOverflow="extendDomain" label={{value:marker,position:'insideBottom',offset:7,fill:markerColors[marker],fontSize:12}}/>
          })}
          {active && series && <PlotPicker start={start} end={end} pick={pick}/>}
        </LineChart>
      </ResponsiveContainer>
      {samples.length<2&&<div className="chart-empty">{hasBody?'运行模拟后即可查看数据':'添加动态物体以记录数据'}</div>}
    </div>
    <div className="series">{groups[group].map(([key,label,color])=><button key={key} className={hidden.includes(key)?'series-hidden':''} aria-pressed={!hidden.includes(key)} onClick={()=>toggleSeries(key)}><span className="dot" style={{background:color}}/>{label}</button>)}
      <button className="chart-ruler-toggle" aria-pressed={active} disabled={samples.length<2||(!active&&!visible.length)} onClick={()=>setEnabled(!active)}><Ruler size={14}/> A/B 测量</button>
      {group==='Energy'&&<small>按物体统计并计入分摊的弹性势能。摩擦、阻尼和外力做功会改变机械能。</small>}
    </div>
    {active && <div className="chart-ruler-controls" role="group" aria-label="两点测量">
      {series ? <>
        <div className="chart-ruler-inputs">
          <label>测量曲线 <select aria-label="测量曲线" value={series[0]} onChange={e=>setQuantity(e.target.value as MeasuredQuantity)}>
            {visible.map(([key,label])=><option key={key} value={key}>{label}</option>)}
          </select></label>
          {markers.map(marker=>{
            const point = marker==='A'?a:b
            return <label key={marker} className="marker-field"><span style={{color:markerColors[marker]}}>{marker}</span>
              <input key={point?.time??'empty'} type="number" inputMode="decimal" min={start} max={lastTime} step="any" aria-label={marker+' 点时间（秒）'} placeholder="时间" defaultValue={point?formatNumber(point.time):''}
                onKeyDown={e=>{if(e.key==='Enter') e.currentTarget.blur()}}
                onBlur={e=>{
                  const input = e.currentTarget
                  if (input.value!=='' && Number.isFinite(input.valueAsNumber)) {
                    const time = nearestSample(samples,input.valueAsNumber)?.time
                    if(time!==undefined) {input.value=formatNumber(time);pick(time,marker)}
                  } else input.value=point?formatNumber(point.time):''
                }}/> s
              {point && <span className="marker-value">{rounded(point[series[0]])} {unit}</span>}
            </label>
          })}
          {(a||b)&&<button className="text-button" onClick={()=>{setSelection(undefined);setTarget('A')}}>重选两点</button>}
        </div>
        <div className="chart-ruler-readout" aria-live="polite">
          {interval ? <><span>Δt <b>{rounded(interval.duration)} s</b></span><span>{series[1]}变化 <b>{rounded(interval.change)} {unit}</b></span>
            <span>斜率 <b>{interval.slope===undefined?'两点同一时刻':rounded(interval.slope)+' '+slopeUnits[group]}</b></span></>
            : <span>点击曲线图选取 {next} 点，也可输入时间。</span>}
        </div>
      </> : <span>点亮一条曲线即可测量。</span>}
    </div>}
  </div>
}
