import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { realpathSync } from 'fs'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { discoverBlocks, type BlockInfo } from '../discoverBlocks.js'

// Get the directory where this CLI script is located
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const blockPartyRoot = resolve(__dirname, '..', '..')

async function generateBlocksModule(blocks: BlockInfo[]): Promise<string> {
  // Generate block imports
  const imports = blocks.map((block, idx) =>
    `import Block${idx} from '${block.path.replace(/\\/g, '/')}'`
  ).join('\n')

  // Generate block configs
  const blockConfigs = blocks.map((block, idx) => `  {
    name: '${block.name}',
    Component: Block${idx},
    propDefinitions: ${JSON.stringify(block.props)},
    description: ${JSON.stringify(block.description)}
  }`).join(',\n')

  return `${imports}

export const blocks = [
${blockConfigs}
]
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

  // Generate initial blocks module
  let blocksModule = await generateBlocksModule(blocks)
  const templatesDir = resolve(__dirname, '..', 'templates')

  // Resolve target path through symlinks for comparison
  const realTargetPath = realpathSync(targetPath)

  // Start Vite dev server
  const server = await createServer({
    root: templatesDir,
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
          if (id === './blocks' || id === './blocks.ts') {
            return '\0virtual:blocks.ts'
          }
        },
        load(id) {
          if (id === '\0virtual:blocks.ts') {
            return blocksModule
          }
        },
        async handleHotUpdate({ file, server }) {
          // Check if the changed file is in the target directory (resolve through symlinks)
          if (file.startsWith(realTargetPath)) {
            console.log(`🔄 Block file changed: ${file}`)
            // Re-discover blocks to get updated prop definitions
            const updatedBlocks = await discoverBlocks(targetPath)
            blocksModule = await generateBlocksModule(updatedBlocks)

            // Invalidate the virtual module
            const module = server.moduleGraph.getModuleById('\0virtual:blocks.ts')
            if (module) {
              server.moduleGraph.invalidateModule(module)
            }

            // Trigger HMR for the blocks module
            server.ws.send({
              type: 'full-reload'
            })
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
