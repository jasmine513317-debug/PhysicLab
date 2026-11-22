import { copyFile, mkdir } from 'node:fs/promises'

const dist = new URL('../dist/', import.meta.url)
const index = new URL('index.html', dist)
for (const route of ['lab', 'experiments', 'geometry']) {
  const directory = new URL(route + '/', dist)
  await mkdir(directory, { recursive: true })
  await copyFile(index, new URL('index.html', directory))
}
