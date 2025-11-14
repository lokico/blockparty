import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { existsSync } from 'fs'
import react from '@vitejs/plugin-react'

// Get the directory where this CLI script is located
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export const blockPartyRoot = resolve(__dirname, '..')
export const templatesDir = resolve(__dirname, 'templates')

function resolvePackage(packageName: string): string {
  // Try blockPartyRoot/node_modules first (e.g. local development)
  const localPath = resolve(blockPartyRoot, 'node_modules', packageName)
  if (existsSync(localPath)) {
    return localPath
  }

  // Otherwise, it must be blockPartyRoot/.. for flat npm install (npx)
  return resolve(blockPartyRoot, '..', packageName)
}

export function getViteResolveConfig() {
  return {
    alias: {
      'react': resolvePackage('react'),
      'react-dom': resolvePackage('react-dom'),
      'react/jsx-runtime': resolve(resolvePackage('react'), 'jsx-runtime'),
      'react/jsx-dev-runtime': resolve(resolvePackage('react'), 'jsx-dev-runtime')
    }
  }
}

export function getVitePlugins() {
  return [react()]
}
