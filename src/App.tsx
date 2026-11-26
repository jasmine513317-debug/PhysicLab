import { Component, lazy, Suspense, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Activity, ArrowLeft, ArrowRight, ArrowUpRight, Atom, Check, CircleDot, Clock3, Copy, FolderOpen, HardDrive, Home as HomeIcon, LibraryBig, Menu, Orbit, Pencil, Plus, Shapes, Trash2, Triangle, Upload, Waves, X, Zap, type LucideIcon } from 'lucide-react'
import { emptyExperiment, type Experiment } from './model'
import { instantiate, templates, type TemplateId } from './templates'
import { deleteExperiment, duplicateExperiment, importExperiment, listExperiments, loadExperiment, renameExperiment, saveAstronomy, saveElectrostatic, saveExtended, storageFor } from './repository'
import { decodeLibraryImport } from './backup'
import { electrostaticTemplates, isElectrostatic } from './electrostatics'
import { astronomyTemplates, type SavedExperiment } from './astronomy'
import { extendedTemplates, extensionUrl, isExtension, type Extension } from './extended-experiments'
import { downloadText } from './download'
import { SceneDiagram } from './Viewport'
import { appPath, appUrl } from './routes'
import { domains, domainUrl, DomainNav, type Domain } from './domains'
const Lab = lazy(() => import('./Lab').then(module => ({default:module.Lab})))
const GeometryStudio = lazy(() => import('./GeometryStudio').then(module => ({default:module.GeometryStudio})))
const ElectrostaticLab = lazy(() => import('./ElectrostaticLab').then(module => ({default:module.ElectrostaticLab})))
const AstronomyLab = lazy(() => import('./AstronomyLab').then(module => ({default:module.AstronomyLab})))
const ExtendedLab = lazy(() => import('./ExtendedLab').then(module => ({default:module.ExtendedLab})))

const dates=new Intl.DateTimeFormat('zh-CN',{year:'numeric',month:'long',day:'numeric'})
function useLibrary() {
  const [entries,setEntries]=useState<SavedExperiment[]>([])
  const [unreadable,setUnreadable]=useState<unknown[]>([])
  const [incomplete,setIncomplete]=useState(false)
  const [error,setError]=useState('')
  const [loading,setLoading]=useState(true)
  async function refresh() {
    try {
      const {experiments,unreadable,incomplete}=await listExperiments()
      setEntries(experiments);setUnreadable(unreadable);setIncomplete(incomplete);setError('')
    }
    catch(e) {setError(message(e))}
    finally {setLoading(false)}
  }
  useEffect(()=>{void refresh()},[])
  return {entries,unreadable,incomplete,error,setError,refresh,loading}
}
export function message(e:unknown) { return e instanceof Error?e.message:'操作未完成，请重试。' }
const newLab=appUrl('/lab?new=1')
function savedUrl(scene:SavedExperiment) {
  if('extension' in scene)return extensionUrl(scene.extension,scene.id)
  return appUrl('/lab?'+('domain' in scene?'domain='+scene.domain+'&':'')+'id='+encodeURIComponent(scene.id))
}

