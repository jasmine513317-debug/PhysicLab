import type { ExtendedExperiment, ParticleSettings, PendulumSettings, RcSettings } from './extended-experiments'
import { DoublePendulum, inductionState, ThreeBody } from './advanced-physics'

export function pendulumPeriods(settings:PendulumSettings) {
  if(settings.gravity===0)return {}
  const theta=settings.angle*Math.PI/180
  const smallAngle=2*Math.PI*Math.sqrt(settings.length/settings.gravity)
  const amplitudeSquared=Math.sin(theta/2)**2+settings.length*settings.angularSpeed**2/(4*settings.gravity)
  if(amplitudeSquared===0||amplitudeSquared>=1)return {smallAngle}
  let arithmetic=1,geometric=Math.sqrt(1-amplitudeSquared)
  while(Math.abs(arithmetic-geometric)>1e-13) {
    const average=(arithmetic+geometric)/2
    geometric=Math.sqrt(arithmetic*geometric)
    arithmetic=average
  }
  return {smallAngle,finiteAmplitude:smallAngle/arithmetic}
}

export interface ExtendedSample {
  time:number
  x:number
  y:number
  vx:number
  vy:number
  angle:number
  angularSpeed:number
  voltage:number
  current:number
  energy:number
  sourceVoltage:number
  doublePendulum?:ReturnType<DoublePendulum['sample']>
  gravity?:ReturnType<ThreeBody['sample']>
  induction?:ReturnType<typeof inductionState>
}

type State=Omit<ExtendedSample,'time'>
const initialState:State={x:0,y:0,vx:0,vy:0,angle:0,angularSpeed:0,voltage:0,current:0,energy:0,sourceVoltage:0}
const NONRELATIVISTIC_SPEED_LIMIT=29_979_245.8

export class ExtendedSimulation {
  readonly scene:ExtendedExperiment
  readonly dt:number
  readonly rate:number
  readonly history:ExtendedSample[]=[]
  current:ExtendedSample
  measuredPeriod?:number
  stopped=''
  rcMode:RcSettings['mode']='charge'
  rcStarted=0
  rcStartVoltage=0
  rcTauVoltage?:number
  private steps=0
  private readonly sampleEvery:number
  private readonly hasPendulumPeriod:boolean
  private lastUpwardCrossing?:number
  private cycles=0
  private readonly doublePendulum?:DoublePendulum
  readonly gravity?:ThreeBody

  constructor(scene:ExtendedExperiment) {
    this.scene=scene
    let state={...initialState}
    switch(scene.extension) {
      case 'pendulum': {
        const {length,gravity,angle,angularSpeed}=scene.settings
        this.dt=Math.min(1/240,Math.sqrt(length/Math.max(gravity,1))/100)
        this.rate=1
        state=this.pendulumState(scene.settings,angle*Math.PI/180,angularSpeed)
        break
      }
      case 'particle': {
        const {mass,charge,bz,vx,vy,ex,ey}=scene.settings
        const frequency=Math.abs(charge*bz/mass)
        const electricRate=Math.abs(charge/mass)*Math.hypot(ex,ey)/Math.max(1,Math.hypot(vx,vy))
        this.dt=Math.min(1/240,.035/Math.max(frequency,electricRate,1))
        this.rate=Math.min(1,this.dt*3600)
        state={...state,vx,vy,energy:mass*(vx*vx+vy*vy)/2}
        break
      }
      case 'rc': {
        const {initialVoltage,mode}=scene.settings
        this.dt=this.timeConstant()/150
        this.rate=this.timeConstant()/1.2
        this.rcMode=mode
        this.rcStartVoltage=initialVoltage
        state=this.circuitState(scene.settings,initialVoltage)
        break
      }
      case 'double-pendulum': {
        this.doublePendulum=new DoublePendulum(scene.settings)
        this.dt=this.doublePendulum.dt
        this.rate=Math.min(1,this.dt*480)
        state.doublePendulum=this.doublePendulum.sample()
        break
      }
      case 'three-body':
      case 'gravity-assist': {
        this.gravity=new ThreeBody(scene)
        this.dt=this.gravity.dt
        this.rate=this.gravity.rate
        this.stopped=this.gravity.stopped
        state.gravity=this.gravity.sample()
        break
      }
      case 'induction': {
        this.dt=1/240
        this.rate=1
        state.induction=inductionState(scene.settings,0)
        break
      }
    }
    this.sampleEvery=Math.max(1,Math.ceil(this.rate/(this.dt*60)))
    this.hasPendulumPeriod=scene.extension==='pendulum'&&pendulumPeriods(scene.settings).finiteAmplitude!==undefined
    this.current={time:0,...state}
    this.history.push(this.current)
  }

