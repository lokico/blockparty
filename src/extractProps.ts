import { readFile } from 'fs/promises'
import * as ts from 'typescript'

export interface PropDefinition {
  name: string
  type: string
  optional: boolean
  properties?: PropDefinition[]  // For object types, the nested properties
  parameters?: PropDefinition[]  // For function types, the parameters
  description?: string  // JSDoc comment text
}

function isFunctionType(typeNode: ts.TypeNode | undefined): boolean {
  if (!typeNode) return false
  if (ts.isFunctionTypeNode(typeNode)) return true

  // Check if it's a parenthesized function type like: (x: number) => void
  if (ts.isParenthesizedTypeNode(typeNode)) {
    return isFunctionType(typeNode.type)
  }

  // Check if it's a union type containing a function
  if (ts.isUnionTypeNode(typeNode)) {
    return typeNode.types.some(t => isFunctionType(t))
  }

  return false
}

function extractFunctionParameters(typeNode: ts.TypeNode, sourceFile: ts.SourceFile): PropDefinition[] {
  let functionNode: ts.FunctionTypeNode | undefined

  if (ts.isFunctionTypeNode(typeNode)) {
    functionNode = typeNode
  } else if (ts.isParenthesizedTypeNode(typeNode) && ts.isFunctionTypeNode(typeNode.type)) {
    functionNode = typeNode.type
  } else if (ts.isUnionTypeNode(typeNode)) {
    // For union types, find the first function type
    for (const unionMember of typeNode.types) {
      if (ts.isFunctionTypeNode(unionMember)) {
        functionNode = unionMember
        break
      } else if (ts.isParenthesizedTypeNode(unionMember) && ts.isFunctionTypeNode(unionMember.type)) {
        functionNode = unionMember.type
        break
      }
    }
  }

  if (!functionNode) {
    return []
  }

  const parameters: PropDefinition[] = []
  for (const param of functionNode.parameters) {
    const name = param.name.getText(sourceFile)
    const type = param.type ? param.type.getText(sourceFile) : 'any'
    const optional = !!param.questionToken

    parameters.push({ name, type, optional })
  }

  return parameters
}

function extractJSDocComment(node: ts.Node, sourceFile: ts.SourceFile): string | undefined {
  const fullText = sourceFile.getFullText()
  const commentRanges = ts.getLeadingCommentRanges(fullText, node.pos)

  if (!commentRanges || commentRanges.length === 0) {
    return undefined
  }

  // Loop backwards to find the last comment starting with "/**"
  for (let i = commentRanges.length - 1; i >= 0; i--) {
    const range = commentRanges[i]
    const commentText = fullText.substring(range.pos, range.end)

    if (commentText.startsWith('/**')) {
      // Parse JSDoc comment
      return commentText
        .replace(/^\/\*\*/, '') // Remove opening /**
        .replace(/\*\/$/, '')   // Remove closing */
        .split('\n')
        .map(line => line.trim().replace(/^\* ?/, '')) // Remove leading * from each line
        .filter(line => line.length > 0) // Remove empty lines
        .join(' ')
        .trim()
    }
  }

  return undefined
}

function extractPropertiesFromType(typeNode: ts.TypeNode, sourceFile: ts.SourceFile): PropDefinition[] {
  const props: PropDefinition[] = []

  if (ts.isTypeLiteralNode(typeNode)) {
    for (const member of typeNode.members) {
      if (ts.isPropertySignature(member) && member.name) {
        const name = member.name.getText(sourceFile)
        const optional = !!member.questionToken
        const type = member.type ? member.type.getText(sourceFile) : 'any'

        const propDef: PropDefinition = { name, type, optional }

        // Extract JSDoc comment if available
        const description = extractJSDocComment(member, sourceFile)
        if (description) {
          propDef.description = description
        }

        // If this property has a type, check if it's a function or object type
        if (member.type) {
          if (isFunctionType(member.type)) {
            // Extract function parameters
            const params = extractFunctionParameters(member.type, sourceFile)
            propDef.parameters = params
          } else {
            // Try to extract nested properties for object types
            const nestedProps = extractNestedProperties(member.type, sourceFile)
            if (nestedProps.length > 0) {
              propDef.properties = nestedProps
            }
          }
        }

        props.push(propDef)
      }
    }
  } else if (ts.isTypeReferenceNode(typeNode)) {
    // Type reference like "Props" or "ComponentProps"
    const typeName = typeNode.typeName.getText(sourceFile)

    // Find the type declaration
    const typeDecl = findTypeDeclaration(sourceFile, typeName)
    if (typeDecl) {
      return extractPropertiesFromDeclaration(typeDecl, sourceFile)
    }
  }

  return props
}

function extractNestedProperties(typeNode: ts.TypeNode, sourceFile: ts.SourceFile): PropDefinition[] {
  // Handle array types - extract element type
  if (ts.isArrayTypeNode(typeNode)) {
    return extractNestedProperties(typeNode.elementType, sourceFile)
  }

  // Handle inline object types
  if (ts.isTypeLiteralNode(typeNode)) {
    return extractPropertiesFromType(typeNode, sourceFile)
  }

  // Handle type references
  if (ts.isTypeReferenceNode(typeNode)) {
    const typeName = typeNode.typeName.getText(sourceFile)
    const typeDecl = findTypeDeclaration(sourceFile, typeName)
    if (typeDecl) {
      return extractPropertiesFromDeclaration(typeDecl, sourceFile)
    }
  }

  return []
}

