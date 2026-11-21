import { mkdirSync, writeFileSync } from 'node:fs'
import { toCsv } from '../src/analysis'
import { Physics } from '../src/physics'
import { instantiate } from '../src/templates'

const scene=instantiate('projectile')
const experiment=new Physics(scene)
for(let i=0;i<120;i++) experiment.step()
mkdirSync('examples',{recursive:true})
writeFileSync('examples/projectile.csv',toCsv(experiment.samples.get(scene.bodies[0].id)!))
