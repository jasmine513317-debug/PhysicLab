import { Box, Chain, Circle, DistanceJoint, Polygon, Vec2, World, type Body } from 'planck'
import { area, decodeExperiment, DEFAULT_WORLD_BOUNDS, springFrequency, type Experiment, type Point } from './model'
import { energies } from './analysis'
import { COULOMB_CONSTANT } from './electrostatics'
import { triangulate } from './freeform'
import { polygonArea } from './track'
import { REPLAY_SAMPLE_LIMIT, type RecordedSample, type Replay } from './replay'
import { SAMPLE_EVERY } from './simulation'

export { SAMPLE_EVERY } from './simulation'
export class Physics {
  readonly world: World
  readonly bodies = new Map<string,Body>()
  readonly samples = new Map<string,RecordedSample[]>()
  readonly acceleration = new Map<string,Point>()
  readonly springJoints = new Map<string,DistanceJoint>()
  private readonly applied = new Map<string,Point>()
  private readonly lastVelocity = new Map<string,Point>()
  private ticks = 0
  private accumulator = 0
  private appliedForceDuringRun = false
  readonly scene: Experiment

  constructor(scene: Experiment) {
    this.scene = decodeExperiment(scene)
    this.world = new World({gravity:Vec2(0,-scene.environment.gravity)})
    if (!scene.environment.collisions) this.world.on('pre-solve', contact => contact.setEnabled(false))
    for (const config of scene.bodies) {
      const b = this.world.createBody({
        type:config.type, position:config.position, angle:config.angle, bullet:true,
        linearVelocity:config.type==='dynamic' ? config.velocity : Vec2(),
        angularVelocity:config.type==='dynamic' ? config.angularVelocity : 0,
      })
      this.bodies.set(config.id,b)
      if(config.role==='marker'||config.role==='field')continue
      const g = config.geometry
      const fixtures={friction:config.friction,restitution:config.restitution}
      if(g.kind==='freeform') {
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
        this.acceleration.set(config.id,{x:0,y:-scene.environment.gravity})
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
    this.record()
  }

  get time() { return this.ticks*this.scene.environment.timeStep }
  get externalForceApplied() { return this.appliedForceDuringRun }
  discardRemainder() { this.accumulator = 0 }

  advance(seconds: number, speed = this.scene.environment.speed, stopTick = Infinity) {
    const dt = this.scene.environment.timeStep
    this.accumulator += Math.min(0.15,Math.max(0,seconds))*speed
    let steps = 0
    while (this.accumulator+1e-10 >= dt && steps < 8 && this.ticks < stopTick) {
      this.step()
      this.accumulator -= dt
      steps++
    }
    if (this.ticks === stopTick) {
      this.discardRemainder()
      if (steps > 0 && this.ticks % SAMPLE_EVERY !== 0) this.record()
    } else if (steps===8) this.accumulator %= dt
    return steps
  }

  setForce(id:string, force:Point) {
    if (![force.x,force.y].every(n=>Number.isFinite(n)&&Math.abs(n)<=10000)) throw new Error('外力分量必须在 −10,000 至 10,000 N 之间。')
    if (this.bodies.get(id)?.isDynamic()) this.applied.set(id,force)
  }

  private electricForce(config:Experiment['bodies'][number]):Point {
    const force={x:0,y:0}
    if(!config.charge)return force
    for(const source of this.scene.bodies) {
      if(source.id===config.id||source.role!=='field'||!source.charge)continue
      const position=this.bodies.get(config.id)!.getPosition()
      const dx=position.x-source.position.x,dy=position.y-source.position.y
      const radius=Math.hypot(dx,dy)
      if(radius===0)continue
      const magnitude=COULOMB_CONSTANT*1e-18*config.charge*source.charge/(radius*radius)
      force.x+=magnitude*dx/radius
      force.y+=magnitude*dy/radius
    }
    return force
  }

  step() {
    const dt = this.scene.environment.timeStep
    for (const [id,f] of this.applied) {
      if(f.x!==0||f.y!==0)this.appliedForceDuringRun=true
      this.bodies.get(id)?.applyForceToCenter(f,true)
    }
    for(const config of this.scene.bodies) {
      if(config.type!=='dynamic')continue
      const force=this.electricForce(config)
      if(force.x!==0||force.y!==0)this.bodies.get(config.id)!.applyForceToCenter(force,true)
    }
    this.world.step(dt,8,3)
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
    const vectors = [{name:'重力',vector:{x:0,y:-b.getMass()*this.scene.environment.gravity},color:'#eecb82'}]
    const external = this.applied.get(id)
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
    return this.externalForceApplied?{version:1,scene,tracks,externalForceApplied:true}:{version:1,scene,tracks}
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
      samples.set(bodyId,{time:this.time,bodyId,x:p.x,y:p.y,angle:b.getAngle(),vx:v.x,vy:v.y,speed,ax:a.x,ay:a.y,
        ...energies(mass,speed,inertia,b.getAngularVelocity(),this.scene.environment.gravity,b.getWorldCenter().y,springEnergy.get(bodyId)??0)})
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
