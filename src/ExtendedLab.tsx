import { useEffect, useId, useMemo, useState } from 'react'
import { Download, Pause, Play, RotateCcw, Save, StepForward } from 'lucide-react'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { createExtendedExperiment, extendedSchema, extendedTemplates, extensionUrl, type ExtendedExperiment, type Extension, type GravityBody } from './extended-experiments'
import { ExtendedSimulation, extendedCsv, pendulumPeriods } from './extended-physics'
import { ExtendedCanvas } from './ExtendedCanvas'
import { loadExtended, saveExtended } from './repository'
import { downloadText } from './download'
import { appUrl } from './routes'
import { formatNumber } from './numberFormat'
import './astronomy.css'
import './extended.css'

type Field=readonly [key:string,label:string,unit:string,min:number,max:number]
const fields:Record<Extension,readonly Field[]>={
  pendulum:[['length','摆长','m',.05,30],['mass','摆球质量','kg',.001,1000],['gravity','重力加速度','m/s²',0,100],['angle','初始角度','°',-179,179],['angularSpeed','初始角速度','rad/s',-30,30]],
  particle:[['mass','粒子质量','kg',1e-32,100],['charge','电荷量','C',-10,10],['ex','电场 X','V/m',-100,100],['ey','电场 Y','V/m',-100,100],['bz','磁场 Z','T',-10,10],['vx','初速度 X','m/s',-1e7,1e7],['vy','初速度 Y','m/s',-1e7,1e7]],
  rc:[['voltage','电源电压','V',-100,100],['resistance','电阻','Ω',10,100000],['capacitance','电容','µF',1,10000],['initialVoltage','电容初始电压','V',-100,100]],
  'double-pendulum':[['length1','第一摆长','m',.1,10],['length2','第二摆长','m',.1,10],['mass1','第一摆球质量','kg',.05,50],['mass2','第二摆球质量','kg',.05,50],
    ['gravity','重力加速度','m/s²',0,30],['angle1','第一摆初始角度','°',-180,180],['angle2','第二摆初始角度','°',-180,180],
    ['speed1','第一摆初始角速度','rad/s',-10,10],['speed2','第二摆初始角速度','rad/s',-10,10],['perturbation','对照组第二摆角扰动','°',0,5]],
  induction:[['area','回路面积','m²',.001,10],['field','初始磁场','T',-10,10],['slope','磁场变化率','T/s',-10,10],
    ['angle','磁场与回路法线夹角','°',-180,180],['resistance','回路电阻','Ω',.1,100000]],
  'three-body':[['perturbation','对照组天体 3 的 X 位移','AU',0,.5]],
  'gravity-assist':[['measurementRadius','飞掠测量半径','AU',.005,2]],
}
const bodyFields=[
  ['mass','质量','M☉',1e-15,10],['x','位置 X','AU',-20,20],['y','位置 Y','AU',-20,20],
  ['vx','初速度 X','AU/年',-100,100],['vy','初速度 Y','AU/年',-100,100],
] as const satisfies readonly (Field & readonly [keyof GravityBody,string,string,number,number])[]
const descriptions:Record<Extension,string>={
  pendulum:'理想点质量摆。周期测量取同方向经过最低点的时间间隔。',
  particle:'二维非相对论运动。电场在画布平面内，磁场垂直于画布。示例采用便于观察的质量和电荷量。',
  rc:'理想直流电源、单电阻和电容。运行时开关在恒定电压源与放电回路之间切换。',
  'double-pendulum':'两个理想点质量由轻杆连接。四阶积分以半步长结果检查数值误差。两条轨迹的差距接近步长误差时，当前结果不足以判断初值敏感性。',
  induction:'固定单匝回路。均匀磁场在 10 秒内线性变化。忽略自感和磁场反馈，断开回路时仍有感应电动势。',
  'three-body':'平面中的三个牛顿点质量。近距离自动缩小积分步长，任意一对距离接近 0.002 AU 时暂停。天体大小仅用于标记。',
  'gravity-assist':'恒星、行星和航天器共同参与牛顿引力计算。进出同一行星距离时采样，比动能按各参考系的相对速度计算。轨迹为教学场景。',
}

function number(value:number|undefined,digits=4) {
  if(value===undefined||!Number.isFinite(value))return '—'
  if(value!==0&&(Math.abs(value)<.001||Math.abs(value)>=100000))return value.toExponential(3)
  return String(Number(value.toFixed(digits)))
}

