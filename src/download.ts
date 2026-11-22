export function downloadText(title: string, extension: 'csv' | 'json' | 'obj', type: string, content: string) {
  const name = title.trim().replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '-').replace(/[. ]+$/g, '')
  const url = URL.createObjectURL(new Blob([content], {type}))
  const link = document.createElement('a')
  link.href = url
  link.download = (name || '实验') + '.' + extension
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