  timeConstant() {
    if(this.scene.extension!=='rc')return 0
    return this.scene.settings.resistance*this.scene.settings.capacitance*1e-6
  }

  switchCircuit(mode:RcSettings['mode']) {
    if(this.scene.extension!=='rc'||this.rcMode===mode)return
    this.rcMode=mode
    this.rcStarted=this.current.time
    this.rcStartVoltage=this.current.voltage
    this.rcTauVoltage=undefined
    if(this.history.at(-1)!==this.current)this.history.push(this.current)
    this.current={...this.circuitState(this.scene.settings,this.current.voltage),time:this.current.time}
    this.history.push(this.current)
    if(this.history.length>2400)this.history.splice(0,100)
  }

  private pendulumState(settings:PendulumSettings,angle:number,angularSpeed:number):State {
    const {length,mass,gravity}=settings
    return {...initialState,angle,angularSpeed,x:length*Math.sin(angle),y:-length*Math.cos(angle),
      vx:length*angularSpeed*Math.cos(angle),vy:length*angularSpeed*Math.sin(angle),
      energy:mass*(length**2*angularSpeed**2/2+gravity*length*(1-Math.cos(angle)))}
  }

  private circuitState(settings:RcSettings,voltage:number):State {
    const sourceVoltage=this.rcMode==='charge'?settings.voltage:0
    return {...initialState,voltage,sourceVoltage,current:(sourceVoltage-voltage)/settings.resistance,
      energy:settings.capacitance*1e-6*voltage*voltage/2}
  }

  step() {
    if(this.stopped)return this.current
    const previous=this.current,dt=this.dt
    this.steps++
    const time=this.steps*dt
    let state:State
    switch(this.scene.extension) {
      case 'pendulum': {
        const settings=this.scene.settings, acceleration=-settings.gravity/settings.length*Math.sin(previous.angle)
        const angle=previous.angle+previous.angularSpeed*dt+acceleration*dt**2/2
        const angularSpeed=previous.angularSpeed+(acceleration-settings.gravity/settings.length*Math.sin(angle))*dt/2
        if(this.hasPendulumPeriod&&previous.angle<=0&&angle>0) {
          const crossing=previous.time-dt*previous.angle/(angle-previous.angle)
          if(this.lastUpwardCrossing!==undefined) {
            this.cycles++
            const period=crossing-this.lastUpwardCrossing
            this.measuredPeriod=(this.measuredPeriod??period)+(period-(this.measuredPeriod??period))/this.cycles
          }
          this.lastUpwardCrossing=crossing
        }
        state=this.pendulumState(settings,angle,angularSpeed)
        break
      }
      case 'particle': {
        const {mass,charge,ex,ey,bz}=this.scene.settings
        const kick=charge/mass*dt/2
        const x=previous.vx+ex*kick,y=previous.vy+ey*kick
        const turn=bz*kick, rotation=2*turn/(1+turn*turn)
        const vx=x+(y-x*turn)*rotation+ex*kick
        const vy=y-(x+y*turn)*rotation+ey*kick
        if(Math.hypot(vx,vy)>=NONRELATIVISTIC_SPEED_LIMIT) {
          this.stopped='粒子速度达到 0.1c，已暂停非相对论模拟。'
          return previous
        }
        state={...initialState,vx,vy,x:previous.x+(previous.vx+vx)*dt/2,y:previous.y+(previous.vy+vy)*dt/2,
          energy:mass*(vx*vx+vy*vy)/2}
        break
      }
      case 'rc': {
        const tau=this.timeConstant(),target=previous.sourceVoltage
        const voltage=previous.voltage+(target-previous.voltage)*(-Math.expm1(-dt/tau))
        const tauTime=this.rcStarted+tau
        if(this.rcTauVoltage===undefined&&time>=tauTime) {
          const fraction=Math.max(0,Math.min(1,(tauTime-previous.time)/dt))
          this.rcTauVoltage=previous.voltage+(voltage-previous.voltage)*fraction
        }
        state=this.circuitState(this.scene.settings,voltage)
        break
      }
      case 'double-pendulum': {
        const sample=this.doublePendulum!.step()
        if(!Number.isFinite(sample.energyDrift)||sample.energyDrift>.02) {
          this.stopped='双摆的能量漂移超过诊断阈值，已暂停。'
          return previous
        }
        state={...initialState,doublePendulum:sample}
        break
      }
      case 'three-body':
      case 'gravity-assist': {
        const sample=this.gravity!.step(time)
        this.stopped=this.gravity!.stopped
        if(this.stopped)return previous
        state={...initialState,gravity:sample}
        break
      }
      case 'induction': {
        state={...initialState,induction:inductionState(this.scene.settings,time)}
        if(time>=10)this.stopped='已完成 10 秒的线性磁场观测。'
        break
      }
    }
    this.current={time,...state}
    if(this.steps%this.sampleEvery===0)this.history.push(this.current)
    if(this.history.length>2400)this.history.splice(0,100)
    return this.current
  }
}

