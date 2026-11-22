import type { BodyConfig, Experiment, Point } from './model'
export interface Sample {
  time:number
  bodyId:string
  x:number
  y:number
  vx:number
  vy:number
  speed:number
  ax:number
  ay:number
  kinetic:number
  potential:number
  spring:number
  total:number
}
export function projectile(position:Point, velocity:Point, gravity:number, time:number): Point {
  return {x:position.x+velocity.x*time, y:position.y+velocity.y*time-gravity*time*time/2}
}
export function projectileRmse(samples:Sample[], position:Point, velocity:Point, gravity:number, duration:number) {
  let squared=0, count=0
  for(const sample of samples) {
    if(sample.time>duration)continue
    const reference=projectile(position,velocity,gravity,sample.time)
    squared+=(sample.x-reference.x)**2+(sample.y-reference.y)**2
    count++
  }
  return count>=2?Math.sqrt(squared/count):undefined
}
export function flightTime(height:number, vy:number, gravity:number) {
  if (height < 0) return 0
  if (gravity === 0) return vy < 0 ? -height/vy : Infinity
  return (vy + Math.sqrt(vy*vy+2*gravity*height))/gravity
}

export function ballisticDuration(scene:Experiment, body:BodyConfig) {
  if(scene.kind!=='projectile'&&scene.kind!=='fall')return
  const {gravity,collisions,boundaries}=scene.environment
  let duration=Infinity
  if(collisions) {
    if(boundaries||scene.bodies.some(other=>other.id!==body.id&&other.type==='dynamic'))return
    const obstacles=scene.bodies.filter(other=>other.id!==body.id)
    if(obstacles.length) {
      const [floor]=obstacles
      if(obstacles.length!==1||floor.geometry.kind!=='surface'||floor.angle!==0||body.geometry.kind!=='circle')return
      const height=body.position.y-floor.position.y-floor.geometry.height/2-body.geometry.radius
      if(height<0)return
      duration=flightTime(height,body.velocity.y,gravity)
      if(Number.isFinite(duration)) {
        const finish=projectile(body.position,body.velocity,gravity,duration)
        if(Math.max(Math.abs(body.position.x-floor.position.x),Math.abs(finish.x-floor.position.x))>floor.geometry.width/2)return
      }
    }
  }
  if(scene.joints.some(joint=>joint.a===body.id||joint.b===body.id))return
  return duration
}

export function ballisticReference(scene:Experiment, body:BodyConfig, samples:Sample[]) {
  const duration=ballisticDuration(scene,body)
  if(duration===undefined)return
  const {gravity}=scene.environment
  let index=samples.length-1
  while(index>=0&&samples[index].time>duration)index--
  const last=index>=0?samples[index]:undefined
  const values:Record<string,string>={}
  if(last&&last.time>0) {
    const position=projectile(body.position,body.velocity,gravity,last.time)
    const verticalVelocity=body.velocity.y-gravity*last.time
    values['Reference time']=last.time.toFixed(3)+' s'
    values['Vertical position']=position.y.toFixed(3)+' m'
    values['Vertical velocity']=verticalVelocity.toFixed(3)+' m/s'
  }
  if(Number.isFinite(duration)&&duration>0) {
    values['Flight time']=duration.toFixed(2)+' s'
    if(scene.kind==='projectile') {
      const peakTime=gravity>0?Math.max(0,Math.min(duration,body.velocity.y/gravity)):(body.velocity.y>0?duration:0)
      values['Peak height']=projectile(body.position,body.velocity,gravity,peakTime).y.toFixed(2)+' m'
      values['Horizontal range']=Math.abs(body.velocity.x*duration).toFixed(2)+' m'
    }
  }
  return {values,last:last?.time?last:undefined,rmse:projectileRmse(samples,body.position,body.velocity,gravity,duration)}
}

export function springPeriodReference(scene:Experiment, subject:BodyConfig) {
  if(scene.kind!=='spring'||scene.bodies.length!==2||scene.joints.length!==1||scene.environment.gravity!==0||scene.environment.boundaries)return
  const joint=scene.joints[0]
  if(joint.damping>=1||joint.anchorA.x||joint.anchorA.y||joint.anchorB.x||joint.anchorB.y)return
  const anchor=scene.bodies.find(candidate=>candidate.type==='static')
  if(!anchor||subject.type!=='dynamic')return
  const dx=subject.position.x-anchor.position.x,dy=subject.position.y-anchor.position.y
  if(Math.hypot(dx,dy)===0||Math.abs(dx*subject.velocity.y-dy*subject.velocity.x)>1e-8)return
  return 2*Math.PI*Math.sqrt(subject.mass/joint.stiffness)/Math.sqrt(1-joint.damping**2)
}

