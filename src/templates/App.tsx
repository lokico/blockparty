import { useState, useEffect } from 'react'
import { ErrorBoundary } from './ErrorBoundary'
import { PropsEditor } from './PropsEditor'
import { blocks } from './blocks'
import type { PropDefinition, PropType } from '../extractProps.js'

const STORAGE_KEY = 'blockparty-state'

const isComplexType = (propType: PropType) => {
  return propType.kind === 'object' || propType.kind === 'union' || propType.kind === 'array' || propType.kind === 'tuple'
}

const getDefaultValue = (propType: PropType, optional: boolean): string => {
  if (optional) return ''

  if (propType.kind === 'array') {
    return '[]'
  }

  if (propType.kind === 'tuple') {
    // Return an array with default values for each tuple element
    const defaults = propType.types.map(t => {
      const defaultVal = getDefaultValue(t, false)
      return JSON.parse(defaultVal)
    })
    return JSON.stringify(defaults)
  }

  if (propType.kind === 'object' || propType.syntax.includes('object')) {
    return '{}'
  }

  if (propType.syntax === 'number') {
    return '0'
  }

  if (propType.syntax === 'boolean') {
    return 'false'
  }

  if (propType.syntax === 'Date') {
    return new Date().toISOString().slice(0, 16) // Format for datetime-local input
  }

  return ''
}

const parseValue = (value: string, propType: PropType, propDefs: PropDefinition[], propDef?: PropDefinition) => {
  // For function types, create a function from the body string (even if empty)
  if (propType.kind === 'function') {
    if (!value) {
      // Return empty function for empty value
      return () => {}
    }
    try {
      // Extract parameter names
      const paramNames = propType.parameters.map(p => p.name).join(', ')
      // Create function from the body string
      // eslint-disable-next-line no-new-func
      const fn = new Function(paramNames, `return ${value}`)
      console.log('Created function for', propDef?.name, 'with body:', value, 'result:', fn)
      return fn
    } catch (error) {
      console.error('Failed to create function:', error)
      return () => {}
    }
  }

  // After handling functions, check for empty values
  if (!value) return value

  // For React.ReactNode, parse and render the block(s) - always an array
  if (propType.syntax === 'React.ReactNode' || propType.syntax === 'ReactNode') {
    try {
      const parsed = typeof value === 'string' ? JSON.parse(value) : value

      if (Array.isArray(parsed)) {
        return parsed.map((item, index) => {
          if (item && typeof item === 'object' && '__block' in item) {
            const blockName = item.__block
            const blockProps = item.__props || {}
            const block = blocks.find(b => b.name === blockName)

            if (block) {
              const parsedBlockProps = Object.fromEntries(
                Object.entries(blockProps).map(([key, val]) => {
                  const propDef = block.propDefinitions.find((p: PropDefinition) => p.name === key)
                  return [key, propDef ? parseValue(val as string, propDef.type, block.propDefinitions, propDef) : val]
                })
              )
              return <block.Component key={index} {...parsedBlockProps} />
            }
          }
          return null
        }).filter(Boolean)
      }
    } catch {
      // Fall through
    }
  }

  // For complex types, try to parse as JSON
  if (isComplexType(propType)) {
    let parsed: any

    // Handle both string JSON and already-parsed objects
    if (typeof value === 'string') {
      try {
        parsed = JSON.parse(value)
      } catch {
        return value
      }
    } else {
      parsed = value
    }

    // Handle arrays - recursively parse each element
    if (propType.kind === 'array' && Array.isArray(parsed)) {
      return parsed.map(item => parseValue(item, propType.elementType, propDefs))
    }

    // Handle tuples - recursively parse each element with its corresponding type
    if (propType.kind === 'tuple' && Array.isArray(parsed)) {
      return parsed.map((item, index) => {
        const elementType = propType.types[index]
        if (elementType) {
          return parseValue(item, elementType, propDefs)
        }
        return item
      })
    }

    // If we have property definitions and the parsed value is an object,
    // recursively parse nested properties (including function types)
    if (propType.kind === 'object' && parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const result: Record<string, any> = {}
      for (const [key, val] of Object.entries(parsed)) {
        const nestedPropDef = propType.properties.find(p => p.name === key)
        if (nestedPropDef) {
          result[key] = parseValue(val as string, nestedPropDef.type, propDefs, nestedPropDef)
        } else {
          result[key] = val
        }
      }
      return result
    }

    return parsed
  }

  // For simple number type, parse as number
  if (propType.syntax === 'number') {
    const num = Number(value)
    return isNaN(num) ? value : num
  }

  // For boolean type
  if (propType.syntax === 'boolean') {
    return value === 'true'
  }

  // For Date type
  if (propType.syntax === 'Date') {
    return value ? new Date(value) : value
  }

  return value
}

const formatValue = (value: any, propType: PropType) => {
  if (value === undefined || value === null) return ''
  if (isComplexType(propType)) {
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
      return [key, propDef ? parseValue(value as string, propDef.type, propDefinitions, propDef) : value]
    })
  )

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'system-ui, sans-serif' }}>
      {/* Left sidebar - block list */}
      <aside style={{ width: '200px', borderRight: '1px solid #ddd', padding: '20px', overflow: 'auto' }}>
        <h2 style={{ marginTop: 0, fontSize: '18px' }}>🎉 Block Party</h2>

        <h3 style={{ fontSize: '14px', textTransform: 'uppercase', color: '#666', marginTop: '24px' }}>Blocks</h3>
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
      </aside>

      {/* Center - component preview */}
      <main style={{ flex: 1, padding: '40px', overflow: 'auto' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <ErrorBoundary key={`${selectedBlock}-${JSON.stringify(props)}`}>
            <CurrentComponent {...parsedProps} />
          </ErrorBoundary>
        </div>
      </main>

      {/* Right sidebar - description and props */}
      <aside style={{ width: '320px', borderLeft: '1px solid #ddd', padding: '20px', overflow: 'auto', background: '#fafafa' }}>
        <h3 style={{ marginTop: 0, fontSize: '16px' }}>{currentBlock.name}</h3>

        {currentBlock.description && (
          <div style={{ marginBottom: '24px', padding: '12px', background: '#fff', borderRadius: '4px', border: '1px solid #e0e0e0' }}>
            <p style={{ fontSize: '12px', color: '#666', margin: 0, lineHeight: '1.5' }}>
              {currentBlock.description}
            </p>
          </div>
        )}

        <h4 style={{ fontSize: '14px', textTransform: 'uppercase', color: '#666', marginBottom: '12px' }}>Props</h4>
        <PropsEditor
          propDefinitions={propDefinitions}
          props={props}
          onPropsChange={setProps}
          availableBlocks={blocks}
        />
      </aside>
    </div>
  )
}
