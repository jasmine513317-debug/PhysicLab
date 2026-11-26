import { z } from 'zod'
import { body, decodeExperiment, emptyExperiment, pointSchema, type Point } from './model'
import { compileExpression } from './geometry-expression'
import { triangulate } from './freeform'
import { withObjectRole, type EditableRole } from './objectRole'
import { freeformError, segmentDistance, simplifyPath, trackError } from './track'

const nodeSchema=z.object({point:pointSchema,in:pointSchema,out:pointSchema})
const rangeValue=z.number().min(-100).max(100)
const expression=z.string().max(240)
const range=z.object({min:rangeValue,max:rangeValue})
const projectSchema=z.object({
  version:z.literal(1),title:z.string().trim().min(1).max(70),
  mode:z.enum(['bezier','function','parametric','polar','surface']),
  nodes:z.array(nodeSchema).max(128),closed:z.boolean(),
  dashed:z.boolean().default(false),
  function:z.object({expression,range,samples:z.number().int().min(16).max(512)}),
  parametric:z.object({x:expression,y:expression,range,samples:z.number().int().min(16).max(512),closed:z.boolean()}),
  polar:z.object({expression,range,samples:z.number().int().min(16).max(512),closed:z.boolean()}),
  surface:z.object({expression,x:range,y:range,divisions:z.number().int().min(8).max(48)}),
})

export type GeometryProject=z.infer<typeof projectSchema>
export type CurveNode=z.infer<typeof nodeSchema>
export type GeometryMode=GeometryProject['mode']
export type Vector3=Point&{z:number}
export type Mesh={vertices:(Vector3|null)[]; faces:[number,number,number][]}
export const geometryModes:readonly [GeometryMode,string][]=[
  ['bezier','手绘与贝塞尔'],['function','函数曲线'],['parametric','参数曲线'],['polar','极坐标'],['surface','三维曲面'],
]

export function defaultGeometry():GeometryProject {
  return {
    version:1,title:'未命名几何',mode:'bezier',closed:false,dashed:false,
    nodes:[
      {point:{x:-4,y:2.4},in:{x:-4,y:2.4},out:{x:-2.8,y:2.1}},
      {point:{x:0,y:0},in:{x:-1.6,y:0},out:{x:1.6,y:0}},
      {point:{x:4,y:1.8},in:{x:2.8,y:1.1},out:{x:4,y:1.8}},
    ],
    function:{expression:'0.16*x^2',range:{min:-5,max:5},samples:96},
    parametric:{x:'4*cos(t)',y:'2.5*sin(t)',range:{min:0,max:2*Math.PI},samples:96,closed:true},
    polar:{expression:'2+0.7*cos(3*theta)',range:{min:0,max:2*Math.PI},samples:96,closed:true},
    surface:{expression:'sin(x)*cos(y)',x:{min:-4,max:4},y:{min:-4,max:4},divisions:24},
  }
}

export function decodeGeometry(value:unknown) {
  return projectSchema.parse(value)
}

export function corner(point:Point):CurveNode {
  return {point,in:point,out:point}
}

export function moveNode(node:CurveNode,key:keyof CurveNode,position:Point):CurveNode {
  if(key!=='point')return {...node,[key]:position}
  const shift=(p:Point)=>({x:p.x+position.x-node.point.x,y:p.y+position.y-node.point.y})
  return {point:position,in:shift(node.in),out:shift(node.out)}
}

function distance(a:Point,b:Point) {return Math.hypot(a.x-b.x,a.y-b.y)}
function midpoint(a:Point,b:Point) {return {x:(a.x+b.x)/2,y:(a.y+b.y)/2}}

export function insertNode(nodes:CurveNode[],index:number,closed:boolean):CurveNode[] {
  const a=nodes[index],b=nodes[index+1]??(closed?nodes[0]:undefined)
  if(!a||!b||a===b)return [...nodes,corner(a?{x:a.point.x+1,y:a.point.y}:{x:0,y:0})]
  const ab=midpoint(a.point,a.out),bc=midpoint(a.out,b.in),cd=midpoint(b.in,b.point)
  const left=midpoint(ab,bc),right=midpoint(bc,cd)
  const next=[...nodes]
  next[index]={...a,out:ab}
  next[(index+1)%nodes.length]={...b,in:cd}
  next.splice(index+1,0,{point:midpoint(left,right),in:left,out:right})
  return next
}

