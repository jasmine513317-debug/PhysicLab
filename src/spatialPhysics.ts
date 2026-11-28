import { z } from 'zod'
import { PHYSICS_HZ, SAMPLE_EVERY } from './simulation'
import { COULOMB_CONSTANT } from './electrostatics'
import { spatialGeometrySchema } from './spatialGeometry'
import { SpatialRigidWorld } from './spatialRigid'
import { disruptionEnergyPerKg,gravityVectors,integrateCelestial,sphereContactFraction } from './celestialPhysics'
import { specialEvolution } from './celestialSpecial'
import { kerrHorizon } from './blackHolePhysics'

const component=z.number().min(-1e18).max(1e18)
const vector=z.tuple([component,component,component])
const wide=z.number().min(-1e40).max(1e40)
const forceVector=z.tuple([wide,wide,wide])
const quaternion=z.tuple([z.number(),z.number(),z.number(),z.number()])
  .refine(q=>Math.abs(Math.hypot(...q)-1)<1e-6,'物体旋转必须是单位四元数。')
export const spatialBodySchema=z.object({
  id:z.string(),name:z.string().min(1).max(80),mass:z.number().min(.001).max(1e32),
  radius:z.number().min(.001).max(1e15),fixed:z.boolean(),
  position:vector,velocity:vector,force:forceVector,angularVelocity:vector,
  charge:z.number().min(-1000).max(1000),restitution:z.number().min(0).max(1),
  orientation:quaternion.optional(),
  geometry:spatialGeometrySchema.optional(),friction:z.number().min(0).max(5).optional(),
  visualRadius:z.number().min(.001).max(1e15).optional(),
  physicsEnabled:z.boolean().optional(),collisionEnabled:z.boolean().optional(),
  densityLocked:z.boolean().optional(),
  disruptionStrength:z.number().min(0).max(1e9).optional(),
  celestial:z.object({kind:z.enum(['star','rock','gas','ice','comet','blackHole']),color:z.string().regex(/^#[0-9a-f]{6}$/i),
    rotationPeriod:z.number().optional(),preset:z.string().optional(),
    spin:z.number().min(-.998).max(.998).optional(),diskExtent:z.number().min(1.2).max(12).optional()}).optional(),
})
const spatialSpring=z.object({
  id:z.string(),a:z.string(),b:z.string(),stiffness:z.number().min(0.001).max(100000),
  restLength:z.number().min(.001).max(1e6),damping:z.number().nonnegative().max(10000),
})
export const spatialSceneSchema=z.object({
  version:z.literal(1),dimension:z.literal(3),title:z.string().min(1).max(100),
  bodies:z.array(spatialBodySchema).max(60),gravity:vector,electric:vector,magnetic:vector,
  mutualGravity:z.boolean(),ground:z.boolean(),collisions:z.boolean(),
  celestial:z.object({integrator:z.enum(['verlet','rk4']),softening:z.number().min(.001).max(1e12),
    secondsPerTick:z.number().min(.0001).max(2e6),maxStep:z.number().min(.0001).max(2e6),adaptive:z.boolean(),
    contact:z.enum(['bounce','merge','fragment']).optional(),special:z.enum(['binaryPN','collapse','ringdown','mergerReplay']).optional()}).optional(),
  mutualElectric:z.boolean().optional(),springs:z.array(spatialSpring).max(100).optional(),
  rigid:z.boolean().optional(),pivots:z.array(z.object({id:z.string(),a:z.string(),b:z.string(),anchorA:vector,anchorB:vector})).max(100).optional(),
  induction:z.object({center:vector,normal:vector.refine(n=>Math.abs(Math.hypot(...n)-1)<1e-6,'线圈法向量必须归一化。'),
    rate:vector,radius:z.number().min(.002).max(1e5)}).optional(),
  source:z.object({dimension:z.literal(2),id:z.string(),time:z.number().nonnegative()}).optional(),
}).superRefine((scene,ctx)=>{
  if(scene.celestial&&(scene.rigid||scene.pivots?.length||scene.springs?.length||scene.induction||scene.mutualElectric||
    scene.bodies.some(b=>b.geometry||b.charge)||scene.electric.some(Boolean)||scene.magnetic.some(Boolean)||!scene.mutualGravity))
    ctx.addIssue({code:'custom',message:'天体求解支持球形天体、相互引力和外力。'})
  const special=scene.celestial?.special
  for(const body of scene.bodies)if(body.celestial?.kind==='blackHole'&&
    Math.abs(body.radius/kerrHorizon(body.mass,body.celestial.spin)-1)>1e-8)
    ctx.addIssue({code:'custom',message:'黑洞视界半径必须与质量及自旋一致。'})
  if(special&&(scene.collisions||scene.ground||scene.gravity.some(Boolean)||
    scene.bodies.some(b=>b.fixed||b.force.some(Boolean)||b.physicsEnabled===false)||
    (special==='binaryPN'?scene.bodies.length!==2||scene.bodies.some(b=>b.celestial?.kind!=='blackHole'||b.celestial.spin)
      :special==='ringdown'?scene.bodies.length!==1||scene.bodies[0]?.celestial?.kind!=='blackHole'||scene.bodies[0].velocity.some(Boolean)
      :special==='mergerReplay'?scene.bodies.length!==3||scene.bodies.some(b=>b.celestial?.kind!=='blackHole'||b.velocity.some(Boolean))
      :scene.bodies.length!==1||scene.bodies[0]?.celestial?.kind!=='star'||scene.bodies[0].velocity.some(Boolean)))) {
    ctx.addIssue({code:'custom',message:'专用模型要求孤立双黑洞或静止的均匀无压球。'})
  }
  const byId=new Map(scene.bodies.map(body=>[body.id,body]))
  if(byId.size!==scene.bodies.length)ctx.addIssue({code:'custom',message:'物体标识必须唯一。'})
  for(const joint of scene.pivots??[]) {
    const a=byId.get(joint.a),b=byId.get(joint.b)
    if(!a||!b||a===b||a.fixed&&b.fixed)ctx.addIssue({code:'custom',message:'球铰需要两个不同端点，至少一个必须可运动。'})
  }
  if(new Set(scene.springs?.map(s=>s.id)).size!==(scene.springs?.length??0))ctx.addIssue({code:'custom',message:'弹簧标识必须唯一。'})
  for(const spring of scene.springs??[]) {
    const a=byId.get(spring.a),b=byId.get(spring.b)
    const inverseMass=(body:SpatialBody)=>body.fixed?0:1/body.mass
    if(!a||!b||a===b||a.fixed&&b.fixed) {
      ctx.addIssue({code:'custom',message:'弹簧需要两个不同的端点，至少一个必须可运动。'})
    }else {
      const effective=inverseMass(a)+inverseMass(b)
      if(Math.sqrt(spring.stiffness*effective)>50 || spring.damping*effective>50)
        ctx.addIssue({code:'custom',message:'弹簧过硬或阻尼过大，请降低参数或增加质量。'})
    }
  }
})

export type Vec3=z.infer<typeof vector>
export type Quaternion=z.infer<typeof quaternion>
export type SpatialBody=z.infer<typeof spatialBodySchema>
export type SpatialScene=z.infer<typeof spatialSceneSchema>
export const SPATIAL_DT=1/PHYSICS_HZ
const G=6.6743e-11
export const add=(a:Vec3,b:Vec3):Vec3=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]]
export const multiply=(v:Vec3,n:number):Vec3=>[v[0]*n,v[1]*n,v[2]*n]
export const subtract=(a:Vec3,b:Vec3)=>add(a,multiply(b,-1))
export const dot=(a:Vec3,b:Vec3)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2]
export const cross=(a:Vec3,b:Vec3):Vec3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]
export const length=(a:Vec3)=>Math.hypot(...a)
const sampleSchema=z.object({time:z.number().nonnegative(),position:vector,velocity:vector,
  acceleration:vector.optional(),angularVelocity:vector.optional(),
})
export type SpatialSample=z.infer<typeof sampleSchema>
const control=z.discriminatedUnion('kind',[
  z.object({kind:z.literal('force'),value:forceVector}),
  z.object({kind:z.literal('timed'),value:forceVector,steps:z.number().int().min(1).max(216000)}),
  z.object({kind:z.literal('impulse'),value:forceVector}),
  z.object({kind:z.literal('velocity'),value:vector}),
])
export type SpatialControl=z.infer<typeof control>
const action=z.object({id:z.string(),tick:z.number().int().nonnegative(),control,
  before:forceVector.optional(),after:forceVector.optional()})
