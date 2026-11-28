import type { SpatialBody, Vec3 } from './spatialPhysics'

export const GRAVITATION=6.6743e-11
export const LIGHT_SPEED=299792458
export const horizonRadius=(mass:number)=>2*GRAVITATION*mass/LIGHT_SPEED**2
export const densityOf=(mass:number,radius:number)=>3*mass/(4*Math.PI*radius**3)
export const radiusForDensity=(mass:number,density:number)=>Math.cbrt(3*mass/(4*Math.PI*density))
export function disruptionEnergyPerKg(body:Pick<SpatialBody,'mass'|'radius'|'celestial'|'disruptionStrength'>) {
  const material=body.disruptionStrength??(body.celestial?.kind==='ice'?5e4:body.celestial?.kind==='comet'?1e3:1e5)
  return material+3*GRAVITATION*body.mass/(5*body.radius)
}
const plus=(a:Vec3,b:Vec3,k=1):Vec3=>[a[0]+k*b[0],a[1]+k*b[1],a[2]+k*b[2]]
const minus=(a:Vec3,b:Vec3)=>plus(a,b,-1)
const dot=(a:Vec3,b:Vec3)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2]
const norm=(v:Vec3)=>Math.hypot(...v)
const cross=(a:Vec3,b:Vec3):Vec3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]
const zero=():Vec3=>[0,0,0]
type Body=Pick<SpatialBody,'id'|'mass'|'position'|'velocity'|'fixed'|'radius'|'celestial'|'physicsEnabled'>

export function gravityVectors(bodies:readonly Body[],softening:number,positions=bodies.map(b=>b.position)) {
  const result=bodies.map(zero)
  for(let i=0;i<bodies.length;i++)for(let j=i+1;j<bodies.length;j++) {
    if(bodies[i].physicsEnabled===false||bodies[j].physicsEnabled===false)continue
    const delta=minus(positions[j],positions[i])
    const factor=GRAVITATION/(dot(delta,delta)+softening**2)**1.5
    result[i]=plus(result[i],delta,factor*bodies[j].mass)
    result[j]=plus(result[j],delta,-factor*bodies[i].mass)
  }
  return result
}

export function gravityContributions(body:Body,bodies:readonly Body[],softening:number) {
  if(body.physicsEnabled===false)return []
  return bodies.flatMap(peer=>{
    if(peer.id===body.id||peer.physicsEnabled===false)return []
    const offset=minus(peer.position,body.position)
    const distance=Math.hypot(norm(offset),softening)
    return [{id:peer.id,force:plus(zero(),offset,GRAVITATION*body.mass*peer.mass/distance**3),
      potential:-GRAVITATION*body.mass*peer.mass/distance}]
  })
}

export function sphereContactFraction(before:Vec3,after:Vec3,radius:number) {
  const delta=minus(after,before),a=dot(delta,delta),b=dot(before,delta)
  const c=dot(before,before)-radius**2
  if(a===0||b>=0||c<=0)return
  const discriminant=b*b-a*c
  if(discriminant<0)return
  const fraction=c/(-b+Math.sqrt(discriminant))
  return fraction<=1?fraction:undefined
}

