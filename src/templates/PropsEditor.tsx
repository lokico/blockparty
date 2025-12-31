import { useState } from 'react'
import type { PropDefinition, PropType, DiscriminatedUnionInfo } from '../extractProps.js'
import { getDiscriminatedUnionInfo } from '../extractProps.js'

interface ReactNodeValue {
  __block: string  // Block name
  __props: Record<string, any>  // Props for the block
}

export interface RuntimeBlockInfo {
  name: string
  description?: string
  propDefinitions: PropDefinition[]
  Component: React.ComponentType<any>
}

interface PropsEditorProps {
  propDefinitions: PropDefinition[]
  props: Record<string, string>
  onPropsChange: (props: Record<string, string>) => void
  availableBlocks?: RuntimeBlockInfo[]
}

const isFunctionType = (propType: PropType): boolean => {
  return propType.kind === 'function'
}

const isComplexType = (propType: PropType) => {
  // Constant unions like "foo" | "bar" are not complex, they get a dropdown
  if (isConstantUnion(propType)) {
    return false
  }
  // Function types are not complex either - they get a special editor
  if (isFunctionType(propType)) {
    return false
  }
  // Objects, arrays, tuples, and other unions are complex
  return propType.kind === 'object' || propType.kind === 'union' || propType.kind === 'array' || propType.kind === 'tuple'
}

const isConstantUnion = (propType: PropType): boolean => {
  // Check if it's a union of constants: "foo" | "bar" | 123 | true
  if (propType.kind !== 'union') return false
  return propType.types.every(t => t.kind === 'constant')
}

const parseConstantUnion = (propType: PropType): string[] => {
  if (propType.kind !== 'union') return []
  return propType.types
    .filter((t): t is Extract<PropType, { kind: 'constant' }> => t.kind === 'constant')
    .map(t => t.value)
}

const getDefaultValue = (propType: PropType, optional: boolean): string => {
  if (optional) return ''

  if (propType.kind === 'object') {
    return '{}'
  }

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

  if (propType.syntax === 'number') {
    return '0'
  }

  if (propType.syntax === 'boolean') {
    return 'false'
  }

  if (isConstantUnion(propType)) {
    const options = parseConstantUnion(propType)
    return options[0] || ''
  }

  return ''
}

export function PropsEditor({ propDefinitions, props, onPropsChange, availableBlocks = [] }: PropsEditorProps) {
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
          availableBlocks={availableBlocks}
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
            propType={propDef.type}
            value={props[propDef.name] || ''}
            onChange={(value) => updateProp(propDef.name, value, propDef.optional)}
            availableBlocks={availableBlocks}
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
                  {propDef.type.syntax}
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
  propType: PropType
  value: string
  onChange: (value: string, optional: boolean) => void
  availableBlocks?: RuntimeBlockInfo[]
}

