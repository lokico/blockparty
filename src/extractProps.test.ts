import { test, describe } from 'node:test'
import assert from 'node:assert'
import { extractPropsFromSource } from './extractProps.js'

describe('extractPropsFromSource', () => {
  test('extracts props from interface named Props', () => {
    const source = `
export interface Props {
  name: string
  age: number
  optional?: boolean
}

export default ({ name, age }: Props) => <div>{name}</div>
`

    const props = extractPropsFromSource(source)

    assert.strictEqual(props.length, 3)
    assert.deepStrictEqual(props[0], { name: 'name', type: 'string', optional: false })
    assert.deepStrictEqual(props[1], { name: 'age', type: 'number', optional: false })
    assert.deepStrictEqual(props[2], { name: 'optional', type: 'boolean', optional: true })
  })

  test('extracts props from only exported type', () => {
    const source = `
export type MyProps = {
  title: string
  count?: number
}

export default ({ title }: MyProps) => <div>{title}</div>
`

    const props = extractPropsFromSource(source)

    assert.strictEqual(props.length, 2)
    assert.deepStrictEqual(props[0], { name: 'title', type: 'string', optional: false })
    assert.deepStrictEqual(props[1], { name: 'count', type: 'number', optional: true })
  })

  test('returns empty array when no Props interface found', () => {
    const source = `
export default () => <div>No props</div>
`

    const props = extractPropsFromSource(source)

    assert.strictEqual(props.length, 0)
  })

  test('returns empty array when multiple types exported but no Props', () => {
    const source = `
export interface Foo {
  x: string
}

export interface Bar {
  y: number
}

export default () => <div>Multiple types</div>
`

    const props = extractPropsFromSource(source)

    assert.strictEqual(props.length, 0)
  })

  test('prefers Props interface over other exported types', () => {
    const source = `
export interface OtherType {
  wrong: string
}

export interface Props {
  correct: number
}

export default ({ correct }: Props) => <div>{correct}</div>
`

    const props = extractPropsFromSource(source)

    assert.strictEqual(props.length, 1)
    assert.deepStrictEqual(props[0], { name: 'correct', type: 'number', optional: false })
  })

  test('handles complex types', () => {
    const source = `
export interface Props {
  items: string[]
  callback: (x: number) => void
  config: { key: string }
}

export default (props: Props) => <div>Complex</div>
`

    const props = extractPropsFromSource(source)

    assert.strictEqual(props.length, 3)
    assert.strictEqual(props[0].name, 'items')
    assert.strictEqual(props[0].type, 'string[]')
    assert.strictEqual(props[1].name, 'callback')
    assert.strictEqual(props[1].type, '(x: number) => void')
    assert.strictEqual(props[2].name, 'config')
    assert.strictEqual(props[2].type, '{ key: string }')
  })
})
