import { ColliderDesc, CoefficientCombineRule, HalfSpace, init, JointData, RigidBodyDesc, World } from '@dimforge/rapier3d-compat'
import type { Quaternion, SpatialBody, SpatialScene, SpatialState, Vec3 } from './spatialPhysics'

let initialization:Promise<void>|undefined
export function initializeSpatialRigid() {return initialization??=init()}

const vector=([x,y,z]:Vec3)=>({x,y,z})
const tuple=({x,y,z}:{x:number;y:number;z:number}):Vec3=>[x,y,z]
const rotation=([x,y,z,w]:Quaternion)=>({x,y,z,w})

function collider(body:SpatialBody) {
  const g=body.geometry
  if(!g)return ColliderDesc.ball(body.radius)
  if(g.kind==='box')return ColliderDesc.cuboid(g.size[0]/2,g.size[1]/2,g.size[2]/2)
  if(g.kind==='cylinder')return ColliderDesc.cylinder(g.height/2,g.radius)
  if(g.kind==='cone')return ColliderDesc.cone(g.height/2,g.radius)
  const points=new Float32Array(g.vertices.flat())
  const c=body.fixed?ColliderDesc.trimesh(points,new Uint32Array(g.indices)):ColliderDesc.convexHull(points)
  if(!c)throw new Error('动态网格需要有体积的凸碰撞代理。')
  return c
}

export class SpatialRigidWorld {
  private world:World
  private readonly handles:number[]=[]

  constructor(scene:SpatialScene,dt:number) {
    this.world=new World({x:0,y:0,z:0})
    this.world.timestep=dt
    this.world.numSolverIterations=8
    this.world.maxCcdSubsteps=4
    const bodyGroup=1,floorGroup=2
    try {
      for(const body of scene.bodies) {
        const desc=(body.fixed?RigidBodyDesc.fixed():RigidBodyDesc.dynamic())
          .setTranslation(...body.position).setLinvel(...body.velocity).setAngvel(vector(body.angularVelocity))
          .setRotation(rotation(body.orientation??[0,0,0,1])).setCanSleep(false).setCcdEnabled(!body.fixed)
        const rigid=this.world.createRigidBody(desc)
        const shape=collider(body).setMass(body.mass).setFriction(body.friction??.35).setRestitution(body.restitution)
          .setRestitutionCombineRule(CoefficientCombineRule.Min)
          .setCollisionGroups((bodyGroup<<16)|floorGroup|(scene.collisions?bodyGroup:0))
        this.world.createCollider(shape,rigid)
        this.handles.push(rigid.handle)
      }
      if(scene.ground) {
        const floor=new ColliderDesc(new HalfSpace({x:0,y:1,z:0})).setFriction(.5).setRestitution(1)
          .setCollisionGroups((floorGroup<<16)|bodyGroup)
        this.world.createCollider(floor)
      }
      const ids=new Map(scene.bodies.map((body,i)=>[body.id,this.handles[i]]))
      for(const joint of scene.pivots??[]) {
        const a=this.world.getRigidBody(ids.get(joint.a)!),b=this.world.getRigidBody(ids.get(joint.b)!)
        this.world.createImpulseJoint(JointData.spherical(vector(joint.anchorA),vector(joint.anchorB)),a,b,true).setContactsEnabled(false)
      }
    } catch(error) {this.world.free();throw error}
  }

  advance(states:SpatialState[],accelerations:Vec3[],velocities:Vec3[]) {
    states.forEach((state,i)=>{
      if(state.fixed)return
      const b=this.world.getRigidBody(this.handles[i])
      b.setLinvel(vector(velocities[i]),false)
      b.resetForces(false)
      b.addForce(vector(accelerations[i].map(n=>n*state.mass) as Vec3),false)
    })
    this.world.step()
    states.forEach((state,i)=>{
      if(state.fixed)return
      const b=this.world.getRigidBody(this.handles[i])
      state.position=tuple(b.translation())
      state.velocity=tuple(b.linvel())
      state.angularVelocity=tuple(b.angvel())
      const {x,y,z,w}=b.rotation()
      const norm=Math.hypot(x,y,z,w)
      state.orientation=[x/norm,y/norm,z/norm,w/norm]
    })
  }

  snapshot() {
    const bytes=this.world.takeSnapshot()
    let raw=''
    for(let i=0;i<bytes.length;i+=8192)raw+=String.fromCharCode(...bytes.subarray(i,i+8192))
    return btoa(raw)
  }

  restore(snapshot:string) {
    const next=World.restoreSnapshot(Uint8Array.from(atob(snapshot),char=>char.charCodeAt(0)))
    if(!next)throw new Error('三维刚体快照无效。')
    if(this.handles.some(handle=>!next.bodies.contains(handle))) {
      next.free();throw new Error('三维刚体快照与物体不匹配。')
    }
    this.world.free()
    this.world=next
  }

  dispose() {this.world.free()}
}
