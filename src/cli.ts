#!/usr/bin/env node

import { existsSync } from 'fs'
import { readdir, stat } from 'fs/promises'
import { join, resolve } from 'path'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

interface BlockInfo {
  name: string
  path: string
}

async function discoverBlocks(baseDir: string): Promise<BlockInfo[]> {
  const blocks: BlockInfo[] = []

  // Check if current directory is a Block (has index.ts or index.tsx)
  const hasIndexTs = existsSync(join(baseDir, 'index.ts'))
  const hasIndexTsx = existsSync(join(baseDir, 'index.tsx'))

  if (hasIndexTs || hasIndexTsx) {
    // Current directory is a Block
    blocks.push({
      name: 'Block',
      path: baseDir
    })
    return blocks
  }

  // Check subdirectories for Blocks
  try {
    const entries = await readdir(baseDir, { withFileTypes: true })

    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        const dirPath = join(baseDir, entry.name)
        const hasIndex = existsSync(join(dirPath, 'index.ts')) || existsSync(join(dirPath, 'index.tsx'))

        if (hasIndex) {
          blocks.push({
            name: entry.name,
            path: dirPath
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
  const cwd = process.cwd()

  console.log('🎉 Starting Block Party...')
  console.log(`📂 Working directory: ${cwd}\n`)

  const blocks = await discoverBlocks(cwd)

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
    root: cwd,
    plugins: [
      react(),
      {
        name: 'blockparty-virtual',
        resolveId(id) {
          if (id === '/@blockparty/storybook') {
            return id
          }
        },
        load(id) {
          if (id === '/@blockparty/storybook') {
            return storybookEntry
          }
        }
      }
    ],
    server: {
      open: true
    }
  })

  await server.listen()

  console.log('🚀 Block Party is running!')
  console.log(`   Local: ${server.resolvedUrls?.local?.[0] || 'http://localhost:5173'}`)
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
    Props: {} as Props${idx}
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

  // Extract prop types from Props interface
  const propKeys = Object.keys(currentBlock.Props)

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
          {propKeys.length > 0 ? propKeys.map(key => (
            <div key={key}>
              <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px', fontWeight: 500 }}>
                {key}
              </label>
              <input
                type="text"
                value={props[key] || ''}
                onChange={(e) => setProps({ ...props, [key]: e.target.value })}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '14px',
                  boxSizing: 'border-box'
                }}
                placeholder={\`Enter \${key}\`}
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
