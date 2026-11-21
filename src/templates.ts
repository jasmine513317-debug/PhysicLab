import { body, emptyExperiment, type Experiment } from './model'

export const templates = [
  {id:'projectile', title:'斜抛运动', topic:'运动学', description:'发射物体，对比实际轨迹与理论抛物线。', tint:'mint'},
  {id:'collision', title:'弹性碰撞', topic:'动量', description:'观察两个物体碰撞时的动量传递。', tint:'blue'},
  {id:'spring', title:'弹簧振子', topic:'振动', description:'测量连接弹簧的物体的振动周期。', tint:'amber'},
  {id:'friction', title:'斜面摩擦', topic:'动力学', description:'改变摩擦系数，观察滑块在斜面上的运动。', tint:'blue'},
  {id:'fall', title:'自由落体', topic:'重力', description:'测量恒定重力下位移和速度的变化。', tint:'mint'},
] as const
export type TemplateId = typeof templates[number]['id']

export function instantiate(id: TemplateId): Experiment {
  const info = templates.find(t => t.id === id)!
  const scene = {...emptyExperiment(), kind:id, title:info.title, description:info.description}
  const floor = body('地面', {kind:'surface',width:22,height:0.32}, 0, -0.16, {restitution:0})
  switch (id) {
    case 'projectile':
      scene.camera = {...scene.camera,x:1.35}
      scene.bodies = [body('抛射体', {kind:'circle',radius:0.28}, -4, 0.8, {
        velocity:{x:Math.SQRT1_2*10,y:Math.SQRT1_2*10}, restitution:0,
      }), floor]
      break
    case 'collision':
      scene.environment.gravity = 0
      scene.bodies = [
        body('运动圆盘',{kind:'circle',radius:0.5},-3,2,{velocity:{x:4,y:0},friction:0,restitution:1}),
        body('目标圆盘',{kind:'circle',radius:0.5},2,2,{color:'blue',friction:0,restitution:1}),
      ]
      break
    case 'spring': {
      scene.environment.gravity = 0
      const anchor = body('固定点',{kind:'rectangle',width:0.46,height:0.46},-3,2,{type:'static',color:'slate'})
      const mass = body('振动物体',{kind:'rectangle',width:0.75,height:0.75},1,2,{color:'amber'})
      scene.bodies = [mass,anchor]
      scene.joints = [{id:crypto.randomUUID(),a:anchor.id,b:mass.id,anchorA:{x:0,y:0},anchorB:{x:0,y:0},stiffness:100,damping:0,restLength:3}]
      break
    }
    case 'friction': {
      const angle = -0.38
      scene.bodies = [
        body('滑块',{kind:'rectangle',width:0.75,height:0.6},-2.6,3.07,{angle,mass:2,color:'blue',friction:0.2,restitution:0}),
        body('斜面',{kind:'surface',width:8,height:0.23},0,1.6,{angle,friction:0.35,restitution:0}),floor,
      ]
      break
    }
    case 'fall':
      scene.camera = {x:0,y:5,scale:45}
      scene.bodies = [body('下落小球',{kind:'circle',radius:0.35},0,10,{restitution:0}),floor]
      break
  }
  return scene
}