export type SpatialAction=z.infer<typeof action>
const contactEvent=z.object({time:z.number().nonnegative(),position:vector,kind:z.enum(['bounce','merge','fragment']),
  names:z.tuple([z.string(),z.string()]),ids:z.tuple([z.string(),z.string()]),created:z.array(z.string()).max(3),
  before:z.tuple([vector,vector]),after:z.array(vector).max(3),mass:z.number(),kineticLoss:z.number(),
  impactSpecificEnergy:z.number().optional(),disruptionThreshold:z.number().optional()})
type ContactEvent=z.infer<typeof contactEvent>
export const spatialRunSchema=z.object({
  version:z.literal(1),kind:z.literal('physiclab-spatial-run'),initial:spatialSceneSchema,current:spatialSceneSchema,
  tick:z.number().int().nonnegative(),tracks:z.array(z.tuple([z.string(),z.array(sampleSchema).max(1800)])).max(60),
  rigidSnapshot:z.string().max(8_000_000).optional(),
  events:z.array(action).max(20000).optional(),
  contacts:z.array(contactEvent).max(2000).optional(),
}).superRefine((run,ctx)=>{
  const ids=new Set(run.current.bodies.map(body=>body.id))
  const initialIds=new Set(run.initial.bodies.map(body=>body.id))
  const topology=Boolean(run.initial.celestial&&run.initial.celestial.contact&&run.initial.celestial.contact!=='bounce')
  const known=new Set([...initialIds,...ids,...(run.contacts??[]).flatMap(event=>[...event.ids,...event.created])])
  if(!topology&&(initialIds.size!==ids.size||[...ids].some(id=>!initialIds.has(id)))||run.tracks.some(([id,samples])=>!ids.delete(id)||
    samples.some((sample,i)=>sample.time>run.tick*(run.initial.celestial?.secondsPerTick??SPATIAL_DT)+1e-8||(i>0&&sample.time<=samples[i-1].time)))||ids.size) {
    ctx.addIssue({code:'custom',message:'三维快照与轨迹不匹配。'})
  }
  if(run.events?.some((event,i)=>event.tick>run.tick||!(topology?known:initialIds).has(event.id)||i>0&&event.tick<run.events![i-1].tick))
    ctx.addIssue({code:'custom',message:'三维干预记录与快照不匹配。'})
  if(run.initial.celestial?.special!==run.current.celestial?.special||run.initial.celestial?.special&&(run.events?.length||run.contacts?.length))
    ctx.addIssue({code:'custom',message:'专用天体模型与运行记录不匹配。'})
})
export type SpatialRun=z.infer<typeof spatialRunSchema>
export type SpatialState=SpatialBody & {orientation:Quaternion;acceleration:Vec3}
const zero=():Vec3=>[0,0,0]
export const spatialObject=(name='球体'):SpatialBody=>({
  id:crypto.randomUUID(),name,mass:1,radius:.35,fixed:false,position:[0,3,0],velocity:zero(),force:zero(),
  angularVelocity:zero(),charge:0,restitution:.5,
})
export const emptySpatialScene=(title='空间实验'):SpatialScene=>({
  version:1,dimension:3,title,bodies:[],gravity:[0,-9.81,0],electric:zero(),magnetic:zero(),
  ground:false,mutualGravity:false,collisions:true,
})

