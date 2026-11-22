import { KM_PER_SECOND_PER_AU_PER_YEAR, SOLAR_GRAVITY } from './astronomy'
import type { DoublePendulumSettings, GravityBody, GravityExperiment, InductionSettings } from './extended-experiments'
import type { Point } from './model'

const radians=Math.PI/180
type PendulumState=[number,number,number,number]
type Bodies=[GravityBody,GravityBody,GravityBody]
const pairs=[[0,1],[0,2],[1,2]] as const
const separation=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y)

export class DoublePendulum {
  readonly dt:number
  private base:PendulumState
  private comparison:PendulumState
  private refined:PendulumState
  private readonly energyScale:number
  readonly initialEnergy:number

  constructor(private readonly settings:DoublePendulumSettings) {
    const {angle1,angle2,speed1,speed2,perturbation,length1,length2,gravity}=settings
    this.dt=Math.min(1/240,.015*Math.sqrt(Math.min(length1,length2)/Math.max(gravity,1)))
    this.base=[angle1*radians,angle2*radians,speed1,speed2]
    this.comparison=[...this.base]
    this.comparison[1]+=perturbation*radians
    this.refined=this.base
    this.initialEnergy=this.energy(this.base)
    this.energyScale=Math.max(1e-12,Math.abs(this.initialEnergy),gravity*((settings.mass1+settings.mass2)*length1+settings.mass2*length2))
  }

  private derivative([a,b,u,v]:PendulumState):PendulumState {
    const {mass1:m1,mass2:m2,length1:l1,length2:l2,gravity:g}=this.settings
    const delta=a-b,c=Math.cos(delta),s=Math.sin(delta)
    // Solve the symmetric two-angle mass matrix from the Euler–Lagrange equations.
    const a11=(m1+m2)*l1*l1,a12=m2*l1*l2*c,a22=m2*l2*l2
    const f1=-(m1+m2)*g*l1*Math.sin(a)-m2*l1*l2*v*v*s
    const f2=-m2*g*l2*Math.sin(b)+m2*l1*l2*u*u*s
    const determinant=m2*l1*l1*l2*l2*(m1+m2*s*s)
    return [u,v,(f1*a22-a12*f2)/determinant,(a11*f2-a12*f1)/determinant]
  }

  private advance(state:PendulumState,dt:number):PendulumState {
    const offset=(rate:PendulumState,fraction:number)=>
      state.map((value,index)=>value+rate[index]*dt*fraction) as PendulumState
    const a=this.derivative(state),b=this.derivative(offset(a,.5))
    const c=this.derivative(offset(b,.5)),d=this.derivative(offset(c,1))
    return state.map((value,index)=>value+dt*(a[index]+2*b[index]+2*c[index]+d[index])/6) as PendulumState
  }

  private positions([a,b]:PendulumState) {
    const {length1,length2}=this.settings
    const first={x:length1*Math.sin(a),y:-length1*Math.cos(a)}
    return {first,second:{x:first.x+length2*Math.sin(b),y:first.y-length2*Math.cos(b)}}
  }

  private energy([a,b,u,v]:PendulumState) {
    const {mass1:m1,mass2:m2,length1:l1,length2:l2,gravity:g}=this.settings
    const kinetic=(m1+m2)*(l1*u)**2/2+m2*(l2*v)**2/2+m2*l1*l2*u*v*Math.cos(a-b)
    return kinetic+g*((m1+m2)*l1*(1-Math.cos(a))+m2*l2*(1-Math.cos(b)))
  }

  step() {
    this.base=this.advance(this.base,this.dt)
    this.comparison=this.advance(this.comparison,this.dt)
    const half=this.dt/2
    this.refined=this.advance(this.advance(this.refined,half),half)
    return this.sample()
  }

  sample() {
    const base=this.positions(this.base),comparison=this.positions(this.comparison),refined=this.positions(this.refined)
    const energy=this.energy(this.base)
    return {base,comparison,angles:this.base.slice(0,2),energy,
      divergence:separation(base.second,comparison.second),resolutionError:separation(base.second,refined.second),
      energyDrift:Math.abs(energy-this.initialEnergy)/this.energyScale}
  }
}

