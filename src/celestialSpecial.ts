import { circularInspiral,kerrRingdown,timedCollapse } from './blackHolePhysics'
import { mergerReplay } from './celestialMergerReplay'
import type { SpatialBody,Vec3 } from './spatialPhysics'

type Evolution={
  stop:number
  at:(time:number)=>(
    {kind:'binaryPN';positions:Vec3[];velocities:Vec3[];accelerations:Vec3[];radius:number;frequency:number;power:number;phase:number;radiatedEnergy:number}
    |{kind:'collapse';radius:number;density:number;potential:number;surfaceSpeed:number}
    |{kind:'ringdown';frequency:number;tau:number;amplitude:number;wave:number;spin:number}
    |ReturnType<ReturnType<typeof mergerReplay>['at']>
  )
}
const scale=(v:Vec3,k:number):Vec3=>[v[0]*k+0,v[1]*k+0,v[2]*k+0]
const add=(a:Vec3,b:Vec3):Vec3=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]]
const direction=(a:Vec3,b:Vec3)=>add(b,scale(a,-1))
const dot=(a:Vec3,b:Vec3)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2]

export function specialEvolution(kind:'binaryPN'|'collapse'|'ringdown'|'mergerReplay',bodies:SpatialBody[]):Evolution {
  const [a,b]=bodies
  if(kind==='mergerReplay')return mergerReplay(a.mass+b.mass)
  if(kind==='ringdown') {
    const spin=a.celestial?.spin??0
    const {omega,frequency,tau}=kerrRingdown(a.mass,spin)
    return {stop:8*tau,at:time=>{
      const amplitude=Math.exp(-time/tau)
      return {kind,frequency,tau,spin,amplitude,wave:amplitude*Math.cos(omega*time)}
    }}
  }
  if(kind==='collapse') {
    const initial=timedCollapse(a.mass,a.radius,0)
    if(!initial)throw new Error('初始球体已超出牛顿坍缩模型的适用范围。')
    return {stop:initial.stop,at:time=>({kind,...timedCollapse(a.mass,a.radius,time)!})}
  }
  const separation=direction(a.position,b.position),r=Math.hypot(...separation)
  const base=circularInspiral(a.mass,b.mass,r,0,true)
  if(!base)throw new Error('双黑洞初始间距须大于 20 GM/c²。')
  const x=scale(separation,1/r)
  const relative=direction(a.velocity,b.velocity)
  const tangent=add(relative,scale(x,-dot(relative,x)))
  const norm=Math.hypot(...tangent)
  if(norm===0)throw new Error('双黑洞需要指定轨道平面与旋转方向。')
  const y=scale(tangent,1/norm)
  const fraction=b.mass/(a.mass+b.mass)
  const origin=add(a.position,scale(separation,fraction)),drift=add(a.velocity,scale(relative,fraction))
  return {stop:base.stop,at:time=>{
    const orbit=circularInspiral(a.mass,b.mass,r,time,true)!
    const cosine=Math.cos(orbit.phase),sine=Math.sin(orbit.phase)
    const normal=add(scale(x,cosine),scale(y,sine)),forward=add(scale(x,-sine),scale(y,cosine))
    const offset=scale(normal,orbit.radius)
    const velocity=add(scale(normal,orbit.radialSpeed),scale(forward,orbit.radius*orbit.omega))
    const acceleration=add(scale(normal,orbit.radialAcceleration-orbit.radius*orbit.omega**2),
      scale(forward,2*orbit.radialSpeed*orbit.omega+orbit.radius*orbit.angularAcceleration))
    const center=add(origin,scale(drift,time))
    return {kind,...orbit,positions:[add(center,scale(offset,-fraction)),add(center,scale(offset,1-fraction))],
      velocities:[add(drift,scale(velocity,-fraction)),add(drift,scale(velocity,1-fraction))],
      accelerations:[scale(acceleration,-fraction),scale(acceleration,1-fraction)]}
  }}
}
