import { body, type BodyColor, type Point } from './model'
import { TRACK_MIN_EDGE,trackError } from './track'

export const drawnShapes = [
  ['circle','圆形'],['rectangle','矩形'],['square','正方形'],
  ['segment','线段'],['curve','光滑曲线'],['arc','圆弧轨道'],
] as const
export type DrawnShape = typeof drawnShapes[number][0]

export function trackProfile(kind:'curve'|'arc',span:number,depth:number):Point[] {
  const half=span/2
  const count=Math.max(2,Math.min(48,2*Math.floor(span/TRACK_MIN_EDGE/2.02)))
  // Sample the circular arc through both ends and the signed midpoint.
  const sag=Math.max(-half,Math.min(half,depth))
  if(kind==='arc'&&Math.abs(sag)>1e-6) {
    const radius=(half*half+sag*sag)/(2*Math.abs(sag))
    const sweep=2*Math.atan(Math.abs(sag)/half)
    return Array.from({length:count+1},(_,i)=>{
      const angle=(2*i/count-1)*sweep
      return {x:radius*Math.sin(angle),y:Math.sign(sag)*(Math.abs(sag)-2*radius*Math.sin(angle/2)**2)}
    })
  }
  return Array.from({length:count+1},(_,i)=>{
    const x=2*i/count-1
    return {x:x*half,y:(kind==='arc'?0:depth)*(1-x*x)}
  })
}

export function drawnBody(kind:DrawnShape,start:Point,end:Point,color:BodyColor,id:string) {
  const dx=end.x-start.x,dy=end.y-start.y
  const width=Math.abs(dx),height=Math.abs(dy),span=Math.hypot(dx,dy)
  if(span<.04)return
  const center={x:(start.x+end.x)/2,y:(start.y+end.y)/2}
  const name=drawnShapes.find(([shape])=>shape===kind)![1]
  const make=(geometry:Parameters<typeof body>[1],angle=0,offset=0)=>body(name,geometry,
    center.x+offset*Math.sin(angle),center.y-offset*Math.cos(angle),{id,color,angle,surfaceLine:kind==='segment'||undefined})
  if(kind==='circle')return make({kind:'circle',radius:Math.min(1000,span/2)})
  if(kind==='rectangle'||kind==='square'){
    const side=Math.max(width,height)
    const w=kind==='square'?side:width,h=kind==='square'?side:height
    if(Math.min(w,h)<.02)return
    return make({kind:'rectangle',width:Math.min(1000,w),height:Math.min(1000,h)})
  }
  const angle=Math.atan2(dy,dx)
  if(kind==='segment')return make({kind:'surface',width:Math.min(1000,span),height:.02},angle,.01)
  const vertices=trackProfile(kind,span,-span*(kind==='arc'?.5:.3))
  if(trackError(vertices,false))return
  return make({kind:'track',vertices,closed:false,profile:kind},angle)
}
