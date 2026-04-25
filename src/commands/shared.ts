import { discoverBlocks } from '../discoverBlocks.js'
import { generateBlocksModule } from '../generateBlocksModule.js'

export async function discoverBlocksAndGenerateModule(targetPath: string): Promise<string> {
  const blocks = await discoverBlocks(targetPath)

  if (blocks.length === 0) {
    console.error('❌ No Blocks found!')
    console.error('A Block is any exported function component in a .tsx file whose name starts with a capital letter and returns JSX.')
    console.error('Example:')
    console.error('  export function MyBlock({ title }: { title: string }) {')
    console.error('    return <div>{title}</div>')
    console.error('  }')
    process.exit(1)
  }

  console.log(`✅ Found ${blocks.length} Block(s):`)
  blocks.forEach(block => {
    console.log(`   - ${block.name}`)
  })
  console.log()

  return await generateBlocksModule(blocks)
}