export function integrateCelestial(bodies:Body[],duration:number,options:{
  softening:number;integrator:'verlet'|'rk4';maxStep:number;adaptive:boolean
},external:()=>Vec3[],afterStep?:(offset:number,previous:Map<string,Vec3>,duration:number)=>void) {
  const {softening,integrator,maxStep,adaptive}=options
  const acceleration=(p:Vec3[],applied:Vec3[])=>gravityVectors(bodies,softening,p).map((a,i)=>bodies[i].fixed||bodies[i].physicsEnabled===false?zero():plus(a,applied[i]))
  let steps=Math.max(1,Math.ceil(duration/maxStep-1e-12))
  if(adaptive)for(let i=0;i<bodies.length;i++)for(let j=i+1;j<bodies.length;j++) {
    const a=bodies[i],b=bodies[j],r=Math.hypot(norm(minus(a.position,b.position)),softening)
    if(a.physicsEnabled===false||b.physicsEnabled===false)continue
    const dynamical=Math.sqrt(r**3/(GRAVITATION*(a.mass+b.mass)))
    const passage=r/Math.max(1e-15,norm(minus(a.velocity,b.velocity)))
    steps=Math.max(steps,Math.ceil(duration/(.04*Math.min(dynamical,passage))))
  }
  if(steps>128)throw new Error('近距离交会需要更小的模拟步长。请暂停并降低每步模拟时间。')
  const h=duration/steps
  for(let step=0;step<steps;step++) {
    const applied=external(),movable=(b:Body)=>!b.fixed&&b.physicsEnabled!==false
    const p=bodies.map(b=>b.position),v=bodies.map(b=>movable(b)?b.velocity:zero()),a=acceleration(p,applied)
    if(integrator==='verlet') {
      const q=p.map((x,i)=>plus(plus(x,v[i],h),a[i],h*h/2))
      const next=acceleration(q,applied)
      bodies.forEach((b,i)=>{if(movable(b)){b.position=q[i];b.velocity=plus(plus(v[i],a[i],h/2),next[i],h/2)}})
    } else {
      const v2=v.map((x,i)=>plus(x,a[i],h/2))
      const b2=acceleration(p.map((x,i)=>plus(x,v[i],h/2)),applied)
      const v3=v.map((x,i)=>plus(x,b2[i],h/2))
      const b3=acceleration(p.map((x,i)=>plus(x,v2[i],h/2)),applied)
      const v4=v.map((x,i)=>plus(x,b3[i],h))
      const b4=acceleration(p.map((x,i)=>plus(x,v3[i],h)),applied)
      const sum=(a:Vec3,b:Vec3,c:Vec3,d:Vec3)=>plus(plus(plus(a,b,2),c,2),d)
      bodies.forEach((b,i)=>{if(movable(b)){
        b.position=plus(p[i],sum(v[i],v2[i],v3[i],v4[i]),h/6)
        b.velocity=plus(v[i],sum(a[i],b2[i],b3[i],b4[i]),h/6)
      }})
    }
    if(afterStep)afterStep((step+1)*h,new Map(bodies.map((b,i)=>[b.id,p[i]])),h)
  }
}

export function invariants(bodies:readonly Body[],softening:number) {
  bodies=bodies.filter(b=>b.physicsEnabled!==false)
  let mass=0,kinetic=0,potential=0,momentum=zero(),angular=zero(),momentumScale=0
  bodies.forEach((b,i)=>{
    mass+=b.mass;kinetic+=.5*b.mass*dot(b.velocity,b.velocity)
    momentum=plus(momentum,b.velocity,b.mass)
    angular=plus(angular,cross(b.position,b.velocity),b.mass)
    momentumScale+=b.mass*norm(b.velocity)
    for(const a of bodies.slice(0,i))potential-=GRAVITATION*a.mass*b.mass/Math.hypot(norm(minus(a.position,b.position)),softening)
  })
  return {mass,kinetic,potential,energy:kinetic+potential,momentum,angular,momentumScale}
}

export function orbitalState(body:Body,primary:Body) {
  const r=minus(body.position,primary.position),v=minus(body.velocity,primary.velocity),distance=norm(r)
  const mu=GRAVITATION*(body.mass+primary.mass),angular=cross(r,v),h=norm(angular)
  if(!distance||!h)return
  const energy=dot(v,v)/2-mu/distance
  const eccentricity=norm(plus(plus(zero(),cross(v,angular),1/mu),r,-1/distance))
  const axis=energy!==0?-mu/(2*energy):undefined
  return {speed:norm(v),energy,eccentricity,axis,inclination:Math.acos(Math.max(-1,Math.min(1,angular[1]/h)))*180/Math.PI,
    periapsis:h*h/(mu*(1+eccentricity)),apoapsis:axis&&axis>0?axis*(1+eccentricity):undefined}
}
