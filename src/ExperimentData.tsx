import { useState } from 'react'
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { downloadText } from './download'
import { formatNumber } from './numberFormat'
import { useEffect } from 'react'
import type { DataView } from './spatialWorkspace'

export type DataRow=Record<string,number|undefined>
export type Variable=readonly [key:string,label:string,unit:string,source?:'理论'|'误差'|'派生']
export type DataSeries={id:string;name:string;rows:readonly DataRow[]}
const colors=['#b3cced','#e8be83','#c6b7df','#8acfb8']

export function ExperimentData({title,variables,subjects,axis=variables[0][0],mode='严格物理',markers=[],settings,onSettings}:{
  title:string;variables:readonly Variable[];subjects:readonly DataSeries[];axis?:string;mode?:string;markers?:readonly number[];
  settings?:DataView;onSettings?:(settings:DataView)=>void
}) {
  const [abscissa,setAbscissa]=useState(settings?.abscissa??axis)
  const [subjectId,setSubject]=useState(settings?.subjectId??'')
  const [compareId,setCompare]=useState(settings?.compareId??'')
  const [ordinate,setOrdinate]=useState(settings?.ordinate??variables[1]?.[0]??axis)
  const [extra,setExtra]=useState<string[]>(settings?.extra??[])
  const [start,setStart]=useState(settings?.start??'')
  const [end,setEnd]=useState(settings?.end??'')
  useEffect(()=>{onSettings?.({abscissa,ordinate,subjectId,compareId,extra,start,end})},
    [onSettings,abscissa,ordinate,subjectId,compareId,extra,start,end])
  const subject=subjects.find(item=>item.id===subjectId)??subjects[0]
  const x=variables.find(variable=>variable[0]===abscissa)??variables[0]
  const y=variables.find(variable=>variable[0]===ordinate)??variables[1]??x
  const lines=[y,...variables.filter(variable=>extra.includes(variable[0])&&variable[0]!==x[0]&&variable[0]!==y[0]&&variable[2]===y[2])].slice(0,4)
  const from=start===''?-Infinity:Number(start),to=end===''?Infinity:Number(end)
  const compare=axis==='time'&&x[0]===axis?subjects.find(item=>item.id===compareId&&item.id!==subject?.id):undefined
  const comparison=new Map(compare?.rows.map(row=>[row[axis],row[y[0]]]))
  const samples=(subject?.rows.filter(row=>Number.isFinite(row[x[0]])&&row[x[0]]!>=from&&row[x[0]]!<=to)??[])
    .map(row=>compare?{...row,comparison:comparison.get(row[axis])}:row)
  const stride=Math.max(1,Math.ceil(samples.length/900))
  const plotted=samples.filter((_,i)=>i%stride===0||i===samples.length-1)
  const label=([,name,unit,source]:Variable)=>name+(unit?' ('+unit+')':'')+(source?' · '+source:'')
  const comparisonLabel=compare?.name+' · '+label(y)
  function exportCsv() {
    const variables=[x,...lines.filter(line=>line[0]!==x[0])]
    const escape=(value:string)=>'"'+value.replaceAll('"','""')+'"'
    const header=['对象','模式',...variables.map(label),...(compare?[comparisonLabel]:[])].map(escape).join(',')
    const rows=samples.map(row=>[escape(subject!.name),escape(mode),...variables.map(([key])=>row[key]??''),...(compare?[row.comparison??'']:[])].join(','))
    downloadText(title,'csv','text/csv;charset=utf-8',[header,...rows].join('\r\n'))
  }
  return <section className="experiment-data" aria-label="统一变量分析">
    <div className="data-controls">
      {subjects.length>1&&<label>对象<select value={subject?.id??''} onChange={e=>setSubject(e.target.value)}>
        {subjects.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
      </select></label>}
      {subjects.length>1&&axis==='time'&&x[0]===axis&&<label>叠加对象<select value={compare?.id??''} onChange={e=>setCompare(e.target.value)}>
        <option value="">无</option>{subjects.filter(item=>item.id!==subject?.id).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
      </select></label>}
      <label>横轴<select value={x[0]} onChange={e=>{setAbscissa(e.target.value);setStart('');setEnd('')}}>
        {variables.map(variable=><option key={variable[0]} value={variable[0]}>{label(variable)}</option>)}
      </select></label>
      <label>纵轴<select value={y[0]} onChange={e=>{setOrdinate(e.target.value);setExtra([])}}>
        {variables.map(variable=><option key={variable[0]} value={variable[0]}>{label(variable)}</option>)}
      </select></label>
      <label>横轴下限 <input type="number" step="any" value={start} onChange={e=>setStart(e.target.value)}/></label>
      <label>横轴上限 <input type="number" step="any" value={end} onChange={e=>setEnd(e.target.value)}/></label>
      <button type="button" className="button compact" disabled={!samples.length} onClick={exportCsv}>导出选区 CSV</button>
    </div>
    <div className="data-controls" role="group" aria-label="叠加同单位曲线">
      {variables.filter(variable=>variable[2]===y[2]&&variable[0]!==y[0]&&variable[0]!==x[0]).map(variable=><label key={variable[0]}>
        <input type="checkbox" disabled={extra.length>=3&&!extra.includes(variable[0])} checked={extra.includes(variable[0])}
          onChange={e=>setExtra(e.target.checked?[...extra,variable[0]]:extra.filter(key=>key!==variable[0]))}/>{label(variable)}
      </label>)}
    </div>
    {from>to&&<p className="muted" role="status">横轴上限应大于或等于下限。</p>}
    {plotted.length>0?<div className="data-plot">
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <LineChart data={plotted} margin={{top:8,right:16,bottom:3,left:3}}>
          <CartesianGrid stroke="var(--line)" vertical={false} strokeDasharray="3 4"/>
          <XAxis dataKey={x[0]} type="number" domain={['dataMin','dataMax']} tickFormatter={value=>formatNumber(value)}/>
          <YAxis unit={y[2]?' '+y[2]:''} width={76} tickFormatter={value=>formatNumber(value)} domain={['auto','auto']}/>
          <Tooltip labelFormatter={value=>label(x)+' '+formatNumber(Number(value))} formatter={value=>formatNumber(Number(value))}
            contentStyle={{background:'var(--raised)',border:'1px solid var(--line-strong)'}}/>
          <Legend wrapperStyle={{fontSize:11}}/>
          {lines.map((variable,i)=><Line key={variable[0]} dataKey={variable[0]} name={label(variable)} stroke={colors[i]}
            strokeDasharray={i===0?undefined:`${5+i} ${3+i}`} dot={plotted.length<2} connectNulls={false} isAnimationActive={false}/>)}
          {compare&&<Line dataKey="comparison" name={comparisonLabel} stroke="#eee" strokeDasharray="2 5"
            dot={plotted.length<2} connectNulls={false} isAnimationActive={false}/>}
          {x[0]===axis&&axis==='time'&&markers.slice(-100).map((time,i)=><ReferenceLine key={i} x={time} stroke="#9ba0ad" strokeDasharray="2 4"/>)}
        </LineChart>
      </ResponsiveContainer>
    </div>:<p className="muted">当前区间没有样本。</p>}
    <small>{mode} · {samples.length} 个样本</small>
  </section>
}
