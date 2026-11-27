import { useEffect, useId, useRef, useState } from 'react'
import { Box, Circle, Globe2, Hexagon, Layers3, PenLine, SlidersHorizontal, Spline, Waves, X } from 'lucide-react'
import { area, DEFAULT_WORLD_BOUNDS, GRAVITY_PRESETS, type BodyConfig, type Experiment, type Point, type Spring } from './model'
import { displayPoint, polarComponents, polarPosition } from './coordinates'
import { connectionAssembly,connectionGroupName,connectionName,setInitialExtension, springGeometry } from './springs'
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
  const committedOnEnter=useRef(false)
  useEffect(()=>{setText(formatNumber(value));setError('')},[value])
  function commit(raw:string) {
    if(readOnly)return true
    const n=Number(raw)
    if(!raw.trim()||!Number.isFinite(n)||(min!==undefined&&n<min)||(max!==undefined&&n>max)) {
      setError(min!==undefined&&max!==undefined?'请输入 '+min+' 至 '+max+' 之间的数值。':min!==undefined?'最小值为 '+min+'。':'请输入有效数值。')
      return false
    }
    if(n===Number(display)||onCommit(n)) {setError('');return true}
    setError('请查看实验参数的错误提示。')
    return false
  }
  return <div className="field"><label htmlFor={id}>{label}</label><div className="numeric">
    <input id={id} type="number" min={min} max={max} step={step} value={text} readOnly={readOnly} aria-invalid={Boolean(error)}
      aria-describedby={error?id+'-error':undefined} onChange={e=>{setText(e.target.value);setError('')}}
      onBlur={e=>{
        if(committedOnEnter.current){committedOnEnter.current=false;return}
        commit(e.currentTarget.value)
      }} onKeyDown={e=>{
        if(e.key==='Enter') {
          e.preventDefault()
          if(commit(e.currentTarget.value)) {
            committedOnEnter.current=true
            e.currentTarget.blur()
            committedOnEnter.current=false
          }
        }
        if(e.key==='Escape'){setText(display);setError('')}
      }}/>
    {unit&&<span aria-hidden="true">{unit}</span>}
  </div>{error&&<small className="field-error" id={id+'-error'}>{error}</small>}</div>
}
function Readout({label,value,unit}:{label:string;value:string;unit?:string}) {
  return <div className="field"><span className="readout-label">{label}</span><div className="numeric"><output aria-label={label}>{value}</output>{unit&&<span aria-hidden="true">{unit}</span>}</div></div>
}
type Props = {
  scene:Experiment; selected:string; select:(id:string)=>void; change:(patch:Partial<Experiment>)=>boolean
  applyAngle:(id:string,angle:number)=>boolean
  livePosition?:Point;liveVelocity?:Point
  initialTab?:'object'|'world'
  onClose?:()=>void
}
export function Inspector({scene,selected,select,change,applyAngle,livePosition,liveVelocity,initialTab='object',onClose}:Props) {
  const [tab,setTab]=useState<'object'|'world'>(initialTab)
  const previous=useRef({initialTab,selected})
  useEffect(()=>{
    if(selected!==previous.current.selected)setTab('object')
    else if(initialTab!==previous.current.initialTab)setTab(initialTab)
    previous.current={initialTab,selected}
  },[initialTab,selected])
  const b=scene.bodies.find(b=>b.id===selected),j=scene.joints.find(j=>j.id===selected)
  const assembly=connectionAssembly(scene,selected)
  const [showParts,setShowParts]=useState(false)
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
              className={env.gravity===p.gravity?'chosen':''} onClick={()=>world({gravity:p.gravity,gravityAngle:undefined})}>{p.name} {p.gravity}</button>)}
          </div>
          <NumberField label="重力加速度" unit="m/s²" min={0} max={100} value={env.gravity} onCommit={gravity=>world({gravity})}/>
          <NumberField label="重力方向（自 +X 逆时针）" unit="°" min={-360} max={360} value={env.gravityAngle??-90} onCommit={gravityAngle=>world({gravityAngle})}/>
          <NumberField label="介质线性阻尼" unit="s⁻¹" min={0} max={20} value={env.linearDrag??0} onCommit={linearDrag=>world({linearDrag})}/>
          <NumberField label="模拟速度" unit="×" min={0.1} max={4} step={0.1} value={env.speed} onCommit={speed=>world({speed})}/>
          <label className="switch-row">启用场景边界<input type="checkbox" checked={env.boundaries} onChange={e=>world({boundaries:e.target.checked})}/></label>
          {env.boundaries&&([
            ['minX','左边界 X'],['maxX','右边界 X'],['minY','下边界 Y'],['maxY','上边界 Y'],
          ] as const).map(([key,label])=><NumberField key={key} label={label} unit="m" min={-10000} max={10000} value={bounds[key]} onCommit={n=>world({worldBounds:{...bounds,[key]:n}})}/>)}
          <label className="switch-row">启用碰撞<input type="checkbox" checked={env.collisions} onChange={e=>world({collisions:e.target.checked})}/></label>
          <NumberField label="默认比例" unit="px/m" min={5} max={400} value={scene.camera.scale} onCommit={scale=>change({camera:{...scene.camera,scale}})}/>
          <button className="button compact" onClick={()=>world({gravity:9.81,gravityAngle:undefined,linearDrag:undefined,
            speed:1,boundaries:false,collisions:true,worldBounds:undefined})}>恢复默认环境</button>
        </div>
      </>:<>
        <label className="object-select"><Layers3 size={15}/><select aria-label="当前物体" value={selected} onChange={e=>select(e.target.value)}>
          <option value="">选择物体</option>
          {scene.bodies.map(body=><option key={body.id} value={body.id}>{body.name}</option>)}
          {scene.joints.map((joint,i)=>joint.group
            ?scene.joints.findIndex(part=>part.group===joint.group)===i&&<option key={joint.group} value={joint.group}>{connectionGroupName(joint)} {i+1}</option>
            :<option key={joint.id} value={joint.id}>{connectionName(joint)} {i+1}</option>)}
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
            {fields.kind==='surface'&&!b.surfaceLine&&<button type="button" className="button compact" onClick={()=>patch({surfaceLine:true})}>转换为线段碰撞</button>}
            {(fields.kind==='track'||b.surfaceLine)&&<label className="plain-select">碰撞方向<select value={b.contactSide??'both'} onChange={e=>patch({contactSide:e.target.value as BodyConfig['contactSide']})}>
              <option value="both">双侧</option><option value="left">仅沿线方向左侧</option><option value="right">仅沿线方向右侧</option>
            </select></label>}
            {b.type==='dynamic'&&fields.kind==='circle'&&scene.bodies.some(target=>target.geometry.kind==='track')&&<>
              <label className="plain-select">轨道模式<select value={b.rail??''} onChange={e=>patch({rail:e.target.value||undefined})}>
                <option value="">普通碰撞</option>{scene.bodies.filter(target=>target.geometry.kind==='track'&&target.role!=='marker'&&target.role!=='field').map(target=>
                  <option key={target.id} value={target.id}>理想约束 · {target.name}</option>)}
              </select></label>
              {b.rail&&<small>质点沿轨道弧长运动，端点停住。忽略滚动与碰撞。</small>}
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
            <Readout label="初始速度 X" unit="m/s" value={b.velocity.x.toFixed(3)}/>
            <Readout label="初始速度 Y" unit="m/s" value={b.velocity.y.toFixed(3)}/>
            <p className="muted">在选择工具中启用「拖动矢量」，拖动速度箭头末端。</p>
          </div>}
          <div className="prop-group">
            <h3>几何参数</h3>
            <NumberField label="X 坐标" unit="m" value={b.position.x} onCommit={x=>patch({position:{...b.position,x}})}/>
            <NumberField label="Y 坐标" unit="m" value={b.position.y} onCommit={y=>patch({position:{...b.position,y}})}/>
            <NumberField label="旋转角" unit="°" min={-3600} max={3600} value={b.angle*180/Math.PI} onCommit={n=>applyAngle(b.id,n*Math.PI/180)}/>
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
          {b.type==='dynamic'&&<div className="prop-group"><h3>矢量干预</h3>
            <label>物理模式 <select value={scene.physicalMode??'strict'} onChange={e=>change({physicalMode:e.target.value==='free'?'free':'strict'})}>
              <option value="strict">严格物理</option><option value="free">自由干预</option>
            </select></label>
            <p className="muted">在选择工具中拖动外力箭头。运行后直接改变速度需要自由干预模式。</p>
          </div>}
        </div>}
        {assembly&&<div className="prop-group">
          <h3>{connectionGroupName(assembly.joints[0])}</h3>
          <NumberField label="总原长" unit="m" min={.02*assembly.joints.length} max={1000}
            value={assembly.length} onCommit={length=>change({joints:scene.joints.map(joint=>joint.group===selected
              ?{...joint,restLength:joint.restLength*length/assembly.length}:joint)})}/>
          {assembly.nodes.length>0&&<NumberField label="总质量" unit="kg" min={.001*assembly.nodes.length} max={100000}
            value={assembly.mass} onCommit={mass=>change({bodies:scene.bodies.map(body=>assembly.nodes.includes(body)
              ?{...body,mass:body.mass*mass/assembly.mass}:body)})}/>}
          <button type="button" className="button compact" aria-expanded={showParts} onClick={()=>setShowParts(!showParts)}>质量节点</button>
          {showParts&&assembly.nodes.map((node,index)=><NumberField key={node.id} label={'节点 '+(index+1)+' 质量'}
            unit="kg" min={.001} max={100000} value={node.mass} onCommit={mass=>change({bodies:scene.bodies.map(body=>body.id===node.id?{...body,mass}:body)})}/>)}
        </div>}
        {j&&<div key={j.id}>
          <div className="object-title"><span className="object-icon amber"><Waves size={19}/></span><div><strong>{connectionName(j)}</strong><small>约束连接 · {scene.bodies.find(b=>b.id===j.a)?.name} ↔ {scene.bodies.find(b=>b.id===j.b)?.name}</small></div></div>
          <div className="prop-group">
            <h3>连接参数</h3>
            {!j.connection&&<>
              <NumberField label="刚度" unit="N/m" min={0.01} max={100000} value={j.stiffness} onCommit={stiffness=>spring({stiffness})}/>
              <NumberField label="阻尼比" min={0} max={5} value={j.damping} onCommit={damping=>spring({damping})}/>
            </>}
            <NumberField label={j.connection==='rope'?'最大长度':j.connection==='rod'?'杆长':'原长'} unit="m" min={0.02} max={1000} value={j.restLength} onCommit={restLength=>spring({restLength})}/>
            {!j.connection&&springA&&springB&&<NumberField label="初始位移" unit="m" min={0.005-j.restLength} max={1000} value={springGeometry(springA,springB,j).length-j.restLength} onCommit={extension=>{
              const moved=setInitialExtension(springA,springB,j,extension)
              return change({bodies:scene.bodies.map(body=>body.id===moved.id?moved:body)})
            }}/>}
            {(['anchorA','anchorB'] as const).flatMap((key,i)=>(['x','y'] as const).map(axis=><NumberField key={key+axis} label={'连接点 '+(i?'B':'A')+' '+axis.toUpperCase()} unit="m" value={j[key][axis]} onCommit={n=>spring({[key]:{...j[key],[axis]:n}})}/>))}
          </div>
        </div>}
        {!b&&!j&&!assembly&&<p className="muted empty-inspector">选择物体或连接件以编辑它的物理参数。</p>}
      </>}
      <div className="prop-group notes"><h3>实验笔记</h3>
        <textarea key={scene.id+':'+scene.notes} aria-label="实验笔记" defaultValue={scene.notes} maxLength={10000} placeholder="记录你的假设或观察结果…" onBlur={e=>{if(e.target.value!==scene.notes)change({notes:e.target.value})}}/>
      </div>
    </div>
  </aside>
}
