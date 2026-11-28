import { GRAVITATION,horizonRadius } from './celestialPhysics'
import { equalMassRemnant,kerrHorizon,kerrRingdown,pressurelessCollapse } from './blackHolePhysics'
import { mergerReplay,sxsMerger } from './celestialMergerReplay'
import { add,cross,emptySpatialScene,length,multiply,spatialObject,subtract,type SpatialBody,type SpatialScene,type Vec3 } from './spatialPhysics'

const AU=149597870700, sunMass=1.9884e30
const radians=Math.PI/180
const elementsSource='https://ssd.jpl.nasa.gov/planets/approx_pos.html'
const smallBodySource='https://ssd.jpl.nasa.gov/sb/elem_tables.html'
// JPL approximate positions, table 1, J2000.0: a, e, I, L, longitude of perihelion, longitude of node.
// Mass, mean radius and rotation are from JPL physical parameters (or NASA's Pluto fact sheet).
export const planets=[
 ['mercury','水星','rock','#a39080',.330103e24,2439.4,58.6462,.38709927,.20563593,7.00497902,252.25032350,77.45779628,48.33076593],
 ['venus','金星','rock','#e1be83',4.86731e24,6051.8,-243.018,.72333566,.00677672,3.39467605,181.97909950,131.60246718,76.67984255],
 ['earth','地球','rock','#548fd9',5.97217e24,6371.0084,.99726968,1.00000261,.01671123,-.00001531,100.46457166,102.93768193,0],
 ['mars','火星','rock','#c16b4a',.641691e24,3389.5,1.025957,1.52371034,.09339410,1.84969142,-4.55343205,-23.94362959,49.55953891],
 ['jupiter','木星','gas','#cfaa8a',1898.125e24,69911,.41354,5.202887,.04838624,1.30439695,34.39644051,14.72847983,100.47390909],
 ['saturn','土星','gas','#dbc48e',568.317e24,58232,.444,9.53667594,.05386179,2.48599187,49.95424423,92.59887831,113.66242448],
 ['uranus','天王星','ice','#a1d9df',86.8099e24,25362,-.71833,19.18916464,.04725744,.77263783,313.23810451,170.95427630,74.01692503],
 ['neptune','海王星','ice','#607fe0',102.4092e24,24622,.67125,30.06992276,.00859048,1.77004347,-55.12002969,44.96476227,131.78422574],
] as const

export const celestialAssets=[
 ...planets.map(([id,name])=>({id,name})),{id:'sun',name:'太阳'},{id:'pluto',name:'冥王星'},{id:'ceres',name:'谷神星'},
 {id:'asteroid',name:'小行星（教学模型）'},{id:'vesta',name:'灶神星'},{id:'comet',name:'彗星（教学模型）'},{id:'halley',name:'哈雷彗星'},
 {id:'terrestrial',name:'类地行星（假设模型）'},{id:'gas',name:'气态行星（假设模型）'},
 {id:'superEarth',name:'超级地球（假设模型）'},{id:'ocean',name:'海洋行星（假设模型）'},
 {id:'ice',name:'冰行星（假设模型）'},{id:'giant',name:'巨型气态行星（假设模型）'},
 {id:'blackHole',name:'非旋转黑洞（近似模型）'},{id:'custom',name:'自定义天体'},
]

export function celestialAsset(id:string):SpatialBody {
  const planet=planets.find(item=>item[0]===id)
  const body=spatialObject()
  if(planet) {
    const [preset,name,kind,color,mass,km,days]=planet
    return {...body,name,mass,radius:km*1000,position:[0,0,0],celestial:{kind,color,preset,rotationPeriod:days*86400},
      angularVelocity:[0,2*Math.PI/(days*86400),0]}
  }
  const assets:Record<string,[string,NonNullable<SpatialBody['celestial']>['kind'],string,number,number,number?]>={
    sun:['太阳','star','#ffd18c',sunMass,695700000,25.38*86400],
    pluto:['冥王星','ice','#cabcb5',1.303e22,1188000,-153.3*3600],
    ceres:['谷神星','rock','#9c9388',9.39e20,469700,9.074*3600],
    asteroid:['小行星','rock','#a99a8e',1e15,4500],comet:['彗星','comet','#bbddf2',1e13,1800],
    vesta:['灶神星','rock','#a2988c',17.2882844e9/GRAVITATION,261385,5.3421276322*3600],
    halley:['哈雷彗星','comet','#a1b5cf',2.7e14,5000,2.2*86400],
    terrestrial:['类地行星','rock','#5e98a1',5e24,6e6],gas:['气态行星','gas','#bb9d7b',1e27,6e7],
    superEarth:['超级地球','rock','#7dab77',3e25,1e7],ocean:['海洋行星','rock','#579fcb',8e24,8e6],
    ice:['冰行星','ice','#a8dced',4e24,6e6],giant:['巨型气态行星','gas','#d1b0b9',4e27,8e7],
    blackHole:['非旋转黑洞','blackHole','#f7ab62',sunMass*4,horizonRadius(sunMass*4)],
    custom:['自定义天体','rock','#a2a8c4',1e24,4e6],
  }
  const value=assets[id]
  if(!value)throw new Error('未知天体模型。')
  const [name,kind,color,mass,radius,rotationPeriod]=value
  return {...body,name,mass,radius,position:[0,0,0],celestial:{kind,color,preset:id,rotationPeriod},
    angularVelocity:[0,rotationPeriod?2*Math.PI/rotationPeriod:0,0]}
}