function advanceRotation(orientation:Quaternion,angularVelocity:Vec3,dt:number):Quaternion {
  const speed=length(angularVelocity)
  if(!speed)return orientation
  const imaginary=multiply(angularVelocity,Math.sin(speed*dt/2)/speed)
  const scalar=Math.cos(speed*dt/2)
  const previous:Vec3=[orientation[0],orientation[1],orientation[2]]
  const xyz=add(add(multiply(imaginary,orientation[3]),multiply(previous,scalar)),cross(imaginary,previous))
  const w=scalar*orientation[3]-dot(imaginary,previous)
  const norm=Math.hypot(...xyz,w)
  return [xyz[0]/norm,xyz[1]/norm,xyz[2]/norm,w/norm]
}

export function rotateSpatialVector(v:Vec3,q:Quaternion):Vec3 {
  const imaginary:Vec3=[q[0],q[1],q[2]]
  const t=multiply(cross(imaginary,v),2)
  return add(v,add(multiply(t,q[3]),cross(imaginary,t)))
}

export function inductionMeasurements(scene:SpatialScene,time:number) {
  const coil=scene.induction
  if(!coil)return
  const area=Math.PI*coil.radius**2
  const slope=dot(coil.rate,coil.normal)
  return {flux:area*(dot(scene.magnetic,coil.normal)+time*slope),emf:-area*slope}
}

