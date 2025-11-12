#!/usr/bin/env node

import { existsSync } from 'fs'
import { readdir } from 'fs/promises'
import { join, resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { extractPropsFromFile, type PropDefinition } from './extractProps.js'

// Get the directory where this CLI script is located
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const blockPartyRoot = resolve(__dirname, '..')

interface BlockInfo {
  name: string
  path: string
  props: PropDefinition[]
}

async function discoverBlocks(baseDir: string): Promise<BlockInfo[]> {
  const blocks: BlockInfo[] = []

  // Check if current directory is a Block (has index.ts or index.tsx)
  const hasIndexTs = existsSync(join(baseDir, 'index.ts'))
  const hasIndexTsx = existsSync(join(baseDir, 'index.tsx'))

  if (hasIndexTs || hasIndexTsx) {
    // Current directory is a Block
    const indexPath = hasIndexTsx ? join(baseDir, 'index.tsx') : join(baseDir, 'index.ts')
    const props = await extractPropsFromFile(indexPath)

    blocks.push({
      name: 'Block',
      path: baseDir,
      props
    })
    return blocks
  }

  // Check subdirectories for Blocks
  try {
    const entries = await readdir(baseDir, { withFileTypes: true })

    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        const dirPath = join(baseDir, entry.name)
        const indexTsPath = join(dirPath, 'index.ts')
        const indexTsxPath = join(dirPath, 'index.tsx')
        const hasIndexTs = existsSync(indexTsPath)
        const hasIndexTsx = existsSync(indexTsxPath)

        if (hasIndexTs || hasIndexTsx) {
          const indexPath = hasIndexTsx ? indexTsxPath : indexTsPath
          const props = await extractPropsFromFile(indexPath)

          blocks.push({
            name: entry.name,
            path: dirPath,
            props
          })
        }
      }
    }
  } catch (error) {
    console.error('Error reading directory:', error)
  }

  return blocks
}

async function startStorybook() {
  // Get path from command line argument, or use current working directory
  const pathArg = process.argv[2]
  const targetDir = pathArg ? resolve(process.cwd(), pathArg) : process.cwd()

  // Verify the directory exists
  if (!existsSync(targetDir)) {
    console.error(`❌ Directory not found: ${targetDir}`)
    process.exit(1)
  }

  console.log('🎉 Starting Block Party...')
  console.log(`📂 Working directory: ${targetDir}\n`)

  const blocks = await discoverBlocks(targetDir)

  if (blocks.length === 0) {
    console.error('❌ No Blocks found!')
    console.error('A Block should have an index.ts or index.tsx file with:')
    console.error('  - An exported Props interface')
    console.error('  - A default exported function component')
    process.exit(1)
  }

  console.log(`✅ Found ${blocks.length} Block(s):`)
  blocks.forEach(block => {
    console.log(`   - ${block.name}`)
  })
  console.log()

  // Create virtual storybook entry point
  const storybookEntry = generateStorybookEntry(blocks)

  // Start Vite dev server
  const server = await createServer({
    root: resolve(__dirname),
    resolve: {
      alias: {
        'react': resolve(blockPartyRoot, 'node_modules/react'),
        'react-dom': resolve(blockPartyRoot, 'node_modules/react-dom'),
        'react/jsx-runtime': resolve(blockPartyRoot, 'node_modules/react/jsx-runtime'),
        'react/jsx-dev-runtime': resolve(blockPartyRoot, 'node_modules/react/jsx-dev-runtime')
      }
    },
    optimizeDeps: {
      include: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime']
    },
    plugins: [
      {
        name: 'blockparty-virtual',
        enforce: 'pre',
        resolveId(id) {
          if (id === '/@blockparty/storybook') {
            return '/@blockparty/storybook.tsx'
          }
        },
        load(id) {
          if (id === '/@blockparty/storybook.tsx') {
            return storybookEntry
          }
        }
      },
      react()
    ],
    server: {
      fs: {
        allow: [blockPartyRoot, targetDir]
      },
      port: 5173,
      strictPort: false,
      open: true
    }
  })

  await server.listen()

  const urls = server.resolvedUrls
  console.log('🚀 Block Party is running!')

  if (urls?.local && urls.local.length > 0) {
    urls.local.forEach(url => {
      console.log(`   Local:   ${url}`)
    })
  }

  if (urls?.network && urls.network.length > 0) {
    urls.network.forEach(url => {
      console.log(`   Network: ${url}`)
    })
  }

  if (!urls?.local && !urls?.network) {
    console.log('   http://localhost:5173')
  }

  console.log()
}

function generateStorybookEntry(blocks: BlockInfo[]): string {
  const imports = blocks.map((block, idx) =>
    `import Block${idx}, { Props as Props${idx} } from '${block.path.replace(/\\/g, '/')}'`
  ).join('\n')

  const blockConfigs = blocks.map((block, idx) => `
  {
    name: '${block.name}',
    Component: Block${idx},
    propDefinitions: ${JSON.stringify(block.props)}
  }`).join(',')

  return `
import { StrictMode, useState, createElement } from 'react'
import { createRoot } from 'react-dom/client'

${imports}

const blocks = [${blockConfigs}
]

function App() {
  const [selectedBlock, setSelectedBlock] = useState(0)
  const [props, setProps] = useState<any>({})

  const currentBlock = blocks[selectedBlock]
  const CurrentComponent = currentBlock.Component
  const propDefinitions = currentBlock.propDefinitions

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'system-ui, sans-serif' }}>
      <aside style={{ width: '250px', borderRight: '1px solid #ddd', padding: '20px', overflow: 'auto' }}>
        <h2 style={{ marginTop: 0 }}>🎉 Block Party</h2>

        <h3 style={{ fontSize: '14px', textTransform: 'uppercase', color: '#666' }}>Blocks</h3>
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {blocks.map((block, idx) => (
            <li key={idx}>
              <button
                onClick={() => {
                  setSelectedBlock(idx)
                  setProps({})
                }}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  textAlign: 'left',
                  border: 'none',
                  background: selectedBlock === idx ? '#0066ff' : 'transparent',
                  color: selectedBlock === idx ? 'white' : 'black',
                  cursor: 'pointer',
                  borderRadius: '4px',
                  marginBottom: '4px'
                }}
              >
                {block.name}
              </button>
            </li>
          ))}
        </ul>

        <h3 style={{ fontSize: '14px', textTransform: 'uppercase', color: '#666', marginTop: '32px' }}>Props</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {propDefinitions.length > 0 ? propDefinitions.map(propDef => (
            <div key={propDef.name}>
              <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px', fontWeight: 500 }}>
                {propDef.name}{propDef.optional ? '' : ' *'}
                <span style={{ color: '#999', fontWeight: 'normal', marginLeft: '4px' }}>
                  {propDef.type}
                </span>
              </label>
              <input
                type="text"
                value={props[propDef.name] || ''}
                onChange={(e) => setProps({ ...props, [propDef.name]: e.target.value })}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '14px',
                  boxSizing: 'border-box'
                }}
                placeholder={\`Enter \${propDef.name}\`}
              />
            </div>
          )) : (
            <p style={{ fontSize: '12px', color: '#999' }}>No props defined</p>
          )}
        </div>
      </aside>

      <main style={{ flex: 1, padding: '40px', overflow: 'auto' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <CurrentComponent {...props} />
        </div>
      </main>
    </div>
  )
}

const root = createRoot(document.getElementById('root')!)
root.render(
  <StrictMode>
    <App />
  </StrictMode>
)
`
}

startStorybook().catch(error => {
  console.error('Failed to start Block Party:', error)
  process.exit(1)
})
