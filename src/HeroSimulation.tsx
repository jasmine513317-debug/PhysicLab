import { useEffect, useRef } from 'react'

type Particle={x:number;y:number;size:number;speed:number;phase:number}

const velocity=10
const angle=Math.PI/4
const gravity=9.81
const vx=velocity*Math.cos(angle)
const vy=velocity*Math.sin(angle)
const flight=2*vy/gravity
const range=vx*flight
const apex=vy*vy/(2*gravity)

export function HeroSimulation() {
  const canvasRef=useRef<HTMLCanvasElement>(null)

  useEffect(()=>{
    const canvas=canvasRef.current
    if(!canvas)return
    const context=canvas.getContext('2d')
    if(!context)return
    const ctx=context
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const particles:Particle[]=Array.from({length:46},(_,index)=>({
      x:((index*47+19)%101)/101,
      y:((index*67+31)%103)/103,
      size:.45+(index%4)*.32,
      speed:.35+(index%7)*.08,
      phase:index*.73,
    }))
    let width=0
    let height=0
    let frame=0
    let last=0
    let start=performance.now()
    let pointerX=0
    let pointerY=0
    let smoothX=0
    let smoothY=0

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
      ctx.setTransform(Math.min(2,window.devicePixelRatio||1),0,0,Math.min(2,window.devicePixelRatio||1),0,0)
      ctx.clearRect(0,0,width,height)
      smoothX+=(pointerX-smoothX)*.045
      smoothY+=(pointerY-smoothY)*.045
      const seconds=reduced?1.05:(now-start)/1000

      const glow=ctx.createRadialGradient(width*.57,height*.43,0,width*.57,height*.43,width*.52)
      glow.addColorStop(0,'rgba(55,132,190,.13)')
      glow.addColorStop(.5,'rgba(22,70,110,.055)')
      glow.addColorStop(1,'rgba(4,9,15,0)')
      ctx.fillStyle=glow
      ctx.fillRect(0,0,width,height)

      ctx.lineWidth=1
      ctx.strokeStyle='rgba(126,179,218,.052)'
      const grid=44
      const offsetX=(smoothX*7)%grid
      const offsetY=(smoothY*5)%grid
      ctx.beginPath()
      for(let x=-grid+offsetX;x<width+grid;x+=grid){ctx.moveTo(x,0);ctx.lineTo(x,height)}
      for(let y=-grid+offsetY;y<height+grid;y+=grid){ctx.moveTo(0,y);ctx.lineTo(width,y)}
      ctx.stroke()

      for(const particle of particles){
        const px=particle.x*width+smoothX*10*particle.size
        const py=((particle.y*height-seconds*particle.speed*9)%height+height)%height
        const alpha=.12+.22*(.5+.5*Math.sin(seconds*.8+particle.phase))
        ctx.fillStyle=`rgba(144,213,241,${alpha})`
        ctx.beginPath()
        ctx.arc(px,py,particle.size,0,Math.PI*2)
        ctx.fill()
      }

      const cx=width*.58+smoothX*12
      const cy=height*.44+smoothY*9
      ctx.save()
      ctx.translate(cx,cy)
      ctx.rotate(-.22+seconds*.018)
      for(let ring=0;ring<3;ring++){
        const rx=width*(.25+ring*.075)
        const ry=height*(.19+ring*.06)
        ctx.strokeStyle=`rgba(116,203,235,${.11-ring*.022})`
        ctx.lineWidth=1
        ctx.setLineDash(ring===1?[2,7]:[])
        ctx.beginPath()
        ctx.ellipse(0,0,rx,ry,0,Math.PI*.08,Math.PI*(1.72+ring*.06))
        ctx.stroke()
        const orbit=seconds*(.24+ring*.08)+ring*2.1
        const ox=Math.cos(orbit)*rx
        const oy=Math.sin(orbit)*ry
        ctx.setLineDash([])
        ctx.fillStyle=`rgba(157,232,255,${.65-ring*.14})`
        ctx.shadowColor='#72d7ff'
        ctx.shadowBlur=9
        ctx.beginPath()
        ctx.arc(ox,oy,ring===0?2.2:1.4,0,Math.PI*2)
        ctx.fill()
        ctx.shadowBlur=0
      }
      ctx.restore()

      const left=Math.max(42,width*.075)
      const right=width-Math.max(30,width*.055)
      const top=height*.17
      const ground=height*.76
      const plotWidth=right-left
      const plotHeight=ground-top
      const point=(t:number)=>({x:left+(vx*t/range)*plotWidth,y:ground-((vy*t-.5*gravity*t*t)/apex)*plotHeight})

      ctx.strokeStyle='rgba(133,190,222,.16)'
      ctx.lineWidth=1
      ctx.beginPath()
      ctx.moveTo(left-12,ground+.5)
      ctx.lineTo(right+10,ground+.5)
      ctx.stroke()
      ctx.strokeStyle='rgba(133,190,222,.08)'
      ctx.beginPath()
      ctx.moveTo(left,top-16)
      ctx.lineTo(left,ground+12)
      ctx.stroke()
      for(let tick=0;tick<=10;tick++){
        const x=left+plotWidth*tick/10
        ctx.strokeStyle='rgba(133,190,222,.13)'
        ctx.beginPath()
        ctx.moveTo(x,ground)
        ctx.lineTo(x,ground+(tick%5===0?7:4))
        ctx.stroke()
      }

      ctx.setLineDash([3,6])
      ctx.strokeStyle='rgba(139,197,227,.25)'
      ctx.beginPath()
      for(let step=0;step<=90;step++){
        const p=point(flight*step/90)
        if(step===0)ctx.moveTo(p.x,p.y)
        else ctx.lineTo(p.x,p.y)
      }
      ctx.stroke()
      ctx.setLineDash([])

      const cycle=reduced?0:(now-start)%5200
      const progress=reduced?.72:Math.min(cycle/3600,1)
      const time=flight*progress
      const fade=reduced?1:Math.min(1,cycle/220,(5200-cycle)/320)
      const current=point(time)
      const trail=ctx.createLinearGradient(left,ground,current.x,current.y)
      trail.addColorStop(0,'rgba(83,157,205,.12)')
      trail.addColorStop(.55,'rgba(112,211,248,.72)')
      trail.addColorStop(1,'rgba(224,249,255,.98)')
      ctx.save()
      ctx.globalAlpha=fade
      ctx.strokeStyle=trail
      ctx.lineWidth=1.7
      ctx.shadowColor='#67d5ff'
      ctx.shadowBlur=9
      ctx.beginPath()
      for(let step=0;step<=80;step++){
        const p=point(time*step/80)
        if(step===0)ctx.moveTo(p.x,p.y)
        else ctx.lineTo(p.x,p.y)
      }
      ctx.stroke()
      ctx.shadowBlur=0

      const arrowScale=Math.min(30,plotWidth*.055)
      const speedX=vx
      const speedY=vy-gravity*time
      const speed=Math.hypot(speedX,speedY)||1
      const arrowX=current.x+speedX/speed*arrowScale
      const arrowY=current.y-speedY/speed*arrowScale
      ctx.strokeStyle='rgba(174,232,250,.62)'
      ctx.lineWidth=1
      ctx.beginPath()
      ctx.moveTo(current.x,current.y)
      ctx.lineTo(arrowX,arrowY)
      ctx.stroke()
      const direction=Math.atan2(arrowY-current.y,arrowX-current.x)
      ctx.beginPath()
      ctx.moveTo(arrowX,arrowY)
      ctx.lineTo(arrowX-Math.cos(direction-.5)*5,arrowY-Math.sin(direction-.5)*5)
      ctx.moveTo(arrowX,arrowY)
      ctx.lineTo(arrowX-Math.cos(direction+.5)*5,arrowY-Math.sin(direction+.5)*5)
      ctx.stroke()

      const ballGlow=ctx.createRadialGradient(current.x,current.y,0,current.x,current.y,19)
      ballGlow.addColorStop(0,'rgba(224,250,255,.95)')
      ballGlow.addColorStop(.2,'rgba(112,215,255,.65)')
      ballGlow.addColorStop(1,'rgba(76,182,240,0)')
      ctx.fillStyle=ballGlow
      ctx.beginPath()
      ctx.arc(current.x,current.y,19,0,Math.PI*2)
      ctx.fill()
      ctx.fillStyle='#e9fbff'
      ctx.shadowColor='#8be4ff'
      ctx.shadowBlur=14
      ctx.beginPath()
      ctx.arc(current.x,current.y,3.4,0,Math.PI*2)
      ctx.fill()
      ctx.shadowBlur=0

      ctx.fillStyle='rgba(164,214,237,.64)'
      ctx.font='9px "JetBrains Mono Variable", monospace'
      ctx.fillText(`${time.toFixed(2)} s`,current.x+13,current.y-12)
      const apexPoint=point(flight/2)
      ctx.fillStyle='rgba(135,192,219,.42)'
      ctx.fillText('APEX',apexPoint.x-11,apexPoint.y-15)
      ctx.strokeStyle='rgba(135,192,219,.25)'
      ctx.beginPath()
      ctx.moveTo(apexPoint.x,apexPoint.y-7)
      ctx.lineTo(apexPoint.x,apexPoint.y-2)
      ctx.stroke()
      ctx.restore()

      ctx.fillStyle='rgba(126,174,201,.38)'
      ctx.font='8px "JetBrains Mono Variable", monospace'
      ctx.fillText('X / m',right-24,ground+22)
      ctx.fillText('Y / m',left-27,top-19)
    }

    function loop(now:number) {
      if(now-last>=32){draw(now);last=now}
      frame=requestAnimationFrame(loop)
    }
    function onPointerMove(event:PointerEvent) {
      const rect=canvas!.getBoundingClientRect()
      pointerX=(event.clientX-rect.left)/rect.width-.5
      pointerY=(event.clientY-rect.top)/rect.height-.5
    }
    function onPointerLeave() {pointerX=0;pointerY=0}
    const observer=new ResizeObserver(resize)
    observer.observe(canvas)
    canvas.addEventListener('pointermove',onPointerMove)
    canvas.addEventListener('pointerleave',onPointerLeave)
    resize()
    start=performance.now()
    if(!reduced)frame=requestAnimationFrame(loop)
    return ()=>{
      observer.disconnect()
      cancelAnimationFrame(frame)
      canvas.removeEventListener('pointermove',onPointerMove)
      canvas.removeEventListener('pointerleave',onPointerLeave)
    }
  },[])

  return <canvas ref={canvasRef} className="hero-simulation" aria-hidden="true"/>
}