function keplerState(body:SpatialBody,sun:SpatialBody,axis:number,e:number,inclination:number,anomaly:number,argument:number,node:number) {
    const a=axis*AU,mean=Math.atan2(Math.sin(anomaly*radians),Math.cos(anomaly*radians))
    let E=e>.8&&Math.abs(mean)>1e-10?Math.PI*Math.sign(mean):mean
    for(let i=0;i<30;i++)E-=(E-e*Math.sin(E)-mean)/(1-e*Math.cos(E))
    const i=inclination*radians,w=argument*radians,N=node*radians,beta=Math.sqrt(1-e*e)
    const rotate=(x:number,y:number):Vec3=>{
      const u=x*Math.cos(w)-y*Math.sin(w),v=x*Math.sin(w)+y*Math.cos(w)
      return [u*Math.cos(N)-v*Math.cos(i)*Math.sin(N),v*Math.sin(i),-u*Math.sin(N)-v*Math.cos(i)*Math.cos(N)]
    }
    const n=Math.sqrt(GRAVITATION*(sun.mass+body.mass)/a**3)/(1-e*Math.cos(E))
    return {...body,position:rotate(a*(Math.cos(E)-e),a*beta*Math.sin(E)),
      velocity:rotate(-a*n*Math.sin(E),a*n*beta*Math.cos(E))}
}

export function referenceOrbit(id:string) {
  const planet=planets.find(([preset])=>id===preset)
  if(planet) {
    const [,,,,,,,axis,e,inclination,longitude,perihelion,node]=planet
    return {axis,e,inclination,mean:longitude-perihelion,argument:perihelion-node,node,epoch:'J2000.0',url:elementsSource}
  }
  const samples:Record<string,readonly [number,number,number,number,number,number,string,string]>={
    ceres:[2.7653485,.07913825,10.58682,113.4104434,72.58981,80.39320,'MJD 55400 TDB',smallBodySource],
    vesta:[2.36,.0902,7.14,81.2,151,104,'JD 2461200.5 TDB','https://ssd-api.jpl.nasa.gov/sbdb.api?sstr=4&phys-par=1'],
    halley:[.58597811/(1-.96714291),.96714291,162.26269,0,111.33249,58.42008,'1986-02-05.89532 TDB · 样例要素近心点',smallBodySource],
  }
  const item=samples[id]
  if(item) {
    const [axis,e,inclination,mean,argument,node,epoch,url]=item
    return {axis,e,inclination,mean,argument,node,epoch,url}
  }
}

export function sourceOrbitScene(id:string):SpatialScene|undefined {
  const record=referenceOrbit(id)
  if(!record)return
  const sun=celestialAsset('sun'),asset=celestialAsset(id)
  const {axis,e,inclination,mean,argument,node,epoch}=record
  const orbit=keplerState(asset,sun,axis,e,inclination,mean,argument,node)
  const fraction=orbit.mass/(orbit.mass+sun.mass)
  const position=multiply(orbit.position,fraction),velocity=multiply(orbit.velocity,fraction)
  const distance=length(orbit.position)
  return {...astronomicalUniverse(asset.name+' · '+epoch),
    celestial:{...astronomicalUniverse().celestial!,secondsPerTick:10800,maxStep:5400,softening:100},
    bodies:[{...sun,position:multiply(position,-1),velocity:multiply(velocity,-1),visualRadius:distance*.04},
      {...orbit,position:subtract(orbit.position,position),velocity:subtract(orbit.velocity,velocity),visualRadius:distance*.012}]}
}

