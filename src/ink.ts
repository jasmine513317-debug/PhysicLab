import { body, type BodyColor, type BodyConfig, type ObjectRole, type Point } from './model'
import { centroid, convexHull } from './freeform'
import { freeformError, polygonArea, simplifyPath } from './track'

const distance=(a:Point,b:Point)=>Math.hypot(b.x-a.x,b.y-a.y)

export const INK_COLORS=[
  {value:'#ff5a5a',label:'红色'},
  {value:'#5b8dff',label:'蓝色'},
  {value:'#ffffff',label:'白色'},
] as const
export type InkColor = string

function bounds(points:readonly Point[]) {
  const xs=points.map(p=>p.x),ys=points.map(p=>p.y)
  const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys)
  return {minX,maxX,minY,maxY,width:maxX-minX,height:maxY-minY,cx:(minX+maxX)/2,cy:(minY+maxY)/2}
}

function pathLength(points:readonly Point[],closed:boolean) {
  let total=0
  for(let i=0;i<points.length-(closed?0:1);i++)total+=distance(points[i],points[(i+1)%points.length])
  return total
}

function dedupe(points:readonly Point[],epsilon=0.006) {
  const result:Point[]=[]
  for(const point of points) {
    const last=result.at(-1)
    if(!last||distance(last,point)>=epsilon)result.push(point)
  }
  return result
}

function resample(points:readonly Point[],count:number,closed:boolean) {
  const source=dedupe(points)
  if(source.length<2)return [...source]
  const path=closed?[...source,source[0]]:source
  const total=pathLength(path,false)
  if(total<1e-9)return [source[0],source.at(-1)!]
  const result:Point[]=[]
  let segment=0,segmentStart=0
  for(let i=0;i<count;i++) {
    const target=total*(closed?i/count:i/(count-1))
    while(segment<path.length-2&&segmentStart+distance(path[segment],path[segment+1])<target) {
      segmentStart+=distance(path[segment],path[segment+1])
      segment++
    }
    const length=distance(path[segment],path[segment+1])||1
    const t=Math.max(0,Math.min(1,(target-segmentStart)/length))
    result.push({x:path[segment].x+(path[segment+1].x-path[segment].x)*t,y:path[segment].y+(path[segment+1].y-path[segment].y)*t})
  }
  return result
}

function thin(points:readonly Point[],closed:boolean) {
  const result:Point[]=[]
  for(const point of points) {
    const last=result.at(-1)
    if(!last||distance(last,point)>=0.021)result.push(point)
  }
  if(closed) {
    while(result.length>3&&distance(result[0],result.at(-1)!)<0.021)result.pop()
  } else if(result.length>1) {
    if(distance(result[0],result.at(-1)!)<0.021)result[result.length-1]=points.at(-1)!
  }
  return result
}

function decimate(points:readonly Point[],closed:boolean,limit=240) {
  let result=[...points]
  while(result.length>limit) {
    const next:Point[]=[]
    for(let i=0;i<result.length;i+=2)next.push(result[i])
    if(!closed&&next.at(-1)!==result.at(-1))next.push(result.at(-1)!)
    result=next
    if(result.length<=2)break
  }
  return result
}

function chaikin(points:readonly Point[],closed:boolean) {
  if(points.length<3)return [...points]
  const result:Point[]=[]
  if(!closed)result.push(points[0])
  const count=points.length-(closed?0:1)
  for(let i=0;i<count;i++) {
    const a=points[i],b=points[(i+1)%points.length]
    result.push({x:a.x*.75+b.x*.25,y:a.y*.75+b.y*.25})
    result.push({x:a.x*.25+b.x*.75,y:a.y*.25+b.y*.75})
  }
  if(!closed)result.push(points.at(-1)!)
  return result
}

function isClosedStroke(points:readonly Point[],diagonal:number) {
  if(points.length<5)return false
  const gap=distance(points[0],points.at(-1)!)
  return gap<Math.max(0.08,diagonal*.16)&&Math.abs(polygonArea(points))>Math.max(0.0005,diagonal*diagonal*.05)
}

