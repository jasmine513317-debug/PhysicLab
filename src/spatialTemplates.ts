import { spatialRibbon,type SpatialGeometry } from './spatialGeometry'
import { add,cross,emptySpatialScene,length,multiply,rotateSpatialVector,spatialObject,subtract,type SpatialScene,type Vec3 } from './spatialPhysics'
import { createExtendedExperiment } from './extended-experiments'
import { SOLAR_GRAVITY } from './astronomy'

export const celestialUnits=[
  {id:'star',name:'恒星',mass:1e12,radius:.14,display:.55},
  {id:'planet',name:'行星',mass:1e10,radius:.07,display:.29},
  {id:'moon',name:'卫星',mass:1e8,radius:.025,display:.13},
  {id:'probe',name:'探测器',mass:1000,radius:.01,display:.085},
] as const

export function astronomyScene():SpatialScene {
  return {...emptySpatialScene('三维天体物理实验'),gravity:[0,0,0],mutualGravity:true,collisions:false}
}

export function appendCelestial(scene:SpatialScene,kind:string,primaryId:string):SpatialScene {
  const unit=celestialUnits.find(item=>item.id===kind)
  if(!unit)throw new Error('请选择天体模型。')
  const next={...spatialObject(unit.name),mass:unit.mass,radius:unit.radius,visualRadius:unit.display,position:[0,0,0] as Vec3}
  if(scene.bodies.length===0)return {...scene,bodies:[next]}
  const primary=scene.bodies.find(body=>body.id===primaryId)??scene.bodies[0]
  // Set relative circular velocity in XZ and preserve the pair's prior momentum.
  const distance=4+2*(scene.bodies.length-1)
  const relativeSpeed=Math.sqrt(6.6743e-11*(primary.mass+next.mass)*distance**2/Math.hypot(distance,.01)**3)
  const fraction=next.mass/(primary.mass+next.mass)
  const velocity=primary.velocity
  next.position=add(primary.position,[distance,0,0])
  next.velocity=add(velocity,[0,0,relativeSpeed*(1-fraction)])
  return {...scene,bodies:[...scene.bodies.map(body=>body.id===primary.id&&!body.fixed
    ?{...body,velocity:add(velocity,[0,0,-relativeSpeed*fraction])}:body),
    primary.fixed?{...next,velocity:add(velocity,[0,0,Math.sqrt(6.6743e-11*primary.mass*distance**2/Math.hypot(distance,.01)**3)])}:next]}
}

export function orbitInclination(scene:SpatialScene) {
  if(!scene.mutualGravity||scene.bodies.length!==2||scene.bodies.some(body=>body.fixed))return
  const [a,b]=scene.bodies
  const plane=cross(subtract(b.position,a.position),subtract(b.velocity,a.velocity))
  const norm=length(plane)
  if(norm<=1e-12)return
  const normal=multiply(plane,1/norm)
  return {normal,radians:Math.acos(Math.max(-1,Math.min(1,normal[1])))}
}

export function withOrbitInclination(scene:SpatialScene,degrees:number):SpatialScene {
  const orbit=orbitInclination(scene)
  if(!orbit||!Number.isFinite(degrees)||degrees<0||degrees>180)throw new Error('需要有明确轨道平面的两个自由天体，倾角须在 0° 至 180° 之间。')
  const up:Vec3=[0,1,0],nodes=cross(up,orbit.normal),nodeLength=length(nodes)
  const axis:Vec3=nodeLength>1e-12?multiply(nodes,1/nodeLength):[1,0,0]
  const halfTurn=(degrees*Math.PI/180-orbit.radians)/2
  const [x,y,z]=multiply(axis,Math.sin(halfTurn))
  const [a,b]=scene.bodies,fraction=b.mass/(a.mass+b.mass)
  const center=(key:'position'|'velocity')=>add(a[key],multiply(subtract(b[key],a[key]),fraction))
  const rotate=(value:Vec3,origin:Vec3)=>add(origin,rotateSpatialVector(subtract(value,origin),[x,y,z,Math.cos(halfTurn)]))
  const position=center('position'),velocity=center('velocity')
  return {...scene,bodies:scene.bodies.map(body=>({
    ...body,position:rotate(body.position,position),velocity:rotate(body.velocity,velocity),
  }))}
}

