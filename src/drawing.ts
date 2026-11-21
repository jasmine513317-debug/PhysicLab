import { isConvexPolygon, type Point } from './model'

export const drawingLabels={ground:'边界',ramp:'斜面',segment:'线段',polygon:'多边形'} as const
export type DrawingKind=keyof typeof drawingLabels

export function classifyDrawing(points:Point[]):DrawingKind|undefined {
  if(points.length<2)return
  if(points.length>2)return isConvexPolygon(points)?'polygon':undefined
  const [a,b]=points
  const dx=Math.abs(b.x-a.x), dy=Math.abs(b.y-a.y)
  if(Math.hypot(dx,dy)<0.02)return
  const angle=Math.atan2(dy,dx)*180/Math.PI
  if(angle<=5)return 'ground'
  if(angle<70)return 'ramp'
  return 'segment'
}
