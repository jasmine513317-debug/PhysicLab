import assert from 'node:assert/strict'
import {World,Vec2,Circle,Box,Polygon,DistanceJoint} from 'planck'
const world = new World({gravity:Vec2(0,-9.81)})
const ball = world.createDynamicBody(Vec2(0,10))
ball.createFixture(new Circle(0.25),{density:1})
for(let i=0;i<60;i++) world.step(1/60)
assert.ok(Math.abs(ball.getPosition().y-5.095)<0.09)
assert.ok(Math.abs(ball.getLinearVelocity().y+9.81)<1e-9)
const spring = new DistanceJoint({bodyA:world.createBody(),bodyB:ball,localAnchorA:Vec2(),localAnchorB:Vec2(),length:2,frequencyHz:1,dampingRatio:0})
assert.equal(world.createJoint(spring).getLength(),2)
assert.ok(new Box(1,1) && new Polygon([Vec2(0,0),Vec2(1,0),Vec2(0,1)]))
console.log('Planck free-fall and distance-joint API verified')