export function solarSystem():SpatialScene {
  const sun=celestialAsset('sun')
  const bodies=[sun,...planets.map(([id,,,,,,,axis,e,inclination,longitude,perihelion,node])=>
    keplerState(celestialAsset(id),sun,axis,e,inclination,longitude-perihelion,perihelion-node,node))]
  const mass=bodies.reduce((sum,b)=>sum+b.mass,0)
  const center=(key:'position'|'velocity')=>bodies.reduce<Vec3>((sum,b)=>add(sum,multiply(b[key],b.mass/mass)),[0,0,0])
  const p=center('position'),v=center('velocity')
  return {...astronomicalUniverse('太阳系 · J2000'),celestial:{...astronomicalUniverse().celestial!,secondsPerTick:10800,maxStep:5400,softening:100},
    bodies:bodies.map(b=>({...b,position:subtract(b.position,p),velocity:subtract(b.velocity,v),visualRadius:(b===sun?.36:.09)*AU}))}
}

export function astronomicalUniverse(title='空白宇宙'):SpatialScene {
  return {...emptySpatialScene(title),gravity:[0,0,0],mutualGravity:true,collisions:false,
    celestial:{integrator:'verlet',softening:.01,secondsPerTick:1/60,maxStep:1/240,adaptive:true}}
}

