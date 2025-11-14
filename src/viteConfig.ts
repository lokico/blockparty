import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import react from '@vitejs/plugin-react'

// Get the directory where this CLI script is located
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export const blockPartyRoot = resolve(__dirname, '..')
export const templatesDir = resolve(__dirname, 'templates')

export function getViteResolveConfig() {
  return {
    alias: {
      'react': resolve(blockPartyRoot, 'node_modules/react'),
      'react-dom': resolve(blockPartyRoot, 'node_modules/react-dom'),
      'react/jsx-runtime': resolve(blockPartyRoot, 'node_modules/react/jsx-runtime'),
      'react/jsx-dev-runtime': resolve(blockPartyRoot, 'node_modules/react/jsx-dev-runtime')
    }
  }
}

export function getVitePlugins() {
  return [react()]
}
