import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowUpRight, Download, Hand, MousePointer2, PenLine, Redo2, Spline, Undo2, Upload } from 'lucide-react'
import { CurveCanvas, SurfaceCanvas } from './GeometryCanvas'
import { decodeGeometry, defaultGeometry, geometryModes, geometryPaths, insertNode, makeMesh, makeTrack, meshObj, moveNode, primitive, primitives, trackExperiment, type CurveNode, type GeometryProject } from './geometry'
import { saveExperiment } from './repository'
import { downloadText } from './download'
import { appUrl } from './routes'
import './geometry-studio.css'

type Tool='node'|'draw'|'pan'
type History={past:GeometryProject[];project:GeometryProject;future:GeometryProject[]}
const draftKey='physiclab-geometry-draft-v1'

function restoreDraft() {
  try {
    const draft=localStorage.getItem(draftKey)
    if(draft)return decodeGeometry(JSON.parse(draft))
  } catch { /* A geometry file can still be imported if browser storage is unavailable. */ }
  return defaultGeometry()
}

function result<T>(task:()=>T) {
  try {return {value:task(),error:''}}
  catch(e) {return {value:undefined,error:e instanceof Error?e.message:'无法计算此几何。'}}
}

function TextField({label,value,change,max=240}:{label:string;value:string;change:(value:string)=>void;max?:number}) {
  return <label className="geometry-field"><span>{label}</span><input key={value} type="text" maxLength={max} defaultValue={value}
    onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur()}} onBlur={e=>{if(e.target.value!==value)change(e.target.value)}}/></label>
}

function NumberField({label,value,change,min=-100,max=100,integer=false,step}:{label:string;value:number;change:(value:number)=>void;min?:number;max?:number;integer?:boolean;step?:number}) {
  const display=+value.toFixed(6)
  const [invalid,setInvalid]=useState(false)
  return <label className="geometry-field"><span>{label}</span><input key={value} type="number" min={min} max={max} step={step??(integer?1:'any')} defaultValue={display}
    aria-invalid={invalid} onChange={()=>setInvalid(false)} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur()}} onBlur={e=>{
      const n=e.currentTarget.valueAsNumber
      if(!Number.isFinite(n)||n<min||n>max||(integer&&!Number.isInteger(n))) {setInvalid(true);return}
      if(n!==display)change(n)
    }}/>{invalid&&<small className="field-error">范围 {min} 至 {max}{integer?'，须为整数':''}</small>}</label>
}

function RangeFields({name,value,change}:{name:string;value:{min:number;max:number};change:(value:{min:number;max:number})=>void}) {
  return <div className="geometry-pair">
    <NumberField label={name+' 下限'} value={value.min} change={min=>change({...value,min})}/>
    <NumberField label={name+' 上限'} value={value.max} change={max=>change({...value,max})}/>
  </div>
}

function Toggle({checked,change,children}:{checked:boolean;change:(checked:boolean)=>void;children:ReactNode}) {
  return <label className="geometry-toggle"><input type="checkbox" checked={checked} onChange={e=>change(e.target.checked)}/>{children}</label>
}

