import { z } from 'zod'
import { freeformError, polygonArea, TRACK_VERTEX_LIMIT, trackError } from './track'
import { PHYSICS_HZ } from './simulation'

export const FIXED_TIME_STEP = 1 / PHYSICS_HZ

z.config(z.locales.zhCN())

const finite = z.number().min(-10000).max(10000)
const positive = z.number().min(0.02).max(1000)
const id = z.string().min(1)
export const pointSchema = z.object({ x: finite, y: finite })
export type Point = z.infer<typeof pointSchema>
export const paletteColorSchema = z.enum(['mint','blue','amber','slate'])
export const bodyColorSchema = z.union([paletteColorSchema,z.string().regex(/^#[0-9a-fA-F]{6}$/,'颜色必须使用 #RRGGBB 格式。')])
export type BodyColor = z.infer<typeof bodyColorSchema>
const geometry = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('circle'), radius: positive }),
  z.object({ kind: z.literal('ellipse'), radiusX: positive, radiusY: positive }),
  z.object({ kind: z.literal('rectangle'), width: positive, height: positive }),
  z.object({ kind: z.literal('surface'), width: positive, height: positive }),
  z.object({ kind:z.literal('track'), vertices:z.array(pointSchema).min(2).max(TRACK_VERTEX_LIMIT), closed:z.boolean() })
    .superRefine(({vertices,closed},ctx)=>{
      if(vertices.length>TRACK_VERTEX_LIMIT)return
      const message=trackError(vertices,closed)
      if(message)ctx.addIssue({code:'custom',message})
    }),
  z.object({ kind:z.literal('freeform'), vertices:z.array(pointSchema).min(2).max(TRACK_VERTEX_LIMIT), closed:z.boolean() })
    .superRefine(({vertices,closed},ctx)=>{
      if(vertices.length>TRACK_VERTEX_LIMIT)return
      const message=freeformError(vertices,closed)
      if(message)ctx.addIssue({code:'custom',message})
    }),
  z.object({ kind: z.literal('polygon'), vertices: z.array(pointSchema).min(3).max(8) }).refine(
    ({vertices}) => isConvexPolygon(vertices),'请绘制由 3 至 8 个不同顶点组成的简单凸多边形。',
  ),
])
export function isConvexPolygon(vertices:Point[]) {
  if(vertices.length<3||vertices.length>8)return false
  // A strictly convex winding rules out degenerate and self-intersecting input.
  const side=Math.sign(turn(vertices[0],vertices[1],vertices[2]))
  return side!==0&&vertices.every((a,i)=>{
    const next=(i+1)%vertices.length
    return vertices.every((p,j)=>j===i||j===next||turn(a,vertices[next],p)*side>0.00001)
  })
}

function turn(a: Point, b: Point, c: Point) {
  return (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x)
}
export const objectRoleSchema=z.enum(['marker','body','boundary','track','constraint','field'])
export type ObjectRole=z.infer<typeof objectRoleSchema>
export const inkProvenanceSchema=z.object({
  source:z.literal('ink'),raw:z.array(pointSchema).max(1200),regularized:z.boolean(),
  confidence:z.number().min(0).max(1),fitError:z.number().min(0),sampleDensity:z.number().min(0),
})
export const bodySchema = z.object({
  id, name: z.string().trim().min(1).max(80), type: z.enum(['static','dynamic']),
  position: pointSchema, angle: finite, velocity: pointSchema, angularVelocity: finite,
  mass: z.number().min(0.001).max(100000), friction: z.number().min(0).max(10),
  restitution: z.number().min(0).max(1), geometry,
  color: bodyColorSchema,
  strokeWidth: z.number().min(1).max(8).optional(),
  role:objectRoleSchema.optional(),charge:z.number().min(-1000).max(1000).optional(),provenance:inkProvenanceSchema.optional(),
  contactSide:z.enum(['both','left','right']).optional(),
  surfaceLine:z.literal(true).optional(),
  rail:z.string().min(1).optional(),
}).refine(b => b.role!=='constraint','约束必须使用弹簧连接，不能作为独立物体。')
.refine(b => !b.surfaceLine || b.geometry.kind==='surface','线段地面需要表面几何。')
.refine(b => !b.contactSide || b.surfaceLine || b.geometry.kind==='track','碰撞侧只适用于线段地面与轨道。')
.refine(b => (b.geometry.kind !== 'surface'&&b.geometry.kind!=='track') || b.type === 'static', '表面和轨道必须设为静态。')
.refine(b => b.type==='static' || !b.role || b.role==='body','标记、边界、轨道和场源必须设为静态。')
.refine(b => !b.role || !['marker','boundary','track','field'].includes(b.role) || !['surface'].includes(b.geometry.kind),'此角色不支持表面几何。')
.refine(b => b.geometry.kind!=='ellipse'||b.role==='body','椭圆刚体需要版本 3 的物体角色。')
.refine(b => b.role!=='track'||b.geometry.kind==='track','轨道角色必须使用链式轨道几何。')
  .refine(b => b.geometry.kind!=='freeform' || b.geometry.closed || b.type==='static', '开放式手绘曲线必须设为静态。')
  .refine(b => b.geometry.kind!=='freeform' || b.type!=='dynamic' || !freeformError(b.geometry.vertices,b.geometry.closed,true), '动态物块必须使用无自相交的封闭曲线。')
