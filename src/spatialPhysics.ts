import { z } from 'zod'
import { PHYSICS_HZ, SAMPLE_EVERY } from './simulation'
import { COULOMB_CONSTANT } from './electrostatics'
import { spatialGeometrySchema } from './spatialGeometry'
import { SpatialRigidWorld } from './spatialRigid'

const component=z.number().min(-1e18).max(1e18)
const vector=z.tuple([component,component,component])
const quaternion=z.tuple([z.number(),z.number(),z.number(),z.number()])
  .refine(q=>Math.abs(Math.hypot(...q)-1)<1e-6,'物体旋转必须是单位四元数。')
const spatialBody=z.object({
  id:z.string(),name:z.string().min(1).max(80),mass:z.number().min(.001).max(1e32),
  radius:z.number().min(.001).max(1e15),fixed:z.boolean(),
  position:vector,velocity:vector,force:vector,angularVelocity:vector,
  charge:z.number().min(-1000).max(1000),restitution:z.number().min(0).max(1),
  orientation:quaternion.optional(),
  geometry:spatialGeometrySchema.optional(),friction:z.number().min(0).max(5).optional(),
  visualRadius:z.number().min(.001).max(1e15).optional(),
})
const spatialSpring=z.object({
  id:z.string(),a:z.string(),b:z.string(),stiffness:z.number().min(0.001).max(100000),
  restLength:z.number().min(.001).max(1e6),damping:z.number().nonnegative().max(10000),
})
export const spatialSceneSchema=z.object({
  version:z.literal(1),dimension:z.literal(3),title:z.string().min(1).max(100),
  bodies:z.array(spatialBody).max(60),gravity:vector,electric:vector,magnetic:vector,
  mutualGravity:z.boolean(),ground:z.boolean(),collisions:z.boolean(),
  mutualElectric:z.boolean().optional(),springs:z.array(spatialSpring).max(100).optional(),
  rigid:z.boolean().optional(),pivots:z.array(z.object({id:z.string(),a:z.string(),b:z.string(),anchorA:vector,anchorB:vector})).max(100).optional(),
  induction:z.object({center:vector,normal:vector.refine(n=>Math.abs(Math.hypot(...n)-1)<1e-6,'线圈法向量必须归一化。'),
    rate:vector,radius:z.number().min(.002).max(1e5)}).optional(),
  source:z.object({dimension:z.literal(2),id:z.string(),time:z.number().nonnegative()}).optional(),
}).superRefine((scene,ctx)=>{
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
export type SpatialBody=z.infer<typeof spatialBody>
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
  z.object({kind:z.literal('force'),value:vector}),
  z.object({kind:z.literal('timed'),value:vector,steps:z.number().int().min(1).max(216000)}),
  z.object({kind:z.literal('impulse'),value:vector}),
  z.object({kind:z.literal('velocity'),value:vector}),
])
export type SpatialControl=z.infer<typeof control>
const action=z.object({id:z.string(),tick:z.number().int().nonnegative(),control,
  before:vector.optional(),after:vector.optional()})
