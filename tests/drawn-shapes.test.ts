import { expect,it } from 'vitest'
import { drawnBody,drawnShapes } from '../src/drawnShapes'
import { rotate } from '../src/coordinates'
import { body,decodeExperiment,emptyExperiment } from '../src/model'
import { Physics } from '../src/physics'
import { connectionAssembly,makeConnection } from '../src/springs'
import { resizeBody,resizeHandles } from '../src/resizeBody'

it('creates six valid shapes and places a sloped collision edge exactly between the drag endpoints',()=>{
  const a={x:-2,y:1},b={x:2,y:2}
  const bodies=drawnShapes.map(([kind])=>drawnBody(kind,a,b,'mint',kind)!)
  expect(decodeExperiment({...emptyExperiment(),version:3,bodies}).bodies).toHaveLength(6)
  const segment=bodies[3],offset=rotate({x:-Math.hypot(4,1)/2,y:.01},segment.angle)
  expect(segment.position.x+offset.x).toBeCloseTo(a.x,12)
  expect(segment.position.y+offset.y).toBeCloseTo(a.y,12)
  expect(segment.surfaceLine).toBe(true)
})

it.each(['rope','rod'] as const)('solves the distinct %s constraint from a slack initial configuration',kind=>{
  const a=body('支点',{kind:'circle',radius:.06},0,3,{type:'static'})
  const b=body('轻小物体',{kind:'circle',radius:.08},0,2.5,{mass:.05})
  const end=(obj:typeof a)=>({id:obj.id,local:{x:0,y:0},world:obj.position})
  const {joints}=makeConnection(kind,end(a),end(b))!
  joints[0].restLength=1
  const scene=emptyExperiment()
  const physics=new Physics({...scene,version:3,bodies:[a,b],joints,environment:{...scene.environment,gravity:0}})
  for(let i=0;i<30;i++)physics.step()
  expect(physics.bodies.get(b.id)!.getPosition().y).toBeCloseTo(kind==='rod'?2:2.5,4)
})

it.each(['massSpring','massRope'] as const)('distributes %s mass across actual dynamic nodes',kind=>{
  const a={id:'a',local:{x:0,y:0},world:{x:0,y:0}},b={...a,id:'b',world:{x:2,y:0}}
  const {nodes,joints}=makeConnection(kind,a,b)!
  expect(nodes).toHaveLength(5)
  expect(nodes.every(node=>node.type==='dynamic')).toBe(true)
  expect(nodes.reduce((mass,node)=>mass+node.mass,0)).toBeCloseTo(.1,12)
  expect(joints.reduce((length,joint)=>length+joint.restLength,0)).toBeCloseTo(2,12)
  expect(connectionAssembly({bodies:nodes,joints},joints[0].group!)).toMatchObject({
    ids:[a.id,...nodes.map(node=>node.id),b.id],nodes,joints,
  })
})

it.each(['curve','arc'] as const)('drags the %s midpoint without moving either endpoint',kind=>{
  const before=drawnBody(kind,{x:-2,y:0},{x:2,y:0},'mint','track')!
  if(before.geometry.kind!=='track')throw new Error('Expected a track')
  const handle=resizeHandles(before.geometry).find(h=>h.curvature)!
  const changed=resizeBody(before,handle,{x:0,y:handle.point.y},{x:0,y:.5}).body
  if(changed.geometry.kind!=='track')throw new Error('Expected a track')
  expect(changed.geometry.vertices[0].x).toBeCloseTo(-2,10)
  expect(changed.geometry.vertices.at(-1)?.x).toBeCloseTo(2,10)
  expect(changed.geometry.vertices[Math.floor(changed.geometry.vertices.length/2)].y).toBeCloseTo(.5,10)
  expect(()=>decodeExperiment({...emptyExperiment(),version:2,bodies:[changed]})).not.toThrow()
})
