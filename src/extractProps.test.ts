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

  test('extracts props from default export', () => {
    const source = `
export type MyProps = {
  title: string
}

export type NotProps = {
  foo: string
}

export default ({ title }: MyProps) => <div>{title}</div>
export const Foo = ({ foo }: NotProps) => <div>{foo}</div>
`

    const props = extractPropsFromSource(source)

    assert.strictEqual(props.length, 1)
    assert.deepStrictEqual(props[0], { name: 'title', type: 'string', optional: false })
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
    assert.strictEqual(props[1].parameters?.[0].name, 'x')
    assert.strictEqual(props[1].parameters?.[0].type, 'number')
    assert.strictEqual(props[2].name, 'config')
    assert.strictEqual(props[2].type, '{ key: string }')
    assert.strictEqual(props[2].properties?.[0].name, 'key')
    assert.strictEqual(props[2].properties?.[0].type, 'string')
  })

  test('extracts props from default export parameter type (multiple types exported)', () => {
    const source = `
export interface UserData {
  id: number
  name: string
}

export interface ComponentProps {
  title: string
  enabled?: boolean
}

export default ({ title, enabled }: ComponentProps) => <div>{title}</div>
`

    const props = extractPropsFromSource(source)

    assert.strictEqual(props.length, 2)
    assert.deepStrictEqual(props[0], { name: 'title', type: 'string', optional: false })
    assert.deepStrictEqual(props[1], { name: 'enabled', type: 'boolean', optional: true })
  })

  test('extracts props from export default function syntax', () => {
    const source = `
export interface ButtonProps {
  label: string
  onClick: () => void
  disabled?: boolean
}

export default function Button({ label, onClick, disabled }: ButtonProps) {
  return <button onClick={onClick} disabled={disabled}>{label}</button>
}
`

    const props = extractPropsFromSource(source)

    assert.strictEqual(props.length, 3)
    assert.deepStrictEqual(props[0], { name: 'label', type: 'string', optional: false })
    assert.deepStrictEqual(props[1], { name: 'onClick', type: '() => void', parameters: [], optional: false })
    assert.deepStrictEqual(props[2], { name: 'disabled', type: 'boolean', optional: true })
  })

  test('extracts JSDoc comments from interface props', () => {
    const source = `
export interface Props {
  /**
   * The user's name
   */
  name: string
  /**
   * The user's age in years
   */
  age: number
  /** Optional flag */
  optional?: boolean
}

export default ({ name, age }: Props) => <div>{name}</div>
`

    const props = extractPropsFromSource(source)

    assert.strictEqual(props.length, 3)
    assert.strictEqual(props[0].name, 'name')
    assert.strictEqual(props[0].description, "The user's name")
    assert.strictEqual(props[1].name, 'age')
    assert.strictEqual(props[1].description, "The user's age in years")
    assert.strictEqual(props[2].name, 'optional')
    assert.strictEqual(props[2].description, 'Optional flag')
  })

  test('extracts JSDoc comments from type alias props', () => {
    const source = `
export type Props = {
  /**
   * The title to display
   */
  title: string
  /** Number of items */
  count?: number
}

export default ({ title }: Props) => <div>{title}</div>
`

    const props = extractPropsFromSource(source)

    assert.strictEqual(props.length, 2)
    assert.strictEqual(props[0].name, 'title')
    assert.strictEqual(props[0].description, 'The title to display')
    assert.strictEqual(props[1].name, 'count')
    assert.strictEqual(props[1].description, 'Number of items')
  })

  test('ignores non-JSDoc comments', () => {
    const source = `
export interface Props {
  // This is a regular comment
  name: string
  /* This is a block comment */
  age: number
  /**
   * This is a JSDoc comment
   */
  optional?: boolean
}

export default ({ name, age }: Props) => <div>{name}</div>
`

    const props = extractPropsFromSource(source)

    assert.strictEqual(props.length, 3)
    assert.strictEqual(props[0].description, undefined)
    assert.strictEqual(props[1].description, undefined)
    assert.strictEqual(props[2].description, 'This is a JSDoc comment')
  })

  test('extracts last JSDoc comment when multiple exist', () => {
    const source = `
export interface Props {
  /**
   * First comment
   */
  /* Regular block comment */
  /**
   * Second comment (should be used)
   */
  name: string
}

export default ({ name }: Props) => <div>{name}</div>
`

    const props = extractPropsFromSource(source)

    assert.strictEqual(props.length, 1)
    assert.strictEqual(props[0].description, 'Second comment (should be used)')
  })

  test('handles props without JSDoc comments', () => {
    const source = `
export interface Props {
  /**
   * Has a comment
   */
  commented: string
  notCommented: number
}

export default ({ commented }: Props) => <div>{commented}</div>
`

    const props = extractPropsFromSource(source)

    assert.strictEqual(props.length, 2)
    assert.strictEqual(props[0].description, 'Has a comment')
    assert.strictEqual(props[1].description, undefined)
  })

  test('does not filter out function-typed props', () => {
    const source = `
export interface Props {
  /**
   * A regular string prop
   */
  name: string
  /**
   * A function prop
   */
  onClick: () => void
  /**
   * Another function
   */
  onHover: (x: number) => void
}

export default ({ name }: Props) => <div>{name}</div>
`

    const props = extractPropsFromSource(source)

    assert.strictEqual(props.length, 3)
    assert.strictEqual(props[0].name, 'name')
    assert.strictEqual(props[0].description, 'A regular string prop')
    assert.strictEqual(props[1].name, 'onClick')
    assert.strictEqual(props[1].description, 'A function prop')
    assert.strictEqual(props[1].parameters?.length, 0)
    assert.strictEqual(props[2].name, 'onHover')
    assert.strictEqual(props[2].description, 'Another function')
    assert.strictEqual(props[2].parameters?.[0].name, 'x')
    assert.strictEqual(props[2].parameters?.[0].type, 'number')
  })

  test('extracts nested properties with descriptions', () => {
    const source = `
export interface Config {
  /**
   * API key
   */
  apiKey: string
  /**
   * Timeout in milliseconds
   */
  timeout: number
}

export interface Props {
  /**
   * Configuration object
   */
  config: Config
}

export default ({ config }: Props) => <div>{config.apiKey}</div>
`

    const props = extractPropsFromSource(source)

    assert.strictEqual(props.length, 1)
    assert.strictEqual(props[0].name, 'config')
    assert.strictEqual(props[0].description, 'Configuration object')
    assert.strictEqual(props[0].properties?.length, 2)
    assert.strictEqual(props[0].properties?.[0].name, 'apiKey')
    assert.strictEqual(props[0].properties?.[0].description, 'API key')
    assert.strictEqual(props[0].properties?.[1].name, 'timeout')
    assert.strictEqual(props[0].properties?.[1].description, 'Timeout in milliseconds')
  })
})