function RichEditor({ propType, value, onChange, availableBlocks = [] }: RichEditorProps) {
  // Parse the current value
  let parsedValue: any
  try {
    parsedValue = value ? JSON.parse(value) : (propType.kind === 'array' || propType.kind === 'tuple' ? [] : {})
  } catch {
    parsedValue = propType.kind === 'array' || propType.kind === 'tuple' ? [] : {}
  }

  // Array type
  if (propType.kind === 'array') {
    const items = Array.isArray(parsedValue) ? parsedValue : []
    const elementPropDef: PropDefinition = {
      name: '',
      type: propType.elementType,
      optional: false,
    }

    const addItem = () => {
      const newItems = [...items, getDefaultValue(propType.elementType, false)]
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
          Array of {propType.elementType.syntax} ({items.length} item{items.length !== 1 ? 's' : ''})
        </div>
        {items.map((item, index) => (
          <div key={index} style={{ display: 'flex', gap: '4px', marginBottom: '4px' }}>
            <div style={{ flex: 1 }}>
              <ItemEditor
                propDef={elementPropDef}
                value={item}
                onChange={(newValue) => updateItem(index, newValue)}
                availableBlocks={availableBlocks}
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

  // Tuple type
  if (propType.kind === 'tuple') {
    const items = Array.isArray(parsedValue) ? parsedValue : Array(propType.types.length).fill('')

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
          Tuple [{propType.types.map(t => t.syntax).join(', ')}]
        </div>
        {propType.types.map((elementType, index) => {
          const elementPropDef: PropDefinition = {
            name: `[${index}]`,
            type: elementType,
            optional: false,
          }
          return (
            <div key={index} style={{ marginBottom: '8px' }}>
              <label style={{ display: 'block', fontSize: '11px', marginBottom: '2px', fontWeight: 500 }}>
                [{index}] {elementType.syntax}
              </label>
              <ItemEditor
                propDef={elementPropDef}
                value={items[index]}
                onChange={(newValue) => updateItem(index, newValue)}
                availableBlocks={availableBlocks}
              />
            </div>
          )
        })}
      </div>
    )
  }

  // Discriminated union type - show dropdown for discriminator + props editor for selected case
  const discriminatedUnionInfo = getDiscriminatedUnionInfo(propType)
  if (discriminatedUnionInfo) {
    return (
      <DiscriminatedUnionEditor
        value={value}
        onChange={(v) => onChange(v, false)}
        discriminatedUnionInfo={discriminatedUnionInfo}
        availableBlocks={availableBlocks}
      />
    )
  }

  // Union of literals - show dropdown
  if (isConstantUnion(propType)) {
    const options = parseConstantUnion(propType)
    const currentValue = typeof parsedValue === 'string' ? parsedValue : String(parsedValue)

    return (
      <select
        value={currentValue || options[0] || ''}
        onChange={(e) => onChange(e.target.value, false)}
        style={{
          width: '100%',
          padding: '4px 6px',
          border: '1px solid #ddd',
          borderRadius: '3px',
          fontSize: '12px'
        }}
      >
        {options.map(option => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    )
  }

  // Object type - show rich editor if we have property definitions
  if (propType.kind === 'object' && propType.properties.length > 0) {
    return (
      <ObjectEditor
        value={value}
        onChange={(v) => onChange(v, false)}
        properties={propType.properties}
        availableBlocks={availableBlocks}
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
      placeholder={`Enter JSON for ${propType.syntax}`}
    />
  )
}

interface ObjectEditorProps {
  value: string
  onChange: (value: string) => void
  properties: PropDefinition[]
  availableBlocks?: RuntimeBlockInfo[]
}

function ObjectEditor({ value, onChange, properties, availableBlocks = [] }: ObjectEditorProps) {
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
              {prop.type.syntax}
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
            availableBlocks={availableBlocks}
          />
        </div>
      ))}
    </div>
  )
}

interface ReactNodeEditorProps {
  value: any
  onChange: (value: any) => void
  optional: boolean
  availableBlocks: RuntimeBlockInfo[]
}

function ReactNodeEditor({ value, onChange, optional, availableBlocks }: ReactNodeEditorProps) {
  const [expandedIndices, setExpandedIndices] = useState<Set<number>>(new Set([0]))

  // Parse the value - always an array
  let blocks: ReactNodeValue[] = []
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value
    if (Array.isArray(parsed)) {
      blocks = parsed.filter(item => item && typeof item === 'object' && '__block' in item)
    }
  } catch {
    // Invalid value
  }

  const toggleExpanded = (index: number) => {
    setExpandedIndices(prev => {
      const next = new Set(prev)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      return next
    })
  }

  const addBlock = () => {
    const newBlocks = [...blocks, { __block: '', __props: {} }]
    onChange(newBlocks)
    setExpandedIndices(prev => new Set([...prev, newBlocks.length - 1]))
  }

  const removeBlock = (index: number) => {
    const newBlocks = blocks.filter((_, i) => i !== index)
    onChange(newBlocks.length === 0 ? (optional ? undefined : []) : newBlocks)
  }

  const updateBlock = (index: number, blockName: string) => {
    const newBlocks = [...blocks]
    newBlocks[index] = {
      __block: blockName,
      __props: {}
    }
    onChange(newBlocks)
  }

  const updateBlockProps = (index: number, newProps: Record<string, any>) => {
    const newBlocks = [...blocks]
    newBlocks[index] = {
      ...newBlocks[index],
      __props: newProps
    }
    onChange(newBlocks)
  }

  return (
    <div style={{
      border: '1px solid #ddd',
      borderRadius: '4px',
      padding: '8px',
      background: '#fafafa'
    }}>
      {blocks.length === 0 && optional && (
        <div style={{ fontSize: '11px', color: '#999', marginBottom: '8px' }}>
          No blocks added
        </div>
      )}

      {blocks.map((block, index) => {
        const selectedBlock = availableBlocks.find(b => b.name === block.__block)
        const isExpanded = expandedIndices.has(index)

        return (
          <div key={index} style={{
            marginBottom: '8px',
            border: '1px solid #ddd',
            borderRadius: '4px',
            background: 'white'
          }}>
            <div style={{
              display: 'flex',
              gap: '4px',
              padding: '6px',
              alignItems: 'center'
            }}>
              <button
                onClick={() => toggleExpanded(index)}
                style={{
                  padding: '2px 6px',
                  background: '#f0f0f0',
                  border: '1px solid #ddd',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  fontSize: '10px',
                  minWidth: '20px'
                }}
              >
                {isExpanded ? '▼' : '▶'}
              </button>

              <select
                value={block.__block || ''}
                onChange={(e) => updateBlock(index, e.target.value)}
                style={{
                  flex: 1,
                  padding: '4px 6px',
                  border: '1px solid #ddd',
                  borderRadius: '3px',
                  fontSize: '12px'
                }}
              >
                <option value="">-- Select a block --</option>
                {availableBlocks.map(b => (
                  <option key={b.name} value={b.name}>{b.name}</option>
                ))}
              </select>

              <button
                onClick={() => removeBlock(index)}
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

            {isExpanded && selectedBlock && (
              <div style={{
                padding: '8px',
                borderTop: '1px solid #ddd'
              }}>
                <div style={{ fontSize: '10px', color: '#666', marginBottom: '6px', fontWeight: 500 }}>
                  Props for {selectedBlock.name}:
                </div>
                <PropsEditor
                  propDefinitions={selectedBlock.propDefinitions}
                  props={block.__props || {}}
                  onPropsChange={(newProps) => updateBlockProps(index, newProps)}
                  availableBlocks={availableBlocks}
                />
              </div>
            )}
          </div>
        )
      })}

      <button
        onClick={addBlock}
        style={{
          width: '100%',
          padding: '6px',
          background: '#f0f0f0',
          border: '1px solid #ddd',
          borderRadius: '3px',
          cursor: 'pointer',
          fontSize: '12px',
          marginTop: blocks.length > 0 ? '4px' : '0'
        }}
      >
        + Add Block
      </button>
    </div>
  )
}

interface DiscriminatedUnionEditorProps {
  value: string
  onChange: (value: string) => void
  discriminatedUnionInfo: DiscriminatedUnionInfo
  availableBlocks?: RuntimeBlockInfo[]
}

function DiscriminatedUnionEditor({ value, onChange, discriminatedUnionInfo, availableBlocks = [] }: DiscriminatedUnionEditorProps) {
  // Parse the current value
  let parsedValue: Record<string, any>
  try {
    parsedValue = value ? JSON.parse(value) : {}
  } catch {
    parsedValue = {}
  }

  const { discriminator, cases } = discriminatedUnionInfo

  // Get current discriminator value from the object
  const currentDiscriminatorValue = parsedValue[discriminator] || cases[0]?.discriminatorValue || ''

  // Find the case for the current discriminator value
  const currentCase = cases.find(c => c.discriminatorValue === currentDiscriminatorValue)

  // Handle discriminator change
  const handleDiscriminatorChange = (newDiscriminatorValue: string) => {
    // Reset the object to just have the discriminator
    const newObj = { [discriminator]: newDiscriminatorValue }
    onChange(JSON.stringify(newObj))
  }

  // Handle property change
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
      {/* Discriminator dropdown */}
      <div>
        <label style={{ display: 'block', fontSize: '11px', marginBottom: '2px', fontWeight: 500 }}>
          {discriminator} *
        </label>
        <select
          value={currentDiscriminatorValue}
          onChange={(e) => handleDiscriminatorChange(e.target.value)}
          style={{
            width: '100%',
            padding: '4px 6px',
            border: '1px solid #ddd',
            borderRadius: '3px',
            fontSize: '12px'
          }}
        >
          {cases.map(c => (
            <option key={c.discriminatorValue} value={c.discriminatorValue}>
              {c.discriminatorValue}
            </option>
          ))}
        </select>
      </div>

      {/* Properties for selected case */}
      {currentCase && currentCase.properties.length > 0 && (
        <>
          <div style={{ borderTop: '1px solid #ddd', margin: '4px 0' }} />
          {currentCase.properties.map(prop => (
            <div key={prop.name}>
              <label style={{ display: 'block', fontSize: '11px', marginBottom: '2px', fontWeight: 500 }}>
                {prop.name}{prop.optional ? '' : ' *'}
                <span style={{ color: '#999', fontWeight: 'normal', marginLeft: '4px' }}>
                  {prop.type.syntax}
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
                availableBlocks={availableBlocks}
              />
            </div>
          ))}
        </>
      )}
    </div>
  )
}

interface FunctionEditorProps {
  parameters: PropDefinition[]
  value: string
  onChange: (value: string) => void
}

function FunctionEditor({ parameters, value, onChange }: FunctionEditorProps) {
  // Build the function signature from parameters
  const paramSignature = parameters.map(p =>
    `${p.name}${p.optional ? '?' : ''}: ${p.type.syntax}`
  ).join(', ')

  return (
    <div>
      <div style={{
        fontSize: '11px',
        fontFamily: 'monospace',
        color: '#666',
        marginBottom: '4px',
        padding: '4px 8px',
        background: '#f5f5f5',
        borderRadius: '3px',
        border: '1px solid #e0e0e0'
      }}>
        ({paramSignature}) =&gt;
      </div>
      <textarea
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Enter function body (without braces)"
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
      />
    </div>
  )
}

interface ItemEditorProps {
  propDef: PropDefinition
  value: any
  onChange: (value: any) => void
  availableBlocks?: RuntimeBlockInfo[]
}

function ItemEditor({ value, onChange, propDef, availableBlocks = [] }: ItemEditorProps) {
  const { type, optional } = propDef

  // For function types, show function editor
  if (type.kind === 'function') {
    return (
      <FunctionEditor
        parameters={type.parameters}
        value={value || ''}
        onChange={onChange}
      />
    )
  }

  // For React.ReactNode, show block selector
  if (type.syntax === 'React.ReactNode' || type.syntax === 'ReactNode') {
    return (
      <ReactNodeEditor
        value={value}
        onChange={onChange}
        optional={optional}
        availableBlocks={availableBlocks}
      />
    )
  }

  // For arrays, tuples, and other complex types, use RichEditor
  if (type.kind === 'array' || type.kind === 'tuple') {
    return (
      <RichEditor
        propType={type}
        value={typeof value === 'string' ? value : JSON.stringify(value)}
        onChange={(newValue) => {
          try {
            onChange(JSON.parse(newValue))
          } catch {
            onChange(newValue)
          }
        }}
        availableBlocks={availableBlocks}
      />
    )
  }

  // For discriminated unions, show discriminated union editor
  const discriminatedUnionInfo = getDiscriminatedUnionInfo(type)
  if (discriminatedUnionInfo) {
    return (
      <DiscriminatedUnionEditor
        value={typeof value === 'string' ? value : JSON.stringify(value)}
        onChange={(newValue) => {
          try {
            onChange(JSON.parse(newValue))
          } catch {
            onChange(newValue)
          }
        }}
        discriminatedUnionInfo={discriminatedUnionInfo}
        availableBlocks={availableBlocks}
      />
    )
  }

  // For constant unions, show dropdown
  if (isConstantUnion(type)) {
    const options = parseConstantUnion(type)
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

  // For Date type
  if (type.syntax === 'Date') {
    return (
      <input
        type="datetime-local"
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

  // For primitive types
  if (type.syntax === 'string') {
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

  if (type.syntax === 'number') {
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

  if (type.syntax === 'boolean') {
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
  if (type.kind === 'object' && type.properties.length > 0) {
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
        properties={type.properties}
        availableBlocks={availableBlocks}
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
