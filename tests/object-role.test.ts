import { expect, it } from 'vitest'
import { body, decodeExperiment, emptyExperiment, type ObjectRole } from '../src/model'
import { roleVisual, withObjectRole } from '../src/objectRole'
import { instantiate } from '../src/templates'

it('changes semantic roles while enforcing static collision-free objects',()=>{
  const moving=body('带电球',{kind:'circle',radius:.4},1,2,{role:'body',velocity:{x:3,y:4},angularVelocity:2,charge:20})
  const marker=withObjectRole(moving,'marker')
  expect(marker).toMatchObject({role:'marker',type:'static',velocity:{x:0,y:0},angularVelocity:0,mass:moving.mass,charge:20})
  const source={...withObjectRole(marker,'field'),id:crypto.randomUUID()}
  expect(source).toMatchObject({role:'field',type:'static',charge:20})
  expect(withObjectRole({...source,charge:undefined},'field').charge).toBe(10)
  expect(withObjectRole(source,'body')).toMatchObject({role:'body',type:'static'})
  expect(decodeExperiment({...emptyExperiment(),version:3,bodies:[marker,source]}).bodies).toEqual([marker,source])
})

it('converts open freeform geometry to a track and marks new springs as constraints',()=>{
  const curve=body('曲线',{kind:'freeform',vertices:[{x:-1,y:0},{x:0,y:1},{x:1,y:0}],closed:false},0,0)
  expect(withObjectRole(curve,'track').geometry).toEqual({kind:'track',vertices:[{x:-1,y:0},{x:0,y:1},{x:1,y:0}],closed:false})
  const scene=instantiate('spring')
  expect(scene.version).toBe(3)
  expect(scene.joints[0].role).toBe('constraint')
  expect(decodeExperiment(scene).joints[0].role).toBe('constraint')
})

it('gives every non-body role a distinct visible treatment',()=>{
  const config=body('对象',{kind:'circle',radius:1},0,0)
  expect(roleVisual(config)).toMatchObject({filled:true})
  expect(roleVisual(withObjectRole(config,'marker'))).toMatchObject({filled:false,dash:[5,4]})
  expect(roleVisual(withObjectRole(config,'marker')).badge).toBeUndefined()
  expect(roleVisual(withObjectRole(config,'boundary'))).toMatchObject({filled:true,badge:'B'})
  expect(roleVisual(withObjectRole(config,'track'))).toMatchObject({filled:false})
  expect(roleVisual(withObjectRole(config,'track')).badge).toBeUndefined()
  expect(roleVisual(withObjectRole(config,'field'))).toMatchObject({filled:false,badge:'+'})
  expect(roleVisual(withObjectRole({...withObjectRole(config,'field'),charge:-10},'field')).badge).toBe('−')
  const roles:ObjectRole[]=['marker','boundary','track','field']
  expect(new Set(roles.map(role=>JSON.stringify(roleVisual(withObjectRole(config,role))))).size).toBe(4)
})
