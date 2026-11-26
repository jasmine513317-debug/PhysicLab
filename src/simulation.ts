export const PHYSICS_HZ = 60
export const SAMPLE_EVERY = 4
export const SAMPLE_HZ = PHYSICS_HZ / SAMPLE_EVERY

export class FixedStepClock {
  private remaining=0
  constructor(readonly dt:number) {}

  clear() {this.remaining=0}

  advance(duration:number,limit:number,step:()=>boolean) {
    this.remaining+=duration
    let steps=0
    while(this.remaining+1e-10>=this.dt&&steps<limit) {
      if(!step()) {this.clear();break}
      this.remaining=Math.max(0,this.remaining-this.dt)
      steps++
    }
    if(steps===limit)this.remaining%=this.dt
    return steps
  }
}

export function runSimulationFrames(tick:(elapsed:number,now:number)=>boolean|void,maxDelta:number) {
  let frame=0, previous:number|undefined
  function draw(now:number) {
    if(document.hidden) {
      previous=undefined
      frame=requestAnimationFrame(draw)
      return
    }
    const elapsed=previous===undefined?0:Math.min(maxDelta,Math.max(0,(now-previous)/1000))
    previous=now
    if(tick(elapsed,now)!==false)frame=requestAnimationFrame(draw)
  }
  const reset=()=>{previous=undefined}
  document.addEventListener('visibilitychange',reset)
  frame=requestAnimationFrame(draw)
  return ()=>{
    document.removeEventListener('visibilitychange',reset)
    cancelAnimationFrame(frame)
  }
}

export interface FixedStepSolver {
  readonly dt:number
  step:()=>boolean|void
}

export function runFixedSolver(solver:FixedStepSolver,options:{
  speed:number;maxDelta:number;maxSteps:number;updated:(steps:number)=>void;stopped?:()=>void;
  failed?:(error:unknown)=>void
}) {
  const clock=new FixedStepClock(solver.dt)
  return runSimulationFrames(elapsed=>{
    let ended=false
    try {
      const count=clock.advance(elapsed*options.speed,options.maxSteps,()=>{
        ended=solver.step()===false
        return !ended
      })
      if(count||ended)options.updated(count)
      if(ended){options.stopped?.();return false}
    } catch(error) {
      if(!options.failed)throw error
      options.failed(error)
      return false
    }
  },options.maxDelta)
}
