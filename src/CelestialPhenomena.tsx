import { useState } from 'react'
import { circularInspiral,lightDeflection,pointLens,pressurelessCollapse,radialTide } from './blackHolePhysics'
import { horizonRadius } from './celestialPhysics'
import { length,subtract,type SpatialPhysics,type SpatialState } from './spatialPhysics'

const number=(value:number)=>value.toExponential(4)

export function CelestialPhenomena({engine,body}:{engine:SpatialPhysics;body?:SpatialState}) {
  const [progress,setProgress]=useState(0)
  const [impact,setImpact]=useState(30)
  const [sourceOffset,setSourceOffset]=useState(.7)
  const otherHole=engine.bodies.find(b=>b.id!==body?.id&&b.celestial?.kind==='blackHole')
  const companion=engine.bodies.find(b=>b.id!==body?.id&&b.celestial?.kind!=='blackHole')
  if(!body)return null
  if(body.celestial?.kind==='blackHole') {
    const horizon=horizonRadius(body.mass)
    const bending=lightDeflection(body.mass,impact*horizon)!
    const images=pointLens(body.mass,horizon*2e6,horizon*4e6,sourceOffset)!
    const tidal=companion&&radialTide(body.mass,length(subtract(body.position,companion.position)),2*companion.radius)
    const initialA=engine.scene.bodies.find(b=>b.id===body.id),initialB=engine.scene.bodies.find(b=>b.id===otherHole?.id)
    const separation=initialA&&initialB?length(subtract(initialA.position,initialB.position)):undefined
    const reference=otherHole&&separation?circularInspiral(body.mass,otherHole.mass,separation,0):undefined
    const orbit=reference&&otherHole&&separation?circularInspiral(body.mass,otherHole.mass,separation,reference.stop*progress):undefined
    const displayRadius=orbit&&separation?64*orbit.radius/separation:0
    return <details className="celestial-diagnostics">
      <summary>黑洞光线与双体模型</summary>
      <label>冲量参数 b / 史瓦西半径 <input type="range" min="20" max="100" value={impact} onChange={e=>setImpact(+e.target.value)}/></label>
      <p>b = {impact} rₛ · 弱场偏折 {number(bending)} rad</p>
      <svg className="celestial-figure" viewBox="0 0 220 85" role="img" aria-label="弱场近似光线偏折示意图">
        <circle cx="100" cy="61" r="10" fill="#000" stroke="#f6b377"/>
        <path d={`M8 28 H100 Q118 28 210 ${28+Math.tan(bending)*110}`} fill="none" stroke="#b9d7ff"/>
        <path d="M8 28 H210" fill="none" stroke="#7e8fa6" strokeDasharray="3 3"/>
      </svg>
      <p>直线为无透镜对照。图中光线采用薄透镜近似，路径比例经过缩放。</p>
      <label>背景光源偏移 / 爱因斯坦角 <input type="range" min="-2" max="2" step=".01" value={sourceOffset} onChange={e=>setSourceOffset(+e.target.value)}/></label>
      <svg className="celestial-figure" viewBox="0 0 220 100" role="img" aria-label="点引力透镜的双像与爱因斯坦环">
        <circle cx="110" cy="50" r="36" fill="none" stroke={sourceOffset===0?'#b9d7ff':'#536683'} strokeDasharray={sourceOffset===0?undefined:'3 3'}/>
        <circle cx="110" cy="50" r="4" fill="#eeaa71"/>
        {sourceOffset!==0&&images.images.map((angle,i)=><circle key={i} cx={110+36*angle/images.einstein} cy="50" r="4" fill="#b9d7ff"/>)}
        {sourceOffset!==0&&<circle cx={110+36*sourceOffset} cy="50" r="4" fill="none" stroke="#ddd1a1"/>}
      </svg>
      <p>爱因斯坦角 {number(images.einstein)} rad。空心点标记背景光源原位置，实心蓝点是像。完全对齐时形成环。</p>
      {companion&&<p>{companion.name} 直径两端的径向潮汐加速度差 {tidal===undefined?'超出弱场小尺寸近似范围':number(tidal)+' m/s²'}</p>}
      {orbit&&<><label>圆轨道辐射近似进度 <input type="range" min="0" max="1" step=".001" value={progress} onChange={e=>setProgress(+e.target.value)}/></label>
        <svg className="celestial-figure" viewBox="0 0 220 100" role="img" aria-label="圆轨道辐射收缩与引力波相位">
          <ellipse cx="110" cy="47" rx={displayRadius} ry={displayRadius*.38} stroke="#747f9d" fill="none"/>
          {[-1,1].map(sign=><circle key={sign} cx={110+sign*displayRadius*Math.cos(orbit.phase)} cy={47+sign*displayRadius*.38*Math.sin(orbit.phase)} r="5" fill="#000" stroke="#ffc187"/>)}
          <path d={'M'+Array.from({length:40},(_,i)=>[12+i*5,87-6*Math.sin(i*.56+2*orbit.phase)].join(' ')).join(' L')} fill="none" stroke="#b9c7ee"/>
        </svg>
        <p>间距 {number(orbit.radius)} m · 引力波频率 {number(orbit.frequency)} Hz · 辐射功率 {number(orbit.power)} W</p>
        <p>Peters 圆轨道四极近似。上图为独立对照，波形幅度采用示意比例。计算止于强场之前，主画布运行牛顿模型。</p>
      </>}
    </details>
  }
  if(body.celestial?.kind!=='star')return null
  const result=pressurelessCollapse(body.mass,body.radius,progress)
  return <details className="celestial-diagnostics"><summary>无压球坍缩对照</summary>
    <p>假设物质初始均匀、静止、球对称且无气体压力。计算在强场之前停止。</p>
    {!result?<p>初始半径超出该模型的适用范围。</p>:<>
      <label>坍缩进度 <input type="range" min="0" max="1" step=".001" value={progress} onChange={e=>setProgress(+e.target.value)}/></label>
      <svg className="celestial-figure" viewBox="0 0 220 90" role="img" aria-label="均匀无压球自由落体">
        <circle cx="110" cy="45" r="39" stroke="#7e8fa6" strokeDasharray="3 3" fill="none"/>
        <circle cx="110" cy="45" r={39*result.radius/body.radius} fill="#f2b77c" fillOpacity=".5" stroke="#ffdda8"/>
      </svg>
      <p>已过 {number(result.time)} s · 半径 {number(result.radius)} m · 密度 {number(result.density)} kg/m³</p>
      <p>自引力势能 {number(result.potential)} J · 表面内落速率 {number(result.surfaceSpeed)} m/s</p>
    </>}
  </details>
}
