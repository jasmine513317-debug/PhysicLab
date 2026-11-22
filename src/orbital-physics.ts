import { ellipsePair, SOLAR_GRAVITY, type CelestialBody } from './astronomy'
import type { Point } from './model'

type Pair=[CelestialBody,CelestialBody]
const TAU=2*Math.PI
const add=(a:Point,b:Point):Point=>({x:a.x+b.x,y:a.y+b.y})
const difference=(a:Point,b:Point):Point=>({x:a.x-b.x,y:a.y-b.y})
const scale=(p:Point,factor:number):Point=>({x:p.x*factor,y:p.y*factor})
const length=(p:Point)=>Math.hypot(p.x,p.y)
const cross=(a:Point,b:Point)=>a.x*b.y-a.y*b.x
const dot=(a:Point,b:Point)=>a.x*b.x+a.y*b.y
const blend=(a:Point,b:Point,t:number)=>add(a,scale(difference(b,a),t))

export interface OrbitSample {
  time:number
  relative:Point
  velocity:Point
  energy:number
  angularMomentum:number
}
interface Sweep {samples:OrbitSample[];area:number}

export function orbitalElements(relative:Point,velocity:Point,mu:number) {
  const separation=length(relative),speedSquared=dot(velocity,velocity),motion=dot(relative,velocity)
  if(separation===0)return
  const specificEnergy=speedSquared/2-mu/separation
  const eccentricityVector=scale(difference(scale(relative,speedSquared-mu/separation),scale(velocity,motion)),1/mu)
  const eccentricity=length(eccentricityVector)
  const angularMomentum=cross(relative,velocity)
  const direction=eccentricity>1e-10?Math.atan2(eccentricityVector.y,eccentricityVector.x):Math.atan2(relative.y,relative.x)
  const periapsis=(angularMomentum**2/mu)/(1+eccentricity)
  const energyRoundoff=32*Number.EPSILON*(speedSquared/2+mu/separation)
  const axis=specificEnergy < -energyRoundoff&&eccentricity<1?-mu/(2*specificEnergy):undefined
  const period=axis===undefined?undefined:TAU*Math.sqrt(axis**3/mu)
  const apoapsis=axis===undefined?undefined:axis*(1+eccentricity)
  return {specificEnergy,eccentricity,angularMomentum,direction,periapsis,axis,period,apoapsis}
}

export function barycentricPosition(relative:Point,bodies:Pair,index:0|1) {
  const mass=bodies[0].mass+bodies[1].mass
  return scale(relative,index===0?-bodies[1].mass/mass:bodies[0].mass/mass)
}

export function centerOfMass(bodies:Pair) {
  const [primary,secondary]=bodies
  return blend(primary.position,secondary.position,secondary.mass/(primary.mass+secondary.mass))
}

export function escapeThreshold(orbit:TwoBodyOrbit) {
  return Math.sqrt(2*orbit.mu/length(orbit.initial.relative))
}

export function withEscapeSpeed(orbit:TwoBodyOrbit,factor:number):Pair {
  const relative=orbit.initial.relative, direction=scale({x:-relative.y,y:relative.x},1/length(relative))
  const velocity=scale(direction,escapeThreshold(orbit)*factor)
  const [primary,secondary]=orbit.bodies
  const centerVelocity=blend(primary.velocity,secondary.velocity,secondary.mass/(primary.mass+secondary.mass))
  return [
    {...primary,velocity:add(centerVelocity,barycentricPosition(velocity,orbit.bodies,0))},
    {...secondary,velocity:add(centerVelocity,barycentricPosition(velocity,orbit.bodies,1))},
  ]
}