interface MomentumSample {
  time:number
  px:number
  py:number
  kinetic:number
}

export function momentumSamples(bodies:BodyConfig[],results:ReadonlyMap<string,Sample[]>,bodyId?:string,limit=Infinity):MomentumSample[] {
  const tracks=bodies.filter(body=>body.type==='dynamic'&&(!bodyId||body.id===bodyId))
    .map(body=>({mass:body.mass,samples:results.get(body.id)}))
  const timeline=tracks[0]?.samples
  if(!timeline?.length||tracks.some(track=>track.samples?.length!==timeline.length))return []
  const points:MomentumSample[]=[]
  const step=Math.max(1,Math.ceil((timeline.length-1)/Math.max(1,limit-1)))
  for(let index=0;index<timeline.length;index=Math.min(index+step,timeline.length-1)) {
    const point={time:timeline[index].time,px:0,py:0,kinetic:0}
    for(const {mass,samples} of tracks) {
      const sample=samples![index]
      if(sample.time!==point.time)return []
      point.px+=mass*sample.vx
      point.py+=mass*sample.vy
      point.kinetic+=sample.kinetic
    }
    points.push(point)
    if(index===timeline.length-1)break
  }
  return points
}

export function momentumCsv(samples:MomentumSample[]) {
  return ['time_s,px_kg_m_per_s,py_kg_m_per_s,kinetic_J',...samples.map(p=>[p.time,p.px,p.py,p.kinetic].map(n=>n.toFixed(6)).join(','))].join('\r\n')+'\r\n'
}
export function energies(mass:number, speed:number, inertia:number, omega:number, gravity:number, height:number, spring:number) {
  const kinetic = (mass*speed**2+inertia*omega**2)/2
  const potential = mass*gravity*height
  return {kinetic,potential,spring,total:kinetic+potential+spring}
}
const columns = [
  'time_s','body_id','x_m','y_m','vx_m_per_s','vy_m_per_s','speed_m_per_s',
  'ax_m_per_s2','ay_m_per_s2','kinetic_J','gravitational_J','spring_share_J','total_tracked_J',
]
export function toCsv(samples: Sample[]) {
  return [columns.join(','), ...samples.map(s => [
    s.time,s.bodyId,s.x,s.y,s.vx,s.vy,s.speed,s.ax,s.ay,s.kinetic,s.potential,s.spring,s.total,
  ].map(v => typeof v === 'number' ? v.toFixed(6) : '"' + (/^[=+@\-\t\r\n]/.test(v) ? "'" : '') + v.replaceAll('"','""') + '"').join(','))].join('\r\n')+'\r\n'
}
export function metrics(samples:Sample[], kind:string, landingHeight?:number) {
  if (samples.length < 2) return {}
  const first = samples[0]
  const last = samples.at(-1)!
  const result: Record<string,string> = {
    'Final speed': last.speed.toFixed(2)+' m/s',
    'Final velocity X': last.vx.toFixed(2)+' m/s',
    'Final velocity Y': last.vy.toFixed(2)+' m/s',
    'Energy change': (last.total-first.total).toFixed(2)+' J',
  }
  if (kind === 'projectile'||kind==='fall') {
    if(kind==='projectile')result['Peak height'] = Math.max(...samples.map(s=>s.y)).toFixed(2)+' m'
    if (landingHeight !== undefined) {
      const i = samples.findIndex((s,i) => i > 0 && s.y <= landingHeight+0.025 && samples[i-1].vy < 0)
      if (i > 0&&first.time===0) {
        if(kind==='projectile')result['Horizontal range'] = Math.abs(samples[i].x-first.x).toFixed(2)+' m'
        result['Flight time'] = (samples[i].time-first.time).toFixed(2)+' s'
      }
    }
  }
  if (kind === 'spring') {
    const variesX = Math.max(...samples.map(s=>s.x))-Math.min(...samples.map(s=>s.x)) >= Math.max(...samples.map(s=>s.y))-Math.min(...samples.map(s=>s.y))
    const key = variesX ? 'vx' : 'vy'
    const peaks = samples.flatMap((s,i) => {
      const before=samples[i-1]
      if(!before||before[key]<=0||s[key]>0)return []
      return [before.time+(s.time-before.time)*before[key]/(before[key]-s[key])]
    })
    if (peaks.length > 1) result['Oscillation period'] = ((peaks.at(-1)!-peaks[0])/(peaks.length-1)).toFixed(3)+' s'
  }
  return result
}
