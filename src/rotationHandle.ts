import { rotate } from './coordinates'
import type { BodyConfig, Point } from './model'

export function rotationGuide(body:BodyConfig,scale:number) {
  const g=body.geometry
  const top=g.kind==='polygon'||g.kind==='track'||g.kind==='freeform'
    ? g.vertices.reduce((highest,p)=>p.y>highest.y?p:highest)
    : {x:0,y:g.kind==='circle'?g.radius:g.height/2}
  const toWorld=(p:Point)=>{
    const offset=rotate(p,body.angle)
    return {x:body.position.x+offset.x,y:body.position.y+offset.y}
  }
  return {edge:toWorld(top),handle:toWorld({x:top.x,y:top.y+25/scale})}
}

export function pointerBearing(center:Point,point:Point) {
  return Math.atan2(point.y-center.y,point.x-center.x)
}

export function turnBetween(from:number,to:number) {
  const difference=to-from
  return Math.atan2(Math.sin(difference),Math.cos(difference))
}