export function inductionState(settings:InductionSettings,time:number) {
  const field=settings.field+settings.slope*time
  const projectedArea=Math.abs(settings.angle)===90?0:settings.area*Math.cos(settings.angle*radians)
  const emf=-projectedArea*settings.slope
  return {field,flux:field*projectedArea,emf,current:settings.closed?emf/settings.resistance:0}
}

export const MIN_ORBIT_DISTANCE=.002

function accelerations(bodies:Bodies) {
  const result:Point[]=bodies.map(()=>({x:0,y:0}))
  for(const [i,j] of pairs) {
    const a=bodies[i],b=bodies[j],x=b.x-a.x,y=b.y-a.y
    const coefficient=SOLAR_GRAVITY/Math.hypot(x,y)**3
    result[i].x+=coefficient*b.mass*x
    result[i].y+=coefficient*b.mass*y
    result[j].x-=coefficient*a.mass*x
    result[j].y-=coefficient*a.mass*y
  }
  return result
}

function safeInterval(bodies:Bodies) {
  let bound=Infinity
  for(const [i,j] of pairs) {
    const a=bodies[i],b=bodies[j],distance=separation(a,b)
    if(distance<=MIN_ORBIT_DISTANCE)return 0
    const speed=Math.hypot(a.vx-b.vx,a.vy-b.vy)
    const dynamicalTime=Math.sqrt(distance**3/(SOLAR_GRAVITY*(a.mass+b.mass)))
    bound=Math.min(bound,.025*dynamicalTime,.025*distance/speed)
  }
  return bound
}

function driftClosest(before:Bodies,after:Bodies,i:number,j:number) {
  const x=before[i].x-before[j].x,y=before[i].y-before[j].y
  const dx=after[i].x-after[j].x-x,dy=after[i].y-after[j].y-y
  const squared=dx*dx+dy*dy
  const progress=squared?Math.max(0,Math.min(1,-(x*dx+y*dy)/squared)):0
  return Math.hypot(x+progress*dx,y+progress*dy)
}

function advanceGravity(start:Bodies,dt:number) {
  let bodies=start,remaining=dt
  for(let step=0;remaining>dt*1e-12;step++) {
    const interval=Math.min(remaining,safeInterval(bodies))
    if(interval<=0||step===128)return
    const initial=accelerations(bodies)
    const next=bodies.map((body,index)=>{
      const vx=body.vx+initial[index].x*interval/2,vy=body.vy+initial[index].y*interval/2
      return {mass:body.mass,x:body.x+vx*interval,y:body.y+vy*interval,vx,vy}
    }) as Bodies
    if(pairs.some(([i,j])=>driftClosest(bodies,next,i,j)<=MIN_ORBIT_DISTANCE))return
    const final=accelerations(next)
    for(let index=0;index<next.length;index++) {
      next[index].vx+=final[index].x*interval/2
      next[index].vy+=final[index].y*interval/2
    }
    bodies=next
    remaining-=interval
  }
  return bodies
}

function invariants(bodies:Bodies) {
  let kinetic=0,potential=0,px=0,py=0,angularMomentum=0,x=0,y=0,mass=0
  for(const body of bodies) {
    const {mass:m,vx,vy}=body
    kinetic+=m*(vx*vx+vy*vy)/2
    px+=m*vx;py+=m*vy
    angularMomentum+=m*(body.x*vy-body.y*vx)
    x+=m*body.x;y+=m*body.y;mass+=m
  }
  for(const [i,j] of pairs) {
    const a=bodies[i],b=bodies[j]
    potential-=SOLAR_GRAVITY*a.mass*b.mass/separation(a,b)
  }
  return {energy:kinetic+potential,energyScale:kinetic-potential,px,py,angularMomentum,center:{x:x/mass,y:y/mass}}
}

