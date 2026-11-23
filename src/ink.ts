import { body, type BodyColor, type BodyConfig, type Point } from './model'
import { centroid, convexHull } from './freeform'
import { freeformError, polygonArea } from './track'

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

export type InkResult = {body:BodyConfig;label:string;kind:'line'|'circle'|'rectangle'|'polygon'|'curve'|'freeform'} | {error:string}

export function createInk(raw:readonly Point[],color:BodyColor,regularize:boolean,strokeWidth=2.4):InkResult {
  const source=dedupe(raw)
  if(source.length<2)return {error:'笔画太短，请画出更长的线条。'}
  const box=bounds(source)
  const diagonal=Math.hypot(box.width,box.height)
  if(diagonal<0.06)return {error:'图形太小，请放大画布后再绘制。'}
  const closed=isClosedStroke(source,diagonal)

  if(!regularize) {
    let points=decimate(source,closed)
    points=thin(points,closed)
    if(closed) {
      if(points.length<3)return {error:'封闭图形过小，请画得更大一些。'}
      const error=freeformError(points,true,true)
      if(error)return {error}
      return {body:inkBody(points,true,color,'手绘物块','dynamic',strokeWidth),label:'手绘物块',kind:'freeform'}
    }
    if(points.length<2)return {error:'笔画太短，请画出更长的线条。'}
    return {body:inkBody(points,false,color,'手绘曲线','static',strokeWidth),label:'手绘曲线（静态斜面/碰撞曲线）',kind:'freeform'}
  }

  const sampled=resample(source,closed?96:110,closed)
  if(closed) {
    const boxFit=minimumBox(sampled)
    if(boxFit) {
      const ratio=Math.abs(polygonArea(sampled))/boxFit.area
      const aspect=Math.min(boxFit.width,boxFit.height)/Math.max(boxFit.width,boxFit.height)
      if(ratio>.86&&aspect>.12&&boxFit.width>=0.02&&boxFit.height>=0.02)
        return {body:body('手绘矩形',{kind:'rectangle',width:boxFit.width,height:boxFit.height},boxFit.cx,boxFit.cy,{angle:boxFit.angle,color,strokeWidth}),
          label:'规整为矩形',kind:'rectangle'}
    }

    const center=centroid(sampled)
    const radii=sampled.map(point=>distance(point,center))
    const mean=radii.reduce((sum,r)=>sum+r,0)/radii.length
    if(mean>0.03) {
      const deviation=Math.sqrt(radii.reduce((sum,r)=>sum+(r-mean)**2,0)/radii.length)/mean
      if(deviation<.13&&Math.abs(polygonArea(sampled))/(Math.PI*mean*mean)>.72)
        return {body:body('手绘圆',{kind:'circle',radius:mean},center.x,center.y,{color,strokeWidth}),label:'规整为圆',kind:'circle'}
    }

    const hull=dropTinyCorners(convexHull(sampled))
    if(hull.length>=3&&hull.length<=8) {
      const hullArea=Math.abs(polygonArea(hull))
      const fill=hullArea>1e-8?Math.abs(polygonArea(sampled))/hullArea:0
      if(fill>.87) {
        const local=centroid(hull)
        const vertices=hull.map(p=>({x:p.x-local.x,y:p.y-local.y}))
        const name=hull.length===3?'手绘三角形':'手绘多边形'
        return {body:body(name,{kind:'polygon',vertices},local.x,local.y,{color,strokeWidth}),label:'规整为'+(hull.length===3?'三角形':'多边形'),kind:'polygon'}
      }
    }

    const smooth=thin(decimate(chaikin(sampled,true),true),true)
    if(smooth.length<3)return {error:'封闭曲线过于简单，请画得更大一些。'}
    const error=freeformError(smooth,true,true)
    if(error)return {error}
    return {body:inkBody(smooth,true,color,'手绘物块','dynamic',strokeWidth),label:'规整为平滑物块',kind:'freeform'}
  }

  if(isStraight(source)) {
    const start=source[0],end=source.at(-1)!
    if(distance(start,end)<0.02)return {error:'笔画太短，请画出更长的线条。'}
    return {body:inkBody([start,end],false,color,'手绘直线','static',strokeWidth),label:'规整为直线',kind:'line'}
  }

  const smooth=thin(decimate(chaikin(sampled,false),false),false)
  if(smooth.length<2)return {error:'笔画太短，请画出更长的线条。'}
  return {body:inkBody(smooth,false,color,'平滑曲线','static',strokeWidth),label:'规整为平滑曲线',kind:'curve'}
}