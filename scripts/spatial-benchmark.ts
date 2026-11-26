import { performance } from 'node:perf_hooks'
import { emptySpatialScene, SpatialPhysics, spatialObject, type Vec3 } from '../src/spatialPhysics'
import { initializeSpatialRigid } from '../src/spatialRigid'

for(const count of [10,30,60]) {
  const elapsed:number[]=[]
  for(let attempt=0;attempt<4;attempt++) {
    const bodies=Array.from({length:count},(_,i)=>({
      ...spatialObject(),position:[i%10*1.15,3+Math.floor(i/10)*.85,Math.floor(i/10)*.65] as Vec3,
      velocity:[i%2*.2,0,.1] as Vec3,radius:.35,
    }))
    const solver=new SpatialPhysics({...emptySpatialScene(),bodies,ground:true})
    const start=performance.now()
    for(let step=0;step<360;step++)solver.step()
    if(attempt>0)elapsed.push(performance.now()-start)
  }
  elapsed.sort((a,b)=>a-b)
  console.log(`${count} 个球体，360 外层步，三次中位数 ${elapsed[1].toFixed(1)} ms`)
}

await initializeSpatialRigid()
for(const count of [10,30,60]) {
  const times=[]
  for(let attempt=0;attempt<4;attempt++) {
    const bodies=Array.from({length:count},(_,i)=>({
      ...spatialObject(),position:[i%10*1.16,3+Math.floor(i/10),Math.floor(i/10)*.8] as Vec3,
      angularVelocity:[.25,.5,.1] as Vec3,
      geometry:{kind:'box' as const,size:[.73,.65,.57] as Vec3},
    }))
    const solver=new SpatialPhysics({...emptySpatialScene(),bodies,ground:true})
    try {
      solver.step()
      const start=performance.now()
      for(let i=0;i<360;i++)solver.step()
      if(attempt>0)times.push(performance.now()-start)
    } finally {solver.dispose()}
  }
  times.sort((a,b)=>a-b)
  console.log(`Rapier · ${count} 个旋转盒体，360 外层步，三次中位数 ${times[1].toFixed(1)} ms`)
}

if(process.argv.includes('--retention')) {
  const bodies=Array.from({length:8},(_,i)=>({
    ...spatialObject(),position:[i%4*1.2,2+Math.floor(i/4),Math.floor(i/4)*.9] as Vec3,
    geometry:{kind:'box' as const,size:[.65,.7,.6] as Vec3},
  }))
  let solver=new SpatialPhysics({...emptySpatialScene(),bodies,ground:true})
  const retained=()=>Math.max(...[...solver.history.values()].map(samples=>samples.length))
  try {
    for(let block=1;block<=30;block++) {
      for(let step=0;step<900;step++)solver.step()
      const next=SpatialPhysics.restore(solver.capture())
      if(next.time!==solver.time||retained()>1800)throw new Error('Long-run checkpoint or retention is inconsistent.')
      solver.dispose()
      solver=next
      if(block%10===0) {
        globalThis.gc?.()
        const {heapUsed,rss,external,arrayBuffers}=process.memoryUsage()
        console.log(`Rapier · ${solver.time} s · ${retained()} 点/物体 · heap ${(heapUsed/2**20).toFixed(1)} MiB · RSS ${(rss/2**20).toFixed(1)} MiB · external ${(external/2**20).toFixed(1)} MiB · buffers ${(arrayBuffers/2**20).toFixed(1)} MiB`)
      }
    }
  } finally {solver.dispose()}
}