function isStraight(points:readonly Point[]) {
  const first=points[0],last=points.at(-1)!
  const chord=distance(first,last)
  if(chord<0.08)return false
  let farthest=0
  for(const point of points)farthest=Math.max(farthest,Math.abs((last.x-first.x)*(first.y-point.y)-(first.x-point.x)*(last.y-first.y))/chord)
  return farthest<=Math.max(0.018,chord*.055)
}

function minimumBox(points:readonly Point[]) {
  let best:{area:number;angle:number;width:number;height:number;cx:number;cy:number}|undefined
  for(let step=0;step<30;step++) {
    const angle=step*Math.PI/60
    const cos=Math.cos(-angle),sin=Math.sin(-angle)
    const rotated=points.map(p=>({x:p.x*cos-p.y*sin,y:p.x*sin+p.y*cos}))
    const b=bounds(rotated)
    const area=b.width*b.height
    if(!best||area<best.area) {
      const rotateBack=(p:Point)=>({x:p.x*Math.cos(angle)-p.y*Math.sin(angle),y:p.x*Math.sin(angle)+p.y*Math.cos(angle)})
      const center=rotateBack({x:b.cx,y:b.cy})
      best={area,angle,width:b.width,height:b.height,cx:center.x,cy:center.y}
    }
  }
  return best
}


// Hand-drawn corners rarely meet exactly; drop hull points whose corner deviates
// less than the stroke resolution from the line joining its neighbours.
function dropTinyCorners(hull:Point[]) {
  const points=[...hull]
  let changed=true
  while(changed&&points.length>3) {
    changed=false
    for(let i=0;i<points.length;i++) {
      const a=points[(i-1+points.length)%points.length],b=points[i],c=points[(i+1)%points.length]
      const base=Math.hypot(c.x-a.x,c.y-a.y)
      const height=base>1e-9?Math.abs((b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x))/base:0
      if(height<0.03) {points.splice(i,1);changed=true;break}
    }
  }
  return points
}

function localGeometry(kind:'freeform',points:readonly Point[],closed:boolean) {
  const center=centroid(points)
  return {center,geometry:{kind,vertices:points.map(p=>({x:p.x-center.x,y:p.y-center.y})),closed} as BodyConfig['geometry']}
}

function inkBody(points:Point[],closed:boolean,color:BodyColor,name:string,type:BodyConfig['type']='dynamic',strokeWidth=2.4) {
  const {center,geometry}=localGeometry('freeform',points,closed)
  return body(name,geometry,center.x,center.y,{type,color,strokeWidth})
}

export type InkKind='line'|'circle'|'ellipse'|'rectangle'|'polygon'|'polyline'|'curve'|'freeform'
export type Recognition={raw:Point[];confidence:number;fitError:number;sampleDensity:number;sampleCount:number}
export type InkResult={body:BodyConfig;label:string;kind:InkKind;regularized:boolean;recognition:Recognition}|{error:string}

function ellipseFit(points:Point[]) {
  const center=centroid(points)
  let xx=0,yy=0,xy=0
  for(const p of points) {xx+=(p.x-center.x)**2;yy+=(p.y-center.y)**2;xy+=(p.x-center.x)*(p.y-center.y)}
  xx/=points.length;yy/=points.length;xy/=points.length
  const angle=.5*Math.atan2(2*xy,xx-yy)
  const c=Math.cos(angle),s=Math.sin(angle)
  const along=points.map(p=>({x:(p.x-center.x)*c+(p.y-center.y)*s,y:-(p.x-center.x)*s+(p.y-center.y)*c}))
  const radiusX=Math.sqrt(Math.max(0,along.reduce((sum,p)=>sum+p.x*p.x,0)/points.length*2))
  const radiusY=Math.sqrt(Math.max(0,along.reduce((sum,p)=>sum+p.y*p.y,0)/points.length*2))
  const error=Math.sqrt(along.reduce((sum,p)=>{
    const radial=Math.hypot(p.x/radiusX,p.y/radiusY)
    return sum+(radial-1)**2*Math.min(radiusX,radiusY)**2
  },0)/points.length)
  return {center,radiusX,radiusY,angle,error}
}

function cornerAngles(points:Point[]) {
  return points.slice(1,-1).map((p,i)=>{
    const a=points[i],b=points[i+2],u={x:p.x-a.x,y:p.y-a.y},v={x:b.x-p.x,y:b.y-p.y}
    const denom=Math.hypot(u.x,u.y)*Math.hypot(v.x,v.y)
    return denom?Math.acos(Math.max(-1,Math.min(1,(u.x*v.x+u.y*v.y)/denom))):0
  }).filter(angle=>angle>.35)
}