function FieldInput({field,value,change}:{field:Field;value:number;change:(value:number)=>void}) {
  const [,label,unit,min,max]=field
  const id=useId(),[error,setError]=useState(false),display=formatNumber(value)
  return <div className="astronomy-field"><label htmlFor={id}>{label} <small>{unit}</small></label>
    <input id={id} key={value} type="number" step="any" min={min} max={max} defaultValue={display} aria-invalid={error}
      aria-describedby={error?id+'-error':undefined} onChange={()=>setError(false)} onKeyDown={event=>{if(event.key==='Enter')event.currentTarget.blur()}}
      onBlur={event=>{
        const next=event.currentTarget.valueAsNumber
        if(!Number.isFinite(next)||next<min||next>max){setError(true);return}
        if(next!==Number(display))change(next)
      }}/>{error&&<small id={id+'-error'} className="astronomy-field-error">请输入 {min} 至 {max} {unit}。</small>}
  </div>
}

function readings(engine:ExtendedSimulation):[string,string][] {
  const {scene,current}=engine
  switch(scene.extension) {
    case 'pendulum': {
      const periods=pendulumPeriods(scene.settings)
      return [['实测摆动周期',number(engine.measuredPeriod)+' s'],['小角度周期',number(periods.smallAngle)+' s'],
        ['有限振幅理论周期',number(periods.finiteAmplitude)+' s'],['机械能',number(current.energy)+' J']]
    }
    case 'particle': {
      const {mass,charge,bz,ex,ey,vx,vy}=scene.settings,frequency=Math.abs(charge*bz/mass)
      const radius=frequency&&ex===0&&ey===0?Math.hypot(vx,vy)/frequency:undefined
      return [['速率',number(Math.hypot(current.vx,current.vy))+' m/s'],['动能',number(current.energy)+' J'],
        ['回旋半径（纯磁场）',number(radius)+' m'],['回旋频率',number(frequency/(2*Math.PI))+' Hz']]
    }
    case 'rc': {
      const ideal=current.sourceVoltage+(engine.rcStartVoltage-current.sourceVoltage)/Math.E
      return [['电容电压',number(current.voltage)+' V'],['电流',number(current.current*1000)+' mA'],['时间常数 RC',number(engine.timeConstant())+' s'],
        ['一倍时间常数理论电压',number(ideal)+' V'],['一倍时间常数实测电压',number(engine.rcTauVoltage)+' V']]
    }
    case 'double-pendulum': {
      const sample=current.doublePendulum!
      return [['第二摆球与对照组的距离',number(sample.divergence)+' m'],['半步长轨迹差',number(sample.resolutionError)+' m'],
        ['机械能',number(sample.energy)+' J'],['归一化能量漂移',number(100*sample.energyDrift)+'%']]
    }
    case 'induction': {
      const sample=current.induction!
      return [['磁感应强度',number(sample.field)+' T'],['磁通量',number(sample.flux)+' Wb'],
        ['感应电动势',number(sample.emf)+' V'],['感应电流',number(sample.current)+' A']]
    }
    case 'three-body':
    case 'gravity-assist': {
      const sample=current.gravity!
      const rows:[string,string][]=[
        ['质心坐标',number(sample.center.x)+'，'+number(sample.center.y)+' AU'],
        ['总能量',number(sample.energy)+' M☉·AU²/年²'],['归一化能量漂移',number(100*sample.energyDrift)+'%'],
        ['总线动量漂移',number(sample.momentumDrift)+' M☉·AU/年'],['总角动量漂移',number(sample.angularMomentumDrift)+' M☉·AU²/年'],
      ]
      return scene.extension==='three-body'?[
        ['天体 3 与对照组的距离',number(sample.divergence)+' AU'],['任意两天体最小距离',number(engine.gravity!.minimumDistance)+' AU'],...rows,
      ]:[
        ['行星与航天器最近距离',number(engine.gravity!.minimumDistance)+' AU'],...rows,
      ]
    }
  }
}

type Series=readonly [dataKey:string,name:string,axis?:'right']
const charts:Record<Extension,{title:string;series:readonly Series[]}>={
  pendulum:{title:'摆角随时间变化',series:[['angleDeg','摆角（°）']]},
  particle:{title:'速度分量随时间变化',series:[['vx','X 速度（m/s）'],['vy','Y 速度（m/s）']]},
  rc:{title:'电压与电流',series:[['voltage','电容电压（V）'],['currentMa','电流（mA）','right']]},
  'double-pendulum':{title:'初值敏感性与步长误差',series:[['divergence','对照组分离距离（m）'],['resolutionError','半步长轨迹差（m）']]},
  induction:{title:'磁通量与感应电动势',series:[['flux','磁通量（Wb）'],['emf','感应电动势（V）','right']]},
  'three-body':{title:'三体轨迹差与能量漂移',series:[['divergence','天体 3 分离距离（AU）'],['energyDrift','归一化能量漂移（%）','right']]},
  'gravity-assist':{title:'航天器相对速度',series:[['starSpeed','恒星系（km/s）'],['planetSpeed','行星系（km/s）']]},
}