export class SpatialPhysics {
  readonly dt=SPATIAL_DT
  readonly scene:SpatialScene
  readonly bodies:SpatialState[]
  readonly history=new Map<string,SpatialSample[]>()
  readonly contactEvents:ContactEvent[]=[]
  private readonly springIndices:Map<string,number>
  private readonly background:Vec3[]
  private readonly events:SpatialAction[]=[]
  private readonly queued:SpatialAction[]=[]
  private readonly timed=new Map<string,{end:number;force:Vec3}>()
  private readonly configuredRigid:boolean
  private rigid?:SpatialRigidWorld
  private rigidSnapshot?:string
  private ticks=0
  private readonly evolution?:ReturnType<typeof specialEvolution>

  constructor(scene:SpatialScene) {
    this.scene=spatialSceneSchema.parse(scene)
    this.bodies=this.scene.bodies.map(body=>({...body,orientation:body.orientation??[0,0,0,1],acceleration:zero()}))
    this.springIndices=new Map(this.bodies.map((body,i)=>[body.id,i]))
    this.background=this.bodies.map(body=>body.fixed?zero():add(this.scene.gravity,multiply(
      add(body.force,multiply(this.scene.electric,body.charge)),1/body.mass)))
    this.configuredRigid=Boolean(this.scene.rigid||this.scene.pivots?.length||this.bodies.some(body=>body.geometry))
    if(this.scene.celestial?.special)this.evolution=specialEvolution(this.scene.celestial.special,this.scene.bodies)
    for(const body of this.bodies)this.history.set(body.id,[])
    this.refreshCelestialAcceleration()
    this.sample()
  }
  get stepSeconds() {return this.scene.celestial?.secondsPerTick??SPATIAL_DT}
  get time() {return Math.min(this.ticks*this.stepSeconds,this.evolution?.stop??Infinity)}
  get modelLimit() {return this.evolution?.stop}
  get modelEnded() {return this.evolution!==undefined&&this.time>=this.evolution.stop}
  get modelReading() {return this.modelReadingAt(this.time)}
  modelReadingAt(time:number) {return this.evolution?.at(Math.min(this.time,Math.max(0,time)))}
  visibleBody(id:string) {
    if(this.scene.celestial?.special!=='mergerReplay')return true
    const reading=this.modelReading
    return reading?.kind==='mergerReplay'&&(id===this.bodies[2].id)===reading.common
  }
  get usesRigidSolver() {return this.configuredRigid}
  get interventions(): readonly SpatialAction[] {return this.events}
  pendingVector(id:string,kind:'velocity'|'force') {
    for(let i=this.queued.length-1;i>=0;i--) {
      const event=this.queued[i]
      if(event.id===id&&event.control.kind===kind)return event.control.value
    }
  }
  private refreshCelestialAcceleration() {
    const model=this.modelReading
    if(model) {
      if(model.kind==='collapse')this.bodies[0].radius=model.radius
      else if(model.kind==='binaryPN')this.bodies.forEach((b,i)=>{
        b.position=model.positions[i];b.velocity=model.velocities[i];b.acceleration=model.accelerations[i]
      })
      else if(model.kind==='mergerReplay')this.bodies.forEach((b,i)=>{
        b.position=model.positions[i];b.visualRadius=model.visualRadii[i]
      })
      return
    }
    if(!this.scene.celestial)return
    const gravity=gravityVectors(this.bodies,this.scene.celestial.softening)
    this.bodies.forEach((body,i)=>{
      body.acceleration=body.fixed||body.physicsEnabled===false?zero():add(gravity[i],add(this.scene.gravity,multiply(this.appliedForce(body.id),1/body.mass)))
    })
  }
  appliedForce(id:string):Vec3 {
    const body=this.bodies[this.springIndices.get(id)??-1]
    if(!body)return [0,0,0]
    const temporary=this.timed.get(id)
    return temporary&&this.ticks<temporary.end?add(body.force,temporary.force):body.force
  }
  dispose() {this.rigid?.dispose();this.rigid=undefined}

  schedule(id:string,input:SpatialControl) {
    if(this.evolution)throw new Error('该专用模型使用预设初始条件。')
    if(!this.bodies.some(body=>body.id===id&&!body.fixed&&(!this.scene.celestial||body.physicsEnabled!==false)))throw new Error('请选择可运动的物体。')
    if(this.events.length+this.queued.length>=20000)throw new Error('干预记录已达上限。请保存后开启新运行。')
    this.queued.push({id,tick:this.ticks,control:control.parse(input)})
  }