export const primitives=[['point','点'],['line','线段'],['polyline','折线'],['circle','圆'],['ellipse','椭圆'],['rectangle','矩形'],['polygon','多边形']] as const

export function primitive(kind:typeof primitives[number][0]) {
  if(kind==='circle'||kind==='ellipse') {
    const k=4*(Math.SQRT2-1)/3, rx=3, ry=kind==='circle'?rx:1.7
    const nodes=[0,1,2,3].map(i=>{
      const t=i*Math.PI/2,p={x:rx*Math.cos(t),y:ry*Math.sin(t)},d={x:-rx*Math.sin(t)*k,y:ry*Math.cos(t)*k}
      return {point:p,in:{x:p.x-d.x,y:p.y-d.y},out:{x:p.x+d.x,y:p.y+d.y}}
    })
    return {nodes,closed:true}
  }
  const presets={point:[[0,0]],line:[[-3,0],[3,0]],polyline:[[-3,1],[0,0],[3,1]],
    rectangle:[[-3,-1.6],[3,-1.6],[3,1.6],[-3,1.6]],polygon:[[-3,-1],[1,-2],[3,0],[1.5,2],[-2.5,1.7]]}
  return {nodes:presets[kind].map(([x,y])=>corner({x,y})),closed:kind==='rectangle'||kind==='polygon'}
}

export function fitStroke(points:Point[]):CurveNode[] {
  const spaced:Point[]=[]
  for(const point of points) {
    if(!spaced.length||distance(point,spaced.at(-1)!)>=0.025)spaced.push(point)
  }
  let tolerance=0.055
  let anchors=simplifyPath(spaced,tolerance)
  while(anchors.length>128)anchors=simplifyPath(spaced,tolerance*=1.5)
  return anchors.map((p,i)=>{
    const left=anchors[i-1]??p,right=anchors[i+1]??p
    const n=distance(left,right)
    const handle=(other:Point,sign:number)=>({x:p.x+sign*(right.x-left.x)*distance(p,other)/(3*(n||1)),y:p.y+sign*(right.y-left.y)*distance(p,other)/(3*(n||1))})
    return {point:p,in:handle(left,-1),out:handle(right,1)}
  })
}

function flattenBezier(nodes:CurveNode[],closed:boolean,tolerance:number) {
  if(!nodes.length)return []
  const points=[nodes[0].point]
  function flatten(a:Point,b:Point,c:Point,d:Point,depth:number) {
    if(Math.max(segmentDistance(b,a,d),segmentDistance(c,a,d))<=tolerance) {
      points.push(d)
      return
    }
    if(depth>=14||points.length>16000)throw new Error('曲线过于复杂。请调整控制柄或提高容差。')
    const ab=midpoint(a,b),bc=midpoint(b,c),cd=midpoint(c,d),abc=midpoint(ab,bc),bcd=midpoint(bc,cd),middle=midpoint(abc,bcd)
    flatten(a,ab,abc,middle,depth+1)
    flatten(middle,bcd,cd,d,depth+1)
  }
  for(let i=0;i<nodes.length-(closed?0:1);i++) {
    const a=nodes[i],b=nodes[(i+1)%nodes.length]
    flatten(a.point,a.out,b.in,b.point,0)
  }
  return points
}

function checkRange({min,max}:{min:number;max:number}) {
  if(!(min<max))throw new Error('定义域的上限必须大于下限。')
}

function validPoint(p:Point) {
  return Number.isFinite(p.x)&&Number.isFinite(p.y)&&Math.abs(p.x)<=10000&&Math.abs(p.y)<=10000
}

function sampleExpression(evaluate:(t:number)=>Point,range:{min:number;max:number},samples:number,tolerance:number,requireContinuous:boolean) {
  checkRange(range)
  const paths:Point[][]=[]
  const checked=(t:number)=>{const point=evaluate(t);return validPoint(point)?point:undefined}
  let count=0
  let gap=false
  function sample(a:number,pa:Point|undefined,b:number,pb:Point|undefined,depth:number) {
    const m=(a+b)/2,pm=checked(m)
    if(!pa&&!pm&&!pb) {gap=true;return}
    if(pa&&pm&&pb&&segmentDistance(pm,pa,pb)<=tolerance
      &&distance(pm,midpoint(pa,pb))<=Math.max(tolerance,distance(pa,pb)*0.1)) {
      const left=checked((a+m)/2),right=checked((m+b)/2)
      if(left&&right&&segmentDistance(left,pa,pb)<=tolerance&&segmentDistance(right,pa,pb)<=tolerance) {
        const path=paths.at(-1)
        if(path?.at(-1)===pa)path.push(pb)
        else paths.push([pa,pb])
        if(++count>16000)throw new Error('曲线采样过密。请缩小定义域或提高容差。')
        return
      }
    }
    if(depth===8 || Math.abs(b-a)<1e-8) {gap=true;return}
    sample(a,pa,m,pm,depth+1)
    sample(m,pm,b,pb,depth+1)
  }
  let a=range.min,pa=checked(a)
  for(let i=1;i<=samples;i++) {
    const b=i===samples?range.max:range.min+(range.max-range.min)*i/samples,pb=checked(b)
    sample(a,pa,b,pb,0)
    a=b;pa=pb
  }
  if(gap&&requireContinuous)throw new Error('定义域内存在间断、无效值或无法可靠采样的区间。')
  return paths
}

