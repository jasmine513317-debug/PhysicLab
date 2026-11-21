import type { Camera, Point } from './model'

export type View = {width:number; height:number}
export function screenPoint(p: Point, camera: Camera, view: View): Point {
  return {x:view.width/2+(p.x-camera.x)*camera.scale, y:view.height/2-(p.y-camera.y)*camera.scale}
}
export function worldPoint(p: Point, camera: Camera, view: View): Point {
  return {x:camera.x+(p.x-view.width/2)/camera.scale, y:camera.y-(p.y-view.height/2)/camera.scale}
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
