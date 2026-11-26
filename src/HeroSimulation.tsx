import { useEffect, useRef } from 'react'

const velocity=10
const angle=Math.PI/4
const gravity=9.81
const vx=velocity*Math.cos(angle)
const vy=velocity*Math.sin(angle)
const flight=2*vy/gravity
const range=vx*flight
const apex=vy*vy/(2*gravity)

const INK='rgba(244,242,236,'
const SAND='rgba(201,174,132,'
const QUIET='rgba(138,133,125,'

export function HeroSimulation() {
  const canvasRef=useRef<HTMLCanvasElement>(null)

  useEffect(()=>{
    const canvas=canvasRef.current
    if(!canvas)return
    const context=canvas.getContext('2d')
    if(!context)return
    const ctx=context
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let width=0
    let height=0
    let frame=0
    let last=0
    let start=performance.now()

    function resize() {
      const rect=canvas!.getBoundingClientRect()
      const dpr=Math.min(2,window.devicePixelRatio||1)
      width=rect.width
      height=rect.height
      canvas!.width=Math.round(width*dpr)
      canvas!.height=Math.round(height*dpr)
      ctx.setTransform(dpr,0,0,dpr,0,0)
      draw(performance.now())
    }

    function draw(now:number) {
      if(!width||!height)return
      const dpr=Math.min(2,window.devicePixelRatio||1)
      ctx.setTransform(dpr,0,0,dpr,0,0)
      ctx.clearRect(0,0,width,height)

      const left=Math.max(38,width*.07)
      const right=width-Math.max(22,width*.045)
      const top=height*.2
      const ground=height*.77
      const plotWidth=right-left
      const plotHeight=ground-top
      const plotHeightSafe=plotHeight||1
      const point=(t:number)=>({x:left+(vx*t/range)*plotWidth,y:ground-((vy*t-.5*gravity*t*t)/apex)*plotHeightSafe})
      const axisY=ground+.5

      // 坐标轴：一条底线、一条细竖线
      ctx.lineWidth=1
      ctx.strokeStyle=INK+'.22)'
      ctx.beginPath()
      ctx.moveTo(left-14,axisY)
      ctx.lineTo(right+10,axisY)
      ctx.stroke()
      ctx.strokeStyle=INK+'.12)'
      ctx.beginPath()
      ctx.moveTo(left,top-18)
      ctx.lineTo(left,ground+8)
      ctx.stroke()

      // 刻度
      for(let tick=0;tick<=10;tick++){
        const x=left+plotWidth*tick/10
        ctx.strokeStyle=INK+(tick%5===0?'.26)':'.14)')
        ctx.beginPath()
        ctx.moveTo(x,ground)
        ctx.lineTo(x,ground+(tick%5===0?6:3))
        ctx.stroke()
      }
      for(let tick=0;tick<=4;tick++){
        const y=ground-plotHeight*tick/4
        ctx.strokeStyle=INK+'.14)'
        ctx.beginPath()
        ctx.moveTo(left,y)
        ctx.lineTo(left-(tick%2===0?6:3),y)
        ctx.stroke()
      }

      // 预测轨迹：细虚线
      ctx.setLineDash([2,5])
      ctx.strokeStyle=INK+'.26)'
      ctx.beginPath()
      for(let step=0;step<=110;step++){
        const p=point(flight*step/110)
        if(step===0)ctx.moveTo(p.x,p.y)
        else ctx.lineTo(p.x,p.y)
      }
      ctx.stroke()
      ctx.setLineDash([])

      // 最高点：空心标记 + 引线 + 读数
      const apexPoint=point(flight/2)
      ctx.strokeStyle=INK+'.18)'
      ctx.beginPath()
      ctx.moveTo(apexPoint.x,apexPoint.y+6)
      ctx.lineTo(apexPoint.x,ground)
      ctx.stroke()
      ctx.strokeStyle=INK+'.5)'
      ctx.beginPath()
      ctx.arc(apexPoint.x,apexPoint.y,3,0,Math.PI*2)
      ctx.stroke()
      ctx.font='italic 11px "Newsreader Variable", Georgia, serif'
      ctx.fillStyle=QUIET+'.95)'
      ctx.textAlign='center'
      ctx.fillText('h = 2.55 m',apexPoint.x,Math.max(12,apexPoint.y-12))
      ctx.textAlign='left'

      // 已运动轨迹
      const cycle=reduced?0:(now-start)%5200
      const progress=reduced?.72:Math.min(cycle/3600,1)
      const time=flight*progress
      const fade=reduced?1:Math.min(1,cycle/200,(5200-cycle)/320)
      const current=point(time)

      ctx.save()
      ctx.globalAlpha=fade
      ctx.strokeStyle=INK+'.92)'
      ctx.lineWidth=1.5
      ctx.beginPath()
      for(let step=0;step<=90;step++){
        const p=point(time*step/90)
        if(step===0)ctx.moveTo(p.x,p.y)
        else ctx.lineTo(p.x,p.y)
      }
      ctx.stroke()

      // 速度矢量
      const arrowLength=Math.min(30,plotWidth*.055)
      const speedX=vx
      const speedY=vy-gravity*time
      const speed=Math.hypot(speedX,speedY)||1
      const arrowX=current.x+speedX/speed*arrowLength
      const arrowY=current.y-speedY/speed*arrowLength
      ctx.strokeStyle=SAND+'.85)'
      ctx.lineWidth=1
      ctx.beginPath()
      ctx.moveTo(current.x,current.y)
      ctx.lineTo(arrowX,arrowY)
      ctx.stroke()
      const direction=Math.atan2(arrowY-current.y,arrowX-current.x)
      ctx.beginPath()
      ctx.moveTo(arrowX,arrowY)
      ctx.lineTo(arrowX-Math.cos(direction-.42)*5,arrowY-Math.sin(direction-.42)*5)
      ctx.moveTo(arrowX,arrowY)
      ctx.lineTo(arrowX-Math.cos(direction+.42)*5,arrowY-Math.sin(direction+.42)*5)
      ctx.stroke()

      // 小球：实心点 + 一圈留白
      ctx.fillStyle='#0b0b0d'
      ctx.beginPath()
      ctx.arc(current.x,current.y,5.6,0,Math.PI*2)
      ctx.fill()
      ctx.fillStyle=INK+'1)'
      ctx.beginPath()
      ctx.arc(current.x,current.y,2.6,0,Math.PI*2)
      ctx.fill()

      // 时间读数
      ctx.font='10px "JetBrains Mono Variable", Consolas, monospace'
      ctx.fillStyle=QUIET+'.95)'
      const readout=time.toFixed(2)+' s'
      if(current.x>width-58){
        ctx.textAlign='right'
        ctx.fillText(readout,current.x-12,current.y-11)
        ctx.textAlign='left'
      }
      else ctx.fillText(readout,current.x+12,current.y-11)
      ctx.restore()

      // 轴名
      ctx.font='9px "JetBrains Mono Variable", Consolas, monospace'
      ctx.fillStyle=QUIET+'.75)'
      ctx.textAlign='right'
      ctx.fillText('x / m',right+8,ground+21)
      ctx.textAlign='left'
      ctx.fillText('y / m',left-30,top-20)
    }

    function loop(now:number) {
      if(now-last>=32){draw(now);last=now}
      frame=requestAnimationFrame(loop)
    }
    const observer=new ResizeObserver(resize)
    observer.observe(canvas)
    resize()
    start=performance.now()
    if(!reduced)frame=requestAnimationFrame(loop)
    return ()=>{
      observer.disconnect()
      cancelAnimationFrame(frame)
    }
  },[])

  return <canvas ref={canvasRef} className="hero-simulation" aria-hidden="true"/>
}
