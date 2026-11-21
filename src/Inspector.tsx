import { useEffect, useId, useState } from 'react'
import { Box, Circle, Globe2, Hexagon, Layers3, SlidersHorizontal, Waves } from 'lucide-react'
import { area, DEFAULT_WORLD_BOUNDS, type BodyConfig, type Experiment, type Spring } from './model'
import { setInitialExtension, springGeometry } from './springs'

function NumberField({label,value,unit,onCommit,min,max,step='any'}:{
  label:string;value:number;unit?:string;onCommit:(n:number)=>boolean;min?:number;max?:number;step?:number|'any'
}) {
  const id=useId()
  const [text,setText]=useState(String(+value.toFixed(5)))
  const [error,setError]=useState('')
  useEffect(()=>{setText(String(+value.toFixed(5)));setError('')},[value])
  function commit() {
    const n=Number(text)
    if(!text.trim()||!Number.isFinite(n)||(min!==undefined&&n<min)||(max!==undefined&&n>max)) {
      setError(min!==undefined&&max!==undefined?'请输入 '+min+' 至 '+max+' 之间的数值。':min!==undefined?'最小值为 '+min+'。':'请输入有效数值。')
      return
    }
    if(n===+value.toFixed(5)) {setError('');return}
    if(onCommit(n)) setError('')
    else setError('请查看实验参数的错误提示。')
  }
  return <div className="field"><label htmlFor={id}>{label}</label><div className="numeric">
    <input id={id} type="number" min={min} max={max} step={step} value={text} aria-invalid={Boolean(error)}
      aria-describedby={error?id+'-error':undefined} onChange={e=>{setText(e.target.value);setError('')}}
      onBlur={commit} onKeyDown={e=>{if(e.key==='Enter') e.currentTarget.blur();if(e.key==='Escape'){setText(String(+value.toFixed(5)));setError('')}}}/>
    {unit&&<span aria-hidden="true">{unit}</span>}
  </div>{error&&<small className="field-error" id={id+'-error'}>{error}</small>}</div>
}
type Props = {
  scene:Experiment; selected:string; select:(id:string)=>void; change:(patch:Partial<Experiment>)=>boolean
  force:(id:string,x:number,y:number)=>void
}
export function Inspector({scene,selected,select,change,force}:Props) {
  const [tab,setTab]=useState<'object'|'world'>('object')
  useEffect(()=>{if(selected)setTab('object')},[selected])
  const b=scene.bodies.find(b=>b.id===selected),j=scene.joints.find(j=>j.id===selected)
  const env=scene.environment
  const bounds=env.worldBounds??DEFAULT_WORLD_BOUNDS
  const springA=j&&scene.bodies.find(body=>body.id===j.a)
  const springB=j&&scene.bodies.find(body=>body.id===j.b)
  const patch=(x:Partial<BodyConfig>)=>change({bodies:scene.bodies.map(body=>body.id===selected?{...body,...x}:body)})
  const spring=(x:Partial<Spring>)=>change({joints:scene.joints.map(joint=>joint.id===selected?{...joint,...x}:joint)})
  const world=(x:Partial<Experiment['environment']>)=>change({environment:{...env,...x}})
  const fields=b?.geometry
  return <aside className="inspector" aria-label="参数面板">
    <div className="panel-title"><SlidersHorizontal size={15}/> 参数</div>
    <div className="tabs inspector-tabs">
      <button className={tab==='object'?'chosen':''} onClick={()=>setTab('object')}>物体</button>
      <button className={tab==='world'?'chosen':''} onClick={()=>setTab('world')}>环境</button>
    </div>
    <div className="inspector-content">
      {tab==='world'?<>
        <div className="object-title"><span className="object-icon"><Globe2 size={19}/></span><div><strong>环境设置</strong><small>国际单位制 · Y 轴向上</small></div></div>
        <div className="prop-group">
          <h3>模拟设置</h3>
          <NumberField label="重力加速度" unit="m/s²" min={0} max={100} value={env.gravity} onCommit={gravity=>world({gravity})}/>
          <NumberField label="模拟速度" unit="×" min={0.1} max={4} step={0.1} value={env.speed} onCommit={speed=>world({speed})}/>
          <label className="switch-row">启用场景边界<input type="checkbox" checked={env.boundaries} onChange={e=>world({boundaries:e.target.checked})}/></label>
          {env.boundaries&&([
            ['minX','左边界 X'],['maxX','右边界 X'],['minY','下边界 Y'],['maxY','上边界 Y'],
          ] as const).map(([key,label])=><NumberField key={key} label={label} unit="m" min={-10000} max={10000} value={bounds[key]} onCommit={n=>world({worldBounds:{...bounds,[key]:n}})}/>)}
          <label className="switch-row">启用碰撞<input type="checkbox" checked={env.collisions} onChange={e=>world({collisions:e.target.checked})}/></label>
          <NumberField label="默认比例" unit="px/m" min={5} max={400} value={scene.camera.scale} onCommit={scale=>change({camera:{...scene.camera,scale}})}/>
        </div>
      </>:<>
        <label className="object-select"><Layers3 size={15}/><select aria-label="当前物体" value={selected} onChange={e=>select(e.target.value)}>
          <option value="">选择物体</option>
          {scene.bodies.map(body=><option key={body.id} value={body.id}>{body.name}</option>)}
          {scene.joints.map((joint,i)=><option key={joint.id} value={joint.id}>弹簧 {i+1}</option>)}
        </select></label>
        {b&&fields&&<div key={b.id}>
          <div className="object-title"><span className={'object-icon '+b.color}>{fields.kind==='circle'?<Circle size={18}/>:fields.kind==='polygon'?<Hexagon size={18}/>:<Box size={18}/>}</span><div><strong>{b.name}</strong><small>{b.type==='dynamic'?'动态物体':'静态物体'}</small></div></div>
          <div className="prop-group">
            <h3>物理属性</h3>
            <NumberField label="质量" unit="kg" min={0.001} max={100000} value={b.mass} onCommit={mass=>patch({mass})}/>
            <NumberField label="面密度" unit="kg/m²" min={0.000001} value={b.mass/area(fields)} onCommit={density=>patch({mass:density*area(fields)})}/>
            <NumberField label="摩擦系数" min={0} max={10} value={b.friction} onCommit={friction=>patch({friction})}/>
            <NumberField label="恢复系数" min={0} max={1} value={b.restitution} onCommit={restitution=>patch({restitution})}/>
            {fields.kind!=='surface'&&<label className="plain-select">物体类型<select value={b.type} onChange={e=>patch({type:e.target.value as BodyConfig['type']})}><option value="dynamic">动态</option><option value="static">静态</option></select></label>}
          </div>
          {b.type==='dynamic'&&<div className="prop-group">
            <h3>初始运动</h3>
            <NumberField label="X 方向速度" unit="m/s" value={b.velocity.x} onCommit={x=>patch({velocity:{...b.velocity,x}})}/>
            <NumberField label="Y 方向速度" unit="m/s" value={b.velocity.y} onCommit={y=>patch({velocity:{...b.velocity,y}})}/>
            <NumberField label="角速度" unit="rad/s" value={b.angularVelocity} onCommit={angularVelocity=>patch({angularVelocity})}/>
            {scene.kind==='projectile'&&<>
              <NumberField label="发射初速度" unit="m/s" min={0} max={100} value={Math.hypot(b.velocity.x,b.velocity.y)} onCommit={speed=>{
                const a=Math.atan2(b.velocity.y,b.velocity.x)
                return patch({velocity:{x:speed*Math.cos(a),y:speed*Math.sin(a)}})
              }}/>
              <NumberField label="发射角" unit="°" min={-180} max={180} value={Math.atan2(b.velocity.y,b.velocity.x)*180/Math.PI} onCommit={angle=>{
                const speed=Math.hypot(b.velocity.x,b.velocity.y)
                return patch({velocity:{x:speed*Math.cos(angle*Math.PI/180),y:speed*Math.sin(angle*Math.PI/180)}})
              }}/>
            </>}
          </div>}
          <div className="prop-group">
            <h3>几何参数</h3>
            <NumberField label="X 坐标" unit="m" value={b.position.x} onCommit={x=>patch({position:{...b.position,x}})}/>
            <NumberField label="Y 坐标" unit="m" value={b.position.y} onCommit={y=>patch({position:{...b.position,y}})}/>
            <NumberField label="旋转角" unit="°" value={b.angle*180/Math.PI} onCommit={n=>patch({angle:n*Math.PI/180})}/>
            {fields.kind==='circle'?<NumberField label="半径" unit="m" min={0.02} max={1000} value={fields.radius} onCommit={radius=>patch({geometry:{...fields,radius}})}/>
              :fields.kind!=='polygon'&&<>
                <NumberField label="宽度" unit="m" min={0.02} max={1000} value={fields.width} onCommit={width=>patch({geometry:{...fields,width}})}/>
                <NumberField label="高度" unit="m" min={0.02} max={1000} value={fields.height} onCommit={height=>patch({geometry:{...fields,height}})}/>
              </>}
          </div>
          {b.type==='dynamic'&&<ForceFields apply={(x,y)=>force(b.id,x,y)}/>}
        </div>}
        {j&&<div key={j.id}>
          <div className="object-title"><span className="object-icon amber"><Waves size={19}/></span><div><strong>弹簧</strong><small>{scene.bodies.find(b=>b.id===j.a)?.name} ↔ {scene.bodies.find(b=>b.id===j.b)?.name}</small></div></div>
          <div className="prop-group">
            <h3>弹簧参数</h3>
            <NumberField label="刚度" unit="N/m" min={0.01} max={100000} value={j.stiffness} onCommit={stiffness=>spring({stiffness})}/>
            <NumberField label="阻尼比" min={0} max={5} value={j.damping} onCommit={damping=>spring({damping})}/>
            <NumberField label="原长" unit="m" min={0.02} max={1000} value={j.restLength} onCommit={restLength=>spring({restLength})}/>
            {springA&&springB&&<NumberField label="初始位移" unit="m" min={0.005-j.restLength} max={1000} value={springGeometry(springA,springB,j).length-j.restLength} onCommit={extension=>{
              const moved=setInitialExtension(springA,springB,j,extension)
              return change({bodies:scene.bodies.map(body=>body.id===moved.id?moved:body)})
            }}/>}
            {(['anchorA','anchorB'] as const).flatMap((key,i)=>(['x','y'] as const).map(axis=><NumberField key={key+axis} label={'连接点 '+(i?'B':'A')+' '+axis.toUpperCase()} unit="m" value={j[key][axis]} onCommit={n=>spring({[key]:{...j[key],[axis]:n}})}/>))}
          </div>
        </div>}
        {!b&&!j&&<p className="muted empty-inspector">选择物体或弹簧以编辑它的物理参数。</p>}
      </>}
      <div className="prop-group notes"><h3>实验笔记</h3>
        <textarea key={scene.id} aria-label="实验笔记" defaultValue={scene.notes} maxLength={10000} placeholder="记录你的假设或观察结果…" onBlur={e=>{if(e.target.value!==scene.notes)change({notes:e.target.value})}}/>
      </div>
    </div>
  </aside>
}

function ForceFields({apply}:{apply:(x:number,y:number)=>void}) {
  const [x,setX]=useState(0),[y,setY]=useState(0)
  return <div className="prop-group">
    <h3>外力 · 本次运行</h3>
    <NumberField label="X 方向外力" unit="N" min={-10000} max={10000} value={x} onCommit={n=>{setX(n);return true}}/>
    <NumberField label="Y 方向外力" unit="N" min={-10000} max={10000} value={y} onCommit={n=>{setY(n);return true}}/>
    <button className="button compact" onClick={()=>apply(x,y)}>施加恒定外力</button>
  </div>
}
