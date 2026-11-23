import { z } from 'zod'
import { freeformError, polygonArea, TRACK_VERTEX_LIMIT, trackError } from './track'

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
export const bodySchema = z.object({
  id, name: z.string().trim().min(1).max(80), type: z.enum(['static','dynamic']),
  position: pointSchema, angle: finite, velocity: pointSchema, angularVelocity: finite,
  mass: z.number().min(0.001).max(100000), friction: z.number().min(0).max(10),
  restitution: z.number().min(0).max(1), geometry,
  color: bodyColorSchema,
}).refine(b => (b.geometry.kind !== 'surface'&&b.geometry.kind!=='track') || b.type === 'static', '表面和轨道必须设为静态。')
  .refine(b => b.geometry.kind!=='freeform' || b.geometry.closed || b.type==='static', '开放式手绘曲线必须设为静态。')
  .refine(b => b.geometry.kind!=='freeform' || b.type!=='dynamic' || !freeformError(b.geometry.vertices,b.geometry.closed,true), '动态物块必须使用无自相交的封闭曲线。')
export const springSchema = z.object({
  id, a: id, b: id, anchorA: pointSchema, anchorB: pointSchema,
  stiffness: z.number().min(0.01).max(100000), damping: z.number().min(0).max(5), restLength: positive,
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
  boundaries: z.boolean(), worldBounds:worldBoundsSchema.optional(),
  collisions: z.boolean(), timeStep: z.literal(1 / 60),
})
export const cameraSchema = z.object({ x: finite, y: finite, scale: z.number().min(5).max(400) })
export const experimentSchema = z.object({
  id, version: z.union([z.literal(1),z.literal(2)]), title: z.string().trim().min(1).max(100), description: z.string(),
  createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(), notes: z.string().max(10000),
  kind: z.enum(['custom','projectile','spring','collision','friction','fall']),
  environment: environmentSchema, camera: cameraSchema,
  bodies: z.array(bodySchema).max(100), joints: z.array(springSchema).max(200),
}).superRefine((scene, ctx) => {
  if(scene.version===1&&scene.bodies.some(body=>body.geometry.kind==='track'||body.geometry.kind==='freeform')) {
    ctx.addIssue({code:'custom',message:'手绘图形和曲线轨道需要使用版本 2 的实验文件。'})
  }
  const bodies = new Map(scene.bodies.map(body => [body.id, body]))
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
    environment:{gravity:9.81, speed:1, boundaries:false, collisions:true, timeStep:1/60},
    camera:{x:0,y:2.2,scale:80},
  }
}
export function decodeExperiment(value: unknown): Experiment {
  return experimentSchema.parse(value)
}
