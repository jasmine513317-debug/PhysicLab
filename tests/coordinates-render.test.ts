import { describe, expect, it } from 'vitest'
import { drawCoordinates, coordinateGridStep } from '../src/coordinateOverlay'
import { emptyExperiment, type Camera, type Coordinates } from '../src/model'
import { defaultDisplay, drawScene } from '../src/render'

function recordingContext() {
  const calls:{name:string;args:unknown[]}[]=[]
  const context=new Proxy({},{
    get:(_,name:string)=>(...args:unknown[])=>{calls.push({name,args})},
    set:()=>true,
  }) as unknown as CanvasRenderingContext2D
  return {context,calls}
}
const camera:Camera={x:0,y:0,scale:80},view={width:640,height:400}

describe('coordinate overlay',()=>{
  it('adapts grid spacing to the zoom level',()=>{
    expect(coordinateGridStep(80)).toBe(1)
    expect(coordinateGridStep(5)).toBe(16)
    expect(coordinateGridStep(400)).toBe(.25)
    expect(coordinateGridStep(80)*80).toBeGreaterThanOrEqual(62)
    expect(coordinateGridStep(5)*5).toBeGreaterThanOrEqual(62)
  })

  it('draws Cartesian axes and ticks around the display origin',()=>{
    const {context,calls}=recordingContext()
    drawCoordinates(context,view,camera,{mode:'cartesian',origin:{x:2,y:1}},true)
    expect(calls.some(call=>call.name==='moveTo'&&call.args[0]===0&&call.args[1]===120)).toBe(true)
    expect(calls.some(call=>call.name==='moveTo'&&call.args[0]===480&&call.args[1]===0)).toBe(true)
    expect(calls.filter(call=>call.name==='fillText').map(call=>call.args[0])).toContain('X')
    expect(calls.filter(call=>call.name==='fillText').map(call=>call.args[0])).toContain('Y')
  })

  it('draws polar rings, radial lines and degree labels',()=>{
    const {context,calls}=recordingContext()
    drawCoordinates(context,view,camera,{mode:'polar',origin:{x:2,y:1}},true)
    expect(calls.some(call=>call.name==='arc')).toBe(true)
    expect(calls.some(call=>call.name==='moveTo'&&call.args[0]===480&&call.args[1]===120)).toBe(true)
    const labels=calls.filter(call=>call.name==='fillText').map(call=>String(call.args[0]))
    expect(labels).toContain('0°')
    expect(labels).toContain('90°')
    expect(labels.some(label=>label.endsWith(' m'))).toBe(true)
  })

  it.each(['cartesian','polar'] as const)('omits coordinate text from %s scene diagrams',mode=>{
    const {context,calls}=recordingContext()
    const scene={...emptyExperiment(),coordinates:{mode,origin:{x:0,y:0}}}
    drawScene(context,view,camera,scene,defaultDisplay,{diagram:true})
    expect(calls.some(call=>call.name==='moveTo'||call.name==='arc')).toBe(true)
    expect(calls.filter(call=>call.name==='fillText')).toEqual([])
  })

  it('draws no coordinate marks in none mode',()=>{
    const {context,calls}=recordingContext()
    drawCoordinates(context,view,camera,{mode:'none',origin:{x:2,y:1}},true)
    expect(calls).toEqual([])
  })
})
