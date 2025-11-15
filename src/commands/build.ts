import { resolve } from 'path'
import { mkdir, writeFile, rm } from 'fs/promises'
import { build as viteBuild } from 'vite'
import { templatesDir, getViteResolveConfig, getVitePlugins } from '../viteConfig.js'
import { discoverBlocksAndGenerateModule } from './shared.js'

export async function buildStorybook(targetPath: string, outDir: string) {
  console.log('🏗️  Building Blocks...')
  console.log(`📂 Target: ${targetPath}`)
  console.log(`📦 Output: ${outDir}\n`)

  const blocksModule = await discoverBlocksAndGenerateModule(targetPath)

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
