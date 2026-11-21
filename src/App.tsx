import { Component, lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Activity, ArrowDownRight, ArrowLeft, ArrowRight, ArrowUpRight, Atom, BookOpen, Boxes, Check, Circle, Clock3, Copy, FolderOpen, MoveUpRight, Pencil, Plus, Trash2, Triangle, Upload, Waves, Zap } from 'lucide-react'
import { decodeExperiment, emptyExperiment, type Experiment } from './model'
import { instantiate, templates, type TemplateId } from './templates'
import { deleteExperiment, duplicateExperiment, listExperiments, loadExperiment, renameExperiment, saveExperiment } from './repository'
import { SceneDiagram } from './Viewport'
import { appPath, appUrl } from './routes'
const Lab = lazy(() => import('./Lab').then(module => ({default:module.Lab})))

const templateIcons = {projectile:MoveUpRight,collision:Circle,spring:Waves,friction:Triangle,fall:ArrowDownRight}
const dates=new Intl.DateTimeFormat('zh-CN',{year:'numeric',month:'long',day:'numeric'})
function useLibrary() {
  const [entries,setEntries]=useState<Experiment[]>([])
  const [error,setError]=useState('')
  const [loading,setLoading]=useState(true)
  async function refresh() {
    try {setEntries(await listExperiments());setError('')}
    catch(e) {setError(message(e))}
    finally {setLoading(false)}
  }
  useEffect(()=>{void refresh()},[])
  return {entries,error,setError,refresh,loading}
}
export function message(e:unknown) { return e instanceof Error?e.message:'操作未完成，请重试。' }
const newLab=appUrl('/lab?new=1')

