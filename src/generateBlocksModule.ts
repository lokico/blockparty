import type { BlockInfo } from './discoverBlocks.js'
import type { RuntimeBlockInfo } from './templates/PropsEditor.js'

export async function generateBlocksModule(blocks: BlockInfo[]): Promise<string> {
  // Generate block imports
  const imports = blocks.map((block, idx) => {
    const path = block.path.replace(/\\/g, '/')
    return block.isDefaultExport
      ? `import Block${idx} from '${path}'`
      : `import { ${block.name} as Block${idx} } from '${path}'`
  }).join('\n')

  // Generate block configs
  const blockConfigs = blocks.map((block, idx) => {
    const blockInfo: RuntimeBlockInfo = {
      name: block.name,
      description: block.description,
      propDefinitions: block.propDefinitions,
      Component: null as any  // Placeholder
    }
    return JSON.stringify(blockInfo).replace('null', `Block${idx}`)
  }).join(',\n')

  return `${imports}

export const blocks = [
${blockConfigs}
]
`
}
