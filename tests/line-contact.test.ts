import { describe, expect, it } from 'vitest'
import { body, emptyExperiment } from '../src/model'
import { Physics } from '../src/physics'

function shot(startY:number,side?:'left'|'right',track=false) {
  const scene=emptyExperiment()
  scene.version=3
  scene.environment={...scene.environment,gravity:0,boundaries:false}
  const ball=body('测试圆盘',{kind:'circle',radius:.15},0,startY,{
    velocity:{x:0,y:-Math.sign(startY)*25},restitution:1,friction:0,
  })
  const barrier=track
    ?body('线链',{kind:'track',vertices:[{x:-2,y:0},{x:0,y:0},{x:2,y:0}],closed:false},0,0,{contactSide:side})
    :body('线段',{kind:'surface',width:4,height:.2},0,-.1,{surfaceLine:true,contactSide:side})
  scene.bodies=[ball,barrier]
  const engine=new Physics(scene)
  for(let i=0;i<8;i++)engine.step()
  return engine.bodies.get(ball.id)!.getLinearVelocity().y
}

describe('oriented static contact',()=>{
  it('catches fast circles from either side by default',()=>{
    expect(shot(1)).toBeGreaterThan(0)
    expect(shot(-1)).toBeLessThan(0)
  })

  it('allows approach through the disabled side of a line',()=>{
    expect(shot(1,'left')).toBeGreaterThan(0)
    expect(shot(-1,'left')).toBeCloseTo(25)
    expect(shot(-1,'right')).toBeLessThan(0)
    expect(shot(1,'right')).toBeCloseTo(-25)
  })

  it('retains connected polyline contacts at the joint',()=>{
    expect(shot(1,'left',true)).toBeGreaterThan(0)
    expect(shot(-1,'left',true)).toBeCloseTo(25)
  })
})
