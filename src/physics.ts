import { Box, Chain, Circle, DistanceJoint, Edge, Polygon, Vec2, World, type Body } from 'planck'
import { area, decodeExperiment, DEFAULT_WORLD_BOUNDS, gravityVector, springFrequency, type Experiment, type Point } from './model'
import { energies } from './analysis'
import { COULOMB_CONSTANT } from './electrostatics'
import { triangulate } from './freeform'
import { polygonArea } from './track'
import { REPLAY_SAMPLE_LIMIT, type RecordedSample, type Replay } from './replay'
import { FixedStepClock, SAMPLE_EVERY } from './simulation'
import { inputSchema, type Intervention, type PhysicalInput, type RunTimeline } from './interventions'
import { RailConstraint } from './railConstraint'

export { SAMPLE_EVERY } from './simulation'
export class Physics {
  readonly world: World
  readonly bodies = new Map<string,Body>()
  readonly samples = new Map<string,RecordedSample[]>()
  readonly acceleration = new Map<string,Point>()
  readonly springJoints = new Map<string,DistanceJoint>()
  private readonly applied = new Map<string,Extract<PhysicalInput,{kind:'continuous'|'timed'}>>()
  private readonly pending: Intervention[] = []
  private readonly appliedEvents: Intervention[] = []
  private readonly impulses=new Map<string,Intervention>()
  private readonly bodyIds = new Map<Body,string>()
  private readonly contactLoads = new Map<string,{normal:Point;friction:Point}>()
  private readonly lastVelocity = new Map<string,Point>()
  private ticks = 0
  private readonly clock:FixedStepClock
  private readonly gravity:Point
  private readonly rails=new Map<string,RailConstraint>()
  private readonly railReaction=new Map<string,Point>()
  private appliedForceDuringRun = false
  readonly scene: Experiment

