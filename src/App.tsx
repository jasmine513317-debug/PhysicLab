import { Component, lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react'
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
import { HeroSimulation } from './HeroSimulation'
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
const domainMeta:Record<Domain['id'],{index:string;count:string}>={
  mechanics:{index:'01',count:'8 个实验'},
  electromagnetism:{index:'02',count:'4 个实验'},
  astrophysics:{index:'03',count:'5 个实验'},
}
const laws:readonly {formula:string;name:string}[]=[
  {formula:'F = ma',name:'牛顿第二定律'},
  {formula:'E = ½mv²',name:'动能'},
  {formula:'T = 2π√(m/k)',name:'弹簧周期'},
  {formula:'F = k q₁q₂ / r²',name:'库仑定律'},
  {formula:'F = G m₁m₂ / r²',name:'万有引力'},
  {formula:'v² = GM(2/r − 1/a)',name:'活力公式'},
]
const domainLaw:Record<Domain['id'],{formula:string;law:string}> = {
  mechanics:{formula:'F = ma',law:'牛顿第二定律'},
  electromagnetism:{formula:'F = k q₁q₂ / r²',law:'库仑定律'},
  astrophysics:{formula:'F = G m₁m₂ / r²',law:'万有引力'},
}
function Home() {
  return <div className="hp-page">
    <main className="hp">
      <div className="hp-shell">
        <div className="hp-masthead">
          <span className="hp-masthead-brand">PhysicLab · Studio</span>
          <span className="hp-masthead-meta"><span>Planck 1.5</span><i aria-hidden="true"/><span>60 Hz</span><i aria-hidden="true"/><span>SI 单位</span></span>
        </div>

        <section className="hp-hero" aria-labelledby="home-title">
          <div className="hp-hero-copy">
            <p className="hp-eyebrow"><i aria-hidden="true"/>交互式物理实验室</p>
            <h1 id="home-title" className="hp-title">先搭一个世界，<br/><span>再问它为什么。</span></h1>
            <p className="hp-lead">搭建刚体、斜面与电荷，设定初始条件，让固定步长的求解器运行——<br className="hp-br"/>然后用曲线和数字回答你的假设。</p>
            <div className="hp-actions">
              <a className="hp-button hp-button-primary" href={newLab}>开始实验<ArrowRight size={15} aria-hidden="true"/></a>
              <a className="hp-button" href="#domains">浏览三个领域</a>
            </div>
            <p className="hp-note">无需账号 · 数据留在本地浏览器 · 全程 SI 单位</p>
          </div>

          <div className="hp-stage">
            <a className="hp-console" href={appUrl('/lab?template=projectile')} aria-label="打开斜抛运动实验">
              <div className="hp-console-head">
                <span className="hp-console-name">斜抛运动<small>Projectile motion</small></span>
                <span className="hp-live"><i aria-hidden="true"/>Running</span>
              </div>
              <div className="hp-canvas-wrap"><HeroSimulation/></div>
              <dl className="hp-metrics">
                <div><dt>最高点</dt><dd>2.55<small>m</small></dd></div>
                <div><dt>滞空时间</dt><dd>1.44<small>s</small></dd></div>
                <div><dt>水平射程</dt><dd>10.19<small>m</small></dd></div>
              </dl>
              <div className="hp-console-foot">
                <span>v₀ 10 m/s · θ 45° · g 9.81 m/s²</span>
                <span className="hp-enter">进入实验<ArrowUpRight size={12} aria-hidden="true"/></span>
              </div>
            </a>
          </div>
        </section>

        <section className="hp-laws" aria-label="实验涉及的物理定律">
          {laws.map(law=><div className="hp-law" key={law.formula}>
            <span className="hp-law-formula">{law.formula}</span>
            <span className="hp-law-name">{law.name}</span>
          </div>)}
        </section>

        <section className="hp-domains" id="domains" aria-labelledby="domains-title">
          <div className="hp-section-head">
            <p className="hp-index">01 — 领域</p>
            <h2 id="domains-title">三个领域，同一套法则。</h2>
            <p className="hp-section-lead">每一门都有自己的控制方程，也都跑在同一个固定步长求解器上。</p>
          </div>
          <div className="hp-grid">{domains.map(domain=>{
            const meta=domainMeta[domain.id]
            const law=domainLaw[domain.id]
            return <a key={domain.id} className={'domain-card hp-card hp-card-'+domain.id} href={domainUrl(domain)}>
              <div className="hp-card-top">
                <span className="hp-card-icon"><domain.icon size={18} strokeWidth={1.4} aria-hidden="true"/></span>
                <span className="hp-card-index">{meta.index}</span>
              </div>
              <p className="hp-card-formula" aria-hidden="true">{law.formula}</p>
              <p className="hp-card-law">控制方程 · {law.law}</p>
              <h3>{domain.name}</h3>
              <p className="hp-card-text">{domain.description}</p>
              <div className="hp-card-foot"><span>{meta.count}</span><span className="hp-card-enter">进入<ArrowUpRight size={13} aria-hidden="true"/></span></div>
            </a>
          })}</div>
        </section>

        <section className="hp-spec" aria-label="实验室规格">
          <div><span className="hp-spec-value">60<small>Hz</small></span><span className="hp-spec-label">固定物理步长</span></div>
          <div><span className="hp-spec-value">15<small>Hz</small></span><span className="hp-spec-label">数据采样</span></div>
          <div><span className="hp-spec-value">SI</span><span className="hp-spec-label">国际单位制</span></div>
          <div className="hp-spec-flow"><span>搭建</span><i aria-hidden="true"/><span>运行</span><i aria-hidden="true"/><span>分析</span></div>
        </section>
      </div>
    </main>
    <footer className="hp-footer">
      <div className="hp-shell hp-footer-inner">
        <span>PhysicLab Studio</span>
        <span>本地优先 · 无账号 · 无上传</span>
        <a href={appUrl('/experiments')}>实验库<ArrowUpRight size={12} aria-hidden="true"/></a>
      </div>
    </footer>
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