export function spatialPreset(name:string): SpatialScene {
  const template=emptySpatialScene()
  const a=spatialObject()
  if(name==='throw')return {...template,title:'空间抛体',ground:true,bodies:[{...a,velocity:[2,7,3],restitution:0}]}
  if(name==='fall')return {...template,title:'空间自由落体',ground:true,bodies:[{...a,position:[0,6,0],restitution:0}]}
  if(name==='helix')return {...template,title:'均匀磁场中的螺旋运动',gravity:[0,0,0],magnetic:[0,2,0],collisions:false,
    bodies:[{...a,position:[0,0,0],charge:1,velocity:[3,1,0],radius:.15}]}
  if(name==='electric')return {...template,title:'空间偶极子电场',gravity:[0,0,0],collisions:false,mutualElectric:true,
    bodies:[{...a,name:'正点电荷',charge:1e-6,fixed:true,position:[-1,2,0],radius:.15},
      {...spatialObject('负点电荷'),charge:-1e-6,fixed:true,position:[1,2,0],radius:.15}]}
  if(name==='induction')return {...template,title:'空间线圈电磁感应',gravity:[0,0,0],collisions:false,magnetic:[0,.2,0],
    induction:{center:[0,2,0],normal:[0,1,0],rate:[0,.12,0],radius:1.6},
    bodies:[{...a,name:'带电示踪粒子',charge:1,position:[1,2,0],radius:.1}]}
  if(name==='spring') {
    const anchor={...spatialObject('固定端点'),fixed:true,position:[0,2,0] as Vec3}
    return {...template,title:'空间弹簧振子',gravity:[0,0,0],collisions:false,
      bodies:[anchor,{...a,position:[2,3,1],velocity:[0,0,.4]}],
      springs:[{id:crypto.randomUUID(),a:anchor.id,b:a.id,stiffness:12,restLength:1.6,damping:0}]}
  }
  if(name==='rigid')return {...template,title:'空间刚体接触',rigid:true,ground:true,bodies:[
    {...a,name:'立方体',geometry:{kind:'box',size:[.85,.85,.85]},angularVelocity:[.3,0,.8]},
    {...spatialObject('圆柱体'),position:[1.5,3,-.2],geometry:{kind:'cylinder',radius:.38,height:1.05},angularVelocity:[.6,.3,.1]},
  ]}
  if(name==='pendulum'||name==='double') {
    const anchor={...spatialObject('固定铰点'),fixed:true,position:[0,4,0] as Vec3,radius:.12}
    const first={...a,name:'第一摆体',position:[0,2.5,0] as Vec3,velocity:[1,0,1] as Vec3}
    const next:SpatialScene={...template,title:name==='double'?'空间双摆':'球铰空间摆',rigid:true,collisions:false,bodies:[anchor,first],
      pivots:[{id:crypto.randomUUID(),a:anchor.id,b:first.id,anchorA:[0,0,0],anchorB:[0,1.5,0]}]}
    if(name==='double') {
      const second={...spatialObject('第二摆体'),position:[0,1.15,0] as Vec3,velocity:[0,0,.6] as Vec3}
      next.bodies.push(second)
      next.pivots!.push({id:crypto.randomUUID(),a:first.id,b:second.id,anchorA:[0,0,0],anchorB:[0,1.35,0]})
    }
    return next
  }
  if(name==='incline'||name==='surface') {
    const track=spatialObject(name==='incline'?'斜面':'空间曲线轨道')
    const geometry:SpatialGeometry=name==='incline'?{kind:'box',size:[8,.08,4]}:
      spatialRibbon(Array.from({length:33},(_,i)=>{const x=(i-16)/4;return [x,.14*x*x,.09*x*x]}),2)
    return {...template,title:name==='incline'?'立体斜面与摩擦':'空间曲线轨道',rigid:true,ground:true,bodies:[
      {...track,fixed:true,position:[0,.6,0],geometry,orientation:name==='incline'?[0,0,-.18,Math.sqrt(1-.18**2)]:[0,0,0,1]},
      {...a,position:[-2.6,2.4,0],friction:.28},
    ]}
  }
  if(name==='orbit'||name==='escape'||name==='three'||name==='assist') {
    const other=spatialObject('伴星'),m=1e11,g=6.6743e-11
    const base={...template,gravity:[0,0,0] as Vec3,mutualGravity:true,collisions:false}
    if(name==='three') {
      const radius=2.4,speed=Math.sqrt(g*m/(Math.sqrt(3)*radius))
      return {...base,title:'倾斜平面等边三体',bodies:Array.from({length:3},(_,i)=>{
        const angle=i*Math.PI*2/3,x=Math.cos(angle),y=Math.sin(angle)
        return {...spatialObject('天体 '+(i+1)),mass:m,radius:.01,visualRadius:.2,
          position:[radius*x,radius*.6*y,radius*.8*y],velocity:[-speed*y,.6*speed*x,.8*speed*x]}
      })}
    }
    if(name==='assist') {
      const reference=createExtendedExperiment('gravity-assist')
      if(reference.extension!=='gravity-assist')throw new Error('无法载入飞掠初始条件。')
      // Similarity transform: the SI model retains all mass ratios and G M T²/L³.
      const lengthUnit=40,timeUnit=6,massUnit=SOLAR_GRAVITY*lengthUnit**3/(g*timeUnit**2)
      return {...base,title:'空间引力飞掠',bodies:reference.settings.bodies.map((item,i)=>({
        ...spatialObject(['中心天体','飞掠天体','飞掠探针'][i]),mass:item.mass*massUnit,radius:.01,visualRadius:[.9,.45,.2][i],
        position:[item.x*lengthUnit,item.y*lengthUnit*.6,item.y*lengthUnit*.8],
        velocity:[item.vx*lengthUnit/timeUnit,item.vy*lengthUnit/timeUnit*.6,item.vy*lengthUnit/timeUnit*.8],
      }))}
    }
    const separation=4,mu=g*(2*m)
    const relative=name==='escape'?1.03*Math.sqrt(2*mu/separation):Math.sqrt(mu*(2/separation-1/7))
    const speed=relative/2
    return {...base,title:name==='escape'?'空间逃逸轨道':'倾斜平面上的椭圆轨道',
      bodies:[{...a,name:'主星',mass:m,position:[-separation/2,0,0],velocity:[0,speed*.6,speed*.8],radius:.02,visualRadius:.3},
        {...other,mass:m,position:[separation/2,0,0],velocity:[0,-speed*.6,-speed*.8],radius:.02,visualRadius:.3}]}
  }
  return template
}