export function geometryPaths(project:GeometryProject,tolerance=0.012,requireContinuous=false) {
  switch(project.mode) {
    case 'bezier':return [flattenBezier(project.nodes,project.closed,tolerance)]
    case 'function': {
      const {expression,range,samples}=project.function
      const evaluate=compileExpression(expression,['x'])
      return sampleExpression(x=>({x,y:evaluate(x)}),range,samples,tolerance,requireContinuous)
    }
    case 'parametric': {
      const {x,y,range,samples}=project.parametric
      const evalX=compileExpression(x,['t']),evalY=compileExpression(y,['t'])
      return sampleExpression(t=>({x:evalX(t),y:evalY(t)}),range,samples,tolerance,requireContinuous)
    }
    case 'polar': {
      const {expression,range,samples}=project.polar
      const evaluate=compileExpression(expression,['theta','t'])
      return sampleExpression(t=>{const r=evaluate(t,t);return {x:r*Math.cos(t),y:r*Math.sin(t)}},range,samples,tolerance,requireContinuous)
    }
    case 'surface':return []
  }
}

export function makeTrack(project:GeometryProject,tolerance:number) {
  if(!Number.isFinite(tolerance)||tolerance<0.005||tolerance>1)throw new Error('离散容差须在 0.005 至 1 m 之间。')
  const paths=geometryPaths(project,tolerance/2,true)
  if(paths.length!==1||paths[0].length<2)throw new Error('请使用一条连续且至少含两个不同点的二维曲线。')
  const closed=project.mode==='bezier'?project.closed:project.mode==='parametric'||project.mode==='polar'?project[project.mode].closed:false
  const raw=paths[0]
  if(closed&&distance(raw[0],raw.at(-1)!)>tolerance/2)throw new Error('要生成闭合轨道，曲线起点与终点必须重合。')
  const simplified=simplifyPath(closed?[...raw.slice(0,-1),raw[0]]:raw,tolerance/2)
  const vertices=closed?simplified.slice(0,-1):simplified
  const error=trackError(vertices,closed)
  if(error)throw new Error(error)
  return {kind:'track' as const,vertices,closed}
}

export type GeometryImportOptions={role:EditableRole;mass:number;friction:number;restitution:number;charge:number;gravity:number;withBall:boolean}
export const defaultGeometryImport:GeometryImportOptions={role:'track',mass:1,friction:.18,restitution:0,charge:10,gravity:9.81,withBall:true}

function boundedNumber(value:number,min:number,max:number,label:string) {
  if(!Number.isFinite(value)||value<min||value>max)throw new Error(label+'超出允许范围。')
  return value
}

