import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { discoverBlocks, type BlockInfo } from '../discoverBlocks.js'

// Get the directory where this CLI script is located
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const blockPartyRoot = resolve(__dirname, '..', '..')

function generateStorybookEntry(blocks: BlockInfo[]): string {
  const imports = blocks.map((block, idx) =>
    `import Block${idx}, { Props as Props${idx} } from '${block.path.replace(/\\/g, '/')}'`
  ).join('\n')

  const blockConfigs = blocks.map((block, idx) => `
  {
    name: '${block.name}',
    Component: Block${idx},
    propDefinitions: ${JSON.stringify(block.props)},
    description: ${JSON.stringify(block.description)}
  }`).join(',')

  return `
import { StrictMode, useState, useEffect, createElement } from 'react'
import { createRoot } from 'react-dom/client'

${imports}

const blocks = [${blockConfigs}
]

const STORAGE_KEY = 'blockparty-state'

function App() {
  const [selectedBlock, setSelectedBlock] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      return saved ? JSON.parse(saved).selectedBlock ?? 0 : 0
    } catch {
      return 0
    }
  })

  const [props, setProps] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      return saved ? JSON.parse(saved).props ?? {} : {}
    } catch {
      return {}
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ selectedBlock, props }))
    } catch (e) {
      console.error('Failed to save state:', e)
    }
  }, [selectedBlock, props])

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

        {currentBlock.description && (
          <div style={{ marginTop: '24px', padding: '12px', background: '#f5f5f5', borderRadius: '4px' }}>
            <p style={{ fontSize: '12px', color: '#666', margin: 0, lineHeight: '1.5' }}>
              {currentBlock.description}
            </p>
          </div>
        )}

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

export async function startStorybook(targetPath: string) {
  console.log('🎉 Starting Block Party...')
  console.log(`📂 Target path: ${targetPath}\n`)

  const blocks = await discoverBlocks(targetPath)

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
    root: resolve(__dirname, '..'),
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
        allow: [blockPartyRoot, targetPath]
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
