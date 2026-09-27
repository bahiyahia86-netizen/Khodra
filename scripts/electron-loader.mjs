import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const shimUrl = pathToFileURL(path.join(__dirname, 'shims', 'electron.ts')).href

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'electron') {
    return {
      shortCircuit: true,
      url: shimUrl,
    }
  }
  return nextResolve(specifier, context)
}