export const springSchema = z.object({
  id, a: id, b: id, anchorA: pointSchema, anchorB: pointSchema,
  stiffness: z.number().min(0.01).max(100000), damping: z.number().min(0).max(5), restLength: positive,
  role:z.literal('constraint').optional(),
})
export const DEFAULT_WORLD_BOUNDS={minX:-11.9,maxX:11.9,minY:-0.9,maxY:18.9}
// Presets only fill in the gravity field; they are not a separate simulation mode.
export const GRAVITY_PRESETS=[
  {name:'地球',gravity:9.81,note:'地表附近的重力加速度'},
  {name:'月球',gravity:1.62,note:'约为地球的六分之一'},
  {name:'火星',gravity:3.71,note:'火星表面附近'},
  {name:'失重',gravity:0,note:'不考虑重力，观察惯性运动'},
] as const
const worldBoundsSchema=z.object({minX:finite,maxX:finite,minY:finite,maxY:finite}).refine(
  b=>b.maxX-b.minX>=0.2&&b.maxY-b.minY>=0.2,'边界的最大值必须比最小值至少大 0.2 m。',
)
export const environmentSchema = z.object({
  gravity: z.number().min(0).max(100), speed: z.number().min(0.1).max(4),
  gravityAngle:z.number().min(-360).max(360).optional(), linearDrag:z.number().min(0).max(20).optional(),
  boundaries: z.boolean(), worldBounds:worldBoundsSchema.optional(),
  collisions: z.boolean(), timeStep: z.literal(FIXED_TIME_STEP),
})
export function gravityVector(env:Experiment['environment']):Point {
  if(env.gravityAngle===undefined||env.gravityAngle===-90)return {x:0,y:-env.gravity}
  const angle=env.gravityAngle*Math.PI/180
  return {x:env.gravity*Math.cos(angle),y:env.gravity*Math.sin(angle)}
}
export const cameraSchema = z.object({ x: finite, y: finite, scale: z.number().min(5).max(400) })
export const coordinatesSchema = z.object({
  mode: z.enum(['cartesian','polar','none']),
  origin: pointSchema,
})
export type Coordinates = z.infer<typeof coordinatesSchema>
export const defaultCoordinates: Coordinates = {mode:'cartesian',origin:{x:0,y:0}}
export const experimentSchema = z.object({
  id, version: z.union([z.literal(1),z.literal(2),z.literal(3)]), title: z.string().trim().min(1).max(100), description: z.string(),
  createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(), notes: z.string().max(10000),
  kind: z.enum(['custom','projectile','spring','collision','friction','fall']),
  environment: environmentSchema, camera: cameraSchema, coordinates: coordinatesSchema.default(defaultCoordinates),
  physicalMode:z.enum(['strict','free']).optional(),
  bodies: z.array(bodySchema).max(100), joints: z.array(springSchema).max(200),
}).superRefine((scene, ctx) => {
  if(scene.version<3&&scene.physicalMode)ctx.addIssue({code:'custom',message:'物理模式需要版本 3 的实验文件。'})
  if(scene.version===1&&scene.bodies.some(body=>body.geometry.kind==='track'||body.geometry.kind==='freeform')) {
    ctx.addIssue({code:'custom',message:'手绘图形和曲线轨道需要使用版本 2 的实验文件。'})
  }
  if(scene.version<3&&(scene.bodies.some(body=>body.role||body.provenance||body.charge!==undefined||body.geometry.kind==='ellipse'||body.surfaceLine||body.contactSide||body.rail)||scene.joints.some(joint=>joint.role))) {
    ctx.addIssue({code:'custom',message:'对象角色、场源和识别来源需要使用版本 3 的实验文件。'})
  }
  if(scene.version===3&&scene.bodies.some(body=>body.role==='field'&&body.charge===undefined))ctx.addIssue({code:'custom',message:'场源必须设置电荷量。'})
  const bodies = new Map(scene.bodies.map(body => [body.id, body]))
  for(const body of scene.bodies)if(body.rail) {
    const track=bodies.get(body.rail)
    if(body.type!=='dynamic'||body.geometry.kind!=='circle'||track?.geometry.kind!=='track'||track.role==='marker'||track.role==='field'
      ||scene.joints.some(joint=>joint.a===body.id||joint.b===body.id))
      ctx.addIssue({code:'custom',message:'理想轨道需要未连接弹簧的动态圆形物体和静态链式轨道。'})
  }
  if (bodies.size !== scene.bodies.length || new Set(scene.joints.map(j => j.id)).size !== scene.joints.length) {
    ctx.addIssue({code:'custom', message:'物体和弹簧各自的标识必须唯一。'})
  }
  for (const j of scene.joints) {
    const a = bodies.get(j.a), b = bodies.get(j.b)
    if (!a || !b || j.a === j.b || (a.type === 'static' && b.type === 'static')) {
      ctx.addIssue({code:'custom', message:'弹簧必须连接两个不同的物体，且至少一个是动态物体。'})
    } else if (springFrequency(j.stiffness, a, b) >= 30) {
      ctx.addIssue({code:'custom', message:'弹簧频率必须低于 30 Hz。请降低刚度或增加质量。'})
    }
  }
})
export type Experiment = z.infer<typeof experimentSchema>
export type BodyConfig = z.infer<typeof bodySchema>
export type Spring = z.infer<typeof springSchema>
export type Camera = z.infer<typeof cameraSchema>