function SampleChart({engine}:{engine:ExtendedSimulation}) {
  const chart=charts[engine.scene.extension],unit=engine.gravity?' 年':' s'
  const history=engine.history.at(-1)===engine.current?engine.history:[...engine.history,engine.current]
  const stride=Math.max(1,Math.ceil(history.length/500))
  const data=history.filter((_,index)=>index%stride===0||index===history.length-1)
    .map(sample=>({
      time:sample.time,angleDeg:sample.angle*180/Math.PI,vx:sample.vx,vy:sample.vy,voltage:sample.voltage,currentMa:sample.current*1000,
      divergence:sample.doublePendulum?.divergence??sample.gravity?.divergence,resolutionError:sample.doublePendulum?.resolutionError,
      flux:sample.induction?.flux,emf:sample.induction?.emf,energyDrift:sample.gravity&&sample.gravity.energyDrift*100,
      starSpeed:sample.gravity?.starSpeed,planetSpeed:sample.gravity?.planetSpeed,
    }))
  return <section className="astronomy-analysis" aria-label="扩展实验图表">
    <h2>{chart.title}</h2>
    <div className="extended-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={data} margin={{top:6,right:4,bottom:1,left:6}}>
      <CartesianGrid stroke="var(--line)" vertical={false} strokeDasharray="3 4"/>
      <XAxis dataKey="time" type="number" domain={[data[0].time,data.at(-1)!.time||engine.dt]} tickFormatter={value=>number(value)+unit} tick={{fill:'var(--dim)',fontSize:10}}/>
      <YAxis yAxisId="left" width={48} tickFormatter={value=>number(value,2)} tick={{fill:'var(--dim)',fontSize:10}}/>
      {chart.series.some(([, ,axis])=>axis==='right')&&<YAxis yAxisId="right" orientation="right" width={48} tickFormatter={value=>number(value,2)} tick={{fill:'var(--dim)',fontSize:10}}/>}
      <Tooltip labelFormatter={time=>number(Number(time))+unit} formatter={value=>number(Number(value))} contentStyle={{background:'var(--raised)',border:'1px solid var(--line-strong)'}}/>
      <Legend wrapperStyle={{fontSize:11}}/>
      {chart.series.map(([dataKey,name,axis],index)=><Line key={dataKey} yAxisId={axis??'left'} dataKey={dataKey} name={name}
        stroke={index===0?'#a6bfff':'#f2c38b'} strokeDasharray={index===0?undefined:'5 3'} dot={false} isAnimationActive={false}/>)}
    </LineChart></ResponsiveContainer></div>
  </section>
}

function FlybyTable({engine}:{engine:ExtendedSimulation}) {
  const {incoming,outgoing}=engine.gravity!
  const rows=[
    ['恒星系速度（km/s）',incoming?.starSpeed,outgoing?.starSpeed],
    ['行星系速度（km/s）',incoming?.planetSpeed,outgoing?.planetSpeed],
    ['恒星系比动能（km²/s²）',incoming?.starEnergy,outgoing?.starEnergy],
    ['行星系比动能（km²/s²）',incoming?.planetEnergy,outgoing?.planetEnergy],
  ] as const
  return <section className="astronomy-analysis" aria-label="飞掠测量">
    <h2>飞掠前后对比</h2>
    <p className="muted">{outgoing?'已记录进入和离开测量半径的读数。':incoming?'已记录入站，等待航天器离开测量半径。':'等航天器从测量半径外进入，再比较出站读数。'}</p>
    <div className="astronomy-table-wrap"><table>
      <thead><tr><th scope="col">观测量</th><th scope="col">入站</th><th scope="col">出站</th><th scope="col">变化</th></tr></thead>
      <tbody>{rows.map(([label,before,after])=><tr key={label}><th scope="row">{label}</th><td>{number(before)}</td><td>{number(after)}</td>
        <td>{before===undefined||after===undefined?'—':number(after-before)}</td></tr>)}</tbody>
    </table></div>
  </section>
}