function FormulaFields({project,patch}:{project:GeometryProject;patch:(value:Partial<GeometryProject>)=>void}) {
  if(project.mode==='function') {
    const settings=project.function
    return <>
      <TextField label="y = f(x)" value={settings.expression} change={expression=>patch({function:{...settings,expression}})}/>
      <RangeFields name="x" value={settings.range} change={range=>patch({function:{...settings,range}})}/>
      <NumberField label="基础采样数" value={settings.samples} min={16} max={512} integer change={samples=>patch({function:{...settings,samples}})}/>
    </>
  }
  if(project.mode==='parametric') {
    const settings=project.parametric
    return <>
      <TextField label="x = f(t)" value={settings.x} change={x=>patch({parametric:{...settings,x}})}/>
      <TextField label="y = g(t)" value={settings.y} change={y=>patch({parametric:{...settings,y}})}/>
      <RangeFields name="t" value={settings.range} change={range=>patch({parametric:{...settings,range}})}/>
      <NumberField label="基础采样数" value={settings.samples} min={16} max={512} integer change={samples=>patch({parametric:{...settings,samples}})}/>
      <Toggle checked={settings.closed} change={closed=>patch({parametric:{...settings,closed}})}>闭合轨道</Toggle>
    </>
  }
  if(project.mode==='polar') {
    const settings=project.polar
    return <>
      <TextField label="r = f(θ)" value={settings.expression} change={expression=>patch({polar:{...settings,expression}})}/>
      <RangeFields name="θ (rad)" value={settings.range} change={range=>patch({polar:{...settings,range}})}/>
      <NumberField label="基础采样数" value={settings.samples} min={16} max={512} integer change={samples=>patch({polar:{...settings,samples}})}/>
      <Toggle checked={settings.closed} change={closed=>patch({polar:{...settings,closed}})}>闭合轨道</Toggle>
    </>
  }
  const settings=project.surface
  return <>
    <TextField label="z = f(x, y)" value={settings.expression} change={expression=>patch({surface:{...settings,expression}})}/>
    <RangeFields name="x" value={settings.x} change={x=>patch({surface:{...settings,x}})}/>
    <RangeFields name="y" value={settings.y} change={y=>patch({surface:{...settings,y}})}/>
    <NumberField label="每轴网格数" value={settings.divisions} min={8} max={48} integer change={divisions=>patch({surface:{...settings,divisions}})}/>
  </>
}

