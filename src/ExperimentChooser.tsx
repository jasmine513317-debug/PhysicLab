import { ArrowUpRight, Box } from 'lucide-react'
import { appUrl } from './routes'
import { domains, type Domain } from './domains'
import './experimentChooser.css'

const toolsByDomain={
  mechanics:'圆形、矩形、正方形、线段地面与斜面、光滑曲线、圆弧轨道、固定端、轻小物体、弹簧、轻绳、刚性杆、有质量绳和有质量弹簧。场景支持重力、摩擦、恢复系数、速度和持续外力。',
  electromagnetism:'可自由布置正电荷和负电荷，用探针、场线与等势线观察场的叠加。粒子、感应和 RC 各自使用独立的初始条件、参数和测量工具。',
  astrophysics:'恒星、行星、卫星和探测器。用三轴位置与速度搭建引力系统，可编辑质量、物理半径、显示半径和双体轨道倾角，切换观察参考系、轨迹与时间倍率。三维模板采用可调的牛顿引力教学尺度。',
}
const spatialModels=[['orbit','倾斜双体轨道'],['three','空间三体'],['escape','空间逃逸'],['assist','空间引力飞掠']] as const

const directions:{domain:Domain;href:string;index:string;note:string;label:string}[]=[
  {domain:domains[0],href:appUrl('/lab?new=1&domain=mechanics'),index:'01',note:'刚体 · 斜面 · 弹簧 · 绳杆',label:'力学'},
  {domain:domains[1],href:appUrl('/lab?new=1&domain=electromagnetism'),index:'02',note:'点电荷 · 场线 · 等势线',label:'电磁学'},
  {domain:domains[2],href:appUrl('/lab?new=1&domain=astrophysics'),index:'03',note:'轨道 · 双体 · 多体系统',label:'天体物理'},
]

export function ExperimentChooser({groups}:{groups:readonly {domain:Domain;items:readonly {title:string;url:string}[]}[]}) {
  const templateCount=groups.reduce((sum,group)=>sum+group.items.length,0)+spatialModels.length
  return <div className="sheet-page"><section className="experiment-chooser page-width paper" aria-labelledby="experiment-chooser-title">
    <header className="page-mast">
      <div>
        <p className="page-kicker"><span>PhysicLab</span><i aria-hidden="true"/><span>新建实验</span></p>
        <h1 id="experiment-chooser-title">选择实验方向</h1>
        <p className="page-deck">先确定学科方向，再从空白场景、基础模型或三维模板开始搭建。</p>
      </div>
      <dl className="page-meta">
        <div><dt>方向</dt><dd>03</dd></div>
        <div><dt>模板</dt><dd>{String(templateCount).padStart(2,'0')}</dd></div>
      </dl>
    </header>

    <div className="chooser-bands">
      {directions.map(({domain,href,index,note,label})=>{
        const Icon=domain.icon
        return <a className="chooser-band" key={domain.id} data-domain={domain.id} href={href} aria-label={label}>
          <span className="chooser-figure" aria-hidden="true">{index}</span>
          <span className="chooser-band-main">
            <span className="chooser-title"><span className="chooser-icon" aria-hidden="true"><Icon size={16}/></span>{domain.name}</span>
            <p>{domain.description}</p>
          </span>
          <span className="chooser-note" aria-hidden="true">{note}</span>
          <span className="chooser-enter" aria-hidden="true">进入 <ArrowUpRight size={13}/></span>
        </a>
      })}
      <a className="chooser-band chooser-band-dark" href={appUrl('/lab?new=1&space=astronomy')} aria-label="三维天体物理">
        <span className="chooser-figure" aria-hidden="true">3D</span>
        <span className="chooser-band-main">
          <span className="chooser-title"><span className="chooser-icon" aria-hidden="true"><Box size={16}/></span>三维天体物理</span>
          <p>在空间坐标系里放置恒星、行星和卫星，观察相互引力、倾斜轨道与飞掠。可在三维面板中直接建模。</p>
        </span>
        <span className="chooser-note" aria-hidden="true">{spatialModels.map(([,title])=>title).join(' · ')}</span>
        <span className="chooser-enter" aria-hidden="true">打开 <ArrowUpRight size={13}/></span>
      </a>
    </div>

    <section className="chooser-models" aria-labelledby="experiment-models-title">
      <h2 className="section-label" id="experiment-models-title">基础模型与实验模板</h2>
      <div className="chooser-details">
        {groups.map(({domain,items},index)=><details key={domain.id} data-domain={domain.id}>
          <summary><span className="chooser-detail-index" aria-hidden="true">{String(index+1).padStart(2,'0')}</span>{domain.name}<span className="chooser-detail-count" aria-hidden="true">{String(items.length).padStart(2,'0')}</span></summary>
          <div className="chooser-detail-body">
            <p>{toolsByDomain[domain.id]}</p>
            <ul>{domain.id==='astrophysics'&&spatialModels.map(([id,title])=><li key={id}>
              <a href={appUrl('/lab?new=1&space=astronomy&spaceModel='+id)}>{title}<ArrowUpRight size={11} aria-hidden="true"/></a>
            </li>)}{items.map(item=><li key={item.url}><a href={item.url}>{item.title}<ArrowUpRight size={11} aria-hidden="true"/></a></li>)}</ul>
          </div>
        </details>)}
      </div>
    </section>
  </section></div>
}
