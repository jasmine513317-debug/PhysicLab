import { copyFile, mkdir } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

const output = process.argv[2]
const dist = output ? pathToFileURL(resolve(output) + sep) : new URL('../dist/', import.meta.url)
const index = new URL('index.html', dist)
for (const route of ['lab', 'experiments', 'geometry']) {
  const directory = new URL(route + '/', dist)
  await mkdir(directory, { recursive: true })
  await copyFile(index, new URL('index.html', directory))
}
