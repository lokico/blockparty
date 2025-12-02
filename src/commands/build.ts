import { resolve } from 'path'
import { mkdir, writeFile, rm, readFile } from 'fs/promises'
import { build as viteBuild } from 'vite'
import type { PackageJson } from 'type-fest'
import { templatesDir, getViteResolveConfig, getVitePlugins } from '../viteConfig.js'
import { discoverBlocksAndGenerateModule } from './shared.js'
import { discoverBlocks } from '../discoverBlocks.js'

export async function buildStorybook(targetPath: string, outDir: string) {
  console.log('🏗️  Building Storybook...')
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
        minify: true,
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

export async function buildBlocks(targetPath: string, outDir: string) {
  console.log('🏗️  Building Blocks...')
  console.log(`📂 Target: ${targetPath}`)
  console.log(`📦 Output: ${outDir}\n`)

  const blocks = await discoverBlocks(targetPath)

  if (blocks.length === 0) {
    console.error('❌ No Blocks found!')
    process.exit(1)
  }

  console.log(`✅ Found ${blocks.length} Block(s):`)
  blocks.forEach(block => {
    console.log(`   - ${block.name}`)
  })
  console.log()

  const outputDir = resolve(process.cwd(), outDir)
  await mkdir(outputDir, { recursive: true })

  const viteResolve = getViteResolveConfig()
  const externalDeps = Object.keys(viteResolve.alias) as (keyof typeof viteResolve.alias)[]

  const importMap: Record<string, string> = {}

  console.log('📦 Bundling external dependencies...\n')

  // Build each package
  for (const dep of externalDeps) {
    // Skip subpath imports
    if (dep.includes('/')) {
      continue
    }

    const depPath = viteResolve.alias[dep]
    const packageJsonPath = resolve(depPath, 'package.json')
    const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf-8')) as PackageJson
    const version = packageJson.version ?? 'latest'

    // Determine entry point
    const entryPoint = packageJson.module ?? packageJson.main ?? 'index.js'
    const entryPath = resolve(depPath, entryPoint)

    console.log(`   Bundling ${dep}...`)

    // Get the list of other external deps to keep external
    const otherExternalDeps = externalDeps.filter(d => d !== dep)

    // Get any subpath imports for this dep
    const subDepEntryPaths: string[] = []
    if (typeof packageJson.exports === 'object' && !Array.isArray(packageJson.exports)) {
      for (const d of externalDeps) {
        if (d.startsWith(`${dep}/`)) {
          const key = d.replace(`${dep}/`, './')
          const entry = packageJson.exports?.[key]
          if (typeof entry === 'string') {
            subDepEntryPaths.push(resolve(depPath, entry))
          }
        }
      }
    }

    try {
      await viteBuild({
        build: {
          lib: {
            entry: [entryPath, ...subDepEntryPaths],
            formats: ['es'],
            fileName: (_, entry) => `${(entry == 'index' ? dep : entry).replace('/', '-')}.js`
          },
          outDir: resolve(outputDir, 'deps'),
          minify: true,
          emptyOutDir: false,
          rollupOptions: {
            external: otherExternalDeps
          }
        }
      })

      // Add to import map
      const external = otherExternalDeps.filter(d => !d.includes('/')).sort().join(',')
      importMap[dep] = `https://esm.sh/${dep}@${version}?external=${external}`

      // Also include trailing slash version for packages that require it
      importMap[`${dep}/`] = `https://esm.sh/${dep}@${version}&external=${external}/`
    } catch (error) {
      console.error(`   ❌ Failed to bundle ${dep}:`, error)
      process.exit(1)
    }
  }

  console.log()

  console.log('📝 Bundling individual blocks...\n')

  // Build each block individually and collect block info
  const blockInfos = []
  for (const block of blocks) {
    const blockId = block.metadata?.id ?? block.name
    console.log(`   Building ${blockId} ${blockId !== block.name ? `(${block.name}) ` : ''}...`)

    // Sanitize block name for filename (replace spaces and special chars)
    const safeFileName = blockId.replace(/[^a-zA-Z0-9-_]/g, '-')

    try {
      const css: string[] = []
      const assets: string[] = []
      await viteBuild({
        build: {
          lib: {
            entry: block.path,
            formats: ['es'],
            fileName: () => 'index.js'
          },
          outDir: resolve(outputDir, safeFileName),
          minify: true,
          emptyOutDir: false,
          rollupOptions: {
            external: externalDeps,
            output: {
              assetFileNames: (assetInfo) => {
                const assetName = assetInfo.name
                if (assetName === undefined) {
                  // FIXME: What to do if assetName is undefined?
                  return 'asset'
                }
                const assetPath = `./${safeFileName}/${assetName}`
                if (assetName.endsWith('.css')) {
                  if (!css.includes(assetPath)) {
                    css.push(assetPath)
                  }
                } else if (!assets.includes(assetPath)) {
                  assets.push(assetPath)
                }
                return assetName
              }
            }
          }
        },
        plugins: getVitePlugins()
      })

      // Add block info with relative path to built file
      const blockInfo: any = {
        name: block.name,
        description: block.description,
        metadata: block.metadata,
        readme: block.readme,

        propDefinitions: block.propDefinitions,
        js: `./${safeFileName}/index.js`,
        css,
        assets
      }

      blockInfos.push(blockInfo)
    } catch (error) {
      console.error(`   ❌ Failed to build ${block.name}:`, error)
      process.exit(1)
    }
  }

  // Write index.json with blocks and import map
  await writeFile(
    resolve(outputDir, 'index.json'),
    JSON.stringify({
      blocks: blockInfos,
      importmap: importMap
    }, null, 2)
  )

  console.log(`\n✅ Build complete! Output in ${outDir}/`)
}
