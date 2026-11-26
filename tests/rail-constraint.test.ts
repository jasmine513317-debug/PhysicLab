import { expect,it } from 'vitest'
import { body,emptyExperiment } from '../src/model'
import { Physics } from '../src/physics'

it('integrates the tangential gravitational acceleration of an ideal incline',()=>{
  const track=body('直斜轨',{kind:'track',vertices:[{x:0,y:0},{x:8,y:6}],closed:false},0,0)
  const bead=body('滑珠',{kind:'circle',radius:.15},6.4,4.8,{mass:2,rail:track.id})
  const engine=new Physics({...emptyExperiment(),version:3,bodies:[track,bead]})
  for(let i=0;i<60;i++)engine.step()
  const live=engine.bodies.get(bead.id)!
  const speed=-9.81*.6
  expect(live.getLinearVelocity().x).toBeCloseTo(speed*.8,8)
  expect(live.getPosition().y).toBeCloseTo(4.8+.5*speed*.6,8)
  const load=engine.forceVectors(bead.id).find(item=>item.name==='轨道约束力')!.vector
  expect((load.x*.8+load.y*.6)).toBeCloseTo(0,8)
  expect(Math.hypot(load.x,load.y)).toBeCloseTo(2*9.81*.8,8)
})

it('traps the bead at an open end and removes transverse impulse',()=>{
  const track=body('直轨',{kind:'track',vertices:[{x:0,y:0},{x:2,y:0}],closed:false},0,0)
  const bead=body('滑珠',{kind:'circle',radius:.15},1.8,0,{rail:track.id})
  const engine=new Physics({...emptyExperiment(),version:3,bodies:[track,bead]})
  engine.schedule(bead.id,{kind:'impulse',vector:{x:3,y:100}})
  for(let i=0;i<30;i++)engine.step()
  const live=engine.bodies.get(bead.id)!
  expect(live.getPosition().x).toBe(2)
  expect(live.getPosition().y).toBe(0)
  expect(live.getLinearVelocity().x).toBe(0)
  expect(engine.interventions[0].velocityAfter?.y).toBe(0)
})

it('adjusts a static horizontal reaction target through a real applied load',()=>{
  const floor=body('水平面',{kind:'surface',width:6,height:.3},0,-.15,{restitution:0,surfaceLine:true})
  const bead=body('球',{kind:'circle',radius:.2},0,.3,{mass:2,restitution:0})
  const engine=new Physics({...emptyExperiment(),version:3,bodies:[floor,bead]})
  for(let i=0;i<100;i++)engine.step()
  const input=engine.inputForSupport(bead.id,12)
  expect(input.vector.y).toBeCloseTo(7.62,8)
  engine.schedule(bead.id,input);engine.step()
  const measured=engine.forceVectors(bead.id).find(value=>value.name==='接触法向力')
  expect(measured?.vector.y).toBeCloseTo(12,4)
})

it('uses an inclined face normal and keeps the tangential external load with other bodies present',()=>{
  const angle=Math.atan2(3,4),normal={x:-.6,y:.8}
  const incline=body('斜面',{kind:'surface',width:12,height:.3},0,0,{angle,restitution:0,friction:1,surfaceLine:true})
  const block=body('滑块',{kind:'rectangle',width:.5,height:.4},-.24,.32,{angle,mass:2,restitution:0,friction:1})
  const unrelated=body('其他平台',{kind:'surface',width:2,height:.4},10,-3)
  const engine=new Physics({...emptyExperiment(),version:3,bodies:[incline,block,unrelated]})
  for(let i=0;i<150;i++)engine.step()
  engine.setForce(block.id,{x:-.8,y:-.6})
  engine.step()
  const input=engine.inputForSupport(block.id,20)
  expect(input.vector.x*.8+input.vector.y*.6).toBeCloseTo(-1,8)
  engine.schedule(block.id,input)
  engine.step()
  const measured=engine.forceVectors(block.id).find(value=>value.name==='接触法向力')!.vector
  expect(measured.x*normal.x+measured.y*normal.y).toBeCloseTo(20,2)
})

it('rejects a support target for a body resting on another dynamic body',()=>{
  const floor=body('地板',{kind:'surface',width:6,height:.3},0,-.15)
  const lower=body('活动支承',{kind:'rectangle',width:1,height:.5},0,.26,{restitution:0})
  const upper=body('上层物体',{kind:'rectangle',width:.5,height:.5},0,.77,{restitution:0})
  const engine=new Physics({...emptyExperiment(),bodies:[floor,lower,upper]})
  for(let i=0;i<150;i++)engine.step()
  expect(()=>engine.inputForSupport(upper.id,12)).toThrow('活动支点')
  expect(()=>engine.inputForNetForce(upper.id,{x:0,y:0},'force')).toThrow('当前接触')
  expect(engine.timeline().events).toHaveLength(0)
})