export function extendedCsv(simulation:ExtendedSimulation) {
  const samples=simulation.history.at(-1)===simulation.current?simulation.history:[...simulation.history,simulation.current]
  switch(simulation.scene.extension) {
    case 'induction':return csv(['time_s','field_T','flux_Wb','emf_V','current_A'],samples.map(sample=>{
      const {field,flux,emf,current}=sample.induction!
      return [sample.time,field,flux,emf,current]
    }))
    case 'double-pendulum':return csv(['time_s','angle_1_rad','angle_2_rad','bob_2_x_m','bob_2_y_m','perturbed_bob_2_x_m','perturbed_bob_2_y_m','separation_m','half_step_error_m','energy_J','normalized_energy_drift'],samples.map(sample=>{
      const {angles,base,comparison,divergence,resolutionError,energy,energyDrift}=sample.doublePendulum!
      return [sample.time,...angles,base.second.x,base.second.y,comparison.second.x,comparison.second.y,divergence,resolutionError,energy,energyDrift]
    }))
    case 'three-body':
    case 'gravity-assist':return csv(['time_year',...['body1','body2','body3'].flatMap(body=>['x_AU','y_AU','vx_AU_per_year','vy_AU_per_year'].map(key=>body+'_'+key)),
      'cx_AU','cy_AU','energy_solar_mass_AU2_per_year2','px_solar_mass_AU_per_year','py_solar_mass_AU_per_year','angular_momentum_solar_mass_AU2_per_year',
      'normalized_energy_drift','momentum_drift','angular_momentum_drift','third_body_separation_AU','star_frame_speed_km_s','planet_frame_speed_km_s'],samples.map(sample=>{
      const {bodies,center,energy,px,py,angularMomentum,energyDrift,momentumDrift,angularMomentumDrift,divergence,starSpeed,planetSpeed}=sample.gravity!
      return [sample.time,...bodies.flatMap(({x,y,vx,vy})=>[x,y,vx,vy]),center.x,center.y,energy,px,py,angularMomentum,energyDrift,momentumDrift,angularMomentumDrift,divergence,starSpeed,planetSpeed]
    }))
  }
  const columns=simulation.scene.extension==='rc'?
    [['time','time_s'],['voltage','capacitor_V'],['current','current_A'],['sourceVoltage','source_V'],['energy','energy_J']] as const:
    simulation.scene.extension==='pendulum'?
      [['time','time_s'],['x','x_m'],['y','y_m'],['angle','angle_rad'],['angularSpeed','angular_rad_per_s'],['energy','energy_J']] as const:
      [['time','time_s'],['x','x_m'],['y','y_m'],['vx','vx_m_per_s'],['vy','vy_m_per_s'],['energy','energy_J']] as const
  return csv(columns.map(([,name])=>name),samples.map(sample=>columns.map(([key])=>sample[key])))
}

function csv(headers:string[],rows:number[][]) {
  return [headers.join(','),...rows.map(row=>row.map(value=>value.toExponential(9)).join(','))].join('\r\n')+'\r\n'
}
