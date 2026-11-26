import { useEffect, useId, useRef, useState } from 'react'
import { Box, Circle, Globe2, Hexagon, Layers3, PenLine, SlidersHorizontal, Spline, Waves, X } from 'lucide-react'
import { area, DEFAULT_WORLD_BOUNDS, GRAVITY_PRESETS, type BodyConfig, type Experiment, type Point, type Spring } from './model'
import { displayPoint, polarComponents, polarPosition } from './coordinates'
import { setInitialExtension, springGeometry } from './springs'
import { formatNumber } from './numberFormat'
import { withObjectRole, type EditableRole } from './objectRole'

const roleLabels={marker:'视觉标记',body:'刚体',boundary:'碰撞边界',track:'轨道',field:'场源'} as const
const roleHints={marker:'只显示，不参与碰撞',body:'参与碰撞；可设为动态或静态',boundary:'静态碰撞轮廓',track:'静态碰撞轨道',field:'静电场源，不参与碰撞'} as const
const editableRoles:EditableRole[]=['marker','body','boundary','track','field']

function NumberField({label,value,unit,onCommit,min,max,step='any',readOnly=false}:{
  label:string;value:number;unit?:string;onCommit:(n:number)=>boolean;min?:number;max?:number;step?:number|'any';readOnly?:boolean
}) {
  const id=useId()
  const display=formatNumber(value)
  const [text,setText]=useState(display)
  const [error,setError]=useState('')
  useEffect(()=>{setText(formatNumber(value));setError('')},[value])
  function commit() {
    if(readOnly)return
    const n=Number(text)
    if(!text.trim()||!Number.isFinite(n)||(min!==undefined&&n<min)||(max!==undefined&&n>max)) {
      setError(min!==undefined&&max!==undefined?'请输入 '+min+' 至 '+max+' 之间的数值。':min!==undefined?'最小值为 '+min+'。':'请输入有效数值。')
      return
    }
    if(n===Number(display)) {setError('');return}
    if(onCommit(n)) setError('')
    else setError('请查看实验参数的错误提示。')
  }
  return <div className="field"><label htmlFor={id}>{label}</label><div className="numeric">
    <input id={id} type="number" min={min} max={max} step={step} value={text} readOnly={readOnly} aria-invalid={Boolean(error)}
      aria-describedby={error?id+'-error':undefined} onChange={e=>{setText(e.target.value);setError('')}}
      onBlur={commit} onKeyDown={e=>{if(e.key==='Enter') e.currentTarget.blur();if(e.key==='Escape'){setText(display);setError('')}}}/>
    {unit&&<span aria-hidden="true">{unit}</span>}
  </div>{error&&<small className="field-error" id={id+'-error'}>{error}</small>}</div>
}
function Readout({label,value,unit}:{label:string;value:string;unit?:string}) {
  return <div className="field"><span className="readout-label">{label}</span><div className="numeric"><output aria-label={label}>{value}</output>{unit&&<span aria-hidden="true">{unit}</span>}</div></div>
}
type Props = {
  scene:Experiment; selected:string; select:(id:string)=>void; change:(patch:Partial<Experiment>)=>boolean
  force:(id:string,x:number,y:number)=>void
  livePosition?:Point;liveVelocity?:Point
  initialTab?:'object'|'world'
  onClose?:()=>void
}
export function Inspector({scene,selected,select,change,force,livePosition,liveVelocity,initialTab='object',onClose}:Props) {
  const [tab,setTab]=useState<'object'|'world'>(initialTab)
  const previous=useRef({initialTab,selected})
  useEffect(()=>{
    if(selected!==previous.current.selected)setTab('object')
    else if(initialTab!==previous.current.initialTab)setTab(initialTab)
    previous.current={initialTab,selected}
  },[initialTab,selected])
  const b=scene.bodies.find(b=>b.id===selected),j=scene.joints.find(j=>j.id===selected)
  const env=scene.environment
  const bounds=env.worldBounds??DEFAULT_WORLD_BOUNDS
  const springA=j&&scene.bodies.find(body=>body.id===j.a)
  const springB=j&&scene.bodies.find(body=>body.id===j.b)
  const patch=(x:Partial<BodyConfig>)=>change({bodies:scene.bodies.map(body=>body.id===selected?{...body,...x}:body)})
  const assignRole=(role:EditableRole)=>{
    const target=scene.bodies.find(body=>body.id===selected)
    return target?patch(withObjectRole(target,role)):false
  }
  const spring=(x:Partial<Spring>)=>change({joints:scene.joints.map(joint=>joint.id===selected?{...joint,...x}:joint)})
  const coordinates=(x:Partial<Experiment['coordinates']>)=>change({coordinates:{...scene.coordinates,...x}})
  const position=b?livePosition??b.position:undefined
  const velocity=b?liveVelocity??b.velocity:undefined
  const displayed=position?displayPoint(position,scene.coordinates.origin):undefined
  const polar=position?polarPosition(position,scene.coordinates.origin):undefined
  const components=position&&velocity?polarComponents(position,velocity,scene.coordinates.origin):undefined
  const world=(x:Partial<Experiment['environment']>)=>change({environment:{...env,...x}})
  const fields=b?.geometry
  const role:EditableRole=b?.role==='constraint'?'body':b?.role??'body'
  const collisionFree=role==='marker'||role==='field',specialRole=role!=='body'
  return <aside className="inspector" aria-label="参数面板">
    <div className="panel-title"><SlidersHorizontal size={15}/> 参数{onClose&&<button className="icon" aria-label="关闭参数面板" title="关闭参数面板" onClick={onClose}><X size={16}/></button>}</div>
    <div className="tabs inspector-tabs">
      <button className={tab==='object'?'chosen':''} onClick={()=>setTab('object')}>物体</button>
      <button className={tab==='world'?'chosen':''} onClick={()=>setTab('world')}>环境</button>
    </div>
    <div className="inspector-content">
      {tab==='world'?<>
        <div className="object-title"><span className="object-icon"><Globe2 size={19}/></span><div><strong>环境设置</strong><small>国际单位制 · Y 轴向上</small></div></div>
        <div className="prop-group">
          <h3>坐标设置</h3>
          <NumberField label="坐标原点 X" unit="m" value={scene.coordinates.origin.x} onCommit={x=>coordinates({origin:{...scene.coordinates.origin,x}})}/>
          <NumberField label="坐标原点 Y" unit="m" value={scene.coordinates.origin.y} onCommit={y=>coordinates({origin:{...scene.coordinates.origin,y}})}/>
          <p className="muted role-hint">原点只改变显示坐标和测量基准，不改变物体位置或物理运动。</p>
        </div>
        <div className="prop-group">
          <h3>模拟设置</h3>
          <div className="tabs gravity-presets" role="group" aria-label="重力预设">
            {GRAVITY_PRESETS.map(p=><button key={p.name} type="button" title={p.note} aria-pressed={env.gravity===p.gravity}
              className={env.gravity===p.gravity?'chosen':''} onClick={()=>world({gravity:p.gravity})}>{p.name} {p.gravity}</button>)}
          </div>
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
          <div className="object-title"><span className={'object-icon '+b.color} style={b.color.startsWith('#')?{color:b.color}:undefined}>{fields.kind==='circle'?<Circle size={18}/>:fields.kind==='polygon'?<Hexagon size={18}/>:fields.kind==='freeform'?<PenLine size={18}/>:fields.kind==='track'?<Spline size={18}/>:<Box size={18}/>}</span><div><strong>{b.name}</strong><small>{b.type==='dynamic'?'动态物体':'静态物体'} · {roleLabels[role]}</small></div></div>
          {scene.coordinates.mode!=='none'&&displayed&&polar&&<div className="prop-group">
            <h3>当前坐标</h3>
            <NumberField label="世界 X" unit="m" value={position?.x??0} onCommit={()=>true} readOnly/>
            <NumberField label="世界 Y" unit="m" value={position?.y??0} onCommit={()=>true} readOnly/>
            {scene.coordinates.mode==='cartesian'?<>
              <NumberField label="显示 X" unit="m" value={displayed.x} onCommit={()=>true} readOnly/>
              <NumberField label="显示 Y" unit="m" value={displayed.y} onCommit={()=>true} readOnly/>
            </>:<>
              <NumberField label="极径 r" unit="m" value={polar.r} onCommit={()=>true} readOnly/>
              {polar.theta===undefined?<Readout label="极角 θ" value="—"/>:<NumberField label="极角 θ" unit="°" value={polar.theta*180/Math.PI} onCommit={()=>true} readOnly/>}
              {components?<>
                <NumberField label="径向速度" unit="m/s" value={components.radial} onCommit={()=>true} readOnly/>
                <NumberField label="切向速度" unit="m/s" value={components.tangential} onCommit={()=>true} readOnly/>
              </>:<><Readout label="径向速度" value="—"/><Readout label="切向速度" value="—"/></>}
            </>}
            <p className="muted role-hint">只读测量值 · 世界位置 {(position?.x??0).toFixed(2)}, {(position?.y??0).toFixed(2)} m</p>
          </div>}
          <div className="prop-group">
            <h3>物理属性</h3>
            {!collisionFree&&fields.kind!=='track'&&!(fields.kind==='freeform'&&!fields.closed)&&<>
              <NumberField label="质量" unit="kg" min={0.001} max={100000} value={b.mass} onCommit={mass=>patch({mass})}/>
              <NumberField label="面密度" unit="kg/m²" min={0.000001} value={b.mass/area(fields)} onCommit={density=>patch({mass:density*area(fields)})}/>
            </>}
            {!collisionFree&&<>
              <NumberField label="摩擦系数" min={0} max={10} value={b.friction} onCommit={friction=>patch({friction})}/>
              <NumberField label="恢复系数" min={0} max={1} value={b.restitution} onCommit={restitution=>patch({restitution})}/>
            </>}
            <label className="plain-select">物体角色<select aria-label="物体角色" value={role} onChange={e=>assignRole(e.target.value as EditableRole)}>
              {editableRoles.map(value=><option key={value} value={value} disabled={fields.kind==='ellipse'?value!=='body':value==='track'&&fields.kind!=='track'&&fields.kind!=='freeform'}>{roleLabels[value]}</option>)}
            </select></label>
            <p className="muted role-hint">{roleHints[role]}</p>
            <NumberField label="电荷量" unit="nC" min={-1000} max={1000} value={b.charge??0} onCommit={charge=>patch({charge})}/>
            {!specialRole&&fields.kind!=='surface'&&fields.kind!=='track'&&!(fields.kind==='freeform'&&!fields.closed)&&<label className="plain-select">物体类型<select aria-label="物体类型" value={b.type} onChange={e=>patch({type:e.target.value as BodyConfig['type']})}><option value="dynamic">动态</option><option value="static">静态</option></select></label>}
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
              :fields.kind==='ellipse'?<>
                <NumberField label="X 轴半径" unit="m" min={0.02} max={1000} value={fields.radiusX} onCommit={radiusX=>patch({geometry:{...fields,radiusX}})}/>
                <NumberField label="Y 轴半径" unit="m" min={0.02} max={1000} value={fields.radiusY} onCommit={radiusY=>patch({geometry:{...fields,radiusY}})}/>
              </>
              :fields.kind!=='polygon'&&fields.kind!=='track'&&fields.kind!=='freeform'&&<>
                <NumberField label="宽度" unit="m" min={0.02} max={1000} value={fields.width} onCommit={width=>patch({geometry:{...fields,width}})}/>
                <NumberField label="高度" unit="m" min={0.02} max={1000} value={fields.height} onCommit={height=>patch({geometry:{...fields,height}})}/>
              </>}
            {fields.kind==='track'&&<p className="muted">静态碰撞轨道 · {fields.vertices.length} 个顶点</p>}
            {fields.kind==='freeform'&&<p className="muted">{fields.closed?'手绘物块':'手绘曲线（静态斜面/碰撞曲线）'} · {fields.vertices.length} 个点</p>}
          </div>
          {b.type==='dynamic'&&<ForceFields apply={(x,y)=>force(b.id,x,y)}/>}
        </div>}
        {j&&<div key={j.id}>
          <div className="object-title"><span className="object-icon amber"><Waves size={19}/></span><div><strong>弹簧</strong><small>约束连接 · {scene.bodies.find(b=>b.id===j.a)?.name} ↔ {scene.bodies.find(b=>b.id===j.b)?.name}</small></div></div>
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
        <textarea key={scene.id+':'+scene.notes} aria-label="实验笔记" defaultValue={scene.notes} maxLength={10000} placeholder="记录你的假设或观察结果…" onBlur={e=>{if(e.target.value!==scene.notes)change({notes:e.target.value})}}/>
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
