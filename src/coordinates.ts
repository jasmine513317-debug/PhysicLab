import type { Camera, Point } from './model'

export type View = {width:number; height:number}
export function screenPoint(p: Point, camera: Camera, view: View): Point {
  return {x:view.width/2+(p.x-camera.x)*camera.scale, y:view.height/2-(p.y-camera.y)*camera.scale}
}
export function worldPoint(p: Point, camera: Camera, view: View): Point {
  return {x:camera.x+(p.x-view.width/2)/camera.scale, y:camera.y-(p.y-view.height/2)/camera.scale}
}
export function displayPoint(world: Point, origin: Point): Point {
  return {x:world.x-origin.x,y:world.y-origin.y}
}
export function worldFromDisplay(display: Point, origin: Point): Point {
  return {x:display.x+origin.x,y:display.y+origin.y}
}
export function normalizeAngle(angle: number): number {
  const normalized=angle%(2*Math.PI)
  return normalized<0?normalized+2*Math.PI:normalized
}
export function shortestAngleDelta(from: number, to: number): number {
  let delta=(to-from)%(2*Math.PI)
  if(delta>Math.PI)delta-=2*Math.PI
  if(delta<-Math.PI)delta+=2*Math.PI
  return delta
}
export function polarPosition(world: Point, origin: Point): {r:number;theta?:number} {
  const p=displayPoint(world,origin),r=Math.hypot(p.x,p.y)
  return {r,theta:r===0?undefined:normalizeAngle(Math.atan2(p.y,p.x))}
}
export function polarComponents(position: Point, velocity: Point, origin: Point): {radial:number;tangential:number}|undefined {
  const p=displayPoint(position,origin),r=Math.hypot(p.x,p.y)
  if(r===0)return
  const radial={x:p.x/r,y:p.y/r}
  return {radial:velocity.x*radial.x+velocity.y*radial.y,tangential:velocity.x*-radial.y+velocity.y*radial.x}
}
export function zoomAt(camera: Camera, view: View, p: Point, factor: number): Camera {
  const before = worldPoint(p,camera,view)
  const next = {...camera, scale:Math.max(5,Math.min(400,camera.scale*factor))}
  const after = worldPoint(p,next,view)
  return {...next,x:next.x+before.x-after.x,y:next.y+before.y-after.y}
}
export function rotate(p:Point, angle:number): Point {
  return {x:p.x*Math.cos(angle)-p.y*Math.sin(angle),y:p.x*Math.sin(angle)+p.y*Math.cos(angle)}
}
