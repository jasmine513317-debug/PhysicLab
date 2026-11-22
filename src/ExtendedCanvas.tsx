import { useLayoutEffect, useRef } from 'react'
import type { ExtendedSimulation } from './extended-physics'

function render(ctx:CanvasRenderingContext2D,width:number,height:number,engine:ExtendedSimulation,planetFrame:boolean) {
  const {scene,current}=engine
  const accent='#a6bfff',white='#f5f5f2',grid='#303037'
  ctx.fillStyle='#101012';ctx.fillRect(0,0,width,height)
  ctx.lineWidth=1;ctx.font='12px monospace';ctx.textBaseline='middle'
  const line=(points:[number,number][],color:string,thickness=1)=>{
    if(!points.length)return
    ctx.beginPath();ctx.moveTo(...points[0]);for(const point of points.slice(1))ctx.lineTo(...point)
    ctx.strokeStyle=color;ctx.lineWidth=thickness;ctx.stroke()
  }
  const dot=(x:number,y:number,radius:number,color:string)=>{
    ctx.beginPath();ctx.arc(x,y,radius,0,Math.PI*2);ctx.fillStyle=color;ctx.fill()
  }
  const label=(x:number,y:number,text:string,color=white)=>{ctx.fillStyle=color;ctx.fillText(text,x,y)}
  if(current.doublePendulum&&scene.extension==='double-pendulum') {
    const pivot:[number,number]=[width/2,height/2]
    const scale=.43*Math.min(width,height)/(scene.settings.length1+scene.settings.length2)
    const screen=(point:{x:number;y:number}):[number,number]=>[pivot[0]+point.x*scale,pivot[1]-point.y*scale]
    const history=engine.history.slice(-430).concat(current)
    line([[pivot[0],15],[pivot[0],height-24]],grid)
    const samples=current.doublePendulum
    const runs=[['base',accent],['comparison','#f2c38b']] as const
    for(const [run,color] of runs) {
      if(run==='comparison')ctx.setLineDash([4,4])
      line(history.map(sample=>screen(sample.doublePendulum![run].second)),color+'60')
      line([pivot,screen(samples[run].first),screen(samples[run].second)],color,2)
      ctx.setLineDash([])
      dot(...screen(samples[run].first),5,color)
      dot(...screen(samples[run].second),7,color)
    }
    dot(...pivot,4,white)
    label(13,height-17,'原始轨迹',accent)
    label(86,height-17,'扰动轨迹（虚线）','#f2c38b')
    return
  }
  if(current.gravity&&engine.gravity) {
    const center=current.gravity.center, flyby=scene.extension==='gravity-assist'
    const frame=flyby?(planetFrame?1:0):undefined
    const samples=engine.history.slice(-700).concat(current)
    const point=(sample:NonNullable<typeof current.gravity>,index:number,twin=false)=>{
      const body=(twin?sample.comparison!:sample.bodies)[index]
      const origin=frame===undefined?sample.center:sample.bodies[frame]
      return {x:body.x-origin.x,y:body.y-origin.y}
    }
    const visible=flyby&&planetFrame?[1,2]:[0,1,2]
    const extent=Math.max(flyby&&planetFrame&&scene.extension==='gravity-assist'?scene.settings.measurementRadius*1.1:.05,
      ...samples.flatMap(sample=>visible.map(index=>{
        const p=point(sample.gravity!,index);return Math.hypot(p.x,p.y)
      })),current.gravity.comparison?Math.hypot(current.gravity.comparison[2].x-center.x,current.gravity.comparison[2].y-center.y):0)
    const scale=.42*Math.min(width,height)/extent
    const screen=(p:{x:number;y:number}):[number,number]=>[width/2+p.x*scale,height/2-p.y*scale]
    const colors=['#f2c38b',accent,'#a8e6cf']
    const names=flyby?['恒星','行星','航天器']:['天体 1','天体 2','天体 3']
    const origin:[number,number]=[width/2,height/2]
    line([[0,origin[1]],[width,origin[1]]],grid);line([[origin[0],0],[origin[0],height]],grid)
    if(flyby&&scene.extension==='gravity-assist') {
      ctx.beginPath();ctx.arc(...screen(point(current.gravity,1)),scene.settings.measurementRadius*scale,0,Math.PI*2)
      ctx.setLineDash([5,5]);ctx.strokeStyle='#797982';ctx.stroke();ctx.setLineDash([])
    }
    if(current.gravity.comparison) {
      ctx.setLineDash([4,4])
      line(samples.map(sample=>screen(point(sample.gravity!,2,true))),white)
      ctx.setLineDash([])
      dot(...screen(point(current.gravity,2,true)),4,white)
    }
    for(const index of visible) {
      line(samples.map(sample=>screen(point(sample.gravity!,index))),colors[index],1.5)
      const [x,y]=screen(point(current.gravity,index))
      dot(x,y,index===0?7:5,colors[index])
      label(x+9,y-11,names[index],colors[index])
    }
    if(!flyby)dot(...origin,3,white)
    label(13,height-17,(flyby?(planetFrame?'行星系':'恒星系'):'质心系')+' · '+(50/scale).toPrecision(2)+' AU / 50 px')
    if(current.gravity.comparison)label(13,17,'虚线 · 扰动后的天体 3')
    return
  }
  if(current.induction&&scene.extension==='induction') {
    const {field,emf,current:amps}=current.induction
    const x=width/2,y=height/2,rx=Math.min(width,height)*.28,ry=rx*.53
    const projected=field*Math.cos(scene.settings.angle*Math.PI/180)
    const marker=projected>1e-12?'⊙':projected< -1e-12?'⊗':'·'
    for(let row=-2;row<=2;row++)for(let col=-2;col<=2;col++)
      label(x+col*rx*.68-4,y+row*ry-4,marker,'#a8e6cf')
    const outline=Array.from({length:97},(_,index):[number,number]=>{
      const gap=scene.settings.closed?0:.19,angle=gap+(2*Math.PI-2*gap)*index/96
      return [x+rx*Math.cos(angle),y+ry*Math.sin(angle)]
    })
    line(outline,'#8b8b93',2)
    if(!scene.settings.closed) {
      dot(...outline[0],3,white);dot(...outline.at(-1)!,3,white)
    }
    if(Math.abs(amps)>1e-12) {
      const sign=-Math.sign(amps)
      line([[x-12*sign,y-ry],[x+12*sign,y-ry]],'#f2c38b',3)
      line([[x+5*sign,y-ry-6],[x+12*sign,y-ry],[x+5*sign,y-ry+6]],'#f2c38b',2)
    }
    label(13,17,'⊙ 朝外   ⊗ 朝内','#a8e6cf')
    label(13,height-17,(scene.settings.closed?'闭合回路':'断开回路')+' · ε = '+emf.toPrecision(3)+' V')
    return
  }
  if(scene.extension==='pendulum') {
    const pivotX=width/2,pivotY=height*.38,pixels=height*.29/scene.settings.length
    const x=pivotX+current.x*pixels,y=pivotY-current.y*pixels
    ctx.setLineDash([4,6]);line([[pivotX,pivotY],[pivotX,pivotY+height*.36]],grid);ctx.setLineDash([])
    line([[pivotX-45,pivotY],[pivotX+45,pivotY]],'#8b8b93',2)
    for(let i=-4;i<=4;i++)line([[pivotX+i*9,pivotY],[pivotX+i*9+5,pivotY-5]],grid)
    line([[pivotX,pivotY],[x,y]],'#9b9baa',2);dot(pivotX,pivotY,4,white);dot(x,y,11,accent)
    const displayAngle=Math.atan2(Math.sin(current.angle),Math.cos(current.angle))
    ctx.beginPath();ctx.arc(pivotX,pivotY,height*.12,Math.min(Math.PI/2,Math.PI/2-displayAngle),Math.max(Math.PI/2,Math.PI/2-displayAngle))
    ctx.strokeStyle='#f2c38b';ctx.stroke()
    label(13,height-16,'θ = '+(current.angle*180/Math.PI).toFixed(2)+'°')
    return
  }
  if(scene.extension==='rc') {
    const mid=width/2,left=width*.16,right=width*.84,top=height*.27,bottom=height*.73,half=(top+bottom)/2
    line([[left,half-8],[left,top],[mid-72,top]],grid,2)
    const resistor:[number,number][]=[[mid-72,top]]
    for(let i=1;i<=9;i++)resistor.push([mid-72+i*5,top+(i%2?7:-7)])
    resistor.push([mid-22,top]);line(resistor,'#f2c38b',2)
    line([[mid-22,top],[mid+8,top]],grid,2)
    line([[mid+8,top],[mid+52,top],[right,top],[right,half-7]],accent,2)
    dot(mid+8,top,3,white);dot(mid+52,top,3,white)
    line([[right-13,half-7],[right+13,half-7]],accent,2)
    line([[right-13,half+7],[right+13,half+7]],accent,2)
    line([[right,half+7],[right,bottom],[left,bottom],[left,half+8]],grid,2)
    line([[left-12,half-8],[left+12,half-8]],white,2)
    line([[left-7,half+8],[left+7,half+8]],white,2)
    label(mid-52,top-25,'R','#f2c38b');label(right+17,half,'C',accent)
    label(left-15,half+33,current.sourceVoltage.toFixed(2)+' V')
    label(13,height-16,engine.rcMode==='charge'?'充电回路':'放电回路')
    return
  }
  if(scene.extension!=='particle')return
  const samples=engine.history.slice(-650).concat(current)
  const {mass,charge,bz,ex,ey,vx,vy}=scene.settings
  const initialSpeed=Math.hypot(vx,vy), frequency=Math.abs(charge*bz/mass), acceleration=Math.abs(charge/mass)*Math.hypot(ex,ey)
  const expected=frequency&&acceleration===0?2*initialSpeed/frequency:initialSpeed*engine.rate+.5*acceleration*engine.rate**2
  const extent=Math.max(expected||1,1e-20,...samples.map(sample=>Math.max(Math.abs(sample.x),Math.abs(sample.y))))
  const scale=Math.min(width,height)*.40/extent
  const screen=(x:number,y:number):[number,number]=>[width/2+x*scale,height/2-y*scale]
  const spacing=10**Math.round(Math.log10(55/scale))*scale
  for(let x=width/2%spacing;x<width;x+=spacing)line([[x,0],[x,height]],grid)
  for(let y=height/2%spacing;y<height;y+=spacing)line([[0,y],[width,y]],grid)
  line([[0,height/2],[width,height/2]],'#54545e');line([[width/2,0],[width/2,height]],'#54545e')
  line(samples.map(sample=>screen(sample.x,sample.y)),accent,2)
  const [px,py]=screen(current.x,current.y)
  dot(px,py,6,scene.settings.charge<0?'#d5b8f5':'#f2c38b')
  const speed=Math.hypot(current.vx,current.vy)
  if(speed>0)line([[px,py],[px+30*current.vx/speed,py-30*current.vy/speed]],'#a8e6cf',2)
  label(13,height-16,(scene.settings.bz>0?'Bz ⊙':scene.settings.bz<0?'Bz ⊗':'Bz = 0')+'  ·  '+Number((spacing/scale).toPrecision(2))+' m / 格')
}

export function ExtendedCanvas({engine,revision,planetFrame}:{engine:ExtendedSimulation;revision:number;planetFrame:boolean}) {
  const element=useRef<HTMLCanvasElement>(null),latest=useRef({engine,planetFrame})
  function draw() {
    const canvas=element.current,ctx=canvas?.getContext('2d')
    if(!canvas||!ctx||!canvas.clientWidth||!canvas.clientHeight)return
    const width=canvas.clientWidth,height=canvas.clientHeight,pixels=Math.min(devicePixelRatio,2)
    if(canvas.width!==Math.round(width*pixels))canvas.width=Math.round(width*pixels)
    if(canvas.height!==Math.round(height*pixels))canvas.height=Math.round(height*pixels)
    ctx.setTransform(pixels,0,0,pixels,0,0)
    render(ctx,width,height,latest.current.engine,latest.current.planetFrame)
  }
  useLayoutEffect(()=>{latest.current={engine,planetFrame};draw()},[engine,revision,planetFrame])
  useLayoutEffect(()=>{
    const observer=new ResizeObserver(draw);observer.observe(element.current!)
    return ()=>observer.disconnect()
  },[])
  return <canvas ref={element} className="astronomy-canvas" aria-label="扩展实验画布"/>
}
