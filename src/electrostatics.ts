import { z } from 'zod'
import { cameraSchema, pointSchema, type Point } from './model'
import type { SavedExperiment } from './astronomy'

export const COULOMB_CONSTANT = 8.98755179e9
export const MAX_CHARGES = 16

const chargeSchema = z.object({
  id:z.string().min(1),
  position:pointSchema,
  nanocoulombs:z.number().min(-100).max(100),
})

export const electrostaticSchema = z.object({
  version:z.literal(1),
  domain:z.literal('electromagnetism'),
  title:z.string().trim().min(1).max(100),
  id:z.string().min(1),
  createdAt:z.iso.datetime(),
  updatedAt:z.iso.datetime(),
  charges:z.array(chargeSchema).max(MAX_CHARGES),
  probe:pointSchema,
  camera:cameraSchema,
  layers:z.object({lines:z.boolean(),vectors:z.boolean(),heat:z.boolean(),contours:z.boolean()}),
  contourStep:z.number().min(.1).max(1000),
}).refine(scene=>new Set(scene.charges.map(charge=>charge.id)).size===scene.charges.length,'电荷标识必须唯一。')

export type Charge = z.infer<typeof chargeSchema>
export type ElectrostaticExperiment = z.infer<typeof electrostaticSchema>

export function isElectrostatic(scene:SavedExperiment):scene is ElectrostaticExperiment {
  return 'domain' in scene && scene.domain==='electromagnetism' && !('extension' in scene)
}

export const electrostaticTemplates = [
  {id:'dipole',title:'电偶极子电场',description:'比较异号电荷之间的电场方向与电势。'},
  {id:'equipotential',title:'等势线',description:'观察同号电荷的电势叠加与等势线。'},
] as const

export function createElectrostaticExperiment(template:string|null):ElectrostaticExperiment {
  const now=new Date().toISOString()
  const preset=electrostaticTemplates.find(entry=>entry.id===template)
  const equipotential=preset?.id==='equipotential'
  return {
    version:1,domain:'electromagnetism',id:crypto.randomUUID(),title:preset?.title??'未命名静电实验',createdAt:now,updatedAt:now,
    charges:preset?[
      {id:crypto.randomUUID(),position:{x:-1.5,y:0},nanocoulombs:5},
      {id:crypto.randomUUID(),position:{x:1.5,y:0},nanocoulombs:equipotential?5:-5},
    ]:[],
    probe:{x:0,y:0},camera:{x:0,y:0,scale:82},contourStep:equipotential?20:10,
    layers:{lines:!equipotential,vectors:false,heat:equipotential,contours:true},
  }
}

export function sampleElectricField(charges:readonly Charge[], point:Point) {
  let x=0, y=0, potential=0
  for(const charge of charges) {
    if(charge.nanocoulombs===0)continue
    const dx=point.x-charge.position.x, dy=point.y-charge.position.y
    const radius=Math.hypot(dx,dy)
    if(radius===0)return null
    const term=COULOMB_CONSTANT*1e-9*charge.nanocoulombs/radius
    const field=term/radius
    x+=field*(dx/radius)
    y+=field*(dy/radius)
    potential+=term
  }
  const magnitude=Math.hypot(x,y)
  if(!Number.isFinite(magnitude)||!Number.isFinite(potential))return null
  return {x,y,potential,magnitude}
}

type Bounds = {left:number;right:number;bottom:number;top:number}

export function electricFieldLines(charges:readonly Charge[], bounds:Bounds, scale:number) {
  const active=charges.filter(charge=>charge.nanocoulombs!==0)
  if(!active.length)return []
  const maximum=Math.max(...active.map(charge=>Math.abs(charge.nanocoulombs)))
  const paths:Point[][]=[]
  const step=4.5/scale, core=9/scale
  const inside=(p:Point)=>p.x>=bounds.left&&p.x<=bounds.right&&p.y>=bounds.bottom&&p.y<=bounds.top
  function direction(point:Point) {
    const field=sampleElectricField(active,point)
    if(!field||field.magnitude<1e-10)return
    return {x:field.x/field.magnitude,y:field.y/field.magnitude}
  }
  for(const charge of active) {
    const sign=Math.sign(charge.nanocoulombs)
    const count=Math.max(3,Math.round(10*Math.abs(charge.nanocoulombs)/maximum))
    for(let seed=0;seed<count;seed++) {
      const angle=2*Math.PI*seed/count
      let point={x:charge.position.x+Math.cos(angle)*core,y:charge.position.y+Math.sin(angle)*core}
      if(!inside(point))continue
      const points=[point]
      let reachedOppositeCharge=false
      for(let index=0;index<260;index++) {
        const first=direction(point)
        if(!first)break
        const midpoint={x:point.x+sign*step*first.x/2,y:point.y+sign*step*first.y/2}
        const middle=direction(midpoint)
        if(!middle)break
        point={x:point.x+sign*step*middle.x,y:point.y+sign*step*middle.y}
        points.push(point)
        if(!inside(point))break
        if(active.some(other=>Math.sign(other.nanocoulombs)!==sign&&Math.hypot(point.x-other.position.x,point.y-other.position.y)<core)) {
          reachedOppositeCharge=true
          break
        }
      }
      if(points.length<3||sign<0&&reachedOppositeCharge)continue
      paths.push(sign<0?points.reverse():points)
    }
  }
  return paths
}

type Cell = readonly [number,number,number,number]

// Corners follow the cell clockwise from top left. Ambiguous saddles use the bilinear center value.
export function contourCell(values:Cell, level:number) {
  const corners=[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}]
  const edges:Point[]=[]
  for(let index=0;index<4;index++) {
    const next=(index+1)%4
    const a=values[index]-level, b=values[next]-level
    if((a>=0)===(b>=0))continue
    const ratio=a/(a-b), start=corners[index], end=corners[next]
    edges.push({x:start.x+ratio*(end.x-start.x),y:start.y+ratio*(end.y-start.y)})
  }
  if(edges.length===2)return [[edges[0],edges[1]]]
  if(edges.length===4) {
    const center=values.reduce((sum,value)=>sum+value,0)/4
    return (center>=level)===(values[0]>=level)?[[edges[0],edges[1]],[edges[2],edges[3]]]:[[edges[0],edges[3]],[edges[1],edges[2]]]
  }
  return []
}
