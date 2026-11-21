import type { Point } from './model'
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
export function flightTime(height:number, vy:number, gravity:number) {
  if (height < 0) return 0
  if (gravity === 0) return vy < 0 ? -height/vy : Infinity
  return (vy + Math.sqrt(vy*vy+2*gravity*height))/gravity
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
  if (kind === 'projectile') {
    result['Peak height'] = Math.max(...samples.map(s=>s.y)).toFixed(2)+' m'
    if (landingHeight !== undefined) {
      const i = samples.findIndex((s,i) => i > 0 && s.y <= landingHeight+0.025 && samples[i-1].vy < 0)
      if (i > 0) {
        result['Horizontal range'] = Math.abs(samples[i].x-first.x).toFixed(2)+' m'
        result['Flight time'] = (samples[i].time-first.time).toFixed(2)+' s'
      }
    }
  }
  if (kind === 'spring') {
    const variesX = Math.max(...samples.map(s=>s.x))-Math.min(...samples.map(s=>s.x)) >= Math.max(...samples.map(s=>s.y))-Math.min(...samples.map(s=>s.y))
    const key = variesX ? 'vx' : 'vy'
    const peaks = samples.flatMap((s,i) => i > 0 && samples[i-1][key] > 0 && s[key] <= 0 ? [s.time] : [])
    if (peaks.length > 1) result['Oscillation period'] = ((peaks.at(-1)!-peaks[0])/(peaks.length-1)).toFixed(3)+' s'
  }
  return result
}