function extractPropertiesFromDeclaration(
  decl: ts.InterfaceDeclaration | ts.TypeAliasDeclaration,
  sourceFile: ts.SourceFile
): PropDefinition[] {
  const props: PropDefinition[] = []

  if (ts.isInterfaceDeclaration(decl)) {
    // First, extract properties from extended interfaces
    if (decl.heritageClauses) {
      for (const heritageClause of decl.heritageClauses) {
        if (heritageClause.token === ts.SyntaxKind.ExtendsKeyword) {
          for (const typeExpr of heritageClause.types) {
            const typeName = typeExpr.expression.getText(sourceFile)
            const baseDecl = findTypeDeclaration(sourceFile, typeName)
            if (baseDecl) {
              const inheritedProps = extractPropertiesFromDeclaration(baseDecl, sourceFile)
              props.push(...inheritedProps)
            }
          }
        }
      }
    }

    // Then, extract properties directly declared on this interface
    for (const member of decl.members) {
      if (ts.isPropertySignature(member) && member.name) {
        const name = member.name.getText(sourceFile)
        const optional = !!member.questionToken
        const type = member.type ? member.type.getText(sourceFile) : 'any'

        const propDef: PropDefinition = { name, type, optional }

        // Extract JSDoc comment if available
        const description = extractJSDocComment(member, sourceFile)
        if (description) {
          propDef.description = description
        }

        // If this property has a type, check if it's a function or object type
        if (member.type) {
          if (isFunctionType(member.type)) {
            // Extract function parameters
            const params = extractFunctionParameters(member.type, sourceFile)
            propDef.parameters = params
          } else {
            // Try to extract nested properties for object types
            const nestedProps = extractNestedProperties(member.type, sourceFile)
            if (nestedProps.length > 0) {
              propDef.properties = nestedProps
            }
          }
        }

        props.push(propDef)
      }
    }
  } else if (ts.isTypeAliasDeclaration(decl) && decl.type) {
    if (ts.isTypeLiteralNode(decl.type)) {
      for (const member of decl.type.members) {
        if (ts.isPropertySignature(member) && member.name) {
          const name = member.name.getText(sourceFile)
          const optional = !!member.questionToken
          const type = member.type ? member.type.getText(sourceFile) : 'any'

          const propDef: PropDefinition = { name, type, optional }

          // Extract JSDoc comment if available
          const description = extractJSDocComment(member, sourceFile)
          if (description) {
            propDef.description = description
          }

          // If this property has a type, check if it's a function or object type
          if (member.type) {
            if (isFunctionType(member.type)) {
              // Extract function parameters
              const params = extractFunctionParameters(member.type, sourceFile)
              propDef.parameters = params
            } else {
              // Try to extract nested properties for object types
              const nestedProps = extractNestedProperties(member.type, sourceFile)
              if (nestedProps.length > 0) {
                propDef.properties = nestedProps
              }
            }
          }

          props.push(propDef)
        }
      }
    }
  }

  return props
}

function findTypeDeclaration(sourceFile: ts.SourceFile, typeName: string): ts.InterfaceDeclaration | ts.TypeAliasDeclaration | null {
  let result: ts.InterfaceDeclaration | ts.TypeAliasDeclaration | null = null

  function visit(node: ts.Node) {
    if ((ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) && node.name.text === typeName) {
      result = node
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return result
}

export function extractPropsFromSource(content: string, fileName: string = 'source.tsx'): PropDefinition[] {
  const sourceFile = ts.createSourceFile(
    fileName,
    content,
    ts.ScriptTarget.Latest,
    true
  )

  // Find the default export
  let defaultExport: ts.ExportAssignment | ts.FunctionDeclaration | null = null

  function visit(node: ts.Node) {
    // export default ...
    if (ts.isExportAssignment(node) && !node.isExportEquals) {
      defaultExport = node
    }
    // export default function Component(props: Props) { ... }
    else if (ts.isFunctionDeclaration(node)) {
      const hasExport = node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)
      const hasDefault = node.modifiers?.some(m => m.kind === ts.SyntaxKind.DefaultKeyword)
      if (hasExport && hasDefault) {
        defaultExport = node
      }
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)

  if (!defaultExport) {
    return []
  }

  // Get the function from the default export
  let func: ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression | null = null

  if (ts.isFunctionDeclaration(defaultExport)) {
    func = defaultExport
  } else {
    // Must be ExportAssignment
    const exportAssignment = defaultExport as ts.ExportAssignment
    const expr = exportAssignment.expression
    if (ts.isArrowFunction(expr) || ts.isFunctionExpression(expr)) {
      func = expr
    } else if (ts.isIdentifier(expr)) {
      // export default ComponentName - need to find the declaration
      const funcDecl = findFunctionDeclaration(sourceFile, expr.text)
      if (funcDecl) {
        func = funcDecl
      }
    }
  }

  if (!func || !func.parameters || func.parameters.length === 0) {
    return []
  }

  // Get the first parameter's type
  const firstParam = func.parameters[0]
  if (!firstParam.type) {
    return []
  }

  return extractPropertiesFromType(firstParam.type, sourceFile)
}

function findFunctionDeclaration(sourceFile: ts.SourceFile, name: string): ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression | null {
  let result: ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression | null = null

  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) {
      result = node
    } else if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && decl.name.text === name && decl.initializer) {
          if (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer)) {
            result = decl.initializer
          }
        }
      }
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return result
}

export async function extractPropsFromFile(filePath: string): Promise<PropDefinition[]> {
  try {
    const content = await readFile(filePath, 'utf-8')
    return extractPropsFromSource(content, filePath)
  } catch (error) {
    console.error(`Error extracting props from ${filePath}:`, error)
    return []
  }
}
