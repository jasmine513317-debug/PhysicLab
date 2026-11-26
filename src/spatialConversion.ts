import { body as makeBody, decodeExperiment, emptyExperiment, gravityVector, springFrequency, type BodyConfig, type Experiment, type Point } from './model'
import type { Physics } from './physics'
import { emptySpatialScene, rotateSpatialVector, spatialObject, type SpatialBody, type SpatialScene } from './spatialPhysics'
import { extrudeContour,meshRadius,spatialGeometrySchema,spatialMesh,type SpatialGeometry } from './spatialGeometry'

const depth=.8
function liftGeometry(geometry:BodyConfig['geometry']):SpatialGeometry|undefined {
  if(geometry.kind==='circle')return
  if(geometry.kind==='rectangle'||geometry.kind==='surface')return {kind:'box',size:[geometry.width,geometry.height,depth]}
  if(geometry.kind==='ellipse')return extrudeContour(Array.from({length:32},(_,i)=>{
    const angle=i*Math.PI/16
    return {x:geometry.radiusX*Math.cos(angle),y:geometry.radiusY*Math.sin(angle)}
  }),depth)
  if(geometry.kind==='polygon'||geometry.kind==='freeform'&&geometry.closed)return extrudeContour(geometry.vertices,depth)
  const vertices=geometry.vertices.flatMap(({x,y}):[number,number,number][]=>[[x,y,-depth/2],[x,y,depth/2]])
  const count=geometry.closed?geometry.vertices.length:geometry.vertices.length-1
  const indices=Array.from({length:count},(_,i)=>{
    const a=i*2,b=(a+2)%vertices.length
    return [a,b,a+1,a+1,b,b+1]
  }).flat()
  return spatialGeometrySchema.parse({kind:'mesh',vertices,indices})
}

export function liftPlanarExperiment(scene:Experiment,physics:Physics):{scene?:SpatialScene;unsupported:string[]} {
  const unsupported=scene.bodies.filter(body=>
    body.rail||body.role==='marker'||body.role==='field'||Boolean(body.charge)||
    (body.contactSide!==undefined&&body.contactSide!=='both'))
    .map(body=>body.name)
  const byId=new Map(scene.bodies.map(body=>[body.id,body]))
  if(scene.joints.some(joint=>[joint.anchorA.x,joint.anchorA.y,joint.anchorB.x,joint.anchorB.y].some(Boolean)||
    springFrequency(joint.stiffness,byId.get(joint.a)!,byId.get(joint.b)!)*2*Math.PI>50))unsupported.push('偏心或高刚度弹簧')
  if(scene.environment.boundaries)unsupported.push('封闭边界')
  if(scene.environment.linearDrag)unsupported.push('介质线性阻尼')
  if(scene.bodies.length>60)unsupported.push('超过 60 个空间物体')
  if(unsupported.length)return {unsupported}
  const spatial=emptySpatialScene(scene.title)
  const gravity=gravityVector(scene.environment)
  spatial.gravity=[gravity.x,gravity.y,0]
  spatial.source={dimension:2,id:scene.id,time:physics.time}
  spatial.collisions=scene.environment.collisions
  const bodies:SpatialBody[]=[]
  for(const body of scene.bodies) {
    const geometry=body.geometry
    let shape:SpatialGeometry|undefined
    try {shape=liftGeometry(geometry)}
    catch {return {unsupported:[body.name+'（轮廓无法构建）']}}
    const live=physics.bodies.get(body.id)
    const at=live?.getPosition()??body.position, velocity=live?.getLinearVelocity()??body.velocity
    const external=physics.externalForceAt(body.id)
    const halfAngle=(live?.getAngle()??body.angle)/2
    const lineOffset=geometry.kind==='surface'&&body.surfaceLine?(geometry.height-.02)/2:0
    if(lineOffset&&shape?.kind==='box')shape={...shape,size:[shape.size[0],.02,shape.size[2]]}
    bodies.push({...spatialObject(body.name),id:body.id,radius:geometry.kind==='circle'?geometry.radius:shape?meshRadius(shape):.35,
      mass:body.mass,geometry:shape,friction:Math.min(5,body.friction),
      fixed:body.type==='static',restitution:body.restitution,position:[at.x-lineOffset*Math.sin(halfAngle*2),at.y+lineOffset*Math.cos(halfAngle*2),0],velocity:[velocity.x,velocity.y,0],
      angularVelocity:[0,0,live?.getAngularVelocity()??body.angularVelocity],orientation:[0,0,Math.sin(halfAngle),Math.cos(halfAngle)],
      force:external?[external.x,external.y,0]:[0,0,0]})
  }
  const springs=scene.joints.map(joint=>{
    const a=byId.get(joint.a)!,b=byId.get(joint.b)!
    const effectiveMass=1/((a.type==='dynamic'?1/a.mass:0)+(b.type==='dynamic'?1/b.mass:0))
    return {id:joint.id,a:joint.a,b:joint.b,stiffness:joint.stiffness,restLength:joint.restLength,
      damping:2*joint.damping*Math.sqrt(joint.stiffness*effectiveMass)}
  })
  return {scene:{...spatial,bodies,springs},unsupported}
}