function segmentError(points:Point[],vertices:Point[],closed:boolean) {
  const path=closed?[...vertices,vertices[0]]:vertices
  let sum=0
  for(const point of points) {
    let best=Infinity
    for(let i=0;i<path.length-1;i++) {
      const a=path[i],b=path[i+1],dx=b.x-a.x,dy=b.y-a.y
      const t=Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.y-a.y)*dy)/(dx*dx+dy*dy||1)))
      best=Math.min(best,Math.hypot(point.x-a.x-t*dx,point.y-a.y-t*dy))
    }
    sum+=best*best
  }
  return Math.sqrt(sum/points.length)
}

export function createInk(raw:readonly Point[],color:BodyColor,regularize:boolean,strokeWidth=2.4,role:ObjectRole='body'):InkResult {
  const source=dedupe(raw)
  if(source.length<2)return {error:'笔画太短，请画出更长的线条。'}
  if(source.length>1200||!source.every(p=>[p.x,p.y].every(n=>Number.isFinite(n)&&Math.abs(n)<=10000)))return {error:'笔迹过长或坐标无效。'}
  const box=bounds(source),diagonal=Math.hypot(box.width,box.height),length=pathLength(source,false)
  if(diagonal<0.06)return {error:'图形太小，请放大画布后再绘制。'}
  const closed=isClosedStroke(source,diagonal)
  const sampleCount=source.length
  const sampleDensity=length/sampleCount
  const evidence=(confidence:number,fitError:number):Recognition=>({raw:source.map(p=>({...p})),confidence:Math.max(0,Math.min(.99,confidence)),fitError,sampleDensity,sampleCount})
  function finish(config:BodyConfig,label:string,kind:InkKind,confidence:number,fitError:number,changed=regularize):InkResult {
    const dynamic=role==='body'&&closed
    let geometry=config.geometry
    if(role==='track'||role==='boundary') {
      if(geometry.kind==='freeform')geometry={kind:'track',vertices:geometry.vertices,closed}
      else if(closed) {
        const points=resample(source,96,true)
        const local=centroid(points)
        config.position=local
        geometry={kind:'track',vertices:points.map(p=>({x:p.x-local.x,y:p.y-local.y})),closed:true}
      } else {
        const points=thin(source,false),local=centroid(points)
        config.position=local
        geometry={kind:'track',vertices:points.map(p=>({x:p.x-local.x,y:p.y-local.y})),closed:false}
      }
    }
    const final=role==='body'?{...config,type:dynamic?'dynamic' as const:'static' as const,geometry,role}:
      {...config,type:'static' as const,geometry,role,velocity:{x:0,y:0},angularVelocity:0,...(role==='field'?{charge:10}:{})}
    final.provenance={source:'ink',raw:source.map(p=>({...p})),regularized:changed,confidence,fitError,sampleDensity}
    return {body:final,label,kind,regularized:changed,recognition:evidence(confidence,fitError)}
  }
  function fallback():InkResult {
    let points=thin(decimate(source,closed),closed)
    if(closed&&points.length<3)return {error:'封闭曲线过于简单，请画得更大一些。'}
    if(!closed&&points.length<2)return {error:'笔画太短，请画出更长的线条。'}
    const error=closed?freeformError(points,true,true):undefined
    if(error)return {error}
    const label=closed?(role==='marker'?'手绘标记':'手绘物块'):(role==='track'||role==='boundary'?'手绘轨道':!regularize?'手绘曲线（静态斜面/碰撞曲线）':'手绘曲线')
    return finish(inkBody(points,closed,color,label,dynamicType(role,closed),strokeWidth),label,closed?'freeform':regularize?'curve':'freeform',.5,diagonal*.1,false)
  }
  if(!regularize)return fallback()

  const sampled=resample(source,closed?96:110,closed)
  if(closed) {
    const fit=ellipseFit(source),axisRatio=Math.min(fit.radiusX,fit.radiusY)/Math.max(fit.radiusX,fit.radiusY)
    const ellipseError=fit.error/Math.max(.02,Math.max(fit.radiusX,fit.radiusY))
    const fill=Math.abs(polygonArea(sampled))/(Math.PI*fit.radiusX*fit.radiusY)
    if(ellipseError<.045&&fill>.88&&axisRatio>.12&&Math.min(fit.radiusX,fit.radiusY)>.02) {
      const circle=axisRatio>.88
      const geometry=circle?{kind:'circle' as const,radius:(fit.radiusX+fit.radiusY)/2}:{kind:'ellipse' as const,radiusX:fit.radiusX,radiusY:fit.radiusY}
      return finish(body(circle?'手绘圆':'手绘椭圆',geometry,fit.center.x,fit.center.y,{angle:circle?0:fit.angle,color,strokeWidth}),circle?'规整为圆':'规整为椭圆',circle?'circle':'ellipse',.99-ellipseError,fit.error)
    }
    const boxFit=minimumBox(sampled)
    if(boxFit) {
      const ratio=Math.abs(polygonArea(sampled))/boxFit.area
      const aspect=Math.min(boxFit.width,boxFit.height)/Math.max(boxFit.width,boxFit.height)
      if(ratio>.86&&aspect>.12&&boxFit.width>=.02&&boxFit.height>=.02) {
        const error=segmentError(sampled,[
          {x:boxFit.cx-boxFit.width/2,y:boxFit.cy-boxFit.height/2},{x:boxFit.cx+boxFit.width/2,y:boxFit.cy-boxFit.height/2},
          {x:boxFit.cx+boxFit.width/2,y:boxFit.cy+boxFit.height/2},{x:boxFit.cx-boxFit.width/2,y:boxFit.cy+boxFit.height/2}],true)
        if(error<diagonal*.08)return finish(body('手绘矩形',{kind:'rectangle',width:boxFit.width,height:boxFit.height},boxFit.cx,boxFit.cy,{angle:boxFit.angle,color,strokeWidth}),'规整为矩形','rectangle',.98-error/diagonal,error)
      }
    }
    const hull=dropTinyCorners(convexHull(sampled))
    if(hull.length>=3&&hull.length<=8) {
      const hullArea=Math.abs(polygonArea(hull)),fill=hullArea>1e-8?Math.abs(polygonArea(sampled))/hullArea:0
      const error=segmentError(sampled,hull,true)
      if(fill>.9&&error<diagonal*.065) {
        const local=centroid(hull),vertices=hull.map(p=>({x:p.x-local.x,y:p.y-local.y}))
        return finish(body(hull.length===3?'手绘三角形':'手绘多边形',{kind:'polygon',vertices},local.x,local.y,{color,strokeWidth}),'规整为'+(hull.length===3?'三角形':'多边形'),'polygon',.97-error/diagonal,error)
      }
    }
    return fallback()
  }

  let lineError=0
  const start=source[0],end=source.at(-1)!,chord=distance(start,end)
  for(const point of source)lineError=Math.max(lineError,Math.abs((end.x-start.x)*(start.y-point.y)-(start.x-point.x)*(end.y-start.y))/(chord||1))
  if(isStraight(source))return finish(inkBody([start,end],false,color,'手绘直线','static',strokeWidth),'规整为直线','line',.99-lineError/Math.max(.02,chord),lineError)
  let tolerance=Math.max(.025,diagonal*.035)
  let corners=simplifyPath(source,tolerance)
  while(corners.length>16)corners=simplifyPath(source,tolerance*=1.35)
  const error=segmentError(source,corners,false)
  const angles=cornerAngles(corners)
  const directions=new Set(source.slice(1).map((p,i)=>Math.round(Math.atan2(p.y-source[i].y,p.x-source[i].x)*3)))
  if(corners.length>=3&&corners.length<=16&&error<=tolerance*1.8&&angles.length>=2&&Math.max(...angles)>=.9&&directions.size<=8) {
    const local=centroid(corners),vertices=corners.map(p=>({x:p.x-local.x,y:p.y-local.y}))
    return finish(body('手绘折线',{kind:'freeform',vertices,closed:false},local.x,local.y,{type:'static',color,strokeWidth}),'规整为折线','polyline',.96-error/diagonal,error)
  }
  return fallback()
}

function dynamicType(role:ObjectRole,closed:boolean):BodyConfig['type'] {return role==='body'&&closed?'dynamic':'static'}