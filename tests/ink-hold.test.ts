import { afterEach, expect, it, vi } from 'vitest'
import { InkHold, INK_HOLD_MS } from '../src/inkHold'

afterEach(()=>vi.useRealTimers())

it('recognizes after 900 ms of stillness while the pointer remains down',()=>{
  vi.useFakeTimers()
  const notify=vi.fn(),hold=new InkHold(2,notify)
  hold.start({x:10,y:10})
  vi.advanceTimersByTime(INK_HOLD_MS-1)
  expect(hold.ready).toBe(false)
  vi.advanceTimersByTime(1)
  expect(hold.ready).toBe(true)
  expect(notify).toHaveBeenCalledOnce()
})

it('ignores touch jitter within two pixels without postponing recognition',()=>{
  vi.useFakeTimers()
  const hold=new InkHold(2,()=>{})
  hold.start({x:0,y:0})
  for(let i=0;i<8;i++) {vi.advanceTimersByTime(100);expect(hold.move({x:1.2,y:1.2})).toBe(false)}
  vi.advanceTimersByTime(100)
  expect(hold.ready).toBe(true)
})

it('restarts on significant movement and cancels a ready result when drawing continues',()=>{
  vi.useFakeTimers()
  const hold=new InkHold(2,()=>{})
  hold.start({x:0,y:0})
  vi.advanceTimersByTime(700)
  expect(hold.move({x:3,y:0})).toBe(true)
  vi.advanceTimersByTime(899)
  expect(hold.ready).toBe(false)
  vi.advanceTimersByTime(1)
  expect(hold.ready).toBe(true)
  expect(hold.move({x:8,y:0})).toBe(true)
  expect(hold.ready).toBe(false)
  vi.advanceTimersByTime(900)
  expect(hold.ready).toBe(true)
  hold.cancel()
  expect(hold.ready).toBe(false)
})
