import { useState } from 'react'

interface PropDefinition {
  name: string
  type: string
  optional: boolean
  properties?: PropDefinition[]
  description?: string
}

interface PropsEditorProps {
  propDefinitions: PropDefinition[]
  props: Record<string, string>
  onPropsChange: (props: Record<string, string>) => void
}

const isComplexType = (type: string) => {
  // String unions like "foo" | "bar" are not complex, they get a dropdown
  if (isStringUnion(type)) {
    return false
  }
  return type.includes('[') || type.includes('{') || type.includes('|')
}

const isStringUnion = (type: string): boolean => {
  // Check if it's a union of string literals: "foo" | "bar" | "baz"
  if (!type.includes('|')) return false

  // Split by | and check if all parts are string literals
  const parts = type.split('|').map(p => p.trim())
  return parts.every(part =>
    (part.startsWith('"') && part.endsWith('"')) ||
    (part.startsWith("'") && part.endsWith("'"))
  )
}

const parseStringUnion = (type: string): string[] => {
  return type.split('|').map(part => {
    const trimmed = part.trim()
    // Remove quotes
    return trimmed.slice(1, -1)
  })
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

  if (isStringUnion(type)) {
    const options = parseStringUnion(type)
    return options[0] || ''
  }

  return ''
}

export function PropsEditor({ propDefinitions, props, onPropsChange }: PropsEditorProps) {
  const [jsonMode, setJsonMode] = useState<Record<string, boolean>>({})

  const toggleJsonMode = (propName: string) => {
    setJsonMode(prev => ({ ...prev, [propName]: !prev[propName] }))
  }

  const updateProp = (name: string, value: string, optional: boolean) => {
    // If the value is empty and the prop is optional, remove it
    if (value === '' && optional) {
      const { [name]: _, ...rest } = props
      onPropsChange(rest)
    } else {
      onPropsChange({ ...props, [name]: value })
    }
  }

  const renderPropEditor = (propDef: PropDefinition) => {
    const isComplex = isComplexType(propDef.type)
    const isJson = jsonMode[propDef.name]

    if (!isComplex) {
      // Simple type - just render input
      return (
        <ItemEditor
          propDef={propDef}
          value={props[propDef.name] || ''}
          onChange={(value) => updateProp(propDef.name, value, propDef.optional)}
        />
      )
    }

    // Complex type - show editor based on mode
    return (
      <>
        {isJson ? (
          <textarea
            value={props[propDef.name] || ''}
            onChange={(e) => updateProp(propDef.name, e.target.value, propDef.optional)}
            style={{
              width: '100%',
              padding: '6px 8px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '12px',
              fontFamily: 'monospace',
              boxSizing: 'border-box',
              minHeight: '100px',
              resize: 'vertical'
            }}
            placeholder={`Enter JSON for ${propDef.name}`}
          />
        ) : (
          <RichEditor
            type={propDef.type}
            value={props[propDef.name] || ''}
            onChange={(value) => updateProp(propDef.name, value, propDef.optional)}
            properties={propDef.properties}
          />
        )}
      </>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {propDefinitions.length > 0 ? propDefinitions.map(propDef => {
        const isComplex = isComplexType(propDef.type)
        const isJson = jsonMode[propDef.name]

        return (
          <div key={propDef.name}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px', flexWrap: 'wrap', gap: '4px' }}>
              <label style={{ fontSize: '12px', fontWeight: 500 }}>
                {propDef.name}{propDef.optional ? '' : ' *'}
                <span style={{ color: '#999', fontWeight: 'normal', marginLeft: '4px' }}>
                  {propDef.type}
                </span>
              </label>
              {isComplex && (
                <button
                  onClick={() => toggleJsonMode(propDef.name)}
                  style={{
                    fontSize: '10px',
                    padding: '2px 6px',
                    background: '#f5f5f5',
                    border: '1px solid #ddd',
                    borderRadius: '3px',
                    cursor: 'pointer'
                  }}
                >
                  {isJson ? 'Rich Editor' : 'JSON'}
                </button>
              )}
            </div>
            {propDef.description && (
              <div style={{ fontSize: '11px', color: '#666', marginBottom: '4px', fontStyle: 'italic' }}>
                {propDef.description}
              </div>
            )}
            {renderPropEditor(propDef)}
          </div>
        )
      }) : (
        <p style={{ fontSize: '12px', color: '#999' }}>No props defined</p>
      )}
    </div>
  )
}

interface RichEditorProps {
  type: string
  value: string
  onChange: (value: string, optional: boolean) => void
  properties?: PropDefinition[]
}

function RichEditor({ type, value, onChange, properties }: RichEditorProps) {
  // Parse the current value
  let parsedValue: any
  try {
    parsedValue = value ? JSON.parse(value) : (type.includes('[]') ? [] : {})
  } catch {
    parsedValue = type.includes('[]') ? [] : {}
  }

  // Array type
  if (type.includes('[]')) {
    const items = Array.isArray(parsedValue) ? parsedValue : []
    const elementType = type.replace('[]', '').trim()
    const elementPropDef: PropDefinition = {
      name: '',
      type: elementType,
      optional: false, // FIXME
      properties
    }

    const addItem = () => {
      const newItems = [...items, getDefaultValue(elementType, false)]
      onChange(JSON.stringify(newItems), false)
    }

    const removeItem = (index: number) => {
      const newItems = items.filter((_, i) => i !== index)
      onChange(JSON.stringify(newItems), items.length === 1)
    }

    const updateItem = (index: number, newValue: any) => {
      const newItems = [...items]
      newItems[index] = newValue
      onChange(JSON.stringify(newItems), false)
    }

    return (
      <div style={{
        border: '1px solid #ddd',
        borderRadius: '4px',
        padding: '8px',
        background: '#fafafa'
      }}>
        <div style={{ marginBottom: '8px', fontSize: '11px', color: '#666' }}>
          Array of {elementType} ({items.length} item{items.length !== 1 ? 's' : ''})
        </div>
        {items.map((item, index) => (
          <div key={index} style={{ display: 'flex', gap: '4px', marginBottom: '4px' }}>
            <div style={{ flex: 1 }}>
              <ItemEditor
                propDef={elementPropDef}
                value={item}
                onChange={(newValue) => updateItem(index, newValue)}
              />
            </div>
            <button
              onClick={() => removeItem(index)}
              style={{
                padding: '4px 8px',
                background: '#fee',
                border: '1px solid #fcc',
                borderRadius: '3px',
                cursor: 'pointer',
                fontSize: '12px'
              }}
            >
              ✕
            </button>
          </div>
        ))}
        <button
          onClick={addItem}
          style={{
            width: '100%',
            padding: '6px',
            background: '#f0f0f0',
            border: '1px solid #ddd',
            borderRadius: '3px',
            cursor: 'pointer',
            fontSize: '12px',
            marginTop: '4px'
          }}
        >
          + Add Item
        </button>
      </div>
    )
  }

  // Object type - show rich editor if we have property definitions
  if (properties && properties.length > 0) {
    return (
      <ObjectEditor
        value={value}
        onChange={(v) => onChange(v, false)}
        properties={properties}
      />
    )
  }

  // Fallback to JSON textarea for unknown object types
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value, false)}
      style={{
        width: '100%',
        padding: '6px 8px',
        border: '1px solid #ddd',
        borderRadius: '4px',
        fontSize: '12px',
        fontFamily: 'monospace',
        boxSizing: 'border-box',
        minHeight: '60px',
        resize: 'vertical'
      }}
      placeholder={`Enter JSON for ${type}`}
    />
  )
}