  constructor(scene: Experiment) {
    this.scene = decodeExperiment(scene)
    this.clock=new FixedStepClock(this.scene.environment.timeStep)
    this.gravity=gravityVector(this.scene.environment)
    this.world = new World({gravity:Vec2(this.gravity)})
    if (!scene.environment.collisions) this.world.on('pre-solve', contact => contact.setEnabled(false))
    const sided=new Map<Body,Experiment['bodies'][number]>()
    this.world.on('pre-solve',contact=>{
      if(!contact.isEnabled())return
      const a=contact.getFixtureA().getBody(),b=contact.getFixtureB().getBody()
      const config=sided.get(a)??sided.get(b)
      if(!config)return
      const onA=sided.has(a),sideBody=onA?a:b,sign=onA?1:-1
      const g=config.geometry
      const i=onA?contact.getChildIndexA():contact.getChildIndexB()
      const tangent=g.kind==='track'?{
        x:g.vertices[(i+1)%g.vertices.length].x-g.vertices[i].x,
        y:g.vertices[(i+1)%g.vertices.length].y-g.vertices[i].y,
      }:{x:1,y:0}
      const left=sideBody.getWorldVector({x:-tangent.y,y:tangent.x})
      const normal=contact.getWorldManifold(null)?.normal
      const side=config.contactSide==='left'?1:-1
      if(normal&&sign*side*(normal.x*left.x+normal.y*left.y)<-1e-9)contact.setEnabled(false)
    })
    this.world.on('post-solve',(contact,impulse)=>{
      const normal=contact.getWorldManifold(null)?.normal
      if(!normal)return
      const dt=this.scene.environment.timeStep
      const normalForce=impulse.normalImpulses.reduce((sum,value)=>sum+value,0)/dt
      const tangentForce=impulse.tangentImpulses.reduce((sum,value)=>sum+value,0)/dt
      const accumulate=(body:Body,sign:number)=>{
        const id=this.bodyIds.get(body)
        if(!id||!this.samples.has(id))return
        const loads=this.contactLoads.get(id)??{normal:{x:0,y:0},friction:{x:0,y:0}}
        loads.normal.x+=sign*normal.x*normalForce
        loads.normal.y+=sign*normal.y*normalForce
        loads.friction.x+=sign*normal.y*tangentForce
        loads.friction.y-=sign*normal.x*tangentForce
        this.contactLoads.set(id,loads)
      }
      accumulate(contact.getFixtureA().getBody(),-1)
      accumulate(contact.getFixtureB().getBody(),1)
    })
    for (const config of scene.bodies) {
      const b = this.world.createBody({
        type:config.type, position:config.position, angle:config.angle, bullet:true,
        linearVelocity:config.type==='dynamic' ? config.velocity : Vec2(),
        angularVelocity:config.type==='dynamic' ? config.angularVelocity : 0,
        linearDamping:scene.environment.linearDrag??0,
      })
      this.bodies.set(config.id,b)
      this.bodyIds.set(b,config.id)
      if(config.contactSide&&config.contactSide!=='both')sided.set(b,config)
      if(config.role==='marker'||config.role==='field')continue
      const g = config.geometry
      const fixtures={friction:config.friction,restitution:config.restitution,filterMaskBits:config.rail?0:0xffff}
      if(g.kind==='surface'&&config.surfaceLine) {
        b.createFixture(new Edge(Vec2(-g.width/2,g.height/2),Vec2(g.width/2,g.height/2)),fixtures)
      } else if(g.kind==='freeform') {
        if(config.type==='static') {
          b.createFixture(new Chain(g.vertices,g.closed),{...fixtures,density:0})
        } else {
          const density=config.mass/area(g)
          const triangles=triangulate(g.vertices)
          if(!triangles.length)throw new Error('无法为手绘物块生成与轮廓一致的碰撞形状。')
          for(const triangle of triangles)b.createFixture(new Polygon(triangle),{...fixtures,density})
        }
      } else if(g.kind==='ellipse') {
        const vertices=Array.from({length:64},(_,i)=>{
          const angle=i*Math.PI/32
          return {x:g.radiusX*Math.cos(angle),y:g.radiusY*Math.sin(angle)}
        })
        const density=config.mass/Math.abs(polygonArea(vertices))
        for(let i=1;i<vertices.length-1;i++)b.createFixture(new Polygon([vertices[0],vertices[i],vertices[i+1]]),{...fixtures,density})
      } else {
        const shape = g.kind==='circle' ? new Circle(g.radius)
          : g.kind==='polygon' ? new Polygon(g.vertices)
          : g.kind==='track' ? new Chain(g.vertices,g.closed)
          : new Box(g.width/2,g.height/2)
        b.createFixture(shape,{...fixtures,density:g.kind==='track'?0:config.mass/area(g)})
      }
      if (config.type==='dynamic') {
        this.samples.set(config.id,[])
        this.lastVelocity.set(config.id,{...b.getLinearVelocity()})
        this.acceleration.set(config.id,this.gravity)
      }
    }
    if (scene.environment.boundaries) {
      const {minX,maxX,minY,maxY}=scene.environment.worldBounds??DEFAULT_WORLD_BOUNDS
      const middleX=(minX+maxX)/2,middleY=(minY+maxY)/2
      const halfWidth=(maxX-minX)/2,halfHeight=(maxY-minY)/2
      const boundaries=this.world.createBody()
      for(const x of [minX-.1,maxX+.1])boundaries.createFixture(new Box(.1,halfHeight+.2,Vec2(x,middleY),0),{friction:.3})
      for(const y of [minY-.1,maxY+.1])boundaries.createFixture(new Box(halfWidth+.2,.1,Vec2(middleX,y),0),{friction:.3})
    }
    for (const j of scene.joints) {
      const bodyA = this.bodies.get(j.a)!, bodyB = this.bodies.get(j.b)!
      const a = scene.bodies.find(b=>b.id===j.a)!, b = scene.bodies.find(b=>b.id===j.b)!
      const joint = this.world.createJoint(new DistanceJoint({
        bodyA,bodyB, localAnchorA:j.anchorA, localAnchorB:j.anchorB,
        length:j.restLength, frequencyHz:springFrequency(j.stiffness,a,b),
        dampingRatio:j.damping, collideConnected:true,
      }))
      if (!joint) throw new Error('无法创建弹簧连接。')
      this.springJoints.set(j.id,joint)
    }
    for(const config of scene.bodies)if(config.rail) {
      const b=this.bodies.get(config.id)!
      const constraint=new RailConstraint(scene.bodies.find(body=>body.id===config.rail)!,config.position,config.velocity)
      const {position,velocity}=constraint.pose()
      this.rails.set(config.id,constraint)
      b.setTransform(position,config.angle);b.setLinearVelocity(velocity)
      this.lastVelocity.set(config.id,velocity)
    }
    this.record()
  }