type Page='home'|'lab'|'geometry'|'library'
const sidebarTemplateGroups:readonly {domain:Domain;items:readonly {title:string;url:string}[]}[]=[
  {domain:domains[0],items:[
    ...templates.map(item=>({title:item.title,url:appUrl('/lab?template='+item.id)})),
    ...extendedTemplates.filter(item=>item.domain==='mechanics').map(item=>({title:item.title,url:extensionUrl(item.id)})),
  ]},
  {domain:domains[1],items:[
    ...electrostaticTemplates.map(item=>({title:item.title,url:appUrl('/lab?domain=electromagnetism&preset='+item.id)})),
    ...extendedTemplates.filter(item=>item.domain==='electromagnetism').map(item=>({title:item.title,url:extensionUrl(item.id)})),
  ]},
  {domain:domains[2],items:[
    ...astronomyTemplates.map(item=>({title:item.title,url:appUrl('/lab?domain=astrophysics&preset='+item.id)})),
    ...extendedTemplates.filter(item=>item.domain==='astrophysics').map(item=>({title:item.title,url:extensionUrl(item.id)})),
  ]},
]
function quickTemplateIcon(title:string):LucideIcon {
  if(/弹簧|摆|振动/.test(title))return Waves
  if(/电场|电荷|电势|电路|感应|粒子/.test(title))return Zap
  if(/轨道|引力|逃逸|三体|弹弓/.test(title))return Orbit
  if(/摩擦|曲线/.test(title))return Triangle
  return CircleDot
}
function AppShell({page,entries,error,loading,children}:{page:Page;entries:SavedExperiment[];error:string;loading:boolean;children:ReactNode}) {
  const [open,setOpen]=useState(false)
  useEffect(()=>{
    setOpen(false)
  },[page])
  useEffect(()=>{
    if(!open)return
    const overflow=document.body.style.overflow
    document.body.style.overflow='hidden'
    function closeOnEscape(event:KeyboardEvent) {
      if(event.key==='Escape')setOpen(false)
    }
    window.addEventListener('keydown',closeOnEscape)
    return ()=>{
      document.body.style.overflow=overflow
      window.removeEventListener('keydown',closeOnEscape)
    }
  },[open])
  return <>
    <button className={'sidebar-scrim'+(open?' open':'')} aria-label="关闭侧边栏" tabIndex={open?0:-1} onClick={()=>setOpen(false)}/>
    <aside id="app-sidebar" className={'app-sidebar'+(open?' open':'')} aria-label="实验导航" onClick={event=>{if((event.target as Element).closest('a'))setOpen(false)}}>
      <div className="sidebar-brand-row">
        <a className="brand" href={appUrl('/')} aria-label="PhysicLab Studio 首页"><span className="brand-mark"><Atom size={23} strokeWidth={1.5} aria-hidden="true"/></span><span className="sidebar-brand-text">PhysicLab <span className="brand-studio">Studio</span></span></a>
        <button className="icon sidebar-close" aria-label="关闭侧边栏" onClick={()=>setOpen(false)}><X size={18}/></button>
      </div>
      <a className="button primary sidebar-new" href={newLab} aria-label="新建实验"><Plus size={17}/><span>新建实验</span></a>
      <nav className="sidebar-nav" aria-label="主导航">
        <a className={page==='home'?'current':''} href={appUrl('/')} aria-current={page==='home'?'page':undefined} title="首页"><HomeIcon size={18}/><span>首页</span></a>
        <a className={page==='lab'?'current':''} href={appUrl('/lab')} aria-current={page==='lab'?'page':undefined} title="实验台"><Activity size={18}/><span>实验台</span></a>
        <a className={page==='geometry'?'current':''} href={appUrl('/geometry')} aria-current={page==='geometry'?'page':undefined} title="几何工作室"><Shapes size={18}/><span>几何工作室</span></a>
        <a className={page==='library'?'current':''} href={appUrl('/experiments')} aria-current={page==='library'?'page':undefined} title="实验库"><LibraryBig size={18}/><span>实验库</span><span className="nav-count" aria-hidden="true">{entries.length||''}</span></a>
      </nav>
      <div className="sidebar-scroll">
        {error&&<p className="sidebar-message">{error}</p>}
        <section className="sidebar-section" aria-label="最近实验">
          <div className="sidebar-section-title"><span>最近实验</span>{entries.length>0&&<span className="nav-count" aria-hidden="true">{entries.length}</span>}</div>
          {loading?<p className="sidebar-empty">正在读取实验库…</p>:entries.length?<div className="sidebar-recent">{entries.slice(0,5).map(scene=><a key={scene.id} href={savedUrl(scene)} title={scene.title}>
            <span className="sidebar-recent-icon">{'extension' in scene?<Activity size={15}/>:isElectrostatic(scene)?<Zap size={15}/>:'domain' in scene?<Orbit size={15}/>:<FolderOpen size={15}/>}</span>
            <span className="sidebar-recent-copy"><strong>{scene.title}</strong><small>{dates.format(new Date(scene.updatedAt))}</small></span>
            <ArrowUpRight size={13} aria-hidden="true"/>
          </a>)}</div>:<p className="sidebar-empty">保存实验后会出现在这里。</p>}
        </section>
        <section className="sidebar-section sidebar-templates" aria-label="实验模板">
          <div className="sidebar-section-title"><span>实验模板</span><span className="nav-count" aria-hidden="true">{sidebarTemplateGroups.reduce((sum,group)=>sum+group.items.length,0)}</span></div>
          {sidebarTemplateGroups.map(group=><div className="sidebar-template-group" key={group.domain.id}>
            <div className="sidebar-template-heading"><group.domain.icon size={13} aria-hidden="true"/>{group.domain.name}</div>
            {group.items.map(item=>{const Icon=quickTemplateIcon(item.title);return <a key={group.domain.id+item.title} href={item.url} title={item.title}><Icon size={14} aria-hidden="true"/><span>{item.title}</span></a>})}
          </div>)}
        </section>
      </div>
      <div className="sidebar-footer"><HardDrive size={14} aria-hidden="true"/><span>数据保存在当前浏览器</span></div>
    </aside>
    <header className="mobile-topbar">
      <button className="icon mobile-menu" aria-label="打开侧边栏" aria-controls="app-sidebar" aria-expanded={open} onClick={()=>setOpen(true)}><Menu size={21}/></button>
      <a className="mobile-brand" href={appUrl('/')} aria-label="PhysicLab Studio 首页"><Atom size={20} strokeWidth={1.5} aria-hidden="true"/><span>PhysicLab</span></a>
      <a className="icon" href={page==='library'?newLab:appUrl('/experiments')} aria-label={page==='library'?'新建实验':'打开实验库'}>{page==='library'?<Plus size={19}/>:<FolderOpen size={18}/>}</a>
    </header>
    <main className="app-content" id="app-content">{children}</main>
  </>
}
const domainCount:Record<Domain['id'],string>={
  mechanics:'8 个实验',
  electromagnetism:'4 个实验',
  astrophysics:'5 个实验',
}
const domainFormula:Record<Domain['id'],string>={
  mechanics:'F = ma',
  electromagnetism:'F = k q₁q₂ / r²',
  astrophysics:'F = G m₁m₂ / r²',
}
type FieldFormula = {
  tex:string;x:string;y:string;size:string;op:number
  dur:string;delay:string;dx:string;dy:string;rot:string
  tone?:'sand'|'cool';far?:boolean;optional?:boolean;flow?:boolean
}
/**
 * 背景公式场：公式在这里是气氛，不是清单。
 * 两层运动：dur/dy 驱动的椭圆锚点（清晰、慢），以及 flow 驱动的上升流（极淡、持续）。
 * x 全部避开左侧正文栏（17%–42%），上升流只在右侧留白与图表区穿过。
 */
