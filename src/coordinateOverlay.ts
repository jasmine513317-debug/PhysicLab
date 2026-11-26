import { screenPoint, type View } from './coordinates'
import type { Camera, Coordinates, Point } from './model'

export function coordinateGridStep(scale:number) {
  return Math.pow(2,Math.ceil(Math.log2(62/scale)))
}

function line(ctx:CanvasRenderingContext2D,a:Point,b:Point) {
  ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y)
}

function tickLabel(value:number) {
  return String(Number(value.toPrecision(3)))
}

export function drawCoordinates(ctx:CanvasRenderingContext2D,view:View,camera:Camera,coordinates:Coordinates,grid:boolean,labels:boolean=true) {
  if(coordinates.mode==='none')return
  const origin=screenPoint(coordinates.origin,camera,view)
  const step=coordinateGridStep(camera.scale),spacing=step*camera.scale
  ctx.save()
  ctx.font='10px "JetBrains Mono Variable", "Microsoft YaHei UI", monospace'
  ctx.lineWidth=1
  if(coordinates.mode==='cartesian') {
    if(grid) {
      for(const [distance,color] of [[spacing/4,'#1b1b1f'],[spacing,'#29292e']] as const) {
        ctx.beginPath()
        for(let x=origin.x%distance;x<view.width;x+=distance)line(ctx,{x,y:0},{x,y:view.height})
        for(let y=origin.y%distance;y<view.height;y+=distance)line(ctx,{x:0,y},{x:view.width,y})
        ctx.strokeStyle=color;ctx.stroke()
      }
    }
    ctx.beginPath()
    line(ctx,{x:0,y:origin.y},{x:view.width,y:origin.y})
    line(ctx,{x:origin.x,y:0},{x:origin.x,y:view.height})
    ctx.strokeStyle='#515159';ctx.stroke()
    ctx.beginPath();ctx.arc(origin.x,origin.y,3.5,0,Math.PI*2)
    ctx.fillStyle='#d2d2d0';ctx.fill()
    if(labels) {
      ctx.fillStyle='#a6a6a6'
      const labelY=Math.max(72,Math.min(view.height-31,origin.y-8))
      for(let x=origin.x%spacing;x<view.width;x+=spacing) {
        const i=Math.round((x-origin.x)/spacing)
        if(i&&x>26)ctx.fillText(tickLabel(i*step),x+3,labelY)
      }
      const labelX=Math.max(8,Math.min(view.width-35,origin.x+9))
      for(let y=origin.y%spacing;y<view.height-36;y+=spacing) {
        const i=Math.round((origin.y-y)/spacing)
        if(i&&y>56)ctx.fillText(tickLabel(i*step),labelX,y-4)
      }
      ctx.fillStyle='#d2d2d0'
      ctx.fillText('X',view.width-14,labelY)
      ctx.fillText('Y',labelX,18)
      ctx.fillText('O',origin.x+8,origin.y-8)
    }
  } else {
    const maxRadius=Math.hypot(view.width-origin.x,view.height-origin.y,origin.x,origin.y)
    if(grid) {
      ctx.beginPath()
      for(let radius=spacing;radius<=maxRadius;radius+=spacing)ctx.arc(origin.x,origin.y,radius,0,Math.PI*2)
      ctx.strokeStyle='#29292e';ctx.stroke()
    }
    ctx.beginPath()
    for(let i=0;i<12;i++) {
      const angle=i*Math.PI/6
      line(ctx,origin,{x:origin.x+Math.cos(angle)*maxRadius,y:origin.y-Math.sin(angle)*maxRadius})
    }
    ctx.strokeStyle='#3b3b43';ctx.stroke()
    if(labels) {
      ctx.fillStyle='#a6a6a6'
      const labelRadius=Math.min(maxRadius*.72,Math.max(24,Math.min(view.width,view.height)*.14))
      for(let i=0;i<12;i++) {
        const angle=i*Math.PI/6
        const x=origin.x+Math.cos(angle)*labelRadius,y=origin.y-Math.sin(angle)*labelRadius
        if(x>18&&x<view.width-30&&y>54&&y<view.height-30)ctx.fillText(i*30+'°',x+4,y-4)
      }
      if(grid) {
        ctx.fillStyle='#8f8f98'
        for(let radius=spacing,r=1;radius<=maxRadius;radius+=spacing,r++) {
          const x=origin.x+radius/Math.sqrt(2),y=origin.y+radius/Math.sqrt(2)
          if(x>0&&x<view.width-45&&y>54&&y<view.height-28)ctx.fillText(tickLabel(r*step)+' m',x+4,y+12)
        }
      }
    }
    ctx.fillStyle='#d2d2d0'
    ctx.beginPath();ctx.arc(origin.x,origin.y,3.5,0,Math.PI*2);ctx.fill()
    if(labels)ctx.fillText('O',origin.x+8,origin.y-8)
  }
  ctx.restore()
}