  get time() { return this.ticks*this.scene.environment.timeStep }
  get externalForceApplied() { return this.appliedForceDuringRun }
  discardRemainder() { this.clock.clear() }

  advance(seconds: number, speed = this.scene.environment.speed, stopTick = Infinity) {
    const steps=this.clock.advance(Math.min(0.15,Math.max(0,seconds))*speed,8,()=>{
      if(this.ticks>=stopTick)return false
      this.step()
      return true
    })
    if (this.ticks === stopTick) {
      this.discardRemainder()
      if (steps > 0 && this.ticks % SAMPLE_EVERY !== 0) this.record()
    }
    return steps
  }

  setForce(id:string, force:Point) {
    this.schedule(id,{kind:'continuous',vector:force})
  }

  schedule(id:string, input:PhysicalInput) {
    if (!this.samples.has(id)) throw new Error('请选择可运动的物体。')
    const result = inputSchema.safeParse(input)
    if (!result.success) throw new Error('分量必须是 −10,000 至 10,000 之间的有限数值，时间必须为非负数。')
    const accepted = result.data
    const dt = this.scene.environment.timeStep
    if (accepted.kind==='timed' && (accepted.end<=accepted.start ||
        Math.ceil(accepted.end/dt-1e-9)<=Math.max(this.ticks,Math.ceil(accepted.start/dt-1e-9)))) {
      throw new Error('定时力的起止时间须至少覆盖一个尚未运行的模拟步。')
    }
    this.pending.push({bodyId:id,tick:this.ticks,time:this.time,input:accepted})
  }

  get interventions(): readonly Intervention[] { return this.appliedEvents }
  timeline():RunTimeline { return {tick:this.ticks,events:[...this.appliedEvents,...this.pending]} }

  static restoreTimeline(scene:Experiment,timeline:RunTimeline) {
    const engine=new Physics(scene)
    let next=0
    for(let tick=0;tick<=timeline.tick;tick++) {
      while(timeline.events[next]?.tick===tick) {
        const event=timeline.events[next++]
        engine.schedule(event.bodyId,event.input)
      }
      if(tick<timeline.tick)engine.step()
    }
    return engine
  }

  externalForceAt(id:string) {
    const input=this.applied.get(id)
    if(input?.kind==='timed' && (this.time+1e-10<input.start || this.time+1e-10>=input.end)) return
    return input?.vector
  }

  private contactNormals(body:Body) {
    const normals:{normal:Point;fixed:boolean}[]=[]
    if(!this.scene.environment.collisions)return normals
    for(let edge=body.getContactList();edge;edge=edge.next) {
      const {contact,other}=edge
      if(!other||!contact.isEnabled()||!contact.isTouching()||contact.getFixtureA().isSensor()||contact.getFixtureB().isSensor())continue
      const manifold=contact.getWorldManifold(null)
      if(!manifold?.points.length)continue
      const sign=contact.getFixtureA().getBody()===body?-1:1
      normals.push({normal:{x:sign*manifold.normal.x,y:sign*manifold.normal.y},fixed:other.isStatic()})
    }
    return normals
  }

