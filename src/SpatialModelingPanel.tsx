import { useState } from 'react'
import { extrudeContour, revolveProfile, spatialGeometrySchema, spatialRibbon } from './spatialGeometry'
import { decodeGeometry,makeMesh } from './geometry'
import type { Vec3 } from './spatialPhysics'
import type { SpatialGeometry } from './spatialGeometry'

type Mode='extrude'|'revolve'|'track'|'surface'
const examples:Record<Mode,string>={
  extrude:'-1,-0.5\n1,-0.5\n1,0.5\n-1,0.5',
  revolve:'0.4,-1\n0.8,-0.5\n0.55,0.5\n0.35,1',
  track:'-3,1,-2\n-1,0,0\n1,0,1\n3,1,2',
  surface:'',
}

export function SpatialModelingPanel({create,report}:{create:(name:string,geometry:SpatialGeometry,fixed:boolean)=>void;report:(message:string)=>void}) {
  const [mode,setMode]=useState<Mode>('extrude')
  const [draft,setDraft]=useState(examples.extrude)
  const [size,setSize]=useState('0.6')
  function generate() {
    try {
      if(mode==='surface') {
        const project=decodeGeometry(JSON.parse(draft))
        const mesh=makeMesh({...project.surface,divisions:Math.min(project.surface.divisions,31)})
        const map=new Map<number,number>()
        const vertices:Vec3[]=[]
        mesh.vertices.forEach((point,i)=>{if(point){map.set(i,vertices.length);vertices.push([point.x,point.z,-point.y])}})
        const indices=mesh.faces.flat().map(index=>map.get(index))
        create(project.title,spatialGeometrySchema.parse({kind:'mesh',vertices,indices}),true)
        return
      }
      const rows=draft.trim().split(/\r?\n/).map(row=>row.trim().split(/[\s,，]+/).map(Number))
      const dim=mode==='track'?3:2
      if(rows.some(row=>row.length!==dim||!row.every(Number.isFinite)))throw new Error('每行输入 '+dim+' 个有限坐标，用逗号分开。')
      const extent=Number(size)
      if(mode!=='revolve'&&(!Number.isFinite(extent)||extent<.002||extent>10000))throw new Error('厚度或宽度必须在 0.002–10,000 m。')
      if(mode==='track')create('空间轨道',spatialRibbon(rows as Vec3[],extent),true)
      else {
        const profile=rows.map(([x,y])=>({x,y}))
        create(mode==='extrude'?'拉伸体':'旋转体',mode==='extrude'?extrudeContour(profile,extent):revolveProfile(profile),false)
      }
    } catch(error) {report(error instanceof Error?error.message:String(error))}
  }
  return <>
    <label>建模方式<select value={mode} onChange={e=>{
      const next=e.target.value as Mode;setMode(next);setDraft(examples[next])
    }}><option value="extrude">拉伸轮廓</option><option value="revolve">旋转母线</option><option value="track">三维路径轨道</option><option value="surface">导入几何工作室曲面</option></select></label>
    <label>{mode==='track'?'路径 X,Y,Z':mode==='revolve'?'母线半径,高度':mode==='surface'?'几何工作室 JSON':'轮廓 X,Y'}
      <textarea aria-label="空间建模输入" rows={6} value={draft} onChange={e=>setDraft(e.target.value)}/>
    </label>
    {mode==='surface'&&<label>从文件读取<input type="file" accept=".json,application/json" onChange={async e=>{
      const file=e.target.files?.[0]
      if(file&&file.size<2_000_000)setDraft(await file.text())
    }}/></label>}
    {(mode==='extrude'||mode==='track')&&<label>{mode==='extrude'?'拉伸厚度 (m)':'轨道宽度 (m)'}
      <input type="number" step="any" min=".002" value={size} onChange={e=>setSize(e.target.value)}/>
    </label>}
    <button className="button compact" type="button" onClick={generate}>创建模型</button>
    <small>轨道和导入曲面作为静态三角网格。动态拉伸体和旋转体采用凸包碰撞代理。</small>
  </>
}
