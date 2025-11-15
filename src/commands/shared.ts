import { discoverBlocks } from '../discoverBlocks.js'
import { generateBlocksModule } from '../generateBlocksModule.js'

export async function discoverBlocksAndGenerateModule(targetPath: string): Promise<string> {
  const blocks = await discoverBlocks(targetPath)

  if (blocks.length === 0) {
    console.error('❌ No Blocks found!')
    console.error('A Block should have an index.ts or index.tsx file with:')
    console.error('  - An exported Props interface')
    console.error('  - A default exported function component that accepts the Props')
    process.exit(1)
  }

  console.log(`✅ Found ${blocks.length} Block(s):`)
  blocks.forEach(block => {
    console.log(`   - ${block.name}`)
  })
  console.log()

  return await generateBlocksModule(blocks)
}