  private applyControls() {
    for(const entry of this.queued.splice(0)) {
      const i=this.springIndices.get(entry.id)!,body=this.bodies[i],input=entry.control
      if(input.kind==='force') {
        entry.before=body.force
        body.force=input.value;entry.after=body.force
        this.background[i]=add(this.scene.gravity,multiply(add(body.force,multiply(this.scene.electric,body.charge)),1/body.mass))
      } else if(input.kind==='timed') {
        entry.before=this.timed.get(body.id)?.force??[0,0,0]
        entry.after=input.value
        this.timed.set(body.id,{end:entry.tick+input.steps,force:input.value})
      } else {
        entry.before=body.velocity
        body.velocity=input.kind==='impulse'?add(body.velocity,multiply(input.value,1/body.mass)):input.value
        entry.after=body.velocity
      }
      this.events.push(entry)
    }
    for(const [id,temporary] of this.timed)if(this.ticks>=temporary.end)this.timed.delete(id)
  }

  private rigidWorld() {
    if(!this.rigid) {
      const world=new SpatialRigidWorld(this.scene,SPATIAL_DT/4)
      try {
        if(this.rigidSnapshot)world.restore(this.rigidSnapshot)
      } catch(error) {world.dispose();throw error}
      this.rigidSnapshot=undefined
      this.rigid=world
    }
    return this.rigid
  }

  private accelerations() {
    const s=this.scene
    if(!s.mutualGravity&&!s.mutualElectric&&!s.springs?.length&&!s.induction&&!this.timed.size)return this.background
    const result=this.background.slice()
    for(const [id,temporary] of this.timed) {
      const i=this.springIndices.get(id)!
      result[i]=add(result[i],multiply(temporary.force,1/this.bodies[i].mass))
    }
    if(s.induction)for(let i=0;i<this.bodies.length;i++) {
      const body=this.bodies[i]
      if(!body.fixed&&body.charge)result[i]=add(result[i],multiply(
        cross(s.induction.rate,subtract(body.position,s.induction.center)),-.5*body.charge/body.mass))
    }
    if(s.mutualGravity||s.mutualElectric)for(let i=0;i<this.bodies.length;i++)for(let j=i+1;j<this.bodies.length;j++) {
      const a=this.bodies[i], b=this.bodies[j]
      const offset=subtract(b.position,a.position)
      // Plummer softening in metres keeps coincident point masses finite.
      const denominator=(dot(offset,offset)+.0001)**1.5
      const gravity=s.mutualGravity?G*a.mass*b.mass:0
      const electric=s.mutualElectric?COULOMB_CONSTANT*a.charge*b.charge:0
      const force=multiply(offset,(gravity-electric)/denominator)
      if(!a.fixed)result[i]=add(result[i],multiply(force,1/a.mass))
      if(!b.fixed)result[j]=add(result[j],multiply(force,-1/b.mass))
    }
    for(const spring of s.springs??[]) {
      const i=this.springIndices.get(spring.a)!,j=this.springIndices.get(spring.b)!
      const a=this.bodies[i],b=this.bodies[j]
      const offset=subtract(b.position,a.position),distance=length(offset)
      if(distance<1e-10)continue
      const direction=multiply(offset,1/distance)
      const relative=dot(subtract(b.velocity,a.velocity),direction)
      const force=multiply(direction,spring.stiffness*(distance-spring.restLength)+spring.damping*relative)
      if(!a.fixed)result[i]=add(result[i],multiply(force,1/a.mass))
      if(!b.fixed)result[j]=add(result[j],multiply(force,-1/b.mass))
    }
    return result
  }

  private *contactPairs(previous?:Map<string,Vec3>):Generator<[number,number]> {
    if(!this.scene.celestial) {
      for(let i=0;i<this.bodies.length;i++)for(let j=i+1;j<this.bodies.length;j++)yield [i,j]
      return
    }
    const intervals=this.bodies.map((body,i)=>{
      const x=body.position[0],start=previous?.get(body.id)?.[0]??x
      return {i,low:Math.min(x,start)-body.radius,high:Math.max(x,start)+body.radius}
    })
      .sort((a,b)=>a.low-b.low)
    for(let i=0;i<intervals.length;i++)for(let j=i+1;j<intervals.length&&intervals[j].low<=intervals[i].high;j++) {
      const a=intervals[i].i,b=intervals[j].i
      yield [Math.min(a,b),Math.max(a,b)]
    }
  }