export function GeometryStudio() {
  const [{past,project,future},setHistory]=useState<History>(()=>({past:[],project:restoreDraft(),future:[]}))
  const [tool,setTool]=useState<Tool>('node')
  const [selected,select]=useState(0)
  const [tolerance,setTolerance]=useState(0.04)
  const [withBall,setWithBall]=useState(true)
  const [surface,setSurface]=useState({grid:true,shade:true,normals:false,pan:false})
  const [error,setError]=useState('')
  const [storageError,setStorageError]=useState(false)
  const [saving,setSaving]=useState(false)
  const filePick=useRef<HTMLInputElement>(null)
  const isSurface=project.mode==='surface', isBezier=project.mode==='bezier'
  const path=useMemo(()=>result(()=>geometryPaths(project)),[project])
  const mesh=useMemo(()=>isSurface?result(()=>makeMesh(project.surface)):undefined,[isSurface,project.surface])
  const track=useMemo(()=>isSurface?undefined:result(()=>makeTrack(project,tolerance)),[isSurface,project,tolerance])
  const previewError=(mesh?.error||path.error)||(!isSurface&&!path.value?.some(points=>points.length)?'当前设置下没有可绘制的点。':'')
  const index=project.nodes.length?Math.max(0,Math.min(selected,project.nodes.length-1)):-1
  const node=project.nodes[index]

  useEffect(()=>{
    try {localStorage.setItem(draftKey,JSON.stringify(project));setStorageError(false)}
    catch {setStorageError(true)}
  },[project])

  function patch(changes:Partial<GeometryProject>) {
    try {
      const next=decodeGeometry({...project,...changes})
      setHistory({past:[...past.slice(-49),project],project:next,future:[]})
      setError('')
    } catch {setError('几何设置无效。请检查名称、坐标和采样范围。')}
  }
  function undo() {
    const previous=past.at(-1)
    if(previous)setHistory({past:past.slice(0,-1),project:previous,future:[project,...future]})
  }
  function redo() {
    if(future.length)setHistory({past:[...past,project],project:future[0],future:future.slice(1)})
  }
  async function readFile(file:File) {
    try {
      if(file.size>2_000_000)throw new Error('file size')
      const restored=decodeGeometry(JSON.parse((await file.text()).replace(/^\uFEFF/,'')))
      patch(restored)
      setTool('node');select(0)
    } catch {setError('无法导入。请选择小于 2 MB 的 PhysicLab 几何 JSON。')}
  }
  async function openTrack() {
    if(saving||!track?.value)return
    setSaving(true);setError('')
    try {
      const saved=await saveExperiment(trackExperiment(project,tolerance,withBall))
      location.assign(appUrl('/lab?id='+encodeURIComponent(saved.id)))
    } catch(e) {setError(e instanceof Error?e.message:'无法保存轨道实验。');setSaving(false)}
  }

  return <main className="geometry-studio page-width" onKeyDown={e=>{
    if(!(e.ctrlKey||e.metaKey)||e.altKey||e.target instanceof HTMLElement&&e.target.closest('input,textarea,select,[contenteditable]'))return
    if(e.key.toLowerCase()==='z') {e.preventDefault();if(e.shiftKey)redo();else undo()}
  }}>
    <header className="geometry-heading">
      <div><h1>几何工作室</h1><p>绘制曲线、生成曲面，或把二维曲线转成力学碰撞轨道。</p></div>
      <div className="geometry-file-actions" role="group" aria-label="几何文件">
        <input type="file" ref={filePick} hidden accept=".json,application/json" onChange={e=>{
          const file=e.target.files?.[0];e.currentTarget.value='';if(file)void readFile(file)
        }}/>
        <button className="button" onClick={()=>filePick.current?.click()}><Upload size={16}/> 导入 JSON</button>
        <button className="button" onClick={()=>downloadText(project.title,'json','application/json',JSON.stringify(project,null,2))}><Download size={16}/> 导出 JSON</button>
      </div>
    </header>
    <nav className="geometry-modes" aria-label="几何模式">
      {geometryModes.map(([mode,label])=><button key={mode} aria-pressed={project.mode===mode} onClick={()=>{if(project.mode!==mode)patch({mode})}}>{label}</button>)}
    </nav>
    {(error||storageError)&&<p className="error-banner geometry-message" role="alert">{error||'浏览器暂时无法保存草稿。可以导出 JSON 保留几何。'}</p>}
    <div className="geometry-workarea">
      <section className="geometry-preview" aria-label="几何预览">
        <div className="geometry-toolbar">
          <div role="group" aria-label={isSurface?'曲面操作':'曲线操作'}>
            {isSurface?<>
              <button className="geometry-tool" aria-pressed={!surface.pan} onClick={()=>setSurface({...surface,pan:false})}>旋转</button>
              <button className="geometry-tool" aria-pressed={surface.pan} onClick={()=>setSurface({...surface,pan:true})}><Hand size={15}/> 平移</button>
            </>:isBezier?<>
              <button className="geometry-tool" aria-pressed={tool==='node'} onClick={()=>setTool('node')}><MousePointer2 size={15}/> 节点</button>
              <button className="geometry-tool" aria-pressed={tool==='draw'} onClick={()=>setTool('draw')}><PenLine size={15}/> 手绘</button>
              <button className="geometry-tool" aria-pressed={tool==='pan'} onClick={()=>setTool('pan')}><Hand size={15}/> 平移</button>
            </>:<span className="geometry-toolbar-label"><Spline size={15}/> 拖动平移视图</span>}
          </div>
          <div role="group" aria-label="几何编辑历史">
            <button className="icon" onClick={undo} disabled={!past.length} aria-label="撤销几何编辑" title="撤销"><Undo2 size={17}/></button>
            <button className="icon" onClick={redo} disabled={!future.length} aria-label="重做几何编辑" title="重做"><Redo2 size={17}/></button>
          </div>
        </div>
        <div className="geometry-stage">
          {isSurface?<SurfaceCanvas mesh={mesh?.value} {...surface}/>:<CurveCanvas paths={path.value??[]} nodes={isBezier?project.nodes:undefined}
            closed={project.closed} selected={index} tool={tool} dashed={project.dashed} select={select} edit={(nodes,closed)=>patch({nodes,closed})}/>}
          {previewError&&<div className="geometry-preview-error" role="status">{previewError}</div>}
        </div>
        <div className="geometry-caption">
          {isSurface?(mesh?.value?`${mesh.value.faces.length} 个三角面 · ${mesh.value.vertices.filter(Boolean).length} 个顶点`:'曲面预览'):
            isBezier?`${project.nodes.length} 个节点 · ${project.closed?'闭合路径':'开放路径'}`:`${path.value?.length??0} 条连续分支`}
          {isBezier&&tool==='draw'&&<span>拖动绘制新路径，原路径可撤销。</span>}
          {isBezier&&tool==='node'&&<span>点击画布添加节点，拖动节点或控制柄。</span>}
          {isSurface&&<span>几何预览 · 无动力学</span>}
        </div>
      </section>

      <aside className="geometry-settings" aria-label="几何参数">
        <section className="geometry-group">
          <h2>{geometryModes.find(([mode])=>mode===project.mode)?.[1]}</h2>
          <TextField label="几何名称" value={project.title} change={title=>patch({title})} max={70}/>
          {isBezier?<>
            <label className="geometry-field"><span>二维图形</span><select value="" onChange={e=>{
              const choice=primitives.find(([id])=>id===e.target.value)
              if(choice) {patch(primitive(choice[0]));setTool('node');select(0)}
            }}><option value="">替换为基本图形…</option>{primitives.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
            <Toggle checked={project.closed} change={closed=>patch({closed})}>闭合路径</Toggle>
            <div className="geometry-node-actions">
              <button className="button compact" disabled={project.nodes.length>=128} onClick={()=>{patch({nodes:insertNode(project.nodes,index,project.closed)});select(index+1);setTool('node')}}>添加节点</button>
              <button className="button compact" disabled={!node} onClick={()=>patch({nodes:project.nodes.filter((_,i)=>index!==i)})}>删除节点</button>
            </div>
            {node&&<>
              <label className="geometry-field"><span>编辑节点</span><select value={index} onChange={e=>{select(+e.target.value);setTool('node')}}>
                {project.nodes.map((_,i)=><option key={i} value={i}>节点 {i+1}</option>)}
              </select></label>
              {([['point','位置'],['in','入柄'],['out','出柄']] as const).map(([key,label])=><div className="geometry-pair" key={key}>
                {(['x','y'] as const).map(axis=><NumberField key={axis} label={label+' '+axis.toUpperCase()+' (m)'} min={-10000} max={10000}
                  value={node[key][axis]} change={value=>patch({nodes:project.nodes.map((n,i)=>i===index?moveNode(n,key,{...n[key],[axis]:value}):n)})}/>)}
              </div>)}
            </>}
          </>:<>
            <FormulaFields project={project} patch={patch}/>
            <small className="geometry-help">使用 * 表示乘法，^ 表示乘方。支持 pi、sin、cos、sqrt 等，角度用弧度。</small>
          </>}
          {!isSurface&&<Toggle checked={project.dashed} change={dashed=>patch({dashed})}>虚线显示</Toggle>}
        </section>
        {isSurface?<section className="geometry-group">
          <h2>曲面显示</h2>
          <Toggle checked={surface.grid} change={grid=>setSurface({...surface,grid})}>网格</Toggle>
          <Toggle checked={surface.shade} change={shade=>setSurface({...surface,shade})}>着色</Toggle>
          <Toggle checked={surface.normals} change={normals=>setSurface({...surface,normals})}>采样法线</Toggle>
          <button className="button" disabled={!mesh?.value} onClick={()=>{if(mesh?.value)downloadText(project.title,'obj','text/plain',meshObj(mesh.value))}}><Download size={16}/> 导出 OBJ</button>
        </section>:<section className="geometry-group">
          <h2>碰撞轨道</h2>
          <NumberField label="离散容差 (m)" value={tolerance} min={0.005} max={1} step={0.005} change={setTolerance}/>
          <Toggle checked={withBall} change={setWithBall}>添加测试小球</Toggle>
          <p className="geometry-help">{track?.value?`${track.value.vertices.length} 个顶点 · Planck 静态链式边界`:track?.error}</p>
          <button className="button primary" disabled={!track?.value||saving} onClick={()=>void openTrack()}>{saving?'正在创建…':'创建轨道实验'} <ArrowUpRight size={16}/></button>
        </section>}
      </aside>
    </div>
  </main>
}