export function ExtendedLab({search,extension,active,updateSavedAddress}:{search:string;extension:Extension;active:boolean;updateSavedAddress:(id:string)=>void}) {
  const id=new URLSearchParams(search).get('id')
  const [scene,setScene]=useState<ExtendedExperiment>()
  const [error,setError]=useState('')
  useEffect(()=>{
    let mounted=true
    if(id)void loadExtended(id).then(record=>{
      if(record.extension!==extension)throw new Error('实验链接与保存的类型不符。')
      if(mounted)setScene(record)
    }).catch(reason=>{if(mounted)setError(reason instanceof Error?reason.message:'无法读取实验。')})
    else setScene(createExtendedExperiment(extension))
    return ()=>{mounted=false}
  },[extension,id])
  if(!scene)return <main className="page-width library">{error?<p role="alert" className="error-banner">{error}</p>:<p className="muted">正在打开实验…</p>}</main>
  return <Editor initial={scene} initiallySaved={Boolean(id)} active={active} updateSavedAddress={updateSavedAddress}/>
}

function Editor({initial,initiallySaved,active,updateSavedAddress}:{initial:ExtendedExperiment;initiallySaved:boolean;active:boolean;updateSavedAddress:(id:string)=>void}) {
  const [scene,setScene]=useState(initial)
  const [saved,setSaved]=useState(initiallySaved?initial:undefined)
  const [saving,setSaving]=useState(false)
  const [error,setError]=useState('')
  const [running,setRunning]=useState(false)
  const [speed,setSpeed]=useState(1)
  const [generation,reset]=useState(0)
  const [revision,redraw]=useState(0)
  const [planetFrame,setPlanetFrame]=useState(true)
  const engine=useMemo(()=>new ExtendedSimulation(scene),[scene.settings,scene.extension,generation])
  const currentSettings=scene.settings as unknown as Record<string,number>
  const template=extendedTemplates.find(candidate=>candidate.id===scene.extension)!

  useEffect(()=>{
    if(!active){if(running)setRunning(false);return}
    if(!running)return
    let frame=0,last:number|undefined,remaining=0
    function tick(now:number) {
      if(last!==undefined)remaining+=Math.min(.05,(now-last)/1000)*speed*engine.rate
      last=now
      let steps=0
      while(remaining>=engine.dt&&steps<240) {
        engine.step()
        if(engine.stopped){setRunning(false);redraw(value=>value+1);return}
        remaining-=engine.dt;steps++
      }
      if(steps===240)remaining%=engine.dt
      if(steps)redraw(value=>value+1)
      frame=requestAnimationFrame(tick)
    }
    frame=requestAnimationFrame(tick)
    return ()=>cancelAnimationFrame(frame)
  },[active,engine,running,speed])

  function updateSetting(key:string,value:number|string|boolean) {
    setRunning(false)
    setScene(current=>extendedSchema.parse({...current,settings:{...current.settings,[key]:value}}))
  }
  function updateBody(index:number,key:keyof GravityBody,value:number) {
    setRunning(false)
    setScene(current=>{
      if(!('bodies' in current.settings))return current
      const bodies=current.settings.bodies.map((body,offset)=>offset===index?{...body,[key]:value}:body)
      return extendedSchema.parse({...current,settings:{...current.settings,bodies}})
    })
  }
  async function save() {
    setSaving(true);setError('')
    try {await saveExtended(scene);setSaved(scene);updateSavedAddress(scene.id)}
    catch(reason){setError(reason instanceof Error?reason.message:'无法保存实验。')}
    finally {setSaving(false)}
  }
  const domainHome={
    mechanics:['/lab?template=spring','弹簧振子'],
    electromagnetism:['/lab?domain=electromagnetism','静电实验'],
    astrophysics:['/lab?domain=astrophysics','双体轨道'],
  }[scene.domain]
  const timeUnit=engine.gravity?' 年':' s'

  return <main className="astronomy-lab extended-lab page-width">
    <header className="astronomy-heading"><div><h1>{template.title}</h1><label className="astronomy-name">实验名称
      <input aria-label="扩展实验名称" key={scene.title} defaultValue={scene.title} maxLength={100}
        onKeyDown={event=>{if(event.key==='Enter')event.currentTarget.blur()}} onBlur={event=>{
          const title=event.currentTarget.value.trim()
          event.currentTarget.value=title||scene.title
          if(title&&title!==scene.title)setScene(current=>({...current,title}))
        }}/></label></div>
      <div className="astronomy-actions">
        <button className="button" onClick={()=>downloadText(scene.title,'json','application/json',JSON.stringify(scene,null,2))}><Download size={16}/> 导出场景 JSON</button>
        <button className="button primary" disabled={saving} onClick={()=>void save()}><Save size={16}/> {saving?'保存中…':saved===scene?'已保存':'保存实验'}</button>
      </div>
    </header>
    <nav className="astronomy-presets" aria-label="同领域实验">
      <a className="button compact" href={appUrl(domainHome[0])}>{domainHome[1]}</a>
      {extendedTemplates.filter(item=>item.domain===scene.domain&&item.id!==scene.extension).map(item=><a key={item.id} className="button compact" href={extensionUrl(item.id)}>{item.title}</a>)}
    </nav>
    {error&&<p className="error-banner" role="alert">{error}</p>}
    <div className="astronomy-workbench">
      <div className="astronomy-main">
        <section className="astronomy-stage" aria-label="实验视图">
          <div className="astronomy-toolbar">
            <button className="button primary compact" disabled={Boolean(engine.stopped)} onClick={()=>setRunning(!running)}>{running?<Pause size={15}/>:<Play size={15}/>} {running?'暂停':'运行'}</button>
            <button className="icon framed" aria-label="单步推进" disabled={Boolean(engine.stopped)} onClick={()=>{setRunning(false);engine.step();redraw(value=>value+1)}}><StepForward size={17}/></button>
            <button className="icon framed" aria-label="重置实验" onClick={()=>{setRunning(false);reset(value=>value+1)}}><RotateCcw size={16}/></button>
            <select aria-label="扩展实验播放速度" value={speed} onChange={event=>setSpeed(+event.target.value)}>{[.25,1,2,4,8].map(value=><option key={value} value={value}>{value}×</option>)}</select>
            {scene.extension==='gravity-assist'&&<select aria-label="画布参考系" value={planetFrame?'planet':'star'} onChange={event=>setPlanetFrame(event.target.value==='planet')}>
              <option value="planet">行星参考系</option><option value="star">恒星参考系</option>
            </select>}
            <button className="button compact" disabled={!engine.current.time} onClick={()=>downloadText(scene.title,'csv','text/csv;charset=utf-8',extendedCsv(engine))}><Download size={15}/> 导出数据 CSV</button>
          </div>
          <div className="astronomy-viewport extended-viewport"><ExtendedCanvas engine={engine} revision={revision} planetFrame={planetFrame}/></div>
          <div className="astronomy-status"><span>模拟时间 <output aria-label="扩展实验时间">{number(engine.current.time,6)}{timeUnit}</output></span><span>{engine.gravity?'基准步长':'积分步长'} {number(engine.dt,6)}{timeUnit}</span></div>
          {engine.stopped&&<p role="status" className="astronomy-stop">{engine.stopped}</p>}
        </section>
        {scene.extension==='gravity-assist'&&<FlybyTable engine={engine}/>}
        <SampleChart engine={engine}/>
      </div>
      <aside className="astronomy-sidebar" aria-label="扩展实验参数">
        <section><h2>初始参数</h2>
          {fields[scene.extension].map(field=><FieldInput key={field[0]} field={field} value={currentSettings[field[0]]} change={value=>updateSetting(field[0],value)}/>)}
          {scene.extension==='rc'&&<label className="astronomy-field">初始开关状态<select value={scene.settings.mode} onChange={event=>updateSetting('mode',event.target.value)}>
            <option value="charge">充电</option><option value="discharge">放电</option>
          </select></label>}
          {scene.extension==='induction'&&<label className="astronomy-field">回路状态<select value={scene.settings.closed?'closed':'open'} onChange={event=>updateSetting('closed',event.target.value==='closed')}>
            <option value="closed">闭合</option><option value="open">断开</option>
          </select></label>}
          {'bodies' in scene.settings&&scene.settings.bodies.map((body,index)=>{
            const label=scene.extension==='gravity-assist'?['恒星','行星','航天器'][index]:'天体 '+(index+1)
            return <details key={label} className="extended-body" open={index===2}>
              <summary>{label}</summary>
              <div role="group" aria-label={label} className="astronomy-pair">{bodyFields.map(field=><FieldInput key={field[0]} field={field}
                value={body[field[0]]} change={value=>updateBody(index,field[0],value)}/>)}</div>
            </details>
          })}
        </section>
        {scene.extension==='rc'&&<section><h2>运行时开关</h2><div className="astronomy-add" role="group" aria-label="运行时开关">
          {(['charge','discharge'] as const).map(mode=><button key={mode} className="button compact" aria-pressed={engine.rcMode===mode}
            onClick={()=>{engine.switchCircuit(mode);redraw(value=>value+1)}}>{mode==='charge'?'切换充电':'切换放电'}</button>)}
        </div></section>}
        <section aria-label="测量读数"><h2>测量读数</h2><dl className="astronomy-invariants">{readings(engine).map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section>
        <section><p className="muted">{descriptions[scene.extension]}</p></section>
      </aside>
    </div>
  </main>
}