  private contacts(elapsed=0,previous?:Map<string,Vec3>,duration=0) {
    if(this.scene.collisions)for(const [i,j] of this.contactPairs(previous)) {
      const a=this.bodies[i], b=this.bodies[j]
      const celestial=this.scene.celestial
      if(celestial&&(a.physicsEnabled===false||b.physicsEnabled===false||a.collisionEnabled===false||b.collisionEnabled===false))continue
      const invA=a.fixed?0:1/a.mass,invB=b.fixed?0:1/b.mass,total=invA+invB
      if(total===0)continue
      const startA=previous?.get(a.id),startB=previous?.get(b.id),radii=a.radius+b.radius
      const fraction=startA&&startB?sphereContactFraction(subtract(startB,startA),subtract(b.position,a.position),radii):undefined
      const offTime=fraction===undefined?0:(1-fraction)*duration
      if(fraction!==undefined&&startA&&startB) {
        a.position=add(startA,multiply(subtract(a.position,startA),fraction))
        b.position=add(startB,multiply(subtract(b.position,startB),fraction))
      }
      const offset=subtract(b.position,a.position),distance=length(offset),overlap=Math.max(0,radii-distance)
      if(overlap<=0&&fraction===undefined)continue
      const normal:Vec3=distance>1e-12?multiply(offset,1/distance):[1,0,0]
      a.position=add(a.position,multiply(normal,-overlap*invA/total))
      b.position=add(b.position,multiply(normal,overlap*invB/total))
      const speed=dot(subtract(b.velocity,a.velocity),normal)
      const finish=(body:SpatialState)=>{if(!body.fixed)body.position=add(body.position,multiply(body.velocity,offTime))}
      if(speed>=0){finish(a);finish(b);continue}
      previous?.delete(a.id);previous?.delete(b.id)
      const before:[Vec3,Vec3]=[a.velocity,b.velocity],position=add(a.position,multiply(normal,a.radius))
      const mass=a.mass+b.mass,kinetic=(body:SpatialBody)=>.5*body.mass*dot(body.velocity,body.velocity)
      const energy=kinetic(a)+kinetic(b)
      const kind=!a.fixed&&!b.fixed&&mass<=1e32?celestial?.contact??'bounce':'bounce'
      const center=add(multiply(a.position,a.mass/mass),multiply(b.position,b.mass/mass))
      const velocity=add(multiply(a.velocity,a.mass/mass),multiply(b.velocity,b.mass/mass))
      const volumeRadius=Math.cbrt(a.radius**3+b.radius**3)
      const main=a.mass>=b.mass?a:b
      const hole=[a,b].find(body=>body.celestial?.kind==='blackHole')
      const relativeEnergy=.5*(a.mass/mass)*b.mass*speed**2
      const disrupt=(a.mass/mass)*disruptionEnergyPerKg(a)+(b.mass/mass)*disruptionEnergyPerKg(b)
      const mode=kind==='fragment'&&(hole||this.bodies.length>=60||relativeEnergy/mass<disrupt)?'merge':kind
      if(mode!=='bounce') {
        let id='contact-'+this.ticks+'-'+this.contactEvents.length
        while(this.springIndices.has(id)||this.springIndices.has(id+'/0')||this.springIndices.has(id+'/1')||this.springIndices.has(id+'/-1'))id+='-'
        const merged:SpatialState={...main,id,name:(hole?'吸积体 · ':'合并体 · ')+main.name.slice(0,65),mass,position:center,
          velocity,radius:hole?kerrHorizon(mass,hole.celestial?.spin):volumeRadius,force:add(a.force,b.force),angularVelocity:zero(),acceleration:zero(),
          celestial:hole?.celestial??main.celestial}
        const fragments=mode==='fragment'?[-1,0,1].map((sign):SpatialState=>{
          const radius=volumeRadius/Math.cbrt(3),spread=Math.sqrt(.45*relativeEnergy/mass)
          return {...merged,id:id+'/'+sign,name:'碎片 '+(sign+2),mass:mass/3,radius,visualRadius:undefined,
            celestial:{kind:'rock',color:'#a6998e'}, force:multiply(merged.force,1/3),
            position:add(center,multiply(normal,sign*radius*2.1)),velocity:add(velocity,multiply(normal,sign*spread))}
        }):[merged]
        this.bodies.splice(j,1);this.bodies.splice(i,1,...fragments)
        this.history.delete(a.id);this.history.delete(b.id)
        this.timed.delete(a.id);this.timed.delete(b.id)
        for(const body of fragments)this.history.set(body.id,[])
        this.springIndices.clear()
        this.bodies.forEach((body,index)=>this.springIndices.set(body.id,index))
        for(const body of fragments)finish(body)
        this.recordContact({time:this.time+elapsed-offTime,kind:mode,position,names:[a.name,b.name],ids:[a.id,b.id],
          created:fragments.map(body=>body.id),before,after:fragments.map(body=>body.velocity),
          mass,kineticLoss:energy-fragments.reduce((sum,body)=>sum+kinetic(body),0),
          impactSpecificEnergy:relativeEnergy/mass,disruptionThreshold:kind==='fragment'&&!hole?disrupt:undefined})
        return
      }
      const impulse=-(1+Math.min(a.restitution,b.restitution))*speed/total
      a.velocity=add(a.velocity,multiply(normal,-impulse*invA))
      b.velocity=add(b.velocity,multiply(normal,impulse*invB))
      finish(a);finish(b)
      if(celestial)this.recordContact({time:this.time+elapsed-offTime,kind:'bounce',position,names:[a.name,b.name],ids:[a.id,b.id],created:[],
        before,after:[a.velocity,b.velocity],mass,kineticLoss:Math.max(0,energy-kinetic(a)-kinetic(b))})
    }
    if(this.scene.ground)for(const body of this.bodies) {
      if(body.fixed||body.position[1]>=body.radius)continue
      const [x,,z]=body.position,[vx,vy,vz]=body.velocity
      body.position=[x,body.radius,z]
      if(vy<0)body.velocity=[vx,-vy*body.restitution,vz]
    }
  }

