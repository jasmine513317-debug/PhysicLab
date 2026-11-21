import { describe, expect, it } from 'vitest'
import { body, decodeExperiment, emptyExperiment } from '../src/model'
import { Physics } from '../src/physics'
import { flightTime, projectile, energies, toCsv } from '../src/analysis'
import { screenPoint, worldPoint, zoomAt } from '../src/coordinates'
import { instantiate } from '../src/templates'

const advance=(engine:Physics,steps:number)=>{ for(let i=0;i<steps;i++)engine.step() }

describe('Planck SI reference cases',()=>{
  it('matches a one-second free fall from 10 m within 0.085 m',()=>{
    const scene=instantiate('fall')
    const lab=new Physics(scene)
    advance(lab,60)
    const live=lab.bodies.get(scene.bodies[0].id)!
    expect(Math.abs(live.getPosition().y-5.095)).toBeLessThan(0.085)
    expect(live.getLinearVelocity().y).toBeCloseTo(-9.81,8)
  })
  it('validates the ideal 10 m/s, 45-degree projectile trajectory, apex, range, and flight time',()=>{
    const scene=emptyExperiment()
    const shot=body('Test projectile',{kind:'circle',radius:0.1},0,0,{velocity:{x:10/Math.sqrt(2),y:10/Math.sqrt(2)}})
    scene.bodies=[shot]
    const lab=new Physics(scene),live=lab.bodies.get(shot.id)!
    const t=flightTime(0,shot.velocity.y,scene.environment.gravity)
    expect(t).toBeCloseTo(1.442,3)
    let peak=0,range=0,last={x:0,y:0},crossing=0
    for(let i=1;i<=Math.ceil(t*60);i++){
      lab.step()
      const p=live.getPosition(),ideal=projectile(shot.position,shot.velocity,9.81,i/60)
      expect(Math.abs(p.x-ideal.x)).toBeLessThan(1e-8)
      expect(Math.abs(p.y-ideal.y)).toBeLessThan(0.125)
      peak=Math.max(peak,p.y)
      if(last.y>0&&p.y<=0){
        const fraction=last.y/(last.y-p.y)
        crossing=(i-1+fraction)/60
        range=last.x+(p.x-last.x)*fraction
        break
      }
      last={...p}
    }
    expect(Math.abs(peak-2.5484)).toBeLessThan(.065)
    expect(Math.abs(crossing-t)).toBeLessThan(.018)
    expect(Math.abs(range-10.1937)).toBeLessThan(.13)
  })
  it('matches the 1 kg, 100 N/m spring period within four percent',()=>{
    const scene=instantiate('spring'),lab=new Physics(scene)
    const mass=lab.bodies.get(scene.bodies[0].id)!
    let last=0
    const peaks:number[]=[]
    for(let i=0;i<180;i++){
      lab.step()
      const v=mass.getLinearVelocity().x
      if(last>0&&v<=0)peaks.push(lab.time)
      last=v
    }
    expect(peaks.length).toBeGreaterThan(2)
    const period=(peaks.at(-1)!-peaks[0])/(peaks.length-1)
    const reference=2*Math.PI*Math.sqrt(1/100)
    expect(Math.abs(period/reference-1)).toBeLessThan(.04)
  })
  it.each([1,0.5,0])('checks momentum and the restitution response at e=%s',(coefficient)=>{
    const scene=instantiate('collision')
    scene.bodies=scene.bodies.map(b=>({...b,restitution:coefficient}))
    const lab=new Physics(scene)
    advance(lab,90)
    const [a,b]=scene.bodies.map(body=>lab.bodies.get(body.id)!.getLinearVelocity().x)
    expect(a+b).toBeCloseTo(4,6)
    expect(b-a).toBeCloseTo(4*coefficient,5)
    expect((a*a+b*b)/2).toBeCloseTo(4*(1+coefficient*coefficient),5)
  })
  it('opposes sliding and increases deceleration with contact friction',()=>{
    function slide(friction:number){
      const scene=emptyExperiment()
      scene.bodies=[
        body('Block',{kind:'rectangle',width:.8,height:.6},0,.51,{friction,restitution:0,velocity:{x:5,y:0}}),
        body('Surface',{kind:'surface',width:30,height:.4},0,0,{friction,restitution:0}),
      ]
      const lab=new Physics(scene)
      advance(lab,48)
      return lab.bodies.get(scene.bodies[0].id)!.getLinearVelocity().x
    }
    expect(Math.abs(slide(0)-5)).toBeLessThan(0.001)
    expect(slide(.2)).toBeLessThan(4)
    expect(slide(.6)).toBeLessThan(slide(.2))
  })
  it('supports circle–rectangle, rectangle–rectangle, and ramp contacts',()=>{
    const scene=instantiate('friction')
    const rampOnly=new Physics(scene)
    advance(rampOnly,54)
    const block=scene.bodies[0]
    expect(rampOnly.bodies.get(block.id)!.getPosition().x).toBeGreaterThan(block.position.x+.2)
    for(const kind of ['circle','rectangle'] as const) {
      const fixture=instantiate('collision')
      fixture.bodies[0].geometry=kind==='circle'?{kind,radius:.5}:{kind,width:1,height:1}
      fixture.bodies[1].geometry={kind:'rectangle',width:1,height:1}
      const lab=new Physics(fixture)
      advance(lab,90)
      expect(lab.bodies.get(fixture.bodies[1].id)!.getLinearVelocity().x).toBeGreaterThan(2)
    }
  })
  it('changes collision behavior, applies an external force and observes finite differences',()=>{
    const scene=instantiate('collision')
    scene.environment.collisions=false
    const lab=new Physics(scene),b=scene.bodies[0]
    lab.setForce(b.id,{x:2,y:0})
    lab.step()
    expect(lab.acceleration.get(b.id)?.x).toBeCloseTo(2,8)
    expect(lab.forceVectors(b.id).find(v=>v.name==='外力')?.vector.x).toBe(2)
    advance(lab,90)
    expect(lab.bodies.get(scene.bodies[1].id)?.getLinearVelocity().x).toBe(0)
  })
})