export type ProjectionPlane='xy'|'xz'|'yz'
const axes={
  xy:[0,1,2],xz:[0,2,1],yz:[1,2,0],
} as const

function hull(points:Point[]) {
  const sorted=points.sort((a,b)=>a.x-b.x||a.y-b.y)
  const unique=sorted.filter((p,i)=>i===0||Math.hypot(p.x-sorted[i-1].x,p.y-sorted[i-1].y)>1e-7)
  function half(list:Point[]) {
    const result:Point[]=[]
    for(const p of list) {
      while(result.length>=2) {
        const [a,b]=result.slice(-2)
        if((b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x)>1e-9)break
        result.pop()
      }
      result.push(p)
    }
    return result.slice(0,-1)
  }
  return unique.length<3?unique:[...half(unique),...half(unique.slice().reverse())]
}

function projectShape(item:SpatialBody,plane:ProjectionPlane,cut?:number):BodyConfig['geometry']|undefined {
  const [x,y,depth]=axes[plane]
  if(!item.geometry) {
    const offset=cut===undefined?0:item.position[depth]-cut
    if(Math.abs(offset)>=item.radius)return
    const radius=Math.sqrt(item.radius**2-offset**2)
    if(radius>=.02)return {kind:'circle',radius}
    return
  }
  const mesh=spatialMesh(item.geometry)
  const vertices=mesh.vertices.map(v=>rotateSpatialVector(v,item.orientation??[0,0,0,1]))
  let points=vertices.map(v=>({x:v[x],y:v[y]}))
  if(cut!==undefined) {
    const level=cut-item.position[depth]
    points=[]
    for(let i=0;i<mesh.indices.length;i+=3)for(let j=0;j<3;j++) {
      const a=vertices[mesh.indices[i+j]],b=vertices[mesh.indices[i+(j+1)%3]]
      const u=a[depth]-level,v=b[depth]-level
      if(Math.abs(u)<1e-8)points.push({x:a[x],y:a[y]})
      if(u*v>=0)continue
      const k=u/(u-v)
      points.push({x:a[x]+k*(b[x]-a[x]),y:a[y]+k*(b[y]-a[y])})
    }
  }
  const boundary=hull(points)
  if(boundary.length<3)return
  return boundary.length<=8?{kind:'polygon',vertices:boundary}:{kind:'freeform',closed:true,vertices:boundary}
}

export function projectSpatialExperiment(physics:import('./spatialPhysics').SpatialPhysics,plane:ProjectionPlane,section?:number) {
  const spatial=physics.state()
  const [x,y,depth]=axes[plane]
  const title=(spatial.title+(section===undefined?' · 二维投影':' · 二维截面')).slice(0,100)
  const scene={...emptyExperiment(),version:3 as const,title}
  const gravity=spatial.gravity
  if(gravity[x]===0&&gravity[y]<=0&&gravity[y]>=-100)scene.environment.gravity=-gravity[y]
  else scene.environment.gravity=0
  scene.environment.collisions=spatial.collisions
  scene.environment.boundaries=false
  scene.notes=`来源：三维实验「${spatial.title}」${physics.time.toFixed(3)} s，${plane.toUpperCase()} ${section===undefined?'投影':'截面 '+section+' m'}。此场景从 0 s 开始，保留可表达的轮廓、面内位置速度、法向角速度、质量和恢复系数。复杂网格用平面凸轮廓表示。原三维计时、轨迹、约束和场留在原工作台。`
  for(const item of spatial.bodies) {
    const geometry=projectShape(item,plane,section)
    if(!geometry)continue
    const normalSign=plane==='xz'?-1:1
    scene.bodies.push(makeBody(item.name,geometry,item.position[x],item.position[y],{
      mass:item.mass,restitution:item.restitution,friction:item.friction??0,
      type:item.fixed?'static':'dynamic',velocity:{x:item.velocity[x],y:item.velocity[y]},
      angularVelocity:item.angularVelocity[depth]*normalSign,
    }))
  }
  return decodeExperiment(scene)
}