  private recordContact(event:ContactEvent) {
    this.contactEvents.push(event)
    if(this.contactEvents.length>2000)this.contactEvents.shift()
  }

  step() {
    if(this.evolution) {
      if(this.modelEnded)return false
      this.ticks++
      this.refreshCelestialAcceleration()
      if(this.ticks%SAMPLE_EVERY===0||this.modelEnded)this.sample()
      return !this.modelEnded
    }
    const slices=4,dt=SPATIAL_DT/slices
    const previous=this.bodies.map(body=>body.velocity)
    this.applyControls()
    if(this.scene.celestial) {
      const external=()=>this.bodies.map(body=>add(this.scene.gravity,multiply(this.appliedForce(body.id),1/body.mass)))
      const contact=this.scene.collisions||this.scene.ground?(offset:number,previous:Map<string,Vec3>,dt:number)=>this.contacts(offset,previous,dt):undefined
      integrateCelestial(this.bodies,this.stepSeconds,this.scene.celestial,external,contact)
      for(const body of this.bodies)if(!body.fixed&&body.physicsEnabled!==false)body.orientation=advanceRotation(body.orientation,body.angularVelocity,this.stepSeconds)
    } else for(let part=0;part<slices;part++) {
      const first=this.accelerations()
      const magnetic=this.scene.induction?add(this.scene.magnetic,multiply(this.scene.induction.rate,this.time+(part+.5)*dt)):this.scene.magnetic
      if(this.configuredRigid) {
        const kick=this.bodies.map(body=>{
          const t=multiply(magnetic,body.charge/body.mass*dt/2)
          const v=body.velocity
          return add(v,cross(add(v,cross(v,t)),multiply(t,2/(1+dot(t,t)))))
        })
        this.rigidWorld().advance(this.bodies,first,kick)
        continue
      }
      this.bodies.forEach((body,index)=>{
        if(body.fixed)return
        const before=add(body.velocity,multiply(first[index],dt/2))
        const t=multiply(magnetic,body.charge/body.mass*dt/2)
        // Boris rotation preserves the speed in a uniform magnetic field.
        const rotated=add(before,cross(add(before,cross(before,t)),multiply(t,2/(1+dot(t,t)))))
        body.position=add(body.position,multiply(add(before,rotated),dt/2))
        body.velocity=rotated
        body.orientation=advanceRotation(body.orientation,body.angularVelocity,dt)
      })
      const next=this.accelerations()
      this.bodies.forEach((body,i)=>{if(!body.fixed)body.velocity=add(body.velocity,multiply(next[i],dt/2))})
      this.contacts()
    }
    this.bodies.forEach((body,i)=>{
      if(![...body.position,...body.velocity].every(Number.isFinite))throw new Error('三维模型超出数值范围。')
      if(!this.scene.celestial)body.acceleration=multiply(subtract(body.velocity,previous[i]),1/this.stepSeconds)
    })
    this.ticks++
    this.refreshCelestialAcceleration()
    if(this.ticks%SAMPLE_EVERY===0)this.sample()
  }

