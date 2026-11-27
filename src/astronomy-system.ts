import { SOLAR_GRAVITY, type CelestialBody } from './astronomy'
import { barycentricPosition, centerOfMass, type TwoBodyOrbit } from './orbital-physics'
import type { Point } from './model'

export function bodyAcceleration(body:CelestialBody,bodies:CelestialBody[]):Point {
  return bodies.reduce((a,other)=>{
    if(other.id===body.id)return a
    const dx=other.position.x-body.position.x,dy=other.position.y-body.position.y,r=Math.hypot(dx,dy)
    if(!r)return a
    return {x:a.x+SOLAR_GRAVITY*other.mass*dx/r**3,y:a.y+SOLAR_GRAVITY*other.mass*dy/r**3}
  },{x:0,y:0})
}

export function orbitBodies(orbit:TwoBodyOrbit):CelestialBody[] {
  const center=centerOfMass(orbit.bodies), [a,b]=orbit.bodies
  const mass=a.mass+b.mass
  const velocity={x:(a.mass*a.velocity.x+b.mass*b.velocity.x)/mass,y:(a.mass*a.velocity.y+b.mass*b.velocity.y)/mass}
  return orbit.bodies.map((body,i)=>{
    const p=barycentricPosition(orbit.current.relative,orbit.bodies,i as 0|1)
    const v=barycentricPosition(orbit.current.velocity,orbit.bodies,i as 0|1)
    return {...body,position:{x:center.x+velocity.x*orbit.current.time+p.x,y:center.y+velocity.y*orbit.current.time+p.y},
      velocity:{x:velocity.x+v.x,y:velocity.y+v.y}}
  })
}

export function systemCenter(bodies:CelestialBody[]) {
  const mass=bodies.reduce((sum,b)=>sum+b.mass,0)
  return bodies.reduce((p,b)=>({x:p.x+b.position.x*b.mass/mass,y:p.y+b.position.y*b.mass/mass}),{x:0,y:0})
}

export class AstronomySystem {
  bodies:CelestialBody[]
  time=0
  dt:number
  readonly playbackRate:number
  readonly initialEnergy:number
  readonly initialMomentum:Point
  readonly initialAngularMomentum:number
  stopped=''
  history:{time:number;positions:Point[]}[]=[]
  constructor(bodies:CelestialBody[]) {
    this.bodies=structuredClone(bodies)
    this.dt=this.safeInterval()
    if(!this.dt)throw new Error('天体初始位置发生接触，请增大间距。')
    this.playbackRate=Math.min(.12,this.dt*2000)
    this.initialEnergy=this.energy()
    this.initialMomentum=this.momentum()
    this.initialAngularMomentum=this.angularMomentum()
    this.record()
  }
  private safeInterval() {
    let dt=1/2000
    for(let i=0;i<this.bodies.length;i++)for(let j=i+1;j<this.bodies.length;j++) {
      const a=this.bodies[i],b=this.bodies[j]
      const r=Math.hypot(a.position.x-b.position.x,a.position.y-b.position.y)
      if(r<=a.radius+b.radius)return 0
      const v=Math.hypot(a.velocity.x-b.velocity.x,a.velocity.y-b.velocity.y)
      dt=Math.min(dt,.004*Math.sqrt(r**3/(SOLAR_GRAVITY*(a.mass+b.mass))),.004*r/Math.max(v,1e-15))
    }
    return dt
  }
  private acceleration(bodies:CelestialBody[]) {
    const result=bodies.map(()=>({x:0,y:0}))
    for(let i=0;i<bodies.length;i++)for(let j=i+1;j<bodies.length;j++) {
      const a=bodies[i],b=bodies[j],x=b.position.x-a.position.x,y=b.position.y-a.position.y
      const factor=SOLAR_GRAVITY/Math.hypot(x,y)**3
      result[i].x+=factor*b.mass*x;result[i].y+=factor*b.mass*y
      result[j].x-=factor*a.mass*x;result[j].y-=factor*a.mass*y
    }
    return result
  }
  energy() {
    const mass=this.bodies.reduce((s,b)=>s+b.mass,0)
    const velocity=this.bodies.reduce((s,b)=>({x:s.x+b.mass*b.velocity.x/mass,y:s.y+b.mass*b.velocity.y/mass}),{x:0,y:0})
    let e=this.bodies.reduce((s,b)=>s+.5*b.mass*((b.velocity.x-velocity.x)**2+(b.velocity.y-velocity.y)**2),0)
    for(let i=0;i<this.bodies.length;i++)for(let j=i+1;j<this.bodies.length;j++) {
      const a=this.bodies[i],b=this.bodies[j]
      e-=SOLAR_GRAVITY*a.mass*b.mass/Math.hypot(a.position.x-b.position.x,a.position.y-b.position.y)
    }
    return e
  }
  momentum() {
    return this.bodies.reduce((sum,body)=>({x:sum.x+body.mass*body.velocity.x,y:sum.y+body.mass*body.velocity.y}),{x:0,y:0})
  }
  angularMomentum() {
    const center=systemCenter(this.bodies)
    const velocity=this.momentum(),mass=this.bodies.reduce((sum,body)=>sum+body.mass,0)
    return this.bodies.reduce((sum,body)=>sum+body.mass*((body.position.x-center.x)*(body.velocity.y-velocity.y/mass)-(body.position.y-center.y)*(body.velocity.x-velocity.x/mass)),0)
  }
  csv() {
    const samples=[...this.history,{time:this.time,positions:this.bodies.map(b=>b.position)}]
    return ['time_yr,body_id,x_AU,y_AU',...samples.flatMap(s=>s.positions.map((p,i)=>
      [s.time,JSON.stringify(this.bodies[i].id),p.x,p.y].join(',')))].join('\r\n')+'\r\n'
  }
  step() {
    if(this.stopped)return false
    const dt=this.safeInterval()
    if(dt<1e-13) {this.stopped='天体接触或时间步长过小，已暂停。';return false}
    const a=this.acceleration(this.bodies)
    const next=this.bodies.map((b,i)=>({...b,position:{x:b.position.x+b.velocity.x*dt+a[i].x*dt*dt/2,y:b.position.y+b.velocity.y*dt+a[i].y*dt*dt/2}}))
    for(let i=0;i<next.length;i++)for(let j=i+1;j<next.length;j++) {
      const p={x:this.bodies[i].position.x-this.bodies[j].position.x,y:this.bodies[i].position.y-this.bodies[j].position.y}
      const dx=next[i].position.x-next[j].position.x-p.x,dy=next[i].position.y-next[j].position.y-p.y
      const t=Math.max(0,Math.min(1,-(p.x*dx+p.y*dy)/(dx*dx+dy*dy||1)))
      if(Math.hypot(p.x+t*dx,p.y+t*dy)<=next[i].radius+next[j].radius){this.stopped='天体已接触，模拟暂停。';return false}
    }
    const end=this.acceleration(next)
    next.forEach((b,i)=>{b.velocity={x:b.velocity.x+(a[i].x+end[i].x)*dt/2,y:b.velocity.y+(a[i].y+end[i].y)*dt/2}})
    if(next.some(b=>![b.position.x,b.position.y,b.velocity.x,b.velocity.y].every(Number.isFinite))) {
      this.stopped='数值超出范围，已暂停。';return false
    }
    this.bodies=next;this.time+=dt;this.dt=dt
    if(this.time-(this.history.at(-1)?.time??0)>=this.playbackRate/40)this.record()
    return true
  }
  private record() {
    this.history.push({time:this.time,positions:this.bodies.map(b=>({...b.position}))})
    if(this.history.length>1600)this.history.shift()
  }
}
