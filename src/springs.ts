import { rotate } from './coordinates'
import { body, type BodyConfig, type Point, type Spring } from './model'

export const connectionTools=[['spring','弹簧'],['rope','轻绳'],['massSpring','有质量弹簧'],['massRope','有质量绳'],['rod','刚性杆']] as const
export type ConnectionTool=typeof connectionTools[number][0]
export const connectionName=(joint:Spring)=>joint.connection==='rod'?'刚性杆':joint.connection==='rope'?'绳段':'弹簧'
export const connectionGroupName=(joint:Spring)=>joint.connection==='rope'?'有质量绳':'有质量弹簧'

export function connectionAssembly(scene:{joints:Spring[];bodies:BodyConfig[]},id:string) {
  const joints=scene.joints.filter(j=>j.group===id)
  if(!joints.length)return
  const uses=new Map<string,number>()
  for(const {a,b} of joints)for(const endpoint of [a,b])uses.set(endpoint,(uses.get(endpoint)??0)+1)
  const nodes=scene.bodies.filter(body=>(uses.get(body.id)??0)>1)
  return {joints,nodes,ids:[...uses.keys()],
    length:joints.reduce((total,joint)=>total+joint.restLength,0),
    mass:nodes.reduce((total,node)=>total+node.mass,0)}
}

export function makeConnection(kind:ConnectionTool,a:{id:string;world:Point;local:Point},b:typeof a) {
  const distance=Math.hypot(b.world.x-a.world.x,b.world.y-a.world.y)
  if(distance<.1)return
  const segments=kind==='massSpring'||kind==='massRope'?Math.min(6,Math.floor(distance/.05)):1
  const group=segments>1?crypto.randomUUID():undefined
  const nodes=Array.from({length:segments-1},(_,i)=>{
    const t=(i+1)/segments
    return body(kind==='massSpring'?'弹簧质量节点':'绳质量节点',{kind:'circle',radius:.02},
      a.world.x+(b.world.x-a.world.x)*t,a.world.y+(b.world.y-a.world.y)*t,{mass:.1/(segments-1),color:'amber'})
  })
  const ends=[a,...nodes.map(node=>({id:node.id,world:node.position,local:{x:0,y:0}})),b]
  const joints=ends.slice(1).map((next,i):Spring=>({
    id:crypto.randomUUID(),a:ends[i].id,b:next.id,anchorA:ends[i].local,anchorB:next.local,
    restLength:distance/segments,stiffness:40*segments,damping:.15,role:'constraint',
    connection:kind==='rope'||kind==='massRope'?'rope':kind==='rod'?'rod':undefined,group,
  }))
  return {nodes,joints}
}

function anchorWorld(body:BodyConfig,local:Point):Point {
  const offset=rotate(local,body.angle)
  return {x:body.position.x+offset.x,y:body.position.y+offset.y}
}

export function springGeometry(a:BodyConfig,b:BodyConfig,spring:Spring) {
  const wa=anchorWorld(a,spring.anchorA),wb=anchorWorld(b,spring.anchorB)
  const dx=wb.x-wa.x,dy=wb.y-wa.y
  const length=Math.hypot(dx,dy)
  return {length, direction:length>1e-8?{x:dx/length,y:dy/length}:{x:1,y:0}}
}

export function setInitialExtension(a:BodyConfig,b:BodyConfig,spring:Spring,extension:number):BodyConfig {
  const {length,direction}=springGeometry(a,b,spring)
  const moveB=b.type==='dynamic'
  const moved=moveB?b:a
  const offset=(spring.restLength+extension-length)*(moveB?1:-1)
  return {...moved,position:{x:moved.position.x+direction.x*offset,y:moved.position.y+direction.y*offset}}
}