function relativeSpeed(bodies:Bodies,origin:0|1) {
  return Math.hypot(bodies[2].vx-bodies[origin].vx,bodies[2].vy-bodies[origin].vy)*KM_PER_SECOND_PER_AU_PER_YEAR
}

function flybyMeasurement(bodies:Bodies,time:number) {
  const starSpeed=relativeSpeed(bodies,0),planetSpeed=relativeSpeed(bodies,1)
  return {time,starSpeed,planetSpeed,starEnergy:starSpeed**2/2,planetEnergy:planetSpeed**2/2}
}

export class ThreeBody {
  readonly dt:number
  readonly rate:number
  stopped=''
  minimumDistance:number
  incoming?:ReturnType<typeof flybyMeasurement>
  outgoing?:ReturnType<typeof flybyMeasurement>
  private bodies:Bodies
  private comparison?:Bodies
  private readonly initial:ReturnType<typeof invariants>

  constructor(private readonly scene:GravityExperiment, refinement=1) {
    const flyby=scene.extension==='gravity-assist'
    this.dt=(flyby?1/12000:1/2400)/refinement
    this.rate=flyby?.018:.22
    this.bodies=scene.settings.bodies.map(body=>({...body})) as Bodies
    this.minimumDistance=flyby?separation(this.bodies[1],this.bodies[2]):Math.min(...pairs.map(([i,j])=>separation(this.bodies[i],this.bodies[j])))
    this.initial=invariants(this.bodies)
    if(scene.extension==='three-body'&&scene.settings.perturbation>0) {
      this.comparison=this.bodies.map(body=>({...body})) as Bodies
      this.comparison[2].x+=scene.settings.perturbation
    }
    if(safeInterval(this.bodies)===0||(this.comparison&&safeInterval(this.comparison)===0))this.stop()
  }

  private stop() {
    this.stopped='近距离相遇超出积分范围，已暂停。任意一对天体需保持在 0.002 AU 之外。'
  }

  step(time:number) {
    if(this.stopped)return this.sample()
    const next=advanceGravity(this.bodies,this.dt)
    const comparison=this.comparison&&advanceGravity(this.comparison,this.dt)
    if(!next||(this.comparison&&!comparison)) {
      this.stop()
      return this.sample()
    }
    if(this.scene.extension==='gravity-assist') {
      const radius=this.scene.settings.measurementRadius
      const previous=separation(this.bodies[1],this.bodies[2]),current=separation(next[1],next[2])
      this.minimumDistance=Math.min(this.minimumDistance,current)
      const enters=!this.incoming&&previous>=radius&&current<radius
      const exits=Boolean(this.incoming&&!this.outgoing&&previous<=radius&&current>radius)
      if(enters||exits) {
        const fraction=(radius-previous)/(current-previous)
        const crossing=next.map((body,index)=>{
          const former=this.bodies[index]
          return {...body,vx:former.vx+(body.vx-former.vx)*fraction,vy:former.vy+(body.vy-former.vy)*fraction}
        }) as Bodies
        const measurement=flybyMeasurement(crossing,time-this.dt*(1-fraction))
        if(enters)this.incoming=measurement
        else this.outgoing=measurement
      }
    } else {
      this.minimumDistance=Math.min(this.minimumDistance,...pairs.map(([i,j])=>separation(next[i],next[j])))
    }
    this.bodies=next
    this.comparison=comparison
    return this.sample()
  }

  sample() {
    const now=invariants(this.bodies)
    return {...now,bodies:this.bodies,comparison:this.comparison,
      divergence:this.comparison?separation(this.bodies[2],this.comparison[2]):0,
      energyDrift:Math.abs(now.energy-this.initial.energy)/Math.max(this.initial.energyScale,1e-20),
      momentumDrift:Math.hypot(now.px-this.initial.px,now.py-this.initial.py),
      angularMomentumDrift:Math.abs(now.angularMomentum-this.initial.angularMomentum),
      starSpeed:relativeSpeed(this.bodies,0),planetSpeed:relativeSpeed(this.bodies,1),
    }
  }
}