const formulaField:readonly FieldFormula[]=[
  /* 椭圆锚点 —— 首屏右侧与大标题错开，构成版式的骨架 */
  {tex:'F = ma',x:'68%',y:'8%',size:'52px',op:.20,dur:'16s',delay:'0s',dx:'40px',dy:'70px',rot:'-2deg'},
  {tex:'E = ½mv²',x:'80%',y:'33%',size:'27px',op:.17,dur:'15s',delay:'-4s',dx:'-42px',dy:'80px',rot:'1.4deg',tone:'sand'},
  {tex:'T = 2π√(l/g)',x:'63%',y:'58%',size:'28px',op:.15,dur:'19s',delay:'-9s',dx:'-48px',dy:'84px',rot:'-1deg'},
  {tex:'iℏ ∂Ψ/∂t = ĤΨ',x:'88%',y:'70%',size:'24px',op:.14,dur:'20s',delay:'-13s',dx:'30px',dy:'70px',rot:'-1.4deg',optional:true},
  {tex:'Δx·Δp ≥ ℏ/2',x:'50%',y:'3%',size:'19px',op:.11,dur:'22s',delay:'-7s',dx:'30px',dy:'58px',rot:'-1.2deg',far:true,optional:true},
  {tex:'λ = h/p',x:'94%',y:'48%',size:'17px',op:.12,dur:'18s',delay:'-11s',dx:'-28px',dy:'68px',rot:'1.6deg',tone:'cool',far:true,optional:true},
  {tex:'F = dp/dt',x:'70%',y:'92%',size:'76px',op:.05,dur:'28s',delay:'-19s',dx:'34px',dy:'52px',rot:'-1deg',tone:'sand',far:true},
  /* 上升流 —— 极淡、贯穿两屏，让「漂浮」在余光里持续发生 */
  {tex:'∇·E = ρ/ε₀',x:'72%',y:'100%',size:'22px',op:.08,dur:'38s',delay:'-5s',dx:'0px',dy:'0px',rot:'.6deg',far:true,flow:true,optional:true},
  {tex:'pV = nRT',x:'58%',y:'100%',size:'19px',op:.07,dur:'46s',delay:'-18s',dx:'0px',dy:'0px',rot:'-.5deg',far:true,flow:true,optional:true},
  {tex:'∮B·dl = μ₀I',x:'88%',y:'100%',size:'20px',op:.08,dur:'42s',delay:'-29s',dx:'0px',dy:'0px',rot:'.8deg',far:true,flow:true,optional:true},
  {tex:'S = k_B ln W',x:'76%',y:'100%',size:'17px',op:.07,dur:'50s',delay:'-12s',dx:'0px',dy:'0px',rot:'-.4deg',far:true,flow:true,optional:true},
  {tex:'a = v²/r',x:'95%',y:'100%',size:'21px',op:.08,dur:'35s',delay:'-24s',dx:'0px',dy:'0px',rot:'1deg',far:true,flow:true,optional:true},
  {tex:'½kx² = ½mv²',x:'64%',y:'100%',size:'18px',op:.07,dur:'44s',delay:'-36s',dx:'0px',dy:'0px',rot:'-.7deg',far:true,flow:true,optional:true},
]
function Home() {
  const fieldRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce), (hover: none)').matches) return
    const field = fieldRef.current
    if (!field) return
    let raf = 0
    let tx = 0, ty = 0, cx = 0, cy = 0
    const tick = () => {
      cx += (tx - cx) * .06
      cy += (ty - cy) * .06
      field.style.setProperty('--par-x', cx.toFixed(2) + 'px')
      field.style.setProperty('--par-y', cy.toFixed(2) + 'px')
      raf = Math.abs(tx - cx) > .1 || Math.abs(ty - cy) > .1 ? requestAnimationFrame(tick) : 0
    }
    const onMove = (e: MouseEvent) => {
      tx = (e.clientX / window.innerWidth - .5) * -36
      ty = (e.clientY / window.innerHeight - .5) * -24
      if (!raf) raf = requestAnimationFrame(tick)
    }
    window.addEventListener('mousemove', onMove, { passive: true })
    return () => { window.removeEventListener('mousemove', onMove); if (raf) cancelAnimationFrame(raf) }
  }, [])
  return <div className="hp-page">
    <div className="hp-field" ref={fieldRef} aria-hidden="true">{formulaField.map(f=><span
      key={f.tex}
      className={'hp-formula'+(f.tone?' is-'+f.tone:'')+(f.far?' is-far':'')+(f.flow?' is-flow':'')+(f.optional?' hp-optional':'')}
      style={{'--x':f.x,'--y':f.y,'--size':f.size,'--op':f.op,'--dur':f.dur,'--delay':f.delay,'--dx':f.dx,'--dy':f.dy,'--rot':f.rot} as CSSProperties}
    ><span className="hp-formula-ink">{f.tex}</span></span>)}</div>
    <main className="hp">
      <section className="hp-hero" aria-labelledby="home-title">
        <div className="hp-shell hp-hero-inner">
          <h1 id="home-title" className="hp-title">先搭一个世界，<br/>再问它为什么。</h1>
        </div>
        <a className="hp-scroll" href="#domains" aria-label="向下查看三个实验领域"><span className="hp-scroll-line" aria-hidden="true"/></a>
      </section>

      <section className="hp-domains" id="domains" aria-labelledby="domains-title">
        <div className="hp-shell">
          <div className="hp-section-head">
            <p className="hp-chapter">01 — 领域</p>
            <h2 id="domains-title">从一条定律开始。</h2>
          </div>
          <div className="hp-rows">{domains.map((domain,i)=><a key={domain.id} className="hp-row" href={domainUrl(domain)}>
            <span className="hp-row-index" aria-hidden="true">0{i+1}</span>
            <span className="hp-row-eq" aria-hidden="true">{domainFormula[domain.id]}</span>
            <div className="hp-row-body">
              <h3>{domain.name}</h3>
              <p>{domain.description}</p>
            </div>
            <div className="hp-row-go"><span>{domainCount[domain.id]}</span><ArrowUpRight size={17} aria-hidden="true"/></div>
          </a>)}</div>
          <div className="hp-tail">
            <a className="hp-tail-link" href={appUrl('/lab?template=projectile')} aria-label="打开斜抛运动实验">打开斜抛运动实验<ArrowUpRight size={13} aria-hidden="true"/></a>
            <span className="hp-tail-note">本地优先 · 无账号 · 无上传</span>
            <a className="hp-tail-link" href={appUrl('/experiments')}>实验库<ArrowUpRight size={13} aria-hidden="true"/></a>
          </div>
        </div>
      </section>
    </main>
  </div>
}
function Library({entries,unreadable,incomplete,error,setError,refresh,loading}:ReturnType<typeof useLibrary>) {
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
      const result=decodeLibraryImport(await file.text(),file.size)
      if(result.kind==='electrostatic')await saveElectrostatic(result.scene,true)
      else if(result.kind==='astronomy')await saveAstronomy(result.scene,true)
      else if(result.kind==='extended')await saveExtended(result.scene,true)
      else await importExperiment(result.scene,result.replay)
    })
  }
  function exportUnreadable() {
    try {downloadText('无法打开的实验','json','application/json',JSON.stringify(unreadable,null,2))}
    catch {setError('无法导出这些记录。原始记录仍保存在实验库中。')}
  }
  return <><main className="page-width library">
    <a href={appUrl('/')} className="text-button"><ArrowLeft size={15}/> 首页</a>
    <div className="section-title library-title"><div><h1>实验库</h1><p>打开和管理保存在当前浏览器中的实验。</p></div><div className="library-command">
      <label className="button import-button"><Upload size={15}/> 导入实验<input type="file" accept=".json,application/json" aria-label="导入实验 JSON" disabled={busy} onChange={e=>{
        const file=e.currentTarget.files?.[0]
        e.currentTarget.value=''
        if(file)void importScene(file)
      }}/></label>
      <a href={newLab} className="button primary"><Plus size={17}/> 创建实验</a></div></div>
    {error&&<div className="error-banner" role="alert">{error}</div>}
    {incomplete&&<p className="library-warning error-banner" role="status">部分实验存储暂时无法读取。可以继续使用已加载的实验。</p>}
    {unreadable.length>0&&<div className="library-warning error-banner" role="status"><span>{unreadable.length} 条记录无法打开，原始记录仍保留在此浏览器中。</span><button className="text-button" onClick={exportUnreadable}>导出原始记录</button></div>}
    {loading?<p className="muted">正在加载实验…</p>:entries.length===0?<div className="empty-library"><FolderOpen size={28}/><strong>暂无保存的实验</strong><p>在实验台保存后，实验会显示在这里。</p><a className="button" href={newLab}>打开实验台 <ArrowRight size={15}/></a></div>:
      <div className="library-grid">{entries.map(scene=><article className="library-card" key={scene.id}>
        <a className="library-preview" href={savedUrl(scene)} aria-label={'预览：'+scene.title}>{'extension' in scene?<span className="library-orbit-preview"><Activity size={23}/> {extendedTemplates.find(item=>item.id===scene.extension)?.title}</span>:isElectrostatic(scene)?<span className="library-electric-preview"><Zap size={23}/> 静电实验</span>:'domain' in scene?<span className="library-orbit-preview"><Orbit size={23}/> 双体实验</span>:<SceneDiagram scene={scene}/>}</a>
        <div className="library-content">
          {editing===scene.id?<form className="rename-form" onSubmit={e=>{e.preventDefault();void action(()=>renameExperiment(scene.id,title,storageFor(scene)))}}><input autoFocus aria-label="实验名称" maxLength={100} value={title} onChange={e=>setTitle(e.target.value)}/><button className="icon" aria-label="确认重命名" disabled={busy}><Check size={16}/></button><button className="text-button" type="button" onClick={()=>setEditing('')}>取消</button></form>:<h2>{scene.title}</h2>}
          <p><Clock3 size={13}/> 创建于 {dates.format(new Date(scene.createdAt))} <span>· {'extension' in scene?extendedTemplates.find(item=>item.id===scene.extension)?.title:isElectrostatic(scene)?`${scene.charges.length} 个电荷`:`${scene.bodies.length} 个${'domain' in scene?'天体':'物体'}`}</span></p>
          {pending===scene.id?<div className="library-actions"><span>删除此实验？</span><button className="text-button danger" disabled={busy} onClick={()=>void action(()=>deleteExperiment(scene.id,storageFor(scene)))}>删除</button><button className="text-button" onClick={()=>setPending('')}>取消</button></div>:
          <div className="library-actions"><a className="button compact" href={savedUrl(scene)}>打开 <ArrowUpRight size={14}/></a>
            <button className="icon" aria-label={'重命名：'+scene.title} title="重命名" disabled={busy} onClick={()=>{setTitle(scene.title);setEditing(scene.id)}}><Pencil size={15}/></button>
            <button className="icon" aria-label={'复制：'+scene.title} title="复制" disabled={busy} onClick={()=>void action(()=>duplicateExperiment(scene))}><Copy size={15}/></button>
            <button className="icon" aria-label={'删除：'+scene.title} title="删除" disabled={busy} onClick={()=>setPending(scene.id)}><Trash2 size={15}/></button>
          </div>}
        </div>
      </article>)}</div>}
  </main></>
}
function currentDomain() {
  const params = new URLSearchParams(location.search)
  const experiment=extendedTemplates.find(candidate=>candidate.id===params.get('extension'))
  return domains.find(candidate=>candidate.id===(experiment?.domain??params.get('domain')))??domains[0]
}

