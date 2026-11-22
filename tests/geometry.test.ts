import { describe, expect, it } from 'vitest'
import { compileExpression } from '../src/geometry-expression'
import { defaultGeometry, fitStroke, geometryPaths, insertNode, makeMesh, makeTrack, meshObj, primitive, trackExperiment } from '../src/geometry'
import { decodeExperiment } from '../src/model'
import { Physics } from '../src/physics'
import { instantiate } from '../src/templates'
import { segmentDistance, trackError } from '../src/track'

describe('geometry sampling',()=>{
  it('parses only mathematical expressions and respects precedence',()=>{
    expect(compileExpression('-2^2 + 2^3^2',['x'])(0)).toBe(508)
    expect(compileExpression('2^-3+sin(π/2)+1e-2',[])()).toBeCloseTo(1.135,10)
    expect(()=>compileExpression('globalThis.alert(1)',[])).toThrow()
    expect(()=>compileExpression('constructor(1)',[])).toThrow()
    expect(()=>compileExpression('2x',['x'])).toThrow()
  })

  it('fits a stroke and inserts a Bézier node without changing the path',()=>{
    expect(fitStroke([{x:0,y:0},{x:0,y:0},{x:1,y:1},{x:2,y:0}])).toHaveLength(3)
    const project=defaultGeometry()
    const [original]=geometryPaths(project,0.001)
    const [split]=geometryPaths({...project,nodes:insertNode(project.nodes,0,false)},0.001)
    expect(split[0]).toEqual(original[0])
    expect(split.at(-1)).toEqual(original.at(-1))
    for(const p of split) {
      const distance=Math.min(...original.slice(1).map((q,i)=>segmentDistance(p,original[i],q)))
      expect(distance).toBeLessThan(0.0011)
    }
  })

  it('breaks asymptotes, invalid domains and finite jumps instead of constructing a bridge',()=>{
    const base=defaultGeometry()
    for(const [expr,min,max,gap] of [['1/(x-0.113)',-2,2,0.113],['floor(x)',-0.7,1.7,1]] as const) {
      const project={...base,mode:'function' as const,function:{expression:expr,range:{min,max},samples:32}}
      const paths=geometryPaths(project)
      expect(paths.length).toBeGreaterThan(1)
      expect(paths.some(path=>path[0].x<gap&&path.at(-1)!.x>gap)).toBe(false)
      expect(()=>makeTrack(project,0.04)).toThrow('间断')
    }
    const root={...base,mode:'function' as const,function:{expression:'sqrt(x)',range:{min:-1,max:2},samples:32}}
    expect(geometryPaths(root).flat().every(p=>p.x>=0)).toBe(true)
    expect(()=>makeTrack(root,0.04)).toThrow('无效值')
  })

  it('builds open and closed tracks with bounded curve-to-track deviation',()=>{
    const project=defaultGeometry(),tolerance=0.04
    const open=makeTrack(project,tolerance)
    expect(open.closed).toBe(false)
    for(const p of geometryPaths(project,0.001)[0]) {
      const distance=Math.min(...open.vertices.slice(1).map((q,i)=>segmentDistance(p,open.vertices[i],q)))
      expect(distance).toBeLessThanOrEqual(tolerance)
    }
    const ellipse=makeTrack({...project,mode:'parametric'},tolerance)
    const polar=makeTrack({...project,mode:'polar'},tolerance)
    expect(ellipse.closed&&polar.closed).toBe(true)
    expect(ellipse.vertices[0]).not.toEqual(ellipse.vertices.at(-1))
    expect(trackError([{x:0,y:0},{x:1,y:1},{x:0,y:1},{x:1,y:0}],false)).toContain('自相交')
    expect(trackError([{x:0,y:0},{x:0.001,y:0}],false)).toContain('0.02')
  })

  it('shows a sampled height field and writes valid OBJ indices around holes',()=>{
    const {surface}=defaultGeometry()
    const mesh=makeMesh({...surface,expression:'x^2+y^2',divisions:8})
    expect(mesh.vertices).toHaveLength(81)
    expect(mesh.faces).toHaveLength(128)
    expect(mesh.vertices[0]).toEqual({x:-4,y:-4,z:32})
    const hole=makeMesh({...surface,expression:'sqrt(x)',divisions:8})
    expect(hole.vertices.some(p=>p===null)).toBe(true)
    const lines=meshObj(hole).trim().split('\n'),count=lines.filter(line=>line.startsWith('v ')).length
    expect(lines.filter(line=>line.startsWith('f ')).every(line=>line.slice(2).split(' ').every(id=>+id>=1&&+id<=count))).toBe(true)
    expect(()=>makeMesh({...surface,expression:'sqrt(-1)'})).toThrow('曲面单元')
  })
})

it('Planck supports a falling ball on a flat track and retains contacts across a curved chain',()=>{
  for(const project of [{...defaultGeometry(),...primitive('line')},defaultGeometry()]) {
    const scene=trackExperiment(project,0.04,true),[track,ball]=scene.bodies
    expect(scene.version).toBe(2)
    expect(()=>decodeExperiment({...scene,version:1})).toThrow('版本 2')
    const physics=new Physics(scene)
    const live=physics.bodies.get(ball.id)!
    expect(physics.bodies.get(track.id)?.getFixtureList()?.getShape().getType()).toBe('chain')
    for(let i=0;i<360;i++)physics.step()
    expect(live.getPosition().y).toBeCloseTo(ball.geometry.kind==='circle'?ball.geometry.radius:0,1)
    expect(Math.abs(live.getLinearVelocity().y)).toBeLessThan(0.05)
  }
  const project=defaultGeometry()
  const curved=trackExperiment({...project,mode:'function',function:{...project.function,expression:'0.06*x^2'}},0.04,true)
  const ball=curved.bodies[1]
  const run=new Physics({...curved,bodies:[curved.bodies[0],{...ball,position:{x:-2.6,y:0.75},velocity:{x:1.5,y:0}}]})
  let furthest=-2.6
  const moving=run.bodies.get(ball.id)!
  for(let i=0;i<180;i++) {
    run.step()
    const {x,y}=moving.getPosition()
    furthest=Math.max(furthest,x)
    expect(y).toBeGreaterThan(0.19+0.06*x*x)
  }
  expect(furthest).toBeGreaterThan(0.5)

  const template=instantiate('track'),templateRun=new Physics(template)
  const templateBall=templateRun.bodies.get(template.bodies[0].id)!
  let crossedCenter=false
  for(let i=0;i<180;i++) {
    templateRun.step()
    const {x,y}=templateBall.getPosition()
    expect(y).toBeGreaterThan(0.19+0.085*x*x)
    crossedCenter ||= x>0.25
  }
  expect(crossedCenter).toBe(true)
})