interface ObjectEditorProps {
  value: string
  onChange: (value: string) => void
  properties: PropDefinition[]
}

function ObjectEditor({ value, onChange, properties }: ObjectEditorProps) {
  let parsedValue: Record<string, any>
  try {
    parsedValue = value ? JSON.parse(value) : {}
  } catch {
    parsedValue = {}
  }

  const updateField = (fieldName: string, fieldValue: any) => {
    const newObj = { ...parsedValue, [fieldName]: fieldValue }
    onChange(JSON.stringify(newObj))
  }

  return (
    <div style={{
      border: '1px solid #ddd',
      borderRadius: '4px',
      padding: '8px',
      background: '#fafafa',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px'
    }}>
      {properties.map(prop => (
        <div key={prop.name}>
          <label style={{ display: 'block', fontSize: '11px', marginBottom: '2px', fontWeight: 500 }}>
            {prop.name}{prop.optional ? '' : ' *'}
            <span style={{ color: '#999', fontWeight: 'normal', marginLeft: '4px' }}>
              {prop.type}
            </span>
          </label>
          {prop.description && (
            <div style={{ fontSize: '10px', color: '#666', marginBottom: '2px', fontStyle: 'italic' }}>
              {prop.description}
            </div>
          )}
          <ItemEditor
            propDef={prop}
            value={parsedValue[prop.name]}
            onChange={(newValue) => updateField(prop.name, newValue)}
          />
        </div>
      ))}
    </div>
  )
}