  inputForNetForce(id:string,target:Point,quantity:'force'|'acceleration'):PhysicalInput {
    const body=this.bodies.get(id)
    const config=this.scene.bodies.find(candidate=>candidate.id===id)
    if(!body||!config||!this.samples.has(id))throw new Error('请选择可运动的物体。')
    const rail=this.rails.get(id)
    if(rail) {
      const {tangent,velocity}=rail.pose()
      const mass=body.getMass(),factor=quantity==='acceleration'?mass:1
      if(Math.abs(target.x*tangent.y-target.y*tangent.x)>1e-8)throw new Error('轨道内部只允许切向目标，法向反力由轨道约束确定。')
      const known=this.electricForce(config),drag=this.scene.environment.linearDrag??0
      const required=tangent.x*(target.x*factor-known.x-mass*(this.gravity.x-drag*velocity.x))+
        tangent.y*(target.y*factor-known.y-mass*(this.gravity.y-drag*velocity.y))
      return {kind:'continuous',vector:{x:tangent.x*required,y:tangent.y*required}}
    }
    if(this.contactNormals(body).length||this.scene.joints.some(joint=>joint.a===id||joint.b===id)) {
      throw new Error('当前接触或弹簧约束下无法保证目标。可直接输入持续外力，再测量实际合力。')
    }
    const mass=body.getMass()
    const factor=quantity==='acceleration'?mass:1
    const electric=this.electricForce(config)
    const drag=this.scene.environment.linearDrag??0,velocity=body.getLinearVelocity(),dt=this.scene.environment.timeStep
    // Planck applies implicit linear damping after the force kick.
    return {kind:'continuous',vector:{
      x:target.x*factor*(1+dt*drag)-electric.x-mass*(this.gravity.x-drag*velocity.x),
      y:target.y*factor*(1+dt*drag)-electric.y-mass*(this.gravity.y-drag*velocity.y),
    }}
  }

  inputForSupport(id:string,newtons:number):PhysicalInput {
    const body=this.bodies.get(id),config=this.scene.bodies.find(candidate=>candidate.id===id)
    if(!body||!config||!this.samples.has(id))throw new Error('请选择可运动的物体。')
    if(!Number.isFinite(newtons)||newtons<0)throw new Error('目标支持力必须是非负有限数值。')
    const contacts=this.contactNormals(body),normal=contacts[0]?.normal
    if(!normal)throw new Error('物体尚未形成可测量的接触。请先运行至接触稳定，再输入目标支持力。')
    if(contacts.some(contact=>!contact.fixed||normal.x*contact.normal.x+normal.y*contact.normal.y<1-1e-7)||
      this.scene.joints.some(joint=>joint.a===id||joint.b===id)) {
      throw new Error('多个接触方向、活动支点或弹簧会共同分配反力。请隔离一个固定接触方向，或输入外力后测量反力。')
    }
    const velocity=body.getLinearVelocity()
    if(Math.abs(normal.x*velocity.x+normal.y*velocity.y)>1e-3||Math.abs(body.getAngularVelocity())>1e-3) {
      throw new Error('物体仍在沿接触法向运动或转动。请等待接触稳定后再求解。')
    }
    const external=this.externalForceAt(id)??{x:0,y:0}
    const electric=this.electricForce(config),mass=body.getMass()
    const baseline={x:mass*this.gravity.x+electric.x+external.x,y:mass*this.gravity.y+electric.y+external.y}
    // Preserve the user-applied tangential force and balance the requested summed normal load.
    const change=-newtons-normal.x*baseline.x-normal.y*baseline.y
    return {kind:'continuous',vector:{x:external.x+change*normal.x,y:external.y+change*normal.y}}
  }

  private applyPending() {
    for(const event of this.pending.splice(0)) {
      const {bodyId,input}=event
      const body=this.bodies.get(bodyId)!
      const velocityBefore={...body.getLinearVelocity()}
      if(input.kind==='impulse') {
        body.applyLinearImpulse(input.vector,body.getWorldCenter(),true)
        this.appliedForceDuringRun ||= input.vector.x!==0 || input.vector.y!==0
      } else if(input.kind==='velocity') {
        body.setLinearVelocity(input.vector)
        body.setAwake(true)
        this.appliedForceDuringRun=true
      } else {
        this.applied.set(bodyId,input)
      }
      const rail=this.rails.get(bodyId)
      if(rail&&(input.kind==='impulse'||input.kind==='velocity')) {
        rail.setVelocity(body.getLinearVelocity())
        body.setLinearVelocity(rail.pose().velocity)
      }
      const recorded=input.kind==='impulse'||input.kind==='velocity'
        ?{...event,velocityBefore,velocityAfter:{...body.getLinearVelocity()}}
        :event
      this.appliedEvents.push(recorded)
      if(input.kind==='impulse')this.impulses.set(bodyId,recorded)
    }
  }

