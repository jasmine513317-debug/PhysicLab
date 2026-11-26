import { expect, it, vi } from 'vitest'
import { body, emptyExperiment } from '../src/model'

vi.mock('../src/freeform',async importOriginal=>({
  ...await importOriginal<typeof import('../src/freeform')>(),
  triangulate:vi.fn(()=>[]),
}))

it('rejects a dynamic outline when exact triangulation fails instead of using a convex hull',async()=>{
  const {Physics}=await import('../src/physics')
  const block=body('不可离散物块',{kind:'freeform',vertices:[{x:-1,y:-1},{x:1,y:-1},{x:1,y:1},{x:-1,y:1}],closed:true},0,2)
  expect(()=>new Physics({...emptyExperiment(),version:2,bodies:[block]})).toThrow('碰撞形状')
})
