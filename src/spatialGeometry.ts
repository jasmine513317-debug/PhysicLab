import { z } from 'zod'
import { triangulate } from './freeform'
import type { Point } from './model'
import type { Vec3 } from './spatialPhysics'

const size=z.number().min(.002).max(1e5)
const point=z.tuple([z.number().min(-1e5).max(1e5),z.number().min(-1e5).max(1e5),z.number().min(-1e5).max(1e5)])
export const spatialGeometrySchema=z.discriminatedUnion('kind',[
  z.object({kind:z.literal('box'),size:z.tuple([size,size,size])}),
  z.object({kind:z.literal('cylinder'),radius:size,height:size}),
  z.object({kind:z.literal('cone'),radius:size,height:size}),
  z.object({kind:z.literal('mesh'),vertices:z.array(point).min(3).max(1024),indices:z.array(z.number().int().min(0).max(1023)).min(3).max(6144)})
    .refine(mesh=>mesh.indices.length%3===0&&mesh.indices.every(index=>index<mesh.vertices.length),'网格索引无效。'),
])
export type SpatialGeometry=z.infer<typeof spatialGeometrySchema>
type Mesh={vertices:Vec3[];indices:number[]}

export function spatialMesh(shape:SpatialGeometry):Mesh {
  if(shape.kind==='mesh')return shape
  if(shape.kind==='box') {
    const [x,y,z]=shape.size.map(value=>value/2)
    return {
      vertices:[[-x,-y,-z],[x,-y,-z],[x,y,-z],[-x,y,-z],[-x,-y,z],[x,-y,z],[x,y,z],[-x,y,z]],
      indices:[0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,3,7,6,3,6,2,0,4,7,0,7,3,1,2,6,1,6,5],
    }
  }
  const count=24,base=-shape.height/2,top=-base
  const ring=(y:number)=>Array.from({length:count},(_,i):Vec3=>{
    const angle=2*Math.PI*i/count
    return [shape.radius*Math.cos(angle),y,shape.radius*Math.sin(angle)]
  })
  const vertices=[...ring(base),...(shape.kind==='cone'?[[0,top,0] as Vec3]:ring(top))]
  const indices:number[]=[]
  for(let i=1;i<count-1;i++) {
    indices.push(0,i,i+1)
    if(shape.kind==='cylinder')indices.push(count,count+i+1,count+i)
  }
  for(let i=0;i<count;i++) {
    const next=(i+1)%count
    if(shape.kind==='cone')indices.push(i,count,next)
    else indices.push(i,i+count,next,i+count,next+count,next)
  }
  return {vertices,indices}
}

export function meshRadius(shape:SpatialGeometry) {
  if(shape.kind==='box')return Math.hypot(...shape.size)/2
  if(shape.kind!=='mesh')return Math.hypot(shape.radius,shape.height/2)
  return Math.max(...shape.vertices.map(vertex=>Math.hypot(...vertex)))
}

export function extrudeContour(contour:Point[],depth:number):SpatialGeometry {
  const cap=triangulate(contour)
  if(!cap.length)throw new Error('需要可三角化的闭合轮廓。')
  const n=contour.length
  const vertices=[...contour.map(({x,y}):Vec3=>[x,y,-depth/2]),...contour.map(({x,y}):Vec3=>[x,y,depth/2])]
  const indices:number[]=[]
  for(const triangle of cap) {
    const [a,b,c]=triangle.map(p=>contour.findIndex(other=>other.x===p.x&&other.y===p.y))
    indices.push(c,b,a,a+n,b+n,c+n)
  }
  for(let i=0;i<n;i++) {
    const j=(i+1)%n
    indices.push(i,j,j+n,i,j+n,i+n)
  }
  return spatialGeometrySchema.parse({kind:'mesh',vertices,indices})
}

export function revolveProfile(profile:Point[]):SpatialGeometry {
  if(profile.length<2||profile.length>32||profile.some(p=>p.x<=0)||profile.some((p,i)=>i>0&&p.y<=profile[i-1].y))
    throw new Error('旋转母线需要 2–32 个半径为正且高度递增的点。')
  const sides=24
  const vertices=profile.flatMap(({x:radius,y})=>Array.from({length:sides},(_,i):Vec3=>{
    const angle=2*Math.PI*i/sides
    return [radius*Math.cos(angle),y,radius*Math.sin(angle)]
  }))
  const indices:number[]=[]
  for(let j=0;j<profile.length-1;j++)for(let i=0;i<sides;i++) {
    const a=j*sides+i,b=j*sides+(i+1)%sides
    indices.push(a,a+sides,b,a+sides,b+sides,b)
  }
  const cap=(profile.length-1)*sides
  for(let i=1;i<sides-1;i++)indices.push(0,i,i+1,cap,cap+i+1,cap+i)
  return spatialGeometrySchema.parse({kind:'mesh',vertices,indices})
}

export function spatialRibbon(path:Vec3[],width:number,sideAxis?:'x'|'z'):SpatialGeometry {
  if(path.length<2||path.length>256||width<.002||!Number.isFinite(width))throw new Error('轨道需要至少两个坐标点和有效宽度。')
  const vertices=path.flatMap(([x,y,z],i)=>{
    if(sideAxis==='x')return [[x+width/2,y,z],[x-width/2,y,z]] as Vec3[]
    if(sideAxis==='z')return [[x,y,z+width/2],[x,y,z-width/2]] as Vec3[]
    const a=path[Math.max(0,i-1)],b=path[Math.min(path.length-1,i+1)]
    const dx=b[0]-a[0],dz=b[2]-a[2],span=Math.hypot(dx,dz)
    if(span<1e-6)throw new Error('轨道路段在水平面上的方向必须明确。')
    const u=-dz/span*width/2,v=dx/span*width/2
    return [[x+u,y,z+v],[x-u,y,z-v]] as Vec3[]
  })
  const indices=path.slice(1).flatMap((_,i)=>[2*i,2*i+2,2*i+1,2*i+1,2*i+2,2*i+3])
  return spatialGeometrySchema.parse({kind:'mesh',vertices,indices})
}
