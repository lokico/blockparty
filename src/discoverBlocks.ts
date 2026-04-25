import { readdir, stat } from 'fs/promises'
import { join, dirname, basename } from 'path'
import { extractReactComponentsFromFile, type PropDefinition } from './extractProps.js'
import { type BlockMetadata, parseReadmeMetadata } from './parseReadme.js'

export interface BlockInfo extends BlockMetadata {
  name: string
  isDefaultExport: boolean
  path: string
  propDefinitions: PropDefinition[]
}

async function buildBlockInfos(filePath: string, metadata: BlockMetadata): Promise<BlockInfo[]> {
  const components = await extractReactComponentsFromFile(filePath)
  return components.map(component => ({
    ...metadata,
    name: component.name,
    isDefaultExport: component.isDefaultExport,
    path: filePath,
    propDefinitions: component.propDefinitions,
  }))
}

export async function discoverBlocks(targetPath: string): Promise<BlockInfo[]> {
  const targetStat = await stat(targetPath)

  if (targetStat.isFile()) {
    if (!targetPath.endsWith('.tsx')) return []
    const isIndex = basename(targetPath) === 'index.tsx'
    const metadata = isIndex ? await parseReadmeMetadata(dirname(targetPath)) : {}
    return buildBlockInfos(targetPath, metadata)
  }

  const blocks: BlockInfo[] = []
  await discoverBlocksRecursive(targetPath, blocks)
  return blocks
}

async function discoverBlocksRecursive(dirPath: string, blocks: BlockInfo[]): Promise<void> {
  try {
    const entries = await readdir(dirPath, { withFileTypes: true })

    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.tsx')) {
        const filePath = join(dirPath, entry.name)
        const metadata = entry.name === 'index.tsx' ? (await parseReadmeMetadata(dirPath)) : {}
        blocks.push(...await buildBlockInfos(filePath, metadata))
      }

      else if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        const entryPath = join(dirPath, entry.name)
        await discoverBlocksRecursive(entryPath, blocks)
      }
    }
  } catch (error) {
    console.error('Error reading directory:', error)
  }
}