  electricField(id:string):Point {
    const field={x:0,y:0}
    const position=this.bodies.get(id)?.getPosition()
    if(!position)return field
    for(const source of this.scene.bodies) {
      if(source.id===id||source.role!=='field'||!source.charge)continue
      const dx=position.x-source.position.x,dy=position.y-source.position.y
      // A uniform 1 cm core keeps the dynamics finite and preserves Coulomb's law outside it.
      const radius=Math.max(Math.hypot(dx,dy),.01)
      const factor=COULOMB_CONSTANT*1e-9*source.charge/(radius**3)
      field.x+=factor*dx
      field.y+=factor*dy
    }
    return field
  }

  private electricForce(config:Experiment['bodies'][number]):Point {
    if(!config.charge)return {x:0,y:0}
    const field=this.electricField(config.id),charge=config.charge*1e-9
    return {x:field.x*charge,y:field.y*charge}
  }

  lastImpulse(id:string) {
    const event=this.impulses.get(id)
    const mass=this.bodies.get(id)?.getMass()
    if(!event?.velocityBefore||!event.velocityAfter||!mass||this.time-event.time>.5)return
    return {x:mass*(event.velocityAfter.x-event.velocityBefore.x),y:mass*(event.velocityAfter.y-event.velocityBefore.y)}
  }

  step() {
    const dt = this.scene.environment.timeStep
    this.contactLoads.clear()
    this.applyPending()
    for (const id of this.applied.keys()) {
      const f=this.externalForceAt(id)
      if(!f)continue
      if(f.x!==0||f.y!==0)this.appliedForceDuringRun=true
      if(!this.rails.has(id)) {
        const body=this.bodies.get(id)!
        // Continuous loads must prevent the solver from putting very slow bodies to sleep.
        if(f.x!==0||f.y!==0)body.setAwake(true)
        body.applyForceToCenter(f,false)
      }
    }
    for(const config of this.scene.bodies) {
      if(config.type!=='dynamic'||this.rails.has(config.id))continue
      const force=this.electricForce(config)
      if(force.x!==0||force.y!==0) {
        const body=this.bodies.get(config.id)!
        body.setAwake(true)
        body.applyForceToCenter(force,false)
      }
    }
    this.world.step(dt,8,3)
    for(const [id,rail] of this.rails) {
      const b=this.bodies.get(id)!,mass=b.getMass()
      const config=this.scene.bodies.find(body=>body.id===id)!
      const external=this.externalForceAt(id)??{x:0,y:0},electric=this.electricForce(config)
      const known={x:this.gravity.x+(external.x+electric.x)/mass,y:this.gravity.y+(external.y+electric.y)/mass}
      const last=rail.pose().velocity,drag=this.scene.environment.linearDrag??0
      const next=rail.step(dt,known,drag)
      b.setTransform(next.position,b.getAngle());b.setLinearVelocity(next.velocity)
      this.railReaction.set(id,{
        x:mass*((next.velocity.x-last.x)/dt-known.x+drag*(last.x+next.velocity.x)/2),
        y:mass*((next.velocity.y-last.y)/dt-known.y+drag*(last.y+next.velocity.y)/2),
      })
    }
    this.ticks++
    for (const [id, previous] of this.lastVelocity) {
      const b = this.bodies.get(id)!
      const p = b.getPosition(), v = b.getLinearVelocity()
      if (![p.x,p.y,v.x,v.y,b.getAngle()].every(Number.isFinite)) throw new Error('模拟出现数值不稳定。请重置并检查参数。')
      this.acceleration.set(id,{x:(v.x-previous.x)/dt,y:(v.y-previous.y)/dt})
      this.lastVelocity.set(id,{...v})
    }
    if (this.ticks%SAMPLE_EVERY===0) this.record()
  }