export function geometryExperiment(project:GeometryProject,tolerance:number,options:Partial<GeometryImportOptions>={}) {
  const settings={...defaultGeometryImport,...options}
  const mass=boundedNumber(settings.mass,.001,100000,'质量')
  const friction=boundedNumber(settings.friction,0,10,'摩擦系数')
  const restitution=boundedNumber(settings.restitution,0,1,'恢复系数')
  const charge=boundedNumber(settings.charge,-1000,1000,'电荷量')
  const gravity=boundedNumber(settings.gravity,0,100,'重力加速度')
  const role=settings.role
  if(!['marker','body','boundary','track','field'].includes(role))throw new Error('请选择有效的对象角色。')
  const isTrack=role==='track'
  const geometry=isTrack?makeTrack(project,tolerance):(()=>{
    const paths=geometryPaths(project,tolerance/2,true)
    if(paths.length!==1||paths[0].length<2)throw new Error('请使用一条连续且至少含两个不同点的二维曲线。')
    const closed=project.mode==='bezier'?project.closed:project.mode==='parametric'||project.mode==='polar'?project[project.mode].closed:false
    const raw=paths[0]
    if(closed&&distance(raw[0],raw.at(-1)!)>tolerance/2)throw new Error('要生成闭合轮廓，曲线起点与终点必须重合。')
    const vertices=simplifyPath(closed?[...raw.slice(0,-1),raw[0]]:raw,tolerance/2)
    const simplified=closed?vertices.slice(0,-1):vertices
    const error=freeformError(simplified,closed,role==='body')
    if(error)throw new Error(error)
    if(role==='body'&&triangulate(simplified).length!==simplified.length-2)throw new Error('无法为封闭轮廓生成与视觉一致的碰撞形状。请调整曲线或提高离散容差。')
    return {kind:'freeform' as const,vertices:simplified,closed}
  })()
  const min=geometry.vertices.reduce((a,b)=>({x:Math.min(a.x,b.x),y:Math.min(a.y,b.y)}),geometry.vertices[0])
  const max=geometry.vertices.reduce((a,b)=>({x:Math.max(a.x,b.x),y:Math.max(a.y,b.y)}),geometry.vertices[0])
  const x=(min.x+max.x)/2,y=(min.y+max.y)/2
  const vertices=geometry.vertices.map(p=>({x:p.x-x,y:p.y-y}))
  const names={marker:'几何标记',body:'几何刚体',boundary:'几何边界',track:'曲线轨道',field:'几何场源'} as const
  const colors={marker:'blue',body:'mint',boundary:'amber',track:'slate',field:'amber'} as const
  const object=withObjectRole(body(names[role],{...geometry,vertices},x,y,{
    color:colors[role],mass,friction,restitution,...(role==='field'?{charge}:{}),
  }),role)
  const withBall=settings.withBall&&(role==='track'||role==='boundary')
  const bodies=withBall?[object,body('测试小球',{kind:'circle',radius:0.24},x,max.y+1.25,{friction:.12,restitution:0})]:[object]
  const experiment=emptyExperiment()
  return decodeExperiment({...experiment,version:3,title:project.title==='未命名几何'?'曲线轨道实验':project.title+' · '+(isTrack?'轨道':'实验'),
    bodies,camera:{x,y:y+(withBall?0.4:0),scale:Math.max(5,Math.min(80,490/Math.max(1,max.x-min.x,max.y-min.y)))},
    environment:{...experiment.environment,gravity},
    notes:'来源：几何工作室。离散容差 '+tolerance+' m，几何已按此容差有损离散，碰撞与显示轮廓以顶点折线为准；对象角色：'+names[role]+'。'})
}

export function trackExperiment(project:GeometryProject,tolerance:number,withBall=false) {
  return geometryExperiment(project,tolerance,{withBall})
}

export function makeMesh(settings:GeometryProject['surface']):Mesh {
  checkRange(settings.x);checkRange(settings.y)
  const z=compileExpression(settings.expression,['x','y'])
  const n=settings.divisions
  const vertices:Mesh['vertices']=[]
  const faces:Mesh['faces']=[]
  for(let j=0;j<=n;j++)for(let i=0;i<=n;i++) {
    const x=settings.x.min+i*(settings.x.max-settings.x.min)/n
    const y=settings.y.min+j*(settings.y.max-settings.y.min)/n
    const height=z(x,y)
    vertices.push(Number.isFinite(height)&&Math.abs(height)<=10000?{x,y,z:height}:null)
  }
  for(let j=0;j<n;j++)for(let i=0;i<n;i++) {
    const a=j*(n+1)+i,b=a+1,c=a+n+1,d=c+1
    if(vertices[a]&&vertices[b]&&vertices[c]&&vertices[d])faces.push([a,b,c],[b,d,c])
  }
  if(!faces.length)throw new Error('定义域内没有可用的曲面单元。')
  return {vertices,faces}
}

export function meshObj(mesh:Mesh) {
  const ids=new Map<number,number>()
  const lines=['# PhysicLab Studio']
  mesh.vertices.forEach((p,i)=>{
    if(p) {ids.set(i,ids.size+1);lines.push('v '+p.x+' '+p.y+' '+p.z)}
  })
  for(const face of mesh.faces)lines.push('f '+face.map(i=>ids.get(i)).join(' '))
  return lines.join('\n')+'\n'
}