export function phenomenonPreset(id:string):SpatialScene|undefined {
  if(id==='mergerReplay') {
    const scene=astronomicalUniverse('双黑洞合并 · SXS 数值回放')
    const a=celestialAsset('blackHole'),b=celestialAsset('blackHole')
    const mass=(a.mass+b.mass)*sxsMerger.massFraction,spin=sxsMerger.spin
    const {positions,visualRadii}=mergerReplay(a.mass+b.mass).at(0)
    const remnant={...celestialAsset('blackHole'),name:'共同视界',mass,radius:kerrHorizon(mass,spin),celestial:{...a.celestial!,spin}}
    return {...scene,celestial:{...scene.celestial!,special:'mergerReplay',secondsPerTick:.00012},
      bodies:[{...a,name:'视界 A'},{...b,name:'视界 B'},remnant].map((body,i)=>({...body,position:positions[i],visualRadius:visualRadii[i]}))}
  }
  if(id==='tidalCapture') {
    const scene=astronomicalUniverse('引力捕获 · 三体交换')
    const primary=celestialAsset('sun'),distance=1e11
    const speed=Math.sqrt(GRAVITATION*primary.mass/distance)
    const timeUnit=distance/speed
    const companion=()=>({...celestialAsset('giant'),mass:.0005*primary.mass,radius:7e7,visualRadius:.016*distance})
    const radial=-speed*Math.sqrt(2.45-.55**2),tangent=.55*speed,internal=Math.sqrt(.001/.02)*speed/2
    return {...scene,celestial:{...scene.celestial!,softening:1e5,secondsPerTick:.012*timeUnit,maxStep:.0003*timeUnit},
      bodies:[{...primary,visualRadius:.035*distance},
        {...companion(),name:'伴星 A',position:[1.01*distance,0,0],velocity:[radial,0,-(tangent+internal)]},
        {...companion(),name:'伴星 B',position:[.99*distance,0,0],velocity:[radial,0,-(tangent-internal)]}]}
  }
  if(id==='ringdown') {
    const scene=astronomicalUniverse('双黑洞合并残骸 · 振铃')
    const hole=celestialAsset('blackHole')
    const {mass,spin}=equalMassRemnant(2*hole.mass)
    const radius=kerrHorizon(mass,spin)
    const {tau}=kerrRingdown(mass,spin)
    return {...scene,celestial:{...scene.celestial!,special:'ringdown',secondsPerTick:8*tau/24},
      bodies:[{...hole,name:'合并后的克尔黑洞',mass,radius,celestial:{...hole.celestial!,spin}}]}
  }
  if(id==='binaryPN'||id==='blackholes') {
    const postNewtonian=id==='binaryPN'
    const scene=astronomicalUniverse(postNewtonian?'双黑洞 · 1PN 圆轨道':'双黑洞 · 牛顿对照')
    const a=celestialAsset('blackHole'),b=celestialAsset('blackHole')
    const gap=12*horizonRadius(a.mass+b.mass)
    const speed=Math.sqrt(GRAVITATION*(a.mass+b.mass)/gap)/2
    return {...scene,celestial:{...scene.celestial!,special:postNewtonian?'binaryPN':undefined,secondsPerTick:.001,maxStep:.00025},
      bodies:[{...a,name:'黑洞 A',position:[-gap/2,0,0],velocity:[0,0,speed]},
        {...b,name:'黑洞 B',position:[gap/2,0,0],velocity:[0,0,-speed]}]}
  }
  if(id==='collapse') {
    const scene=astronomicalUniverse('均匀无压球坍缩'),sphere=celestialAsset('sun')
    const end=pressurelessCollapse(sphere.mass,sphere.radius,1)!
    return {...scene,celestial:{...scene.celestial!,special:'collapse',secondsPerTick:end.time/360},
      bodies:[{...sphere,name:'无压气体球',celestial:{...sphere.celestial!,rotationPeriod:undefined},angularVelocity:[0,0,0]}]}
  }
  if(id==='impact') {
    const scene=astronomicalUniverse('行星碰撞')
    const a={...celestialAsset('custom'),name:'撞击体 A',position:[-1.8e7,0,0] as Vec3,velocity:[7200,0,0] as Vec3}
    const b={...celestialAsset('custom'),name:'撞击体 B',position:[1.8e7,0,0] as Vec3,velocity:[-7200,0,0] as Vec3}
    return {...scene,collisions:true,celestial:{...scene.celestial!,secondsPerTick:60,maxStep:10,contact:'fragment'},bodies:[a,b]}
  }
  if(id==='binary'||id==='accretion'||id==='capture') {
    const isHole=id==='accretion'
    const scene=astronomicalUniverse(({binary:'双星系统',accretion:'黑洞与周围天体',capture:'引力捕获 · 人工耗能'})[id])
    const a=celestialAsset(isHole?'blackHole':'sun')
    const b=celestialAsset(id==='binary'?'sun':id==='accretion'?'asteroid':'earth')
    const separation=id==='accretion'?3.5e5:6e9
    const mass=a.mass+b.mass,va=b.mass/mass,vb=a.mass/mass
    const v=Math.sqrt(GRAVITATION*mass/separation)*(id==='capture'?1.5:id==='accretion'?.1:1)
    const h=Math.max(.0004,2*Math.PI*Math.sqrt(separation**3/(GRAVITATION*mass))/1200)
    const radial=id==='accretion'?-v*.2:0
    return {...scene,collisions:id==='accretion',
      celestial:{...scene.celestial!,secondsPerTick:h,maxStep:h/4,contact:id==='accretion'?'merge':'bounce'},
      bodies:[
        {...a,name:a.name+' A',position:[-separation*va,0,0],velocity:[-radial*va,0,v*va],visualRadius:id==='accretion'?a.radius*2:Math.max(a.radius,separation*.025)},
        {...b,name:b.name+' B',position:[separation*vb,0,0],velocity:[radial*vb,0,-v*vb],visualRadius:Math.max(b.radius,separation*.012)},
      ]}
  }
}

export function insertAsset(scene:SpatialScene,asset:string|SpatialBody,selected:string):SpatialScene {
  const next=typeof asset==='string'?celestialAsset(asset):{...asset,id:crypto.randomUUID(),position:[0,0,0] as Vec3,velocity:[0,0,0] as Vec3}
  const primary=scene.bodies.find(b=>b.id===selected)??scene.bodies[0]
  if(!primary)return {...scene,bodies:[next]}
  const radius=Math.max(8*(primary.radius+next.radius),length(primary.position)*.6,1e7)
  const offset:Vec3=[radius,0,0]
  const softened=Math.hypot(radius,scene.celestial?.softening??.01)
  const speed=Math.sqrt(GRAVITATION*(primary.mass+next.mass)*radius**2/softened**3)
  const direction=cross([0,1,0],offset)
  const relative=multiply(direction,speed/radius)
  const fraction=primary.fixed?0:next.mass/(primary.mass+next.mass)
  next.position=add(primary.position,offset)
  next.velocity=add(primary.velocity,multiply(relative,1-fraction))
  if(primary.visualRadius)next.visualRadius=Math.max(next.radius,primary.visualRadius*.55)
  return {...scene,bodies:[...scene.bodies.map(b=>b===primary&&!b.fixed?{...b,velocity:subtract(b.velocity,multiply(relative,fraction))}:b),next]}
}