  state():SpatialScene {
    return spatialSceneSchema.parse({...this.scene,bodies:this.bodies})
  }

  capture(includeHistory=true):SpatialRun {
    return spatialRunSchema.parse({
      version:1,kind:'physiclab-spatial-run',initial:this.scene,current:this.state(),tick:this.ticks,
      tracks:includeHistory?[...this.history]:[...this.history.keys()].map(id=>[id,[]]),
      rigidSnapshot:this.rigid?.snapshot()??this.rigidSnapshot,
      events:this.events.length||this.queued.length?[...this.events,...this.queued]:undefined,
      contacts:this.contactEvents.length?this.contactEvents:undefined,
    })
  }

  static restore(value:unknown) {
    const run=spatialRunSchema.parse(value)
    const engine=new SpatialPhysics(run.initial)
    if(engine.configuredRigid!==Boolean(run.rigidSnapshot)&&run.tick!==0)throw new Error('快照和求解器不匹配。')
    engine.rigidSnapshot=run.rigidSnapshot
    const byId=new Map(run.current.bodies.map(body=>[body.id,body]))
    if(run.initial.celestial) {
      engine.bodies.splice(0,engine.bodies.length,...run.current.bodies.map(body=>({...body,orientation:body.orientation??[0,0,0,1],acceleration:zero()} as SpatialState)))
      engine.springIndices.clear()
      engine.bodies.forEach((body,i)=>engine.springIndices.set(body.id,i))
      engine.history.clear()
      engine.contactEvents.push(...run.contacts??[])
    }
    engine.bodies.forEach((body,i)=>{
      Object.assign(body,byId.get(body.id))
      if(!body.fixed)engine.background[i]=add(engine.scene.gravity,multiply(
        add(body.force,multiply(engine.scene.electric,body.charge)),1/body.mass))
    })
    engine.ticks=run.tick
    for(const event of run.events??[]) {
      if(event.tick===run.tick) {engine.queued.push(event);continue}
      engine.events.push(event)
      if(event.control.kind==='timed'&&event.tick+event.control.steps>run.tick)
        engine.timed.set(event.id,{end:event.tick+event.control.steps,force:event.control.value})
      else if(event.control.kind==='timed')engine.timed.delete(event.id)
    }
    for(const [id,samples] of run.tracks)engine.history.set(id,samples)
    engine.refreshCelestialAcceleration()
    return engine
  }

  clearHistory() {
    for(const list of this.history.values())list.length=0
    this.sample()
  }

  prediction(steps=120,alternative=false) {
    const source=this.rigid||this.evolution?this.scene:this.state()
    const settings=source.celestial
    const forecast=new SpatialPhysics(alternative&&settings
      ?{...source,celestial:{...settings,integrator:settings.integrator==='verlet'?'rk4':'verlet'}}
      :source)
    if(this.rigid) {
      forecast.rigidSnapshot=this.rigid.snapshot()
      this.bodies.forEach((body,i)=>Object.assign(forecast.bodies[i],body))
    } else if(this.rigidSnapshot)forecast.rigidSnapshot=this.rigidSnapshot
    forecast.ticks=this.ticks
    if(this.evolution)forecast.refreshCelestialAcceleration()
    this.background.forEach((value,i)=>{forecast.background[i]=value})
    for(const [id,temporary] of this.timed)forecast.timed.set(id,temporary)
    forecast.queued.push(...this.queued.map(event=>({...event})))
    try {
      forecast.clearHistory()
      for(let i=0;i<steps;i++)if(forecast.step()===false)break
      return forecast.history
    } finally {forecast.dispose()}
  }

  private sample() {
    for(const body of this.bodies) {
      if(!this.visibleBody(body.id))continue
      const list=this.history.get(body.id)!
      list.push({time:this.time,position:body.position.slice() as Vec3,velocity:body.velocity.slice() as Vec3,
        angularVelocity:body.angularVelocity.slice() as Vec3,acceleration:body.acceleration.slice() as Vec3})
      if(list.length>1800)list.splice(0,60)
    }
  }
}
