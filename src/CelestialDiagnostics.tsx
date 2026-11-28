import { densityOf,gravityContributions,horizonRadius,invariants,orbitalState } from './celestialPhysics'
import { kerrDisk } from './blackHolePhysics'
import { useState } from 'react'
import { add,length,multiply,subtract,type SpatialPhysics,type SpatialState } from './spatialPhysics'

const format=(n:number|undefined)=>n===undefined?'—':n===0?'0':n.toPrecision(5)
export function CelestialDiagnostics({engine,body}:{engine:SpatialPhysics;body?:SpatialState}) {
 const [detail,setDetail]=useState<'all'|'motion'|'forces'>('all')
 const settings=engine.scene.celestial
 if(!settings)return null
 const now=invariants(engine.bodies,settings.softening),initial=invariants(engine.scene.bodies,settings.softening)
 const drift=Math.abs(now.energy-initial.energy)/Math.max(Math.abs(initial.energy),1e-30)
 const primary=engine.bodies.filter(b=>b!==body&&b.physicsEnabled!==false).reduce<SpatialState|undefined>((best,b)=>!best||b.mass>best.mass?b:best,undefined)
 const orbit=body&&primary?orbitalState(body,primary):undefined
 const initialBody=engine.scene.bodies.find(item=>item.id===body?.id),initialPrimary=engine.scene.bodies.find(item=>item.id===primary?.id)
 const startOrbit=initialBody&&initialPrimary?orbitalState(initialBody,initialPrimary):undefined
 const exchange=engine.bodies.filter(b=>b.physicsEnabled!==false).length>2||engine.interventions.length>0||engine.contactEvents.length>0||
   engine.bodies.some(b=>b.force.some(Boolean))
 const captured=exchange&&startOrbit&&startOrbit.energy>0&&orbit&&orbit.energy<0
 const contributions=body?gravityContributions(body,engine.bodies,settings.softening):[]
 const gravity=contributions.reduce<SpatialState['force']>((sum,item)=>add(sum,item.force),[0,0,0])
 const potential=contributions.reduce((sum,item)=>sum+item.potential,0)
 const kinetic=body&&body.physicsEnabled!==false?.5*body.mass*length(body.velocity)**2:0
 const tuple=(v:readonly number[])=>v.map(format).join(', ')
 return <details className="celestial-diagnostics"><summary>实时物理诊断</summary>
  <p>牛顿多体模型 · Plummer 软化 {format(settings.softening)} m · 每步 {format(engine.stepSeconds)} 秒</p>
  <label>物理数据字段<select value={detail} onChange={e=>setDetail(e.target.value as typeof detail)}>
    <option value="all">所有字段</option><option value="motion">运动与轨道</option><option value="forces">力和能量</option>
  </select></label>
  <dl>
   <dt>总质量 (kg)</dt><dd>{format(now.mass)}</dd><dt>动能 / 势能 / 总能量 (J)</dt><dd>{tuple([now.kinetic,now.potential,now.energy])}</dd>
   <dt>机械能相对变化</dt><dd>{format(drift*100)}%</dd>
   <dt>总动量 XYZ (kg·m/s)</dt><dd>{tuple(now.momentum)}</dd><dt>总角动量 XYZ (kg·m²/s)</dt><dd>{tuple(now.angular)}</dd>
   <dt>动量变化量 (kg·m/s)</dt><dd>{format(length(subtract(now.momentum,initial.momentum)))}</dd>
   <dt>角动量变化量 (kg·m²/s)</dt><dd>{format(length(subtract(now.angular,initial.angular)))}</dd>
   {body&&detail!=='forces'&&<><dt>平均密度 (kg/m³)</dt><dd>{body.celestial?.kind==='blackHole'?'—':format(densityOf(body.mass,body.radius))}</dd>
   <dt>当前位置 XYZ (m)</dt><dd>{tuple(body.position)}</dd><dt>速度 XYZ (m/s)</dt><dd>{tuple(body.velocity)}</dd>
   <dt>加速度 XYZ (m/s²)</dt><dd>{tuple(body.acceleration)}</dd>
   <dt>角速度 XYZ (rad/s)</dt><dd>{tuple(body.angularVelocity)}</dd>
   </>}
   {body&&detail!=='motion'&&<>
   <dt>天体动能 / 成对势能 / 能量分摊 (J)</dt><dd>{tuple([kinetic,potential,kinetic+potential/2])}</dd>
   <dt>总天体引力 XYZ (N)</dt><dd>{tuple(gravity)}</dd>
   <dt>自定义均匀引力场作用 XYZ (N)</dt><dd>{tuple(multiply(engine.scene.gravity,body.mass))}</dd>
   <dt>施加外力 XYZ (N)</dt><dd>{tuple(engine.appliedForce(body.id))}</dd>
   <dt>合力 XYZ (N)</dt><dd>{tuple(add(add(gravity,multiply(engine.scene.gravity,body.mass)),engine.appliedForce(body.id)))}</dd>
   {contributions.map(item=><div key={item.id}><dt>{engine.bodies.find(b=>b.id===item.id)?.name}的引力 XYZ (N)</dt><dd>{tuple(item.force)}</dd></div>)}
   {body.celestial?.kind==='blackHole'&&<><dt>外视界 / 史瓦西尺度 (m)</dt><dd>{tuple([body.radius,horizonRadius(body.mass)])}</dd>
    <dt>自旋 χ / 最内稳定圆轨道 (m)</dt><dd>{tuple([body.celestial.spin??0,kerrDisk(body.mass,body.celestial.spin).isco])}</dd></>}
   </>}
   {orbit&&detail!=='forces'&&<><dt>相对{primary?.name}的瞬时双体轨道</dt><dd>偏心率 {format(orbit.eccentricity)} · 倾角 {format(orbit.inclination)}°</dd>
   <dt>半长轴 / 近心点 / 远心点 (m)</dt><dd>{[orbit.axis,orbit.periapsis,orbit.apoapsis].map(format).join(' / ')}</dd>
   <dt>相对速率 (m/s) / 比轨道能量 (J/kg)</dt><dd>{tuple([orbit.speed,orbit.energy])}{captured&&' · 已从无束缚变为瞬时束缚'}</dd></>}
  </dl>
  <p>施加外力、固定天体或非弹性接触时，能量变化可来自系统边界。能量分摊计入一半的成对势能。</p>
  {drift>.001&&!exchange&&<p role="status">机械能相对变化已超过 0.1%。可缩小积分步长后对照结果。</p>}
  {engine.scene.title==='引力捕获 · 人工耗能'&&<p>选中随行天体，在自由干预中把速度缩小到原值的约 2/3，再单步执行。对照比轨道能量由正变负。</p>}
  {engine.scene.title==='引力捕获 · 三体交换'&&<p>伴星相对中心天体的初始轨道均无束缚。近掠时重新分配轨道能量，选中两颗伴星可分别观察。多体系统中的瞬时束缚可再次解除。</p>}
 </details>
}