function readExtension(search:string|undefined) {
  const value=new URLSearchParams(search).get('extension')
  return isExtension(value)?value:undefined
}

function Workspace() {
  const [domain,setDomain]=useState(currentDomain)
  const [searches,setSearches]=useState<Partial<Record<Domain['id'],string>>>(()=>({[currentDomain().id]:location.search}))
  const addresses=useRef<Partial<Record<Domain['id'],string>>>({})

  function activate(next:Domain) {
    const search=location.search
    setSearches(previous=>previous[next.id]===undefined?{...previous,[next.id]:search}:previous)
    setDomain(next)
  }

  useEffect(()=>{
    function onBackOrForward() {
      const next=currentDomain()
      addresses.current[next.id]=location.pathname+location.search
      activate(next)
    }
    window.addEventListener('popstate',onBackOrForward)
    return ()=>window.removeEventListener('popstate',onBackOrForward)
  },[])

  function selectDomain(next:Domain) {
    if(next.id===domain.id)return
    addresses.current[domain.id]=location.pathname+location.search
    history.pushState(null,'',addresses.current[next.id]??domainUrl(next))
    activate(next)
  }
  function updateSavedAddress(id:string,scope:Domain['id']='mechanics',extension?:Extension) {
    const url=new URL(extension?extensionUrl(extension,id):appUrl('/lab'),location.origin)
    if(!extension) {
      if(scope!=='mechanics')url.searchParams.set('domain',scope)
      url.searchParams.set('id',id)
    }
    const address=url.pathname+url.search
    addresses.current[scope]=address
    if(currentDomain().id===scope)history.replaceState(null,'',address)
  }

  const inMechanics=domain.id==='mechanics'
  const mechanicsExtension=readExtension(searches.mechanics),electricExtension=readExtension(searches.electromagnetism),astronomyExtension=readExtension(searches.astrophysics)
  return <><DomainNav active={domain} select={selectDomain}/>
    {searches.mechanics!==undefined&&<div hidden={!inMechanics}>{mechanicsExtension?<Suspense fallback={<main className="page-width library"><p>正在打开实验…</p></main>}>
      <ExtendedLab search={searches.mechanics} extension={mechanicsExtension} active={inMechanics} updateSavedAddress={id=>updateSavedAddress(id,'mechanics',mechanicsExtension)}/>
    </Suspense>:<MechanicsWorkspace search={searches.mechanics} active={inMechanics} updateSavedAddress={updateSavedAddress}/>}</div>}
    {searches.electromagnetism!==undefined&&<div hidden={domain.id!=='electromagnetism'}><Suspense fallback={<main className="page-width library"><p>正在打开静电实验…</p></main>}>
      {electricExtension?<ExtendedLab search={searches.electromagnetism} extension={electricExtension} active={domain.id==='electromagnetism'} updateSavedAddress={id=>updateSavedAddress(id,'electromagnetism',electricExtension)}/>:<ElectrostaticLab search={searches.electromagnetism} updateSavedAddress={id=>updateSavedAddress(id,'electromagnetism')}/>}
    </Suspense></div>}
    {searches.astrophysics!==undefined&&<div hidden={domain.id!=='astrophysics'}><Suspense fallback={<main className="page-width library"><p>正在打开双体实验…</p></main>}>
      {astronomyExtension?<ExtendedLab search={searches.astrophysics} extension={astronomyExtension} active={domain.id==='astrophysics'} updateSavedAddress={id=>updateSavedAddress(id,'astrophysics',astronomyExtension)}/>:<AstronomyLab search={searches.astrophysics} active={domain.id==='astrophysics'} updateSavedAddress={id=>updateSavedAddress(id,'astrophysics')}/>}
    </Suspense></div>}
  </>
}

