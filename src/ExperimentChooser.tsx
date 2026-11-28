import { Box,Magnet,Orbit,ArrowUpRight } from 'lucide-react'
import { appUrl } from './routes'
import type { Domain } from './domains'
import './experimentChooser.css'

const toolsByDomain={
  mechanics:'圆形、矩形、正方形、线段地面与斜面、光滑曲线、圆弧轨道、固定端、轻小物体、弹簧、轻绳、刚性杆、有质量绳和有质量弹簧。场景支持重力、摩擦、恢复系数、速度和持续外力。',
  electromagnetism:'可自由布置正电荷和负电荷，用探针、场线与等势线观察场的叠加。粒子、感应和 RC 各自使用独立的初始条件、参数和测量工具。',
  astrophysics:'恒星、行星、卫星和探测器。用三轴位置与速度搭建引力系统，可编辑质量、物理半径、显示半径和双体轨道倾角，切换观察参考系、轨迹与时间倍率。三维模板采用可调的牛顿引力教学尺度。',
}
const spatialModels=[['orbit','倾斜双体轨道'],['three','空间三体'],['escape','空间逃逸'],['assist','空间引力飞掠']] as const

export function ExperimentChooser({groups}:{groups:readonly {domain:Domain;items:readonly {title:string;url:string}[]}[]}) {
  return <section className="experiment-chooser page-width" aria-labelledby="experiment-chooser-title">
    <h1 id="experiment-chooser-title">选择实验方向</h1>
    <div className="experiment-chooser-grid">
      <section aria-labelledby="simple-experiments">
        <h2 id="simple-experiments">简单物体实验</h2>
        <a href={appUrl('/lab?new=1&domain=mechanics')}><Box aria-hidden="true"/><strong>力学</strong><ArrowUpRight aria-hidden="true"/></a>
        <p>用刚体、斜面、曲线轨道、弹簧、绳和杆搭建场景。可调整质量、摩擦、碰撞和重力。</p>
        <a href={appUrl('/lab?new=1&domain=electromagnetism')}><Magnet aria-hidden="true"/><strong>电磁学</strong><ArrowUpRight aria-hidden="true"/></a>
        <p>放置正负点电荷，查看场线和等势线，也可打开带电粒子、电磁感应和 RC 电路模型。</p>
      </section>
      <section aria-labelledby="space-experiments">
        <h2 id="space-experiments">天体物理实验</h2>
        <a href={appUrl('/lab?new=1&space=astronomy')}><Orbit aria-hidden="true"/><strong>三维天体物理</strong><ArrowUpRight aria-hidden="true"/></a>
        <p>添加恒星、行星和卫星，调整三维初始位置与速度，观察相互引力、轨迹和质心。</p>
        <a href={appUrl('/lab?new=1&domain=astrophysics')}><Orbit aria-hidden="true"/><strong>二维天体物理</strong><ArrowUpRight aria-hidden="true"/></a>
        <p>在平面中比较轨道、周期、逃逸速度和多天体运动。</p>
      </section>
    </div>
    <h2 className="experiment-models-title">基础模型与实验模板</h2>
    <div className="experiment-models">
      {groups.map(({domain,items})=><details key={domain.id}>
        <summary>{domain.name}</summary>
        <p>{toolsByDomain[domain.id]}</p>
        <ul>{domain.id==='astrophysics'&&spatialModels.map(([id,title])=><li key={id}>
          <a href={appUrl('/lab?new=1&space=astronomy&spaceModel='+id)}>{title}</a>
        </li>)}{items.map(item=><li key={item.url}><a href={item.url}>{item.title}</a></li>)}</ul>
      </details>)}
    </div>
  </section>
}
