import { spatialField } from './spatialFields'
import { add,cross,dot,length,multiply,subtract,type SpatialPhysics,type SpatialState,type Vec3 } from './spatialPhysics'

export const vectorKinds=['displacement','acceleration','momentum','angular','weight','net','applied','electric','magnetic','electricForce','magneticForce','gravity'] as const
export type VectorKind=typeof vectorKinds[number]
export const vectorStyles:Record<VectorKind,readonly [string,string,number,string]>={
  displacement:['位移','m',1,'#c4c4cc'],acceleration:['加速度','m/s²',.13,'#f2c38b'],
  momentum:['动量','kg·m/s',.18,'#a7d3df'],angular:['角速度','rad/s',.25,'#d4bca0'],
  weight:['重力','N',.11,'#f2c38b'],net:['合力（步平均）','N',.11,'#ece2b6'],
  applied:['外力','N',.11,'#e9b5bd'],electric:['电场','N/C',.00012,'#a6c4ef'],
  magnetic:['磁感应强度','T',.3,'#a7b996'],electricForce:['电场力','N',.11,'#acc4e3'],
  magneticForce:['磁场力','N',.11,'#abc79f'],gravity:['万有引力','N',.11,'#d6c48f'],
}
export type VectorView={kinds:VectorKind[];labels:'name'|'size'|'components'|'none';scales:Record<string,number>}
export const defaultVectorView:VectorView={kinds:[],labels:'size',scales:{}}

export function vectorsAt(engine:SpatialPhysics,body:SpatialState,kinds:readonly VectorKind[]) {
  const scene=engine.scene
  const peers=engine.bodies.filter(item=>item.id!==body.id)
  let electric=kinds.some(kind=>kind==='electric'||kind==='electricForce')
    ?spatialField(scene.mutualElectric?peers:[],body.position,scene.electric).field:scene.electric
  const magnetic=scene.induction?add(scene.magnetic,multiply(scene.induction.rate,engine.time)):scene.magnetic
  if(scene.induction)electric=add(electric,multiply(cross(scene.induction.rate,subtract(body.position,scene.induction.center)),-.5))
  let gravity:Vec3=[0,0,0]
  if(scene.mutualGravity&&kinds.includes('gravity'))for(const other of peers) {
    const gap=subtract(other.position,body.position)
    gravity=add(gravity,multiply(gap,6.6743e-11*other.mass*body.mass/(dot(gap,gap)+.0001)**1.5))
  }
  const initial=scene.bodies.find(item=>item.id===body.id)
  const values:Record<VectorKind,Vec3>={
    displacement:initial?subtract(body.position,initial.position):[0,0,0],acceleration:body.acceleration,
    momentum:multiply(body.velocity,body.mass),angular:body.angularVelocity,weight:multiply(scene.gravity,body.mass),
    net:multiply(body.acceleration,body.mass),applied:engine.appliedForce(body.id),electric,magnetic,
    electricForce:multiply(electric,body.charge),magneticForce:multiply(cross(body.velocity,magnetic),body.charge),gravity,
  }
  return kinds.map(kind=>({style:vectorStyles[kind],value:values[kind]})).filter(item=>length(item.value)>0)
}