function MechanicsWorkspace({search,active,updateSavedAddress}:{search:string;active:boolean;updateSavedAddress:(id:string)=>void}) {
  const params=useRef(new URLSearchParams(search)).current
  const id=params.get('id')
  const [scene,setScene]=useState<Experiment|null>(null)
  const [error,setError]=useState('')
  useEffect(()=>{
    let mounted=true
    if(id) void loadExperiment(id).then(value=>{if(mounted)setScene(value)}).catch(e=>{if(mounted)setError(message(e))})
    else {
      const requested=params.get('template')
      const template=templates.find(t=>t.id===requested)
      setScene(params.has('new')?emptyExperiment():instantiate((template?.id??'projectile') as TemplateId))
    }
    return ()=>{mounted=false}
  },[id,params])
  return scene?<Suspense fallback={<main className="page-width library"><p className="muted">正在打开实验台…</p></main>}><Lab initial={scene} initiallySaved={Boolean(id)} active={active} updateSavedAddress={updateSavedAddress}/></Suspense>:<main className="page-width library">
    {error?<><p className="error-banner" role="alert">{error}</p><a className="button" href={appUrl('/experiments')}><ArrowLeft size={15}/> 返回实验库</a></>:<p className="muted">正在打开实验台…</p>}
  </main>
}
class ErrorBoundary extends Component<{children:ReactNode},{error:string}> {
  state={error:''}
  static getDerivedStateFromError(e:unknown) {return {error:message(e)}}
  render() {return this.state.error?<main className="page-width library"><h1>无法打开 PhysicLab</h1><p role="alert">{this.state.error}</p><a className="button" href={appUrl('/')}>返回首页</a></main>:this.props.children}
}
export function App() {
  const path=appPath(location.pathname)
  const page:Page=path==='/lab'?'lab':path==='/experiments'?'library':path==='/geometry'?'geometry':'home'
  const library=useLibrary()
  return <ErrorBoundary><AppShell page={page} entries={library.entries} error={library.error} loading={library.loading}>
    {page==='lab'?<Workspace/>:page==='library'?<Library {...library}/>:page==='geometry'?
      <Suspense fallback={<main className="page-width library"><p>正在打开几何工作室…</p></main>}><GeometryStudio/></Suspense>:<Home/>}
  </AppShell></ErrorBoundary>
}
