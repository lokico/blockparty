import { existsSync } from 'fs'
import { readdir, stat } from 'fs/promises'
import { join, dirname, basename } from 'path'
import { extractPropsFromFile, type PropDefinition } from './extractProps.js'
import { parseReadmeMetadata } from './parseReadme.js'

export interface BlockInfo {
  name: string
  path: string
  props: PropDefinition[]
  description?: string
}

async function getBlockInfo(blockDir: string, indexPath?: string): Promise<BlockInfo | undefined> {
  if (!indexPath) {
    const indexTsPath = join(blockDir, 'index.ts')
    const indexTsxPath = join(blockDir, 'index.tsx')
    if (existsSync(indexTsxPath)) {
      indexPath = indexTsxPath
    } else if (existsSync(indexTsPath)) {
      indexPath = indexTsPath
    } else {
      return undefined
    }
  }
  const props = await extractPropsFromFile(indexPath)
  const blockName = basename(blockDir)
  const metadata = await parseReadmeMetadata(blockDir)

  return {
    name: metadata.name ?? blockName,
    path: indexPath,
    props,
    description: metadata.description
  }
}

export async function discoverBlocks(targetPath: string): Promise<BlockInfo[]> {
  const blocks: BlockInfo[] = []

  const targetStat = await stat(targetPath)
  const blockDir = targetStat.isFile() ? dirname(targetPath) : targetPath
  const indexPath = targetStat.isFile() ? targetPath : undefined

  const blockInfo = await getBlockInfo(blockDir, indexPath)
  if (blockInfo) {
    blocks.push(blockInfo)
    return blocks
  }

  // Check subdirectories for Blocks
  try {
    const entries = await readdir(targetPath, { withFileTypes: true })

    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        const dirPath = join(targetPath, entry.name)
        const blockInfo = await getBlockInfo(dirPath)

        if (blockInfo) {
          blocks.push(blockInfo)
        }
      }
    }
  } catch (error) {
    console.error('Error reading directory:', error)
  }

  return blocks
}