export function referenceEllipse(elements:ReturnType<typeof orbitalElements>) {
  if(!elements?.axis)return []
  const {axis,eccentricity,direction}=elements
  const shortAxis=axis*Math.sqrt(1-eccentricity**2)
  const cosine=Math.cos(direction),sine=Math.sin(direction)
  return Array.from({length:193},(_,index)=>{
    const angle=index*TAU/192, x=axis*(Math.cos(angle)-eccentricity),y=shortAxis*Math.sin(angle)
    return {x:x*cosine-y*sine,y:x*sine+y*cosine}
  })
}

export class TwoBodyOrbit {
  readonly bodies:Pair
  readonly mu:number
  readonly reducedMass:number
  readonly elements:ReturnType<typeof orbitalElements>
  readonly dt:number
  readonly sweepSteps:number
  readonly playbackRate:number
  readonly initial:OrbitSample
  readonly history:OrbitSample[]=[]
  current:OrbitSample
  firstSweep?:Sweep
  lastSweep?:Sweep
  measuredPeriod?:number
  minimumDistance:number
  maximumDistance:number
  stopped=''
  private relative:Point
  private velocity:Point
  private acceleration:Point
  private contactDistance:number
  private stepCount=0
  private revolutionAngle=0
  private sweep:Sweep

  constructor(bodies:Pair) {
    this.bodies=bodies
    const [primary,secondary]=bodies
    const mass=primary.mass+secondary.mass
    this.mu=SOLAR_GRAVITY*mass
    this.reducedMass=primary.mass*secondary.mass/mass
    this.relative=difference(secondary.position,primary.position)
    this.velocity=difference(secondary.velocity,primary.velocity)
    const initialDistance=length(this.relative)
    this.minimumDistance=this.maximumDistance=initialDistance
    this.contactDistance=Math.max(1e-8,primary.radius+secondary.radius)
    if(initialDistance<=this.contactDistance)throw new Error('初始位置发生接触。请增大天体间距。')
    this.elements=orbitalElements(this.relative,this.velocity,this.mu)
    const closest=Math.min(initialDistance,Math.max(this.contactDistance,this.elements?.periapsis??initialDistance))
    const dynamicalTime=Math.sqrt(closest**3/this.mu)
    const velocityTime=closest/Math.max(length(this.velocity),1e-12)
    const resolution=this.elements?.period?80:256
    this.dt=Math.min((this.elements?.period??Infinity)/4096,dynamicalTime/resolution,velocityTime/resolution)
    this.playbackRate=Math.min((this.elements?.period??dynamicalTime*TAU)/9,this.dt*6800)
    const sweepDuration=(this.elements?.period??this.dt*4096)/8
    this.sweepSteps=Math.max(1,Math.round(sweepDuration/this.dt))
    this.acceleration=this.accelerationAt(this.relative)
    this.initial=this.current=this.sample()
    this.history.push(this.initial)
    this.sweep={samples:[this.initial],area:0}
  }

  private accelerationAt(relative:Point) {
    return scale(relative,-this.mu/length(relative)**3)
  }

  private sample():OrbitSample {
    return {time:this.stepCount*this.dt,relative:this.relative,velocity:this.velocity,
      energy:this.reducedMass*(dot(this.velocity,this.velocity)/2-this.mu/length(this.relative)),
      angularMomentum:this.reducedMass*cross(this.relative,this.velocity)}
  }

