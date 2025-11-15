import { realpathSync } from 'fs'
import { createServer } from 'vite'
import { discoverBlocks } from '../discoverBlocks.js'
import { generateBlocksModule } from '../generateBlocksModule.js'
import { blockPartyRoot, templatesDir, getViteResolveConfig, getVitePlugins } from '../viteConfig.js'
import { discoverBlocksAndGenerateModule } from './shared.js'

export async function startStorybookServer(targetPath: string) {
  console.log('🎉 Starting Block Party...')
  console.log(`📂 Target path: ${targetPath}\n`)

  let blocksModule = await discoverBlocksAndGenerateModule(targetPath)

  // Resolve target path through symlinks for comparison
  const realTargetPath = realpathSync(targetPath)

  // Start Vite dev server
  const server = await createServer({
    root: templatesDir,
    resolve: getViteResolveConfig(),
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
      ...getVitePlugins()
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
