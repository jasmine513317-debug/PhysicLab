import { z } from 'zod'
import { experimentSchema } from './model'
import { interventionSchema } from './interventions'
import { spatialRunSchema } from './spatialPhysics'
import { vectorKinds } from './spatialVectors'

const scalar=z.number().min(-1e18).max(1e18)
const point=z.tuple([scalar,scalar,scalar])
const switches=z.object({
  grid:z.boolean(),reference:z.boolean(),trails:z.boolean(),velocity:z.boolean(),acceleration:z.boolean(),forces:z.boolean(),
  vectorScale:z.number().positive().max(10),vectorLabels:z.enum(['none','name','magnitude','components']).optional(),
  extraVectors:z.partialRecord(z.enum(['displacement','momentum','netForce','omega','impulse','electric']),z.boolean()).optional(),
  unitScale:z.partialRecord(z.enum(['m','m/s','m/s²','kg·m/s','N','N·s','N/C']),z.number().positive().max(10)).optional(),
  hiddenForces:z.array(z.string()).max(30).optional(),
})
export const dataViewSchema=z.object({
  abscissa:z.string(),ordinate:z.string(),subjectId:z.string(),compareId:z.string(),
  extra:z.array(z.string()).max(3),start:z.string(),end:z.string(),
})
export type DataView=z.infer<typeof dataViewSchema>
export const planarBranchSchema=z.object({
  scene:experimentSchema,
  timeline:z.object({tick:z.number().int().min(0).max(2_160_000),events:z.array(interventionSchema).max(20000)}),
  display:switches.optional(),
  analysis:dataViewSchema.optional(),
}).superRefine(({scene,timeline},ctx)=>{
  const dynamic=new Set(scene.bodies.filter(body=>body.type==='dynamic').map(body=>body.id))
  if(timeline.events.some((event,i)=>!dynamic.has(event.bodyId)||event.tick>timeline.tick||
    i>0&&event.tick<timeline.events[i-1].tick||Math.abs(event.tick*scene.environment.timeStep-event.time)>1e-9))
    ctx.addIssue({code:'custom',message:'二维运行记录与场景不匹配。'})
})
export type PlanarBranch=z.infer<typeof planarBranchSchema>
export const spatialViewSchema=z.object({
  camera:z.object({yaw:scalar,pitch:z.number().min(-1.57).max(1.57),distance:z.number().min(.1).max(1e14),
    focus:point,mode:z.enum(['orbit','first','xy'])}),
  trail:z.enum(['off','history','prediction','both']),trailWindow:z.number().positive().max(31557600),vectors:z.boolean(),
  trailCount:z.number().int().min(10).max(1800).optional(),
  color:z.string().regex(/^#[a-f0-9]{6}$/i),alpha:z.number().min(.15).max(1),markers:z.boolean(),
  analysis:dataViewSchema.optional(),
  vectorView:z.object({kinds:z.array(z.enum(vectorKinds)).max(vectorKinds.length),
    labels:z.enum(['name','size','components','none']),scales:z.record(z.string(),z.number().min(.01).max(100)),
  }).optional(),
  observation:z.object({
    selected:z.string().optional(),reference:z.enum(['world','com','body','target']),
    originMode:z.enum(['world','manual','body']),origin:point,gridOpacity:z.number().min(.1).max(1),
    showAxes:z.boolean().optional(),showGrid:z.boolean().optional(),lensRays:z.boolean(),compare:z.boolean(),
  }).optional(),
})
export const workspaceSchema=z.object({
  kind:z.literal('physiclab-unified-workspace'),version:z.literal(1),
  planar:planarBranchSchema,spatial:spatialRunSchema,view:spatialViewSchema,
  numerics:z.object({fixedStepSeconds:z.literal(1/60),rigidSubsteps:z.literal(4),randomSeed:z.null()}).optional(),
})
export type SpatialWorkspace=z.infer<typeof workspaceSchema>