function Header({page}:{page:string}) {
  return <header className="site-header">
    <a className="brand" href={appUrl('/')} aria-label="PhysicLab 首页"><span className="brand-mark"><Atom size={21} strokeWidth={1.8}/></span><span>Physic<span>Lab</span></span></a>
    <nav aria-label="主导航">
      <a className={page==='home'?'current':''} href={appUrl('/')}>首页</a>
      <a className={page==='lab'?'current':''} href={appUrl('/lab')}>实验台</a>
      <a className={page==='library'?'current':''} href={appUrl('/experiments')}>实验库</a>
    </nav>
    {page==='lab'?<a href={appUrl('/experiments')} className="button compact header-end" aria-label="打开实验库"><FolderOpen size={15}/><span>实验库</span></a>
      :<a href={newLab} className="button primary header-end" aria-label="新建实验"><Plus size={16}/><span>新建实验</span></a>}
  </header>
}
function Home() {
  const {entries,error}=useLibrary()
  const demo=useMemo(()=>instantiate('projectile'),[])
  return <><Header page="home"/><main className="home page-width">
    <section className="hero">
      <div className="hero-copy">
        <span className="kicker"><span/> 虚拟物理实验室</span>
        <h1>搭建，设定。<br/><em>开始模拟。</em></h1>
        <p>设计自己的物理实验。搭建场景、设定初始条件，运行模拟并观察数据变化。</p>
        <div className="hero-actions"><a className="button primary" href={newLab}><Plus size={19}/> 创建实验</a>
          <a className="button outline" href={appUrl('/lab?template=projectile')}>打开实验台 <ArrowUpRight size={16}/></a></div>
      </div>
      <a className="hero-diagram" href={appUrl('/lab?template=projectile')} aria-label="打开斜抛运动实验">
        <div className="diagram-top"><span><Activity size={15}/> 斜抛运动</span><ArrowUpRight size={17}/></div>
        <div className="diagram-stage"><SceneDiagram scene={demo}/><span className="diagram-axis">Y ↑ &nbsp; X →</span></div>
        <div className="diagram-bottom"><span><i/> 理论轨迹</span><span>g = 9.81 m/s²</span></div>
      </a>
    </section>
    <section className="home-section" id="templates">
      <div className="section-title"><div><h2>实验模板</h2><p>从现成场景开始，自由调整实验参数。</p></div></div>
      <div className="template-grid">{templates.map(t=><TemplateCard key={t.id} template={t}/>)}</div>
    </section>
    <section className="home-section">
      <div className="section-title"><div><h2>最近的实验</h2><p>继续上次的实验。</p></div><a className="text-button" href={appUrl('/experiments')}>查看实验库 <ArrowRight size={15}/></a></div>
      {error&&<p className="error-banner" role="alert">{error}</p>}
      {entries.length?<div className="recent">{entries.slice(0,3).map(scene=><a key={scene.id} href={appUrl('/lab?id='+encodeURIComponent(scene.id))}><FolderOpen size={17}/><strong>{scene.title}</strong><small>{dates.format(new Date(scene.updatedAt))}</small><ArrowRight size={15}/></a>)}</div>
      :<div className="empty-library"><FolderOpen size={23}/><strong>暂无保存的实验</strong><p>在实验台保存你的第一个实验。</p></div>}
    </section>
    <section className="feature-grid" aria-label="实验室功能">
      <div><Boxes size={21}/><h3>搭建场景</h3><p>在坐标网格中放置物体、斜面和弹簧。</p></div>
      <div><Zap size={21}/><h3>观察运动</h3><p>逐步运行模拟，查看运动轨迹与矢量。</p></div>
      <div><Activity size={21}/><h3>对比实验结果</h3><p>用图表查看采样数据、设置基准并导出 CSV。</p></div>
    </section>
  </main><footer className="site-footer page-width"><span>PhysicLab · 搭建，设定，开始模拟。</span><a href={appUrl('/experiments')}>实验库 <ArrowUpRight size={13}/></a></footer></>
}
function TemplateCard({template:t}:{template:typeof templates[number]}) {
  const Icon=templateIcons[t.id]
  return <a className="template-card" href={appUrl('/lab?template='+t.id)}><div className="template-top"><span className={'object-icon '+t.tint}><Icon size={19}/></span><ArrowUpRight size={16}/></div><small>{t.topic}</small><h3>{t.title}</h3><p>{t.description}</p></a>
}
function Library() {
  const {entries,error,setError,refresh,loading}=useLibrary()
  const [editing,setEditing]=useState('')
  const [title,setTitle]=useState('')
  const [pending,setPending]=useState('')
  const [busy,setBusy]=useState(false)
  async function action(fn:()=>Promise<unknown>) {
    setBusy(true)
    try {await fn();setEditing('');setPending('');await refresh()}
    catch(e){setError(message(e))}
    finally{setBusy(false)}
  }
  async function importScene(file:File) {
    await action(async()=>{
      if(file.size>5_000_000) throw new Error('请选择小于 5 MB 的 PhysicLab JSON 文件。')
      let scene:Experiment
      try {scene=decodeExperiment(JSON.parse((await file.text()).replace(/^\uFEFF/,'')))}
      catch {throw new Error('该文件不是有效的 PhysicLab 版本 1 实验文件。')}
      await saveExperiment({...scene,id:crypto.randomUUID()})
    })
  }
  return <><Header page="library"/><main className="page-width library">
    <a href={appUrl('/')} className="text-button"><ArrowLeft size={15}/> 首页</a>
    <div className="section-title library-title"><div><h1>实验库</h1><p>打开和管理保存在当前浏览器中的实验。</p></div><div className="library-command">
      <label className="button import-button"><Upload size={15}/> 导入场景<input type="file" accept=".json,application/json" aria-label="导入实验 JSON" disabled={busy} onChange={e=>{
        const file=e.currentTarget.files?.[0]
        e.currentTarget.value=''
        if(file)void importScene(file)
      }}/></label>
      <a href={newLab} className="button primary"><Plus size={17}/> 创建实验</a></div></div>
    {error&&<div className="error-banner" role="alert">{error}</div>}
    {loading?<p className="muted">正在加载实验…</p>:entries.length===0?<div className="empty-library"><FolderOpen size={28}/><strong>暂无保存的实验</strong><p>在实验台保存后，实验会显示在这里。</p><a className="button" href={newLab}>打开实验台 <ArrowRight size={15}/></a></div>:
      <div className="library-grid">{entries.map(scene=><article className="library-card" key={scene.id}>
        <a className="library-preview" href={appUrl('/lab?id='+encodeURIComponent(scene.id))} aria-label={'预览：'+scene.title}><SceneDiagram scene={scene}/></a>
        <div className="library-content">
          {editing===scene.id?<form className="rename-form" onSubmit={e=>{e.preventDefault();void action(()=>renameExperiment(scene.id,title))}}><input autoFocus aria-label="实验名称" maxLength={100} value={title} onChange={e=>setTitle(e.target.value)}/><button className="icon" aria-label="确认重命名" disabled={busy}><Check size={16}/></button><button className="text-button" type="button" onClick={()=>setEditing('')}>取消</button></form>:<h2>{scene.title}</h2>}
          <p><Clock3 size={13}/> 创建于 {dates.format(new Date(scene.createdAt))} <span>· {scene.bodies.length} 个物体</span></p>
          {pending===scene.id?<div className="library-actions"><span>删除此实验？</span><button className="text-button danger" disabled={busy} onClick={()=>void action(()=>deleteExperiment(scene.id))}>删除</button><button className="text-button" onClick={()=>setPending('')}>取消</button></div>:
          <div className="library-actions"><a className="button compact" href={appUrl('/lab?id='+encodeURIComponent(scene.id))}>打开 <ArrowUpRight size={14}/></a>
            <button className="icon" aria-label={'重命名：'+scene.title} title="重命名" disabled={busy} onClick={()=>{setTitle(scene.title);setEditing(scene.id)}}><Pencil size={15}/></button>
            <button className="icon" aria-label={'复制：'+scene.title} title="复制" disabled={busy} onClick={()=>void action(()=>duplicateExperiment(scene))}><Copy size={15}/></button>
            <button className="icon" aria-label={'删除：'+scene.title} title="删除" disabled={busy} onClick={()=>setPending(scene.id)}><Trash2 size={15}/></button>
          </div>}
        </div>
      </article>)}</div>}
    <section className="home-section"><div className="section-title"><div><h2><BookOpen size={20}/> 从模板开始</h2></div></div><div className="template-grid">{templates.map(t=><TemplateCard key={t.id} template={t}/>)}</div></section>
  </main></>
}
function Workspace() {
  const params=useMemo(()=>new URLSearchParams(location.search),[])
  const id=params.get('id')
  const [scene,setScene]=useState<Experiment|null>(null)
  const [error,setError]=useState('')
  useEffect(()=>{
    let active=true
    if(id) void loadExperiment(id).then(value=>{if(active)setScene(value)}).catch(e=>{if(active)setError(message(e))})
    else {
      const requested=params.get('template')
      const template=templates.find(t=>t.id===requested)
      setScene(params.has('new')?emptyExperiment():instantiate((template?.id??'projectile') as TemplateId))
    }
    return ()=>{active=false}
  },[id,params])
  return <><Header page="lab"/>{scene?<Suspense fallback={<main className="page-width library"><p className="muted">正在打开实验台…</p></main>}><Lab initial={scene} initiallySaved={Boolean(id)}/></Suspense>:<main className="page-width library">
    {error?<><p className="error-banner" role="alert">{error}</p><a className="button" href={appUrl('/experiments')}><ArrowLeft size={15}/> 返回实验库</a></>:<p className="muted">正在打开实验台…</p>}
  </main>}</>
}
class ErrorBoundary extends Component<{children:ReactNode},{error:string}> {
  state={error:''}
  static getDerivedStateFromError(e:unknown) {return {error:message(e)}}
  render() {return this.state.error?<main className="page-width library"><h1>无法打开 PhysicLab</h1><p role="alert">{this.state.error}</p><a className="button" href={appUrl('/')}>返回首页</a></main>:this.props.children}
}
export function App() {
  const page=appPath(location.pathname)
  return <ErrorBoundary>{page==='/lab'?<Workspace/>:page==='/experiments'?<Library/>:<Home/>}</ErrorBoundary>
}
