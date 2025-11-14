import type { BlockInfo } from './discoverBlocks.js'

export async function generateBlocksModule(blocks: BlockInfo[]): Promise<string> {
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
