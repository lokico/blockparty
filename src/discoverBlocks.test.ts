import { test, describe, after } from 'node:test'
import assert from 'node:assert'
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { discoverBlocks } from './discoverBlocks.js'

const tempDirs: string[] = []

async function makeFixture(structure: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'bp-discover-test-'))
  tempDirs.push(dir)
  for (const [relPath, content] of Object.entries(structure)) {
    const fullPath = join(dir, relPath)
    await mkdir(dirname(fullPath), { recursive: true })
    await writeFile(fullPath, content)
  }
  return dir
}

after(async () => {
  await Promise.all(tempDirs.map(d => rm(d, { recursive: true, force: true })))
})

describe('discoverBlocks', () => {
  test('finds block in named export .tsx file', async () => {
    const dir = await makeFixture({
      'Button.tsx': `export function Button({ label }: { label: string }): JSX.Element { return <div>{label}</div> }`
    })
    const blocks = await discoverBlocks(dir)
    assert.strictEqual(blocks.length, 1)
    assert.strictEqual(blocks[0].name, 'Button')
    assert.strictEqual(blocks[0].isDefaultExport, false)
    assert.strictEqual(blocks[0].propDefinitions.length, 1)
    assert.strictEqual(blocks[0].propDefinitions[0].name, 'label')
  })

  test('finds block in default export .tsx file', async () => {
    const dir = await makeFixture({
      'Widget.tsx': `export default function Widget({ id }: { id: number }): JSX.Element { return <div/> }`
    })
    const blocks = await discoverBlocks(dir)
    assert.strictEqual(blocks.length, 1)
    assert.strictEqual(blocks[0].name, 'Widget')
    assert.strictEqual(blocks[0].isDefaultExport, true)
  })

  test('finds multiple blocks exported from a single file', async () => {
    const dir = await makeFixture({
      'UI.tsx': `
export function Button(): JSX.Element { return <button/> }
export function Input(): JSX.Element { return <input/> }
`
    })
    const blocks = await discoverBlocks(dir)
    assert.strictEqual(blocks.length, 2)
    assert.deepStrictEqual(blocks.map(b => b.name).sort(), ['Button', 'Input'])
  })

  test('finds blocks across multiple .tsx files in one directory', async () => {
    const dir = await makeFixture({
      'Button.tsx': `export function Button(): JSX.Element { return <button/> }`,
      'Card.tsx': `export function Card(): JSX.Element { return <div/> }`,
    })
    const blocks = await discoverBlocks(dir)
    assert.strictEqual(blocks.length, 2)
    assert.ok(blocks.some(b => b.name === 'Button'))
    assert.ok(blocks.some(b => b.name === 'Card'))
  })

  test('attaches readme metadata to index.tsx blocks only', async () => {
    const dir = await makeFixture({
      'index.tsx': `export function IndexBlock(): JSX.Element { return <div/> }`,
      'Other.tsx': `export function OtherBlock(): JSX.Element { return <div/> }`,
      'README.md': `# My Library\n\nA collection of components.`,
    })
    const blocks = await discoverBlocks(dir)
    assert.strictEqual(blocks.length, 2)
    const indexBlock = blocks.find(b => b.name === 'IndexBlock')!
    const otherBlock = blocks.find(b => b.name === 'OtherBlock')!
    assert.strictEqual(indexBlock.description, 'A collection of components.')
    assert.strictEqual(otherBlock.description, undefined)
  })

  test('recurses into subdirectories when parent directory has no blocks', async () => {
    const dir = await makeFixture({
      'widgets/Button.tsx': `export function Button(): JSX.Element { return <button/> }`,
    })
    const blocks = await discoverBlocks(dir)
    assert.strictEqual(blocks.length, 1)
    assert.strictEqual(blocks[0].name, 'Button')
  })

  test('accepts a direct .tsx file path', async () => {
    const dir = await makeFixture({
      'Card.tsx': `export function Card({ title }: { title: string }): JSX.Element { return <div/> }`,
    })
    const blocks = await discoverBlocks(join(dir, 'Card.tsx'))
    assert.strictEqual(blocks.length, 1)
    assert.strictEqual(blocks[0].name, 'Card')
    assert.strictEqual(blocks[0].isDefaultExport, false)
  })

  test('ignores .ts files', async () => {
    const dir = await makeFixture({
      'helper.ts': `export function Helper(): JSX.Element { return null as any }`,
    })
    const blocks = await discoverBlocks(dir)
    assert.strictEqual(blocks.length, 0)
  })

  test('ignores exports whose names start with a lowercase letter', async () => {
    const dir = await makeFixture({
      'utils.tsx': `export function helper(): JSX.Element { return <div/> }`,
    })
    const blocks = await discoverBlocks(dir)
    assert.strictEqual(blocks.length, 0)
  })

  test('ignores exported functions that do not return JSX', async () => {
    const dir = await makeFixture({
      'utils.tsx': `export function Helper(): string { return 'hello' }`,
    })
    const blocks = await discoverBlocks(dir)
    assert.strictEqual(blocks.length, 0)
  })
})