  step() {
    if(this.stopped)return false
    const before=this.current
    const nextPosition=add(this.relative,add(scale(this.velocity,this.dt),scale(this.acceleration,this.dt**2/2)))
    const chord=difference(nextPosition,this.relative), chordSquared=dot(chord,chord)
    const approach=chordSquared===0?0:Math.max(0,Math.min(1,-dot(this.relative,chord)/chordSquared))
    if(length(blend(this.relative,nextPosition,approach))<=this.contactDistance) {
      this.stopped='两个天体已接触，模拟暂停。';return false
    }
    const nextAcceleration=this.accelerationAt(nextPosition)
    const nextVelocity=add(this.velocity,scale(add(this.acceleration,nextAcceleration),this.dt/2))
    if(![nextPosition.x,nextPosition.y,nextVelocity.x,nextVelocity.y].every(Number.isFinite)) {
      this.stopped='计算超出有限数值范围，模拟暂停。';return false
    }
    this.relative=nextPosition;this.velocity=nextVelocity;this.acceleration=nextAcceleration
    this.stepCount++
    this.current=this.sample()
    const separation=length(this.relative)
    this.minimumDistance=Math.min(this.minimumDistance,separation)
    this.maximumDistance=Math.max(this.maximumDistance,separation)

    const swept=cross(before.relative,this.relative)
    const direction=Math.sign(this.initial.angularMomentum)
    const increment=direction*Math.atan2(swept,dot(before.relative,this.relative))
    if(this.measuredPeriod===undefined&&this.elements?.period) {
      if(increment>0&&this.revolutionAngle+increment>=TAU) {
        this.measuredPeriod=before.time+this.dt*(TAU-this.revolutionAngle)/increment
      }
      this.revolutionAngle+=increment
    }
    this.sweep.area+=Math.abs(swept)/2
    if(this.stepCount%Math.max(1,Math.ceil(this.sweepSteps/90))===0)this.sweep.samples.push(this.current)
    if(this.stepCount%this.sweepSteps===0) {
      if(this.sweep.samples.at(-1)!==this.current)this.sweep.samples.push(this.current)
      this.firstSweep??=this.sweep
      this.lastSweep=this.sweep
      this.sweep={samples:[this.current],area:0}
    }
    if(this.stepCount%Math.max(1,Math.ceil(this.sweepSteps/115))===0) {
      this.history.push(this.current)
      if(this.history.length>2300)this.history.splice(0,100)
    }
    return true
  }
}

export function verifyKeplerThird(orbit:TwoBodyOrbit) {
  const {elements,bodies}=orbit
  if(!elements?.axis)throw new Error('开普勒第三定律对比需要闭合轨道。')
  const eccentricity=elements.eccentricity
  if(.75*elements.axis*(1-eccentricity)<=bodies[0].radius+bodies[1].radius)throw new Error('最内侧对比轨道会接触天体。请增大半长轴或减小半径。')
  return [.75,1,1.35].map(factor=>{
    const axis=elements.axis!*factor
    const trial=new TwoBodyOrbit(ellipsePair(bodies,axis,eccentricity))
    const expected=trial.elements!.period!
    const maxSteps=Math.ceil(expected/trial.dt*1.03)+2
    if(maxSteps>100_000)throw new Error('轨道接近抛物线，测量一圈所需积分步数超过对比上限。')
    for(let step=0;step<maxSteps&&trial.measuredPeriod===undefined;step++)if(!trial.step())break
    if(trial.measuredPeriod===undefined)throw new Error('未完成一整圈，无法测量周期。')
    const period=trial.measuredPeriod
    return {axis,period,expected,ratio:period**2/axis**3,relativeError:Math.abs(period/expected-1)}
  })
}

export function orbitCsv(orbit:TwoBodyOrbit) {
  const samples=orbit.history.at(-1)===orbit.current?orbit.history:[...orbit.history,orbit.current]
  const rows=samples.map(sample=>{
    const primary=barycentricPosition(sample.relative,orbit.bodies,0)
    const secondary=barycentricPosition(sample.relative,orbit.bodies,1)
    return [sample.time,primary.x,primary.y,secondary.x,secondary.y,sample.relative.x,sample.relative.y,
      sample.velocity.x,sample.velocity.y,sample.energy,sample.angularMomentum].map(value=>value.toExponential(10)).join(',')
  })
  return ['time_yr,primary_x_AU,primary_y_AU,secondary_x_AU,secondary_y_AU,relative_x_AU,relative_y_AU,relative_vx_AU_per_yr,relative_vy_AU_per_yr,energy_Msun_AU2_per_yr2,angular_momentum_Msun_AU2_per_yr',...rows].join('\r\n')+'\r\n'
}
