type RGB = readonly [number, number, number]
const ice = [130, 196, 255] as const
const cyan = [92, 212, 255] as const
const gold = [255, 185, 120] as const
const rgba = ([r,g,b]: RGB, alpha: number) => 'rgba('+r+','+g+','+b+','+alpha+')'
const tau = Math.PI * 2
const violet = [126,107,215] as const

function nebula(ctx:CanvasRenderingContext2D,w:number,h:number,t:number,small:boolean) {
  const colors=[ice,cyan,violet,ice,gold]
  const layers=small?8:17
  ctx.save()
  ctx.globalCompositeOperation='screen'
  for(const side of [-1,1])for(let layer=0;layer<layers;layer++) {
    const offset=layer/(layers-1)-.5
    const shift=Math.sin(t*tau/(24+layer*.57)+layer*.19+side)*.012
    const hue=colors[(layer+(side>0?1:0))%4]
    const gradient=ctx.createLinearGradient(side<0?0:w,h*.33,w*.5,h*.61)
    gradient.addColorStop(0,rgba(hue,.015))
    gradient.addColorStop(.25,rgba(hue,.029))
    gradient.addColorStop(.47,rgba(hue,.085*(1-Math.abs(offset))))
    gradient.addColorStop(.70,rgba(layer%9===0?gold:hue,.05))
    gradient.addColorStop(1,rgba(hue,0))
    ctx.strokeStyle=gradient
    ctx.lineWidth=Math.max(.7,h*(.001+Math.abs(offset)*.017))
    const x=(n:number)=>w*(.5+side*n)
    ctx.beginPath()
    ctx.moveTo(x(.55),h*(.16+offset*.25))
    const bend=h*(.51+shift+offset*.09+(side>0?.025:0))
    ctx.bezierCurveTo(x(.38),h*(.48+offset*.08),x(.36),bend-h*.08,x(.24),bend)
    ctx.bezierCurveTo(x(.13),bend+h*.074,x(.06),h*(.57+offset*.09),x(.005),h*.585)
    ctx.stroke()
  }
  ctx.restore()
}

function sunrise(ctx:CanvasRenderingContext2D,w:number,h:number,t:number,small:boolean) {
  const x=w/2,y=h*(small?.66:.636)
  const breathing=.85+.15*Math.sin(t*tau/8)
  const shimmer=.90+.10*Math.cos(t*tau/15)
  ctx.save()
  ctx.globalCompositeOperation='screen'
  ctx.translate(x,y)
  ctx.scale(2.8,1)
  const intensity=small?1:.56
  glow(ctx,0,-h*.008,h*.19,violet,.32*breathing*intensity)
  glow(ctx,0,0,h*.12,ice,.57*breathing*intensity)
  glow(ctx,0,0,h*.068,gold,.90*shimmer*intensity)
  glow(ctx,0,0,h*.035,[255,241,220],shimmer*intensity)
  ctx.restore()
  const gradient=ctx.createLinearGradient(0,y,w,y)
  gradient.addColorStop(0,'#4dbeff00')
  gradient.addColorStop(.29,'#78c3ff85')
  gradient.addColorStop(.5,'#fff1dcee')
  gradient.addColorStop(.71,'#9bc7ff7a')
  gradient.addColorStop(1,'#4dbeff00')
  const sag=h*(small?.025:.122)
  ctx.beginPath();ctx.moveTo(0,y+sag);ctx.quadraticCurveTo(x,y-sag,w,y+sag)
  ctx.strokeStyle=gradient;ctx.lineWidth=4
  ctx.globalAlpha=breathing*(small?.29:.08);ctx.stroke();ctx.globalAlpha=1
}

function glow(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: RGB, alpha: number) {
  const gradient = ctx.createRadialGradient(x,y,0,x,y,radius)
  gradient.addColorStop(0,rgba(color,alpha))
  gradient.addColorStop(.24,rgba(color,alpha*.46))
  gradient.addColorStop(1,rgba(color,0))
  ctx.fillStyle=gradient
  ctx.fillRect(x-radius,y-radius,radius*2,radius*2)
}

function starField(count:number) {
  let seed=25689
  const random=()=>((seed=Math.imul(1664525,seed)+1013904223>>>0)/4294967296)
  return Array.from({length:count},(_,i)=>({
    x:random(), y:random(), depth:random(), phase:random()*tau, cycle:3+5*random(),
    radius:i<7?.85+random()*.55:.3+random()*.56, color:i%9===0?gold:i%4===0?ice:[228,237,255] as RGB,
  }))
}

const orbits=[
  {angle:-.72, width:1, height:.26, cycle:24, period:7.5, phase:-.43, color:gold},
  {angle:.67,width:.93,height:.30,cycle:28,period:8.8,phase:2.3,color:ice},
  {angle:.79,width:1.10,height:.36,cycle:30,period:10.3,phase:5.3,color:cyan},
]

