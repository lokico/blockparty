import { test, describe } from 'node:test'
import assert from 'node:assert'
import { extractPropsFromSource, extractPropsFromFile } from './extractProps.js'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

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
    assert.deepStrictEqual(props[0], { name: 'name', type: { kind: 'primitive', syntax: 'string' }, optional: false })
    assert.deepStrictEqual(props[1], { name: 'age', type: { kind: 'primitive', syntax: 'number' }, optional: false })
    assert.deepStrictEqual(props[2], { name: 'optional', type: { kind: 'primitive', syntax: 'boolean' }, optional: true })
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
    assert.deepStrictEqual(props[0], { name: 'title', type: { kind: 'primitive', syntax: 'string' }, optional: false })
    assert.deepStrictEqual(props[1], { name: 'count', type: { kind: 'primitive', syntax: 'number' }, optional: true })
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
    assert.deepStrictEqual(props[0], { name: 'title', type: { kind: 'primitive', syntax: 'string' }, optional: false })
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
    assert.deepStrictEqual(props[0], { name: 'correct', type: { kind: 'primitive', syntax: 'number' }, optional: false })
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
    assert.strictEqual(props[0].type.syntax, 'string[]')
    assert.strictEqual(props[1].name, 'callback')
    assert.strictEqual(props[1].type.syntax, '(x: number) => void')
    assert.strictEqual(props[1].type.kind, 'function')
    if (props[1].type.kind === 'function') {
      assert.strictEqual(props[1].type.parameters[0].name, 'x')
      assert.strictEqual(props[1].type.parameters[0].type.syntax, 'number')
    }
    assert.strictEqual(props[2].name, 'config')
    assert.strictEqual(props[2].type.syntax, '{ key: string }')
    assert.strictEqual(props[2].type.kind, 'object')
    if (props[2].type.kind === 'object') {
      assert.strictEqual(props[2].type.properties[0].name, 'key')
      assert.strictEqual(props[2].type.properties[0].type.syntax, 'string')
    }
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
    assert.deepStrictEqual(props[0], { name: 'title', type: { kind: 'primitive', syntax: 'string' }, optional: false })
    assert.deepStrictEqual(props[1], { name: 'enabled', type: { kind: 'primitive', syntax: 'boolean' }, optional: true })
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
    assert.deepStrictEqual(props[0], { name: 'label', type: { kind: 'primitive', syntax: 'string' }, optional: false })
    assert.deepStrictEqual(props[1], { name: 'onClick', type: { kind: 'function', syntax: '() => void', parameters: [] }, optional: false })
    assert.deepStrictEqual(props[2], { name: 'disabled', type: { kind: 'primitive', syntax: 'boolean' }, optional: true })
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
    assert.strictEqual(props[1].type.kind, 'function')
    if (props[1].type.kind === 'function') {
      assert.strictEqual(props[1].type.parameters.length, 0)
    }
    assert.strictEqual(props[2].name, 'onHover')
    assert.strictEqual(props[2].description, 'Another function')
    assert.strictEqual(props[2].type.kind, 'function')
    if (props[2].type.kind === 'function') {
      assert.strictEqual(props[2].type.parameters[0].name, 'x')
      assert.strictEqual(props[2].type.parameters[0].type.syntax, 'number')
    }
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
    assert.strictEqual(props[0].type.kind, 'object')
    if (props[0].type.kind === 'object') {
      assert.strictEqual(props[0].type.properties.length, 2)
      assert.strictEqual(props[0].type.properties[0].name, 'apiKey')
      assert.strictEqual(props[0].type.properties[0].description, 'API key')
      assert.strictEqual(props[0].type.properties[1].name, 'timeout')
      assert.strictEqual(props[0].type.properties[1].description, 'Timeout in milliseconds')
    }
  })

  test('extracts inherited props when interface extends base interface', () => {
    const source = `
export interface BaseProps {
  /**
   * Base property: ID
   */
  id: string
  /**
   * Base property: Name
   */
  name: string
}

export interface Props extends BaseProps {
  /**
   * Extended property: Title
   */
  title: string
  /**
   * Extended property: Count
   */
  count?: number
}

export default ({ id, name, title }: Props) => <div>{title}</div>
`

    const props = extractPropsFromSource(source)

    assert.strictEqual(props.length, 4)
    assert.strictEqual(props[0].name, 'id')
    assert.strictEqual(props[0].type.syntax, 'string')
    assert.strictEqual(props[0].optional, false)
    assert.strictEqual(props[0].description, 'Base property: ID')
    assert.strictEqual(props[1].name, 'name')
    assert.strictEqual(props[1].type.syntax, 'string')
    assert.strictEqual(props[1].optional, false)
    assert.strictEqual(props[1].description, 'Base property: Name')
    assert.strictEqual(props[2].name, 'title')
    assert.strictEqual(props[2].type.syntax, 'string')
    assert.strictEqual(props[2].optional, false)
    assert.strictEqual(props[2].description, 'Extended property: Title')
    assert.strictEqual(props[3].name, 'count')
    assert.strictEqual(props[3].type.syntax, 'number')
    assert.strictEqual(props[3].optional, true)
    assert.strictEqual(props[3].description, 'Extended property: Count')
  })

  test('extracts inherited props when base interface is imported from another file', async () => {
    // Use source files since test fixtures aren't copied to dist
    const componentPath = join(__dirname, '..', 'src', '__test-fixtures__', 'Component.tsx')
    const props = await extractPropsFromFile(componentPath)

    assert.strictEqual(props.length, 4)
    assert.strictEqual(props[0].name, 'id')
    assert.strictEqual(props[0].type.syntax, 'string')
    assert.strictEqual(props[0].optional, false)
    assert.strictEqual(props[0].description, 'Base property: ID')
    assert.strictEqual(props[1].name, 'name')
    assert.strictEqual(props[1].type.syntax, 'string')
    assert.strictEqual(props[1].optional, false)
    assert.strictEqual(props[1].description, 'Base property: Name')
    assert.strictEqual(props[2].name, 'title')
    assert.strictEqual(props[2].type.syntax, 'string')
    assert.strictEqual(props[2].optional, false)
    assert.strictEqual(props[2].description, 'Extended property: Title')
    assert.strictEqual(props[3].name, 'count')
    assert.strictEqual(props[3].type.syntax, 'number')
    assert.strictEqual(props[3].optional, true)
    assert.strictEqual(props[3].description, 'Extended property: Count')
  })

  test('extracts constant literal types', () => {
    const source = `
export interface Props {
  status: 'active' | 'inactive'
  count: 42
  enabled: true
}

export default ({ status }: Props) => <div>{status}</div>
`

    const props = extractPropsFromSource(source)

    assert.strictEqual(props.length, 3)
    assert.strictEqual(props[0].name, 'status')
    assert.strictEqual(props[0].type.kind, 'union')
    if (props[0].type.kind === 'union') {
      assert.strictEqual(props[0].type.types.length, 2)
      assert.strictEqual(props[0].type.types[0].kind, 'constant')
      if (props[0].type.types[0].kind === 'constant') {
        assert.strictEqual(props[0].type.types[0].value, "'active'")
      }
      assert.strictEqual(props[0].type.types[1].kind, 'constant')
      if (props[0].type.types[1].kind === 'constant') {
        assert.strictEqual(props[0].type.types[1].value, "'inactive'")
      }
    }
    assert.strictEqual(props[1].name, 'count')
    assert.strictEqual(props[1].type.kind, 'constant')
    if (props[1].type.kind === 'constant') {
      assert.strictEqual(props[1].type.value, '42')
    }
    assert.strictEqual(props[2].name, 'enabled')
    assert.strictEqual(props[2].type.kind, 'constant')
    if (props[2].type.kind === 'constant') {
      assert.strictEqual(props[2].type.value, 'true')
    }
  })

  test('handles mixed union types', () => {
    const source = `
export interface Props {
  value: string | number | boolean
}

export default ({ value }: Props) => <div>{value}</div>
`

    const props = extractPropsFromSource(source)

    assert.strictEqual(props.length, 1)
    assert.strictEqual(props[0].name, 'value')
    assert.strictEqual(props[0].type.kind, 'union')
    assert.strictEqual(props[0].type.syntax, 'string | number | boolean')
    if (props[0].type.kind === 'union') {
      assert.strictEqual(props[0].type.types.length, 3)
      // First should be primitive string
      assert.strictEqual(props[0].type.types[0].kind, 'primitive')
      assert.strictEqual(props[0].type.types[0].syntax, 'string')
      // Second should be primitive number
      assert.strictEqual(props[0].type.types[1].kind, 'primitive')
      assert.strictEqual(props[0].type.types[1].syntax, 'number')
      // Third should be primitive boolean
      assert.strictEqual(props[0].type.types[2].kind, 'primitive')
      assert.strictEqual(props[0].type.types[2].syntax, 'boolean')
    }
  })

  test('extracts array types with element type', () => {
    const source = `
export interface Props {
  items: string[]
  numbers: number[]
  complexArray: { id: number; name: string }[]
}

export default ({ items }: Props) => <div>{items}</div>
`

    const props = extractPropsFromSource(source)

    assert.strictEqual(props.length, 3)

    // string[]
    assert.strictEqual(props[0].name, 'items')
    assert.strictEqual(props[0].type.kind, 'array')
    assert.strictEqual(props[0].type.syntax, 'string[]')
    if (props[0].type.kind === 'array') {
      assert.strictEqual(props[0].type.elementType.kind, 'primitive')
      assert.strictEqual(props[0].type.elementType.syntax, 'string')
    }

    // number[]
    assert.strictEqual(props[1].name, 'numbers')
    assert.strictEqual(props[1].type.kind, 'array')
    if (props[1].type.kind === 'array') {
      assert.strictEqual(props[1].type.elementType.kind, 'primitive')
      assert.strictEqual(props[1].type.elementType.syntax, 'number')
    }

    // complex array
    assert.strictEqual(props[2].name, 'complexArray')
    assert.strictEqual(props[2].type.kind, 'array')
    if (props[2].type.kind === 'array') {
      assert.strictEqual(props[2].type.elementType.kind, 'object')
      if (props[2].type.elementType.kind === 'object') {
        assert.strictEqual(props[2].type.elementType.properties.length, 2)
        assert.strictEqual(props[2].type.elementType.properties[0].name, 'id')
        assert.strictEqual(props[2].type.elementType.properties[1].name, 'name')
      }
    }
  })

  test('extracts tuple types', () => {
    const source = `
export interface Props {
  coordinate: [number, number]
  mixed: [string, number, boolean]
}

export default ({ coordinate }: Props) => <div>{coordinate}</div>
`

    const props = extractPropsFromSource(source)

    assert.strictEqual(props.length, 2)

    // [number, number]
    assert.strictEqual(props[0].name, 'coordinate')
    assert.strictEqual(props[0].type.kind, 'tuple')
    assert.strictEqual(props[0].type.syntax, '[number, number]')
    if (props[0].type.kind === 'tuple') {
      assert.strictEqual(props[0].type.types.length, 2)
      assert.strictEqual(props[0].type.types[0].kind, 'primitive')
      assert.strictEqual(props[0].type.types[0].syntax, 'number')
      assert.strictEqual(props[0].type.types[1].kind, 'primitive')
      assert.strictEqual(props[0].type.types[1].syntax, 'number')
    }

    // [string, number, boolean]
    assert.strictEqual(props[1].name, 'mixed')
    assert.strictEqual(props[1].type.kind, 'tuple')
    if (props[1].type.kind === 'tuple') {
      assert.strictEqual(props[1].type.types.length, 3)
      assert.strictEqual(props[1].type.types[0].syntax, 'string')
      assert.strictEqual(props[1].type.types[1].syntax, 'number')
      assert.strictEqual(props[1].type.types[2].syntax, 'boolean')
    }
  })
})
