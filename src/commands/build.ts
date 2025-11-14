import { resolve } from 'path'
import { mkdir, writeFile, rm } from 'fs/promises'
import { build as viteBuild } from 'vite'
import { discoverBlocks } from '../discoverBlocks.js'
import { generateBlocksModule } from '../generateBlocksModule.js'
import { templatesDir, getViteResolveConfig, getVitePlugins } from '../viteConfig.js'

export async function buildBlocks(targetPath: string, outDir: string) {
  console.log('🏗️  Building Blocks...')
  console.log(`📂 Target: ${targetPath}`)
  console.log(`📦 Output: ${outDir}\n`)

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

  // Generate blocks module
  const blocksModule = await generateBlocksModule(blocks)

  // Create a temporary directory for the virtual blocks module
  const tempDir = resolve(process.cwd(), '.blockparty-build')
  await mkdir(tempDir, { recursive: true })
  const blocksPath = resolve(tempDir, 'blocks.ts')
  await writeFile(blocksPath, blocksModule)

  console.log('📝 Generating static bundle...')

  try {
    // Build with Vite
    const viteResolve = getViteResolveConfig()
    await viteBuild({
      root: templatesDir,
      base: './',
      resolve: {
        ...viteResolve,
        alias: {
          ...viteResolve.alias,
          './blocks': blocksPath,
          './blocks.ts': blocksPath
        }
      },
      plugins: getVitePlugins(),
      build: {
        outDir: resolve(process.cwd(), outDir),
        emptyOutDir: true,
        rollupOptions: {
          input: resolve(templatesDir, 'index.html')
        }
      }
    })

    console.log(`\n✅ Build complete! Output in ${outDir}/`)
  } catch (error) {
    console.error('\n❌ Build failed:', error)
    process.exit(1)
  } finally {
    // Clean up temporary directory
    await rm(tempDir, { recursive: true, force: true })
  }
}