export type SpatialAction=z.infer<typeof action>
export const spatialRunSchema=z.object({
  version:z.literal(1),kind:z.literal('physiclab-spatial-run'),initial:spatialSceneSchema,current:spatialSceneSchema,
  tick:z.number().int().nonnegative(),tracks:z.array(z.tuple([z.string(),z.array(sampleSchema).max(1800)])).max(60),
  rigidSnapshot:z.string().max(8_000_000).optional(),
  events:z.array(action).max(20000).optional(),
}).superRefine((run,ctx)=>{
  const ids=new Set(run.current.bodies.map(body=>body.id))
  const initialIds=new Set(run.initial.bodies.map(body=>body.id))
  if(initialIds.size!==ids.size||[...ids].some(id=>!initialIds.has(id))||run.tracks.some(([id,samples])=>!ids.delete(id)||
    samples.some((sample,i)=>sample.time>run.tick*SPATIAL_DT+1e-8||(i>0&&sample.time<=samples[i-1].time)))||ids.size) {
    ctx.addIssue({code:'custom',message:'三维快照与轨迹不匹配。'})
  }
  if(run.events?.some((event,i)=>event.tick>run.tick||!initialIds.has(event.id)||i>0&&event.tick<run.events![i-1].tick))
    ctx.addIssue({code:'custom',message:'三维干预记录与快照不匹配。'})
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
  private readonly springIndices:Map<string,number>
  private readonly background:Vec3[]
  private readonly events:SpatialAction[]=[]
  private readonly queued:SpatialAction[]=[]
  private readonly timed=new Map<string,{end:number;force:Vec3}>()
  private readonly configuredRigid:boolean
  private rigid?:SpatialRigidWorld
  private rigidSnapshot?:string
  private ticks=0

  constructor(scene:SpatialScene) {
    this.scene=spatialSceneSchema.parse(scene)
    this.bodies=this.scene.bodies.map(body=>({...body,orientation:body.orientation??[0,0,0,1],acceleration:zero()}))
    this.springIndices=new Map(this.bodies.map((body,i)=>[body.id,i]))
    this.background=this.bodies.map(body=>body.fixed?zero():add(this.scene.gravity,multiply(
      add(body.force,multiply(this.scene.electric,body.charge)),1/body.mass)))
    this.configuredRigid=Boolean(this.scene.rigid||this.scene.pivots?.length||this.bodies.some(body=>body.geometry))
    for(const body of this.bodies)this.history.set(body.id,[])
    this.sample()
  }
  get time() {return this.ticks*SPATIAL_DT}
  get usesRigidSolver() {return this.configuredRigid}
  get interventions(): readonly SpatialAction[] {return this.events}
  appliedForce(id:string):Vec3 {
    const body=this.bodies[this.springIndices.get(id)??-1]
    if(!body)return [0,0,0]
    const temporary=this.timed.get(id)
    return temporary&&this.ticks<temporary.end?add(body.force,temporary.force):body.force
  }
  dispose() {this.rigid?.dispose();this.rigid=undefined}

  schedule(id:string,input:SpatialControl) {
    if(!this.bodies.some(body=>body.id===id&&!body.fixed))throw new Error('请选择可运动的物体。')
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

  private contacts() {
    if(this.scene.collisions)for(let i=0;i<this.bodies.length;i++)for(let j=i+1;j<this.bodies.length;j++) {
      const a=this.bodies[i], b=this.bodies[j]
      const invA=a.fixed?0:1/a.mass,invB=b.fixed?0:1/b.mass,total=invA+invB
      if(total===0)continue
      const offset=subtract(b.position,a.position),distance=length(offset),overlap=a.radius+b.radius-distance
      if(overlap<=0)continue
      const normal:Vec3=distance>1e-12?multiply(offset,1/distance):[1,0,0]
      a.position=add(a.position,multiply(normal,-overlap*invA/total))
      b.position=add(b.position,multiply(normal,overlap*invB/total))
      const speed=dot(subtract(b.velocity,a.velocity),normal)
      if(speed>=0)continue
      const impulse=-(1+Math.min(a.restitution,b.restitution))*speed/total
      a.velocity=add(a.velocity,multiply(normal,-impulse*invA))
      b.velocity=add(b.velocity,multiply(normal,impulse*invB))
    }
    if(this.scene.ground)for(const body of this.bodies) {
      if(body.fixed||body.position[1]>=body.radius)continue
      const [x,,z]=body.position,[vx,vy,vz]=body.velocity
      body.position=[x,body.radius,z]
      if(vy<0)body.velocity=[vx,-vy*body.restitution,vz]
    }
  }

  step() {
    const slices=4,dt=SPATIAL_DT/slices
    const previous=this.bodies.map(body=>body.velocity)
    this.applyControls()
    for(let part=0;part<slices;part++) {
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
      body.acceleration=multiply(subtract(body.velocity,previous[i]),1/SPATIAL_DT)
    })
    this.ticks++
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
    })
  }

  static restore(value:unknown) {
    const run=spatialRunSchema.parse(value)
    const engine=new SpatialPhysics(run.initial)
    if(engine.configuredRigid!==Boolean(run.rigidSnapshot)&&run.tick!==0)throw new Error('快照和求解器不匹配。')
    engine.rigidSnapshot=run.rigidSnapshot
    const byId=new Map(run.current.bodies.map(body=>[body.id,body]))
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
    return engine
  }

  clearHistory() {
    for(const list of this.history.values())list.length=0
    this.sample()
  }

  prediction(steps=120) {
    const forecast=new SpatialPhysics(this.rigid?this.scene:this.state())
    if(this.rigid) {
      forecast.rigidSnapshot=this.rigid.snapshot()
      this.bodies.forEach((body,i)=>Object.assign(forecast.bodies[i],body))
    } else if(this.rigidSnapshot)forecast.rigidSnapshot=this.rigidSnapshot
    forecast.ticks=this.ticks
    this.background.forEach((value,i)=>{forecast.background[i]=value})
    for(const [id,temporary] of this.timed)forecast.timed.set(id,temporary)
    forecast.queued.push(...this.queued.map(event=>({...event})))
    try {
      forecast.clearHistory()
      for(let i=0;i<steps;i++)forecast.step()
      return forecast.history
    } finally {forecast.dispose()}
  }

  private sample() {
    for(const body of this.bodies) {
      const list=this.history.get(body.id)!
      list.push({time:this.time,position:body.position.slice() as Vec3,velocity:body.velocity.slice() as Vec3,
        angularVelocity:body.angularVelocity.slice() as Vec3,acceleration:body.acceleration.slice() as Vec3})
      if(list.length>1800)list.splice(0,60)
    }
  }
}