function orbitSystem(ctx:CanvasRenderingContext2D,w:number,h:number,t:number,portrait:boolean) {
  const x=w*.50,y=h*(portrait?.27:.28),radius=Math.min(w*(portrait?.40:.14),h*.29)
  let crossings=0
  for(const orbit of orbits) {
    const inclination=orbit.angle+tau*t/orbit.cycle*.5
    const cos=Math.cos(inclination),sin=Math.sin(inclination)
    const point=(angle:number)=>{
      const u=Math.cos(angle)*radius*orbit.width,v=Math.sin(angle)*radius*orbit.height
      return [x+u*cos-v*sin,y+u*sin+v*cos] as const
    }
    const [ax,ay]=point(Math.PI),[bx,by]=point(0)
    const gradient=ctx.createLinearGradient(ax,ay,bx,by)
    gradient.addColorStop(0,rgba(ice,.08))
    gradient.addColorStop(.25,rgba(ice,.52))
    gradient.addColorStop(.48,rgba(orbit.color,.91))
    gradient.addColorStop(.73,rgba(orbit.color===gold?[255,241,220]:orbit.color,.95))
    gradient.addColorStop(1,rgba(ice,.18))
    ctx.beginPath();ctx.ellipse(x,y,radius*orbit.width,radius*orbit.height,inclination,0,tau)
    ctx.strokeStyle=gradient
    ctx.lineWidth=13;ctx.globalAlpha=.032;ctx.stroke()
    ctx.lineWidth=6;ctx.globalAlpha=.13;ctx.stroke()
    ctx.lineWidth=1.45;ctx.globalAlpha=1;ctx.stroke()

    const phase=orbit.phase+tau*t/orbit.period
    for(let i=12;i>0;i--) {
      const [px,py]=point(phase-i*.022),[qx,qy]=point(phase-(i-1)*.022)
      ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(qx,qy)
      ctx.strokeStyle=rgba(orbit.color,.48*(1-i/13)**2);ctx.lineWidth=1.8;ctx.stroke()
    }
    const [px,py]=point(phase),size=Math.max(2.3,radius*(orbit.color===gold?.063:.023))
    glow(ctx,px,py,size*6,orbit.color,.68)
    const core=ctx.createRadialGradient(px-size*.3,py-size*.35,0,px,py,size)
    core.addColorStop(0,'#fff1dc')
    core.addColorStop(.38,rgba(orbit.color,.93))
    core.addColorStop(.67,'#243d6b')
    core.addColorStop(1,'#a8edff')
    ctx.fillStyle=core;ctx.beginPath();ctx.arc(px,py,size,0,tau);ctx.fill()
    crossings+=Math.exp(-((Math.hypot(px-x,py-y)/(radius*.41))**2))
  }
  glow(ctx,x,y,radius*.54,ice,.12+crossings*.24)
}

export function animateSpace(canvas: HTMLCanvasElement, atmosphere: HTMLDivElement) {
  const ctx=canvas.getContext('2d')
  const reduced=matchMedia('(prefers-reduced-motion: reduce)')
  const stars=starField(115)
  let frame=0, previous=0, elapsed=0, width=0, height=0, lastPaint=-1
  let small=false,interval=0
  function resize() {
    width=canvas.clientWidth;height=canvas.clientHeight
    small=width/Math.max(height,1)<.8
    const lowPower=small||navigator.hardwareConcurrency<=4
    interval=lowPower?32:0
    const resolution=Math.min(devicePixelRatio,lowPower?1.25:1.6)
    canvas.width=Math.round(width*resolution);canvas.height=Math.round(height*resolution)
    ctx?.setTransform(resolution,0,0,resolution,0,0)
    paint()
  }
  function paint() {
    const w=width,h=height,t=reduced.matches?0:elapsed
    if(!w||!h)return
    atmosphere.style.setProperty('--wisp-x',(.8*Math.sin(t*tau/28))+'%')
    atmosphere.style.setProperty('--wisp-y',(1.1*Math.sin(t*tau/24))+'%')
    atmosphere.style.setProperty('--wisp-turn',(1.4*Math.sin(t*tau/31))+'deg')
    atmosphere.style.setProperty('--wisp-alpha',String(.33+.13*Math.sin(t*tau/20)))
    if(!ctx)return
    ctx.clearRect(0,0,w,h)
    const horizon=h*(small?.66:.65)
    const count=small?57:stars.length
    for(let i=0;i<count;i++) {
      const star=stars[i]
      const drift=Math.sin(t*tau/(60-30*star.depth)+star.phase)
      const x=(star.x+.009*star.depth*drift)*w,y=star.y*h*.80
      const alpha=(.28+.48*star.depth)*(.84+.15*Math.sin(t*tau/star.cycle+star.phase))
      if(y>horizon+(.15*h)*(2*x/w-1)**2)continue
      if(star.radius>1.15)glow(ctx,x,y,6,star.color,alpha*.42)
      ctx.beginPath();ctx.arc(x,y,star.radius,0,tau)
      ctx.fillStyle=rgba(star.color,alpha);ctx.fill()
    }
    if(canvas.parentElement?.classList.contains('launch-texture-failed'))nebula(ctx,w,h,t,small)
    sunrise(ctx,w,h,t,small)
    orbitSystem(ctx,w,h,t,small)
  }
  function tick(now:number) {
    if(previous)elapsed+=Math.min(.064,(now-previous)/1000)
    previous=now
    if(now-lastPaint>=interval){paint();lastPaint=now}
    frame=requestAnimationFrame(tick)
  }
  function sync() {
    cancelAnimationFrame(frame);previous=0;lastPaint=-1
    if(!document.hidden&&!reduced.matches)frame=requestAnimationFrame(tick)
    else paint()
  }
  const observer=new ResizeObserver(resize)
  observer.observe(canvas)
  document.addEventListener('visibilitychange',sync)
  reduced.addEventListener('change',sync)
  resize();sync()
  return ()=>{
    cancelAnimationFrame(frame);observer.disconnect()
    document.removeEventListener('visibilitychange',sync)
    reduced.removeEventListener('change',sync)
  }
}