  forceVectors(id:string) {
    const b = this.bodies.get(id)
    if (!b?.isDynamic()) return []
    const vectors = [{name:'重力',vector:{x:this.gravity.x*b.getMass(),y:this.gravity.y*b.getMass()},color:'#eecb82'}]
    const external = this.externalForceAt(id)
    if (external) vectors.push({name:'外力',vector:external,color:'#f1a0ca'})
    const config=this.scene.bodies.find(body=>body.id===id)!
    const electric=this.electricForce(config)
    if(electric.x!==0||electric.y!==0)vectors.push({name:'电场力',vector:electric,color:'#a9d7ff'})
    for (const j of this.scene.joints) {
      if (j.a!==id && j.b!==id) continue
      const joint = this.springJoints.get(j.id)!
      const reaction = joint.getReactionForce(1/this.scene.environment.timeStep)
      const side = j.a===id ? -1 : 1
      vectors.push({name:'弹簧力',vector:{x:reaction.x*side,y:reaction.y*side},color:'#e6a273'})
    }
    const contact=this.contactLoads.get(id)
    if(contact) {
      vectors.push({name:'接触法向力',vector:contact.normal,color:'#abd6bc'})
      vectors.push({name:'接触摩擦力',vector:contact.friction,color:'#d0b5df'})
    }
    const rail=this.railReaction.get(id)
    if(rail)vectors.push({name:'轨道约束力',vector:rail,color:'#abd6bc'})
    return vectors
  }

  captureReplay(scene:Experiment):Replay|undefined {
    if (this.time===0 || !this.samples.size) return
    const tail=this.time===this.samples.values().next().value!.at(-1)?.time ? undefined : this.collectSamples()
    const tracks:Replay['tracks']=[...this.samples].map(([id,samples])=>{
      const history=samples.slice(-(REPLAY_SAMPLE_LIMIT-(tail?1:0)))
      const last=tail?.get(id)
      if(last)history.push(last)
      return [id,history]
    })
    return {version:1,scene,tracks,
      ...(this.externalForceApplied?{externalForceApplied:true as const}:{}),
      ...(this.appliedEvents.length?{interventions:this.appliedEvents.slice()}:{}),
    }
  }

  private collectSamples() {
    const samples = new Map<string,RecordedSample>()
    const springEnergy = new Map<string,number>()
    for (const j of this.scene.joints) {
      const joint = this.springJoints.get(j.id)!
      const a = joint.getAnchorA(), b = joint.getAnchorB()
      const total = j.stiffness*(Math.hypot(a.x-b.x,a.y-b.y)-j.restLength)**2/2
      const dynamic = [j.a,j.b].filter(id=>this.samples.has(id))
      for (const id of dynamic) springEnergy.set(id,(springEnergy.get(id)??0)+total/dynamic.length)
    }
    for (const bodyId of this.samples.keys()) {
      const b = this.bodies.get(bodyId)!
      const p = b.getPosition(), v = b.getLinearVelocity(), a = this.acceleration.get(bodyId)!
      const speed = Math.hypot(v.x,v.y)
      const mass = b.getMass(), center = b.getLocalCenter()
      const inertia = Math.max(0,b.getInertia()-mass*(center.x**2+center.y**2))
      const worldCenter=b.getWorldCenter()
      const potentialPerMass=-(this.gravity.x*worldCenter.x+this.gravity.y*worldCenter.y)
      samples.set(bodyId,{time:this.time,bodyId,x:p.x,y:p.y,angle:b.getAngle(),vx:v.x,vy:v.y,speed,ax:a.x,ay:a.y,
        ...energies(mass,speed,inertia,b.getAngularVelocity(),1,potentialPerMass,springEnergy.get(bodyId)??0)})
    }
    return samples
  }

  private record() {
    for (const [id,sample] of this.collectSamples()) {
      const list=this.samples.get(id)!
      list.push(sample)
      // Prune in batches to keep chart storage near four minutes.
      if(list.length>REPLAY_SAMPLE_LIMIT+59)list.splice(0,60)
    }
  }
}