describe('timestep, units and scene validation',()=>{
  it('round-trips points, inverts Y and keeps the cursor fixed when zooming',()=>{
    const view={width:640,height:400},camera={x:1,y:2,scale:80},p={x:3,y:4}
    const screen=screenPoint(p,camera,view)
    expect(screen).toEqual({x:480,y:40})
    expect(worldPoint(screen,camera,view)).toEqual(p)
    expect(screenPoint(p,zoomAt(camera,view,screen,2),view)).toEqual(screen)
  })
  it('gives equivalent fixed-step results with different render intervals and caps catch-up',()=>{
    const scene=instantiate('fall')
    const fast=new Physics(scene),slow=new Physics(scene)
    for(let i=0;i<120;i++)fast.advance(1/120)
    for(let i=0;i<30;i++)slow.advance(1/30)
    expect(fast.time).toBe(1)
    expect(slow.time).toBe(1)
    expect(slow.samples).toEqual(fast.samples)
    expect(fast.advance(6,4)).toBe(8)
  })
  it('samples at reproducible times and writes unit-aware CSV',()=>{
    const s=instantiate('projectile'),lab=new Physics(s)
    advance(lab,12)
    const samples=lab.samples.get(s.bodies[0].id)!
    expect(samples.map(x=>x.time)).toEqual([0,4/60,8/60,12/60])
    expect(toCsv(samples)).toContain('time_s,body_id,x_m,y_m,vx_m_per_s')
    expect(toCsv(samples).split('\r\n')).toHaveLength(6)
  })
  it('accounts for angular kinetic, gravitational and allocated spring energy',()=>{
    expect(energies(2,3,1,2,10,5,4)).toEqual({kinetic:11,potential:100,spring:4,total:115})
    const s=instantiate('spring'),lab=new Physics(s)
    expect(lab.samples.get(s.bodies[0].id)?.[0].spring).toBeCloseTo(50,6)
  })
  it('restores initial conditions and rejects broken schemas',()=>{
    const s=instantiate('spring')
    expect(decodeExperiment(JSON.parse(JSON.stringify(s)))).toEqual(s)
    const run=new Physics(s)
    advance(run,21)
    expect(new Physics(s).bodies.get(s.bodies[0].id)!.getPosition().x).toBe(s.bodies[0].position.x)
    expect(()=>decodeExperiment({...s,version:2})).toThrow()
    expect(()=>decodeExperiment({...s,bodies:[{...s.bodies[0],mass:-1}]})).toThrow()
    expect(()=>decodeExperiment({...s,bodies:[{...s.bodies[0],restitution:1.2}]})).toThrow()
    expect(()=>decodeExperiment({...s,bodies:[{...s.bodies[0],velocity:{x:NaN,y:1}}]})).toThrow()
    expect(()=>decodeExperiment({...s,joints:[{...s.joints[0],b:'absent'}]})).toThrow()
    expect(()=>decodeExperiment({...s,joints:[{...s.joints[0],stiffness:100000}]})).toThrow()
    expect(()=>decodeExperiment({...s,joints:[],bodies:[body('Crossed',{kind:'polygon',vertices:[{x:0,y:0},{x:1,y:1},{x:0,y:1},{x:1,y:0}]},0,0)]})).toThrow()
  })
})

describe('continuous recording workload',()=>{
  it.each([10,30,50])('steps and records %s bodies with contacts and multiple springs',(n)=>{
    const scene=emptyExperiment()
    scene.bodies=Array.from({length:n},(_,i)=>body('Body '+i,{kind:'circle',radius:.36},i%10*.82,1+Math.floor(i/10)*.85,{restitution:.2}))
    scene.bodies.push(body('Floor',{kind:'surface',width:25,height:.3},0,0))
    scene.joints=Array.from({length:4},(_,i)=>({id:'joint-'+i,a:scene.bodies[i*2].id,b:scene.bodies[i*2+1].id,
      anchorA:{x:0,y:0},anchorB:{x:0,y:0},restLength:.83,damping:.2,stiffness:35}))
    const start=performance.now(),lab=new Physics(scene)
    advance(lab,360)
    const duration=performance.now()-start
    console.log(n+' bodies, 360 steps in '+duration.toFixed(0)+' ms')
    expect(lab.world.getContactCount()).toBeGreaterThan(0)
    expect(lab.samples.size).toBe(n)
    expect([...lab.samples.values()].every(s=>s.length===91)).toBe(true)
    expect(duration).toBeLessThan(5000)
  })
})
