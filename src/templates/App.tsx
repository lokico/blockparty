import { useState, useEffect } from 'react'
import { ErrorBoundary } from './ErrorBoundary'
import { PropsEditor } from './PropsEditor'
import { blocks } from './blocks'

interface PropDefinition {
  name: string
  type: string
  optional: boolean
}

const STORAGE_KEY = 'blockparty-state'

const isComplexType = (type: string) => {
  return type.includes('[') || type.includes('{') || type.includes('|')
}

const getDefaultValue = (type: string, optional: boolean) => {
  if (optional) return ''

  if (type.includes('[]')) {
    return '[]'
  }

  if (type.includes('{') || type.includes('object')) {
    return '{}'
  }

  if (type === 'number') {
    return '0'
  }

  if (type === 'boolean') {
    return 'false'
  }

  return ''
}

const parseValue = (value: string, type: string) => {
  if (!value) return value

  // For complex types, try to parse as JSON
  if (isComplexType(type)) {
    try {
      return JSON.parse(value)
    } catch {
      return value
    }
  }

  // For simple number type, parse as number
  if (type === 'number') {
    const num = Number(value)
    return isNaN(num) ? value : num
  }

  // For boolean type
  if (type === 'boolean') {
    return value === 'true'
  }

  return value
}

const formatValue = (value: any, type: string) => {
  if (value === undefined || value === null) return ''
  if (isComplexType(type)) {
    try {
      return JSON.stringify(value, null, 2)
    } catch {
      return String(value)
    }
  }
  return String(value)
}

export function App() {
  const [selectedBlock, setSelectedBlock] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      return saved ? JSON.parse(saved).selectedBlock ?? 0 : 0
    } catch {
      return 0
    }
  })

  const [props, setProps] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      return saved ? JSON.parse(saved).props ?? {} : {}
    } catch {
      return {}
    }
  })

  const currentBlock = blocks[selectedBlock]
  const CurrentComponent = currentBlock.Component
  const propDefinitions: PropDefinition[] = currentBlock.propDefinitions

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ selectedBlock, props }))
    } catch (e) {
      console.error('Failed to save state:', e)
    }
  }, [selectedBlock, props])

  // Initialize props with defaults when block changes or prop definitions change
  useEffect(() => {
    const validPropNames = new Set(propDefinitions.map(p => p.name))

    // Remove props that no longer exist in the prop definitions
    const filteredProps = Object.fromEntries(
      Object.entries(props).filter(([key]) => validPropNames.has(key))
    )

    // Add default values for required props that don't have values
    const defaultProps = propDefinitions.reduce((acc: Record<string, string>, propDef) => {
      if (!propDef.optional && !filteredProps[propDef.name]) {
        acc[propDef.name] = getDefaultValue(propDef.type, propDef.optional)
      }
      return acc
    }, {})

    const newProps = { ...filteredProps, ...defaultProps }

    // Only update if props actually changed
    if (JSON.stringify(props) !== JSON.stringify(newProps)) {
      setProps(newProps)
    }
  }, [selectedBlock, propDefinitions])

  const parsedProps = Object.fromEntries(
    Object.entries(props).map(([key, value]) => {
      const propDef = propDefinitions.find((p: PropDefinition) => p.name === key)
      return [key, propDef ? parseValue(value as string, propDef.type) : value]
    })
  )

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'system-ui, sans-serif' }}>
      <aside style={{ width: '250px', borderRight: '1px solid #ddd', padding: '20px', overflow: 'auto' }}>
        <h2 style={{ marginTop: 0 }}>🎉 Block Party</h2>

        <h3 style={{ fontSize: '14px', textTransform: 'uppercase', color: '#666' }}>Blocks</h3>
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {blocks.map((block, idx) => (
            <li key={idx}>
              <button
                onClick={() => {
                  setSelectedBlock(idx)
                  setProps({})
                }}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  textAlign: 'left',
                  border: 'none',
                  background: selectedBlock === idx ? '#0066ff' : 'transparent',
                  color: selectedBlock === idx ? 'white' : 'black',
                  cursor: 'pointer',
                  borderRadius: '4px',
                  marginBottom: '4px'
                }}
              >
                {block.name}
              </button>
            </li>
          ))}
        </ul>

        {currentBlock.description && (
          <div style={{ marginTop: '24px', padding: '12px', background: '#f5f5f5', borderRadius: '4px' }}>
            <p style={{ fontSize: '12px', color: '#666', margin: 0, lineHeight: '1.5' }}>
              {currentBlock.description}
            </p>
          </div>
        )}

        <h3 style={{ fontSize: '14px', textTransform: 'uppercase', color: '#666', marginTop: '32px' }}>Props</h3>
        <PropsEditor
          propDefinitions={propDefinitions}
          props={props}
          onPropsChange={setProps}
        />
      </aside>

      <main style={{ flex: 1, padding: '40px', overflow: 'auto' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <ErrorBoundary key={`${selectedBlock}-${JSON.stringify(props)}`}>
            <CurrentComponent {...parsedProps} />
          </ErrorBoundary>
        </div>
      </main>
    </div>
  )
}
