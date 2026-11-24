import { Component, lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Activity, ArrowDownRight, ArrowLeft, ArrowRight, ArrowUpRight, Atom, Boxes, Check, Circle, Clock3, Copy, Database, FlaskConical, FolderOpen, House, Menu, MoveUpRight, Pencil, Plus, Trash2, Triangle, Upload, Waves, X, Zap } from 'lucide-react'
import { decodeExperiment, emptyExperiment, type Experiment } from './model'
import { instantiate, templates, type TemplateId } from './templates'
import { deleteExperiment, duplicateExperiment, listExperiments, loadExperiment, renameExperiment, saveExperiment } from './repository'
import { SceneDiagram } from './Viewport'
import { appPath, appUrl } from './routes'
const Lab = lazy(() => import('./Lab').then(module => ({default:module.Lab})))

const templateIcons = {projectile:MoveUpRight,collision:Circle,spring:Waves,friction:Triangle,fall:ArrowDownRight}
const dates=new Intl.DateTimeFormat('zh-CN',{year:'numeric',month:'long',day:'numeric'})
const shortDates=new Intl.DateTimeFormat('zh-CN',{month:'2-digit',day:'2-digit'})
type Page='home'|'lab'|'library'
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

function Brand({compact=false}:{compact?:boolean}) {
  return <span className={'brand'+(compact?' compact':'')}><span className="brand-mark"><Atom size={21} strokeWidth={1.8}/></span><span className="brand-word">Physic<span>Lab</span></span></span>
}
function AppShell({page,entries,loading,error,children}:{page:Page;entries:Experiment[];loading:boolean;error:string;children:ReactNode}) {
  const [open,setOpen]=useState(false)
  useEffect(()=>{
    function onKey(e:KeyboardEvent) {if(e.key==='Escape')setOpen(false)}
    window.addEventListener('keydown',onKey)
    return ()=>window.removeEventListener('keydown',onKey)
  },[])
  return <div className={'app-shell page-'+page}>
    <aside id="app-sidebar" className={'app-sidebar'+(open?' open':'')} aria-label="实验导航">
      <div className="sidebar-brand-row"><a href={appUrl('/')} aria-label="PhysicLab 首页" onClick={()=>setOpen(false)}><Brand/></a><button className="icon sidebar-close" aria-label="关闭侧边栏" onClick={()=>setOpen(false)}><X size={18}/></button></div>
      <a className="button primary sidebar-new" href={newLab} aria-label="新建实验"><Plus size={17}/><span>新建实验</span></a>
      <nav className="sidebar-nav" aria-label="主导航">
        <a className={page==='home'?'current':''} href={appUrl('/')} aria-current={page==='home'?'page':undefined} onClick={()=>setOpen(false)}><House size={18}/><span className="nav-label">首页</span></a>
        <a className={page==='lab'?'current':''} href={appUrl('/lab')} aria-current={page==='lab'?'page':undefined} onClick={()=>setOpen(false)}><FlaskConical size={18}/><span className="nav-label">实验台</span></a>
        <a className={page==='library'?'current':''} href={appUrl('/experiments')} aria-current={page==='library'?'page':undefined} onClick={()=>setOpen(false)}><FolderOpen size={18}/><span className="nav-label">实验库</span><span className="nav-count" aria-hidden="true">{entries.length||''}</span></a>
      </nav>
      <div className="sidebar-scroll">
        <section className="sidebar-section" aria-label="实验模板">
          <div className="sidebar-section-heading"><span>实验模板</span><small>5 个场景</small></div>
          <div className="sidebar-template-list">{templates.map(t=>{
            const Icon=templateIcons[t.id]
            return <a key={t.id} href={appUrl('/lab?template='+t.id)} title={t.title+' · '+t.topic} onClick={()=>setOpen(false)}><span className={'object-icon '+t.tint}><Icon size={16}/></span><span className="sidebar-template-copy"><strong>{t.title}</strong><small>{t.topic}</small></span><ArrowUpRight className="sidebar-link-arrow" size={13}/></a>
          })}</div>
        </section>
        <section className="sidebar-section sidebar-recent" aria-label="最近实验">
          <div className="sidebar-section-heading"><span>最近实验</span>{entries.length>0&&<a href={appUrl('/experiments')} onClick={()=>setOpen(false)}>全部 <ArrowRight size={12}/></a>}</div>
          {loading?<p className="sidebar-empty">正在读取实验…</p>:error?<p className="sidebar-empty error-text">{error}</p>:entries.length?<div className="sidebar-recent-list">{entries.slice(0,5).map(scene=><a key={scene.id} href={appUrl('/lab?id='+encodeURIComponent(scene.id))} title={scene.title} onClick={()=>setOpen(false)}><Clock3 size={15}/><span className="sidebar-recent-copy"><strong>{scene.title}</strong><small>{shortDates.format(new Date(scene.updatedAt))} · {scene.bodies.length} 个物体</small></span></a>)}</div>:<div className="sidebar-empty"><FolderOpen size={18}/><span>还没有保存的实验</span></div>}
        </section>
      </div>
      <div className="sidebar-footer" title="实验保存在当前浏览器的 IndexedDB 中"><Database size={15}/><span className="sidebar-footer-text">本地保存 · 无需登录</span></div>
    </aside>
    {open&&<button className="sidebar-backdrop" aria-label="关闭侧边栏" onClick={()=>setOpen(false)}/>}
    <div className="app-content">
      <header className="mobile-bar"><button className="icon" aria-label="打开侧边栏" aria-expanded={open} aria-controls="app-sidebar" onClick={()=>setOpen(true)}><Menu size={20}/></button><a href={appUrl('/')} aria-label="PhysicLab 首页"><Brand compact/></a><a className="icon mobile-new" href={newLab} aria-label="新建实验"><Plus size={19}/></a></header>
      {children}
    </div>
  </div>
}
function Home() {
  const demo=useMemo(()=>instantiate('projectile'),[])
  return <><main className="home page-width">
    <section className="hero">
      <div className="hero-copy">
        <span className="kicker"><span/> 虚拟物理实验室</span>
        <h1>搭建，设定。<br/><em>开始模拟。</em></h1>
        <p>设计自己的物理实验。搭建场景、设定初始条件，运行模拟并观察数据变化。</p>
        <div className="hero-actions"><a className="button primary" href={newLab}><Plus size={18}/> 创建实验</a>
          <a className="button outline" href={appUrl('/lab?template=projectile')}>从模板开始 <ArrowUpRight size={16}/></a></div>
        <div className="hero-note"><span><Check size={13}/> 无需登录</span><span><Check size={13}/> 数据本地保存</span></div>
      </div>
      <a className="hero-diagram" href={appUrl('/lab?template=projectile')} aria-label="打开斜抛运动实验">
        <div className="diagram-top"><span><Activity size={15}/> 斜抛运动</span><ArrowUpRight size={17}/></div>
        <div className="diagram-stage"><SceneDiagram scene={demo}/><span className="diagram-axis">Y ↑ &nbsp; X →</span></div>
        <div className="diagram-bottom"><span><i/> 理论轨迹</span><span>g = 9.81 m/s²</span></div>
      </a>
    </section>
    <section className="home-section workflow-section" aria-labelledby="workflow-title">
      <div className="section-title"><div><span className="eyebrow">HOW IT WORKS</span><h2 id="workflow-title">三步完成一次实验</h2><p>从空白画布出发，把想法变成可验证的数据。</p></div></div>
      <div className="workflow-grid">
        <article><span className="step-number">01</span><span className="step-icon"><Boxes size={21}/></span><h3>搭建场景</h3><p>拖放圆形、矩形、地面和斜面，用弹簧连接物体。</p></article>
        <article><span className="step-number">02</span><span className="step-icon"><Zap size={21}/></span><h3>设定并运行</h3><p>调整质量、速度与重力，单步观察或连续模拟运动。</p></article>
        <article><span className="step-number">03</span><span className="step-icon"><Activity size={21}/></span><h3>分析与对比</h3><p>查看轨迹和图表，设置基准，导出 CSV 保留结果。</p></article>
      </div>
    </section>
    <section className="home-section feature-section">
      <div className="feature-copy"><span className="eyebrow">BUILT FOR DISCOVERY</span><h2>让每一次变化，<br/>都有迹可循。</h2><p>模板和最近实验已放到左侧导航，随时继续。你可以在实验台里自由修改参数，保存当前版本，再回来对比不同条件下的结果。</p><a className="text-button" href={appUrl('/experiments')}>打开实验库 <ArrowRight size={15}/></a></div>
      <div className="feature-grid">
        <div><Boxes size={21}/><h3>直观搭建</h3><p>在坐标网格中放置物体、斜面和弹簧。</p></div>
        <div><Zap size={21}/><h3>稳定模拟</h3><p>固定步长物理引擎，逐步运行与历史回放。</p></div>
        <div><Activity size={21}/><h3>数据驱动</h3><p>采样图表、实验基准和 CSV 导出。</p></div>
      </div>
    </section>
  </main><footer className="site-footer page-width"><span>PhysicLab · 搭建，设定，开始模拟。</span><span>为课堂演示与自主探究设计</span></footer></>
}
function Library({entries,error,setError,refresh,loading}:ReturnType<typeof useLibrary>) {
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
  return <main className="page-width library">
    <div className="section-title library-title"><div><span className="eyebrow">YOUR EXPERIMENTS</span><h1>实验库</h1><p>打开和管理保存在当前浏览器中的实验。</p></div><div className="library-command">
      <label className="button import-button"><Upload size={15}/> 导入场景<input type="file" accept=".json,application/json" aria-label="导入实验 JSON" disabled={busy} onChange={e=>{
        const file=e.currentTarget.files?.[0]
        e.currentTarget.value=''
        if(file)void importScene(file)
      }}/></label>
      <a href={newLab} className="button primary"><Plus size={17}/> 创建实验</a></div></div>
    <div className="library-summary"><span><FolderOpen size={15}/> {loading?'正在读取…':entries.length+' 个实验'}</span><span><Database size={15}/> 数据保存在此浏览器</span></div>
    {error&&<div className="error-banner" role="alert">{error}</div>}
    {loading?<div className="library-loading"><span className="loading-spinner"/> 正在加载实验…</div>:entries.length===0?<div className="empty-library"><FolderOpen size={28}/><strong>暂无保存的实验</strong><p>在实验台保存后，实验会显示在这里。</p><a className="button" href={newLab}>打开实验台 <ArrowRight size={15}/></a></div>:
      <div className="library-grid">{entries.map(scene=><article className="library-card" key={scene.id}>
        <a className="library-preview" href={appUrl('/lab?id='+encodeURIComponent(scene.id))} aria-label={'预览：'+scene.title}><SceneDiagram scene={scene}/><span className="library-preview-tag">{scene.kind==='custom'?'自定义实验':templates.find(t=>t.id===scene.kind)?.title??'自定义实验'}</span></a>
        <div className="library-content">
          {editing===scene.id?<form className="rename-form" onSubmit={e=>{e.preventDefault();void action(()=>renameExperiment(scene.id,title))}}><input autoFocus aria-label="实验名称" maxLength={100} value={title} onChange={e=>setTitle(e.target.value)}/><button className="icon" aria-label="确认重命名" disabled={busy}><Check size={16}/></button><button className="text-button" type="button" onClick={()=>setEditing('')}>取消</button></form>:<h2>{scene.title}</h2>}
          <p><Clock3 size={13}/> 更新于 {dates.format(new Date(scene.updatedAt))} <span>· {scene.bodies.length} 个物体</span></p>
          {pending===scene.id?<div className="library-actions"><span>删除此实验？</span><button className="text-button danger" disabled={busy} onClick={()=>void action(()=>deleteExperiment(scene.id))}>删除</button><button className="text-button" onClick={()=>setPending('')}>取消</button></div>:
          <div className="library-actions"><a className="button compact" href={appUrl('/lab?id='+encodeURIComponent(scene.id))}>打开 <ArrowUpRight size={14}/></a>
            <button className="icon" aria-label={'重命名：'+scene.title} title="重命名" disabled={busy} onClick={()=>{setTitle(scene.title);setEditing(scene.id)}}><Pencil size={15}/></button>
            <button className="icon" aria-label={'复制：'+scene.title} title="复制" disabled={busy} onClick={()=>void action(()=>duplicateExperiment(scene))}><Copy size={15}/></button>
            <button className="icon" aria-label={'删除：'+scene.title} title="删除" disabled={busy} onClick={()=>setPending(scene.id)}><Trash2 size={15}/></button>
          </div>}
        </div>
      </article>)}</div>}
  </main>
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
  return <>{scene?<Suspense fallback={<main className="page-width library"><p className="muted">正在打开实验台…</p></main>}><Lab initial={scene} initiallySaved={Boolean(id)}/></Suspense>:<main className="page-width library">
    {error?<><p className="error-banner" role="alert">{error}</p><a className="button" href={appUrl('/experiments')}><ArrowLeft size={15}/> 返回实验库</a></>:<p className="muted">正在打开实验台…</p>}
  </main>}</>
}
class ErrorBoundary extends Component<{children:ReactNode},{error:string}> {
  state={error:''}
  static getDerivedStateFromError(e:unknown) {return {error:message(e)}}
  render() {return this.state.error?<main className="page-width library"><h1>无法打开 PhysicLab</h1><p role="alert">{this.state.error}</p><a className="button" href={appUrl('/')}>返回首页</a></main>:this.props.children}
}
export function App() {
  const path=appPath(location.pathname)
  const page:Page=path==='/lab'?'lab':path==='/experiments'?'library':'home'
  const library=useLibrary()
  return <ErrorBoundary><AppShell page={page} {...library}>{path==='/lab'?<Workspace/>:path==='/experiments'?<Library {...library}/>:<Home/>}</AppShell></ErrorBoundary>
}