interface ItemEditorProps {
  propDef: PropDefinition
  value: any
  onChange: (value: any) => void
}

function ItemEditor({ value, onChange, propDef: { type, properties, optional} }: ItemEditorProps) {
  // For string unions, show dropdown
  if (isStringUnion(type)) {
    const options = parseStringUnion(type)
    return (
      <select
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: '100%',
          padding: '4px 6px',
          border: '1px solid #ddd',
          borderRadius: '3px',
          fontSize: '12px'
        }}
      >
        {optional && <option value="">-- Select --</option>}
        {options.map(option => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    )
  }

  // For primitive types
  if (type === 'string') {
    return (
      <input
        type="text"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: '100%',
          padding: '4px 6px',
          border: '1px solid #ddd',
          borderRadius: '3px',
          fontSize: '12px'
        }}
      />
    )
  }

  if (type === 'number') {
    return (
      <input
        type="number"
        value={value ?? ''}
        onChange={(e) => {
          const val = e.target.value
          // If empty and optional, pass undefined
          if (val === '' && optional) {
            onChange(undefined)
          } else {
            onChange(val === '' ? 0 : Number(val))
          }
        }}
        style={{
          width: '100%',
          padding: '4px 6px',
          border: '1px solid #ddd',
          borderRadius: '3px',
          fontSize: '12px'
        }}
      />
    )
  }

  if (type === 'boolean') {
    return (
      <select
        value={value ? 'true' : 'false'}
        onChange={(e) => onChange(e.target.value === 'true')}
        style={{
          width: '100%',
          padding: '4px 6px',
          border: '1px solid #ddd',
          borderRadius: '3px',
          fontSize: '12px'
        }}
      >
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    )
  }

  // For object types with known properties, show structured editor
  if (properties && properties.length > 0) {
    return (
      <ObjectEditor
        value={typeof value === 'string' ? value : JSON.stringify(value)}
        onChange={(newValue) => {
          try {
            onChange(JSON.parse(newValue))
          } catch {
            onChange(newValue)
          }
        }}
        properties={properties}
      />
    )
  }

  // For unknown object types, show JSON editor
  return (
    <textarea
      value={typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
      onChange={(e) => {
        try {
          onChange(JSON.parse(e.target.value))
        } catch {
          onChange(e.target.value)
        }
      }}
      style={{
        width: '100%',
        padding: '4px 6px',
        border: '1px solid #ddd',
        borderRadius: '3px',
        fontSize: '11px',
        fontFamily: 'monospace',
        minHeight: '40px',
        resize: 'vertical'
      }}
    />
  )
}
