import { rotate } from './coordinates'
import type { BodyConfig, Point, Spring } from './model'

function anchorWorld(body:BodyConfig,local:Point):Point {
  const offset=rotate(local,body.angle)
  return {x:body.position.x+offset.x,y:body.position.y+offset.y}
}

export function springGeometry(a:BodyConfig,b:BodyConfig,spring:Spring) {
  const wa=anchorWorld(a,spring.anchorA),wb=anchorWorld(b,spring.anchorB)
  const dx=wb.x-wa.x,dy=wb.y-wa.y
  const length=Math.hypot(dx,dy)
  return {length, direction:length>1e-8?{x:dx/length,y:dy/length}:{x:1,y:0}}
}

export function setInitialExtension(a:BodyConfig,b:BodyConfig,spring:Spring,extension:number):BodyConfig {
  const {length,direction}=springGeometry(a,b,spring)
  const moveB=b.type==='dynamic'
  const moved=moveB?b:a
  const offset=(spring.restLength+extension-length)*(moveB?1:-1)
  return {...moved,position:{x:moved.position.x+direction.x*offset,y:moved.position.y+direction.y*offset}}
}