export function springFrequency(k: number, a: BodyConfig, b: BodyConfig) {
  const inverseMass = (a.type === 'dynamic' ? 1/a.mass : 0) + (b.type === 'dynamic' ? 1/b.mass : 0)
  return Math.sqrt(k * inverseMass)/(2 * Math.PI)
}

export function area(g: BodyConfig['geometry']) {
  if (g.kind === 'track') return 0
  if (g.kind === 'ellipse') return Math.PI*g.radiusX*g.radiusY
  if (g.kind === 'freeform') return g.closed?polygonArea(g.vertices):0
  if (g.kind === 'circle') return Math.PI * g.radius ** 2
  if (g.kind !== 'polygon') return g.width * g.height
  return polygonArea(g.vertices)
}
export function body(name: string, geometry: BodyConfig['geometry'], x: number, y: number, values: Partial<BodyConfig> = {}): BodyConfig {
  const fixed=geometry.kind==='surface'||geometry.kind==='track'
  return {
    id: crypto.randomUUID(), name, geometry, type: fixed ? 'static' : 'dynamic',
    color: fixed ? 'slate' : 'mint', position:{x,y}, angle:0,
    velocity:{x:0,y:0}, angularVelocity:0, mass:1, friction:0.3, restitution:0.35, ...values,
  }
}
export function emptyExperiment(): Experiment {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(), version:1, title:'未命名实验', description:'', notes:'',
    kind:'custom', createdAt:now, updatedAt:now, bodies:[], joints:[],
    environment:{gravity:9.81, speed:1, boundaries:false, collisions:true, timeStep:FIXED_TIME_STEP},
    camera:{x:0,y:2.2,scale:80}, coordinates:{...defaultCoordinates,origin:{...defaultCoordinates.origin}},
  }
}
const experimentDecoders: Record<number, (value: unknown) => Experiment> = {
  1: value => experimentSchema.parse(value),
  2: value => experimentSchema.parse(value),
  3: value => experimentSchema.parse(value),
}

export function decodeExperiment(value: unknown): Experiment {
  const version=value&&typeof value==='object'?(value as {version?:unknown}).version:undefined
  if(!Number.isInteger(version))throw new Error('实验文件缺少有效版本号。')
  const decode=experimentDecoders[version as number]
  if(!decode)throw new Error(`暂不支持实验文件版本 ${String(version)}。请升级 PhysicLab Studio。`)
  return decode(value)
}
