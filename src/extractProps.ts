import { readFile } from 'fs/promises'
import * as ts from 'typescript'

export type PropType =
  | { kind: 'primitive'; syntax: string }
  | { kind: 'object'; syntax: string; properties: PropDefinition[] }
  | { kind: 'function'; syntax: string; parameters: PropDefinition[] }
  | { kind: 'union'; syntax: string; types: PropType[] }
  | { kind: 'constant'; syntax: string; value: string }
  | { kind: 'array'; syntax: string; elementType: PropType }
  | { kind: 'tuple'; syntax: string; types: PropType[] }

export interface PropDefinition {
  name: string
  type: PropType
  optional: boolean
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

function isLiteralType(typeNode: ts.TypeNode | undefined): boolean {
  if (!typeNode) return false
  return ts.isLiteralTypeNode(typeNode)
}

function extractLiteralValue(typeNode: ts.LiteralTypeNode, sourceFile: ts.SourceFile): string {
  return typeNode.literal.getText(sourceFile)
}

function buildPropType(typeNode: ts.TypeNode, sourceFile: ts.SourceFile): PropType {
  const syntax = typeNode.getText(sourceFile)

  // Handle literal types (string/number/boolean constants)
  if (ts.isLiteralTypeNode(typeNode)) {
    const value = extractLiteralValue(typeNode, sourceFile)
    return { kind: 'constant', syntax, value }
  }

  // Handle tuple types (before union, as tuples are TupleTypeNode)
  if (ts.isTupleTypeNode(typeNode)) {
    const types = typeNode.elements.map(el => buildPropType(el, sourceFile))
    return { kind: 'tuple', syntax, types }
  }

  // Handle union types
  if (ts.isUnionTypeNode(typeNode)) {
    const types = typeNode.types.map(t => buildPropType(t, sourceFile))
    return { kind: 'union', syntax, types }
  }

  // Handle array types
  if (ts.isArrayTypeNode(typeNode)) {
    const elementType = buildPropType(typeNode.elementType, sourceFile)
    return { kind: 'array', syntax, elementType }
  }

  // Handle function types
  if (isFunctionType(typeNode)) {
    const parameters = extractFunctionParameters(typeNode, sourceFile)
    return { kind: 'function', syntax, parameters }
  }

  // Handle object types (type literals)
  if (ts.isTypeLiteralNode(typeNode)) {
    const properties = extractPropertiesFromType(typeNode, sourceFile)
    return { kind: 'object', syntax, properties }
  }

  // Handle type references (might resolve to object/function/etc)
  if (ts.isTypeReferenceNode(typeNode)) {
    const typeName = typeNode.typeName.getText(sourceFile)
    const typeDecl = findTypeDeclaration(sourceFile, typeName)

    if (typeDecl) {
      const properties = extractPropertiesFromDeclaration(typeDecl, sourceFile)
      if (properties.length > 0) {
        return { kind: 'object', syntax, properties }
      }
    }
  }

  // Default: primitive type
  return { kind: 'primitive', syntax }
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
    const optional = !!param.questionToken

    // Build the PropType for this parameter
    const propType: PropType = param.type ? buildPropType(param.type, sourceFile) : { kind: 'primitive', syntax: 'any' }

    parameters.push({ name, type: propType, optional })
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
        props.push(extractPropertyFromSignature(member, sourceFile))
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

function extractPropertyFromSignature(
  member: ts.PropertySignature,
  sourceFile: ts.SourceFile
): PropDefinition {
  const name = member.name!.getText(sourceFile)
  const optional = !!member.questionToken

  // Build the PropType for this property
  const propType: PropType = member.type ? buildPropType(member.type, sourceFile) : { kind: 'primitive', syntax: 'any' }

  const propDef: PropDefinition = { name, type: propType, optional }

  // Extract JSDoc comment if available
  const description = extractJSDocComment(member, sourceFile)
  if (description) {
    propDef.description = description
  }

  return propDef
}

function extractPropertiesFromDeclaration(
  decl: ts.InterfaceDeclaration | ts.TypeAliasDeclaration,
  sourceFile: ts.SourceFile,
  typeChecker?: ts.TypeChecker
): PropDefinition[] {
  const props: PropDefinition[] = []

  if (ts.isInterfaceDeclaration(decl)) {
    // First, extract properties from extended interfaces
    if (decl.heritageClauses) {
      for (const heritageClause of decl.heritageClauses) {
        if (heritageClause.token === ts.SyntaxKind.ExtendsKeyword) {
          for (const typeExpr of heritageClause.types) {
            let baseDecl: ts.InterfaceDeclaration | ts.TypeAliasDeclaration | null = null
            let baseSrcFile = sourceFile

            if (typeChecker) {
              // Use typeChecker to resolve cross-file references
              const type = typeChecker.getTypeAtLocation(typeExpr)
              const symbol = type.getSymbol()
              if (symbol && symbol.declarations && symbol.declarations.length > 0) {
                const decl = symbol.declarations[0]
                if (ts.isInterfaceDeclaration(decl) || ts.isTypeAliasDeclaration(decl)) {
                  baseDecl = decl
                  baseSrcFile = decl.getSourceFile()
                }
              }
            } else {
              // Fall back to same-file lookup
              const typeName = typeExpr.expression.getText(sourceFile)
              baseDecl = findTypeDeclaration(sourceFile, typeName)
            }

            if (baseDecl) {
              const inheritedProps = extractPropertiesFromDeclaration(baseDecl, baseSrcFile, typeChecker)
              props.push(...inheritedProps)
            }
          }
        }
      }
    }

    // Then, extract properties directly declared on this interface
    for (const member of decl.members) {
      if (ts.isPropertySignature(member) && member.name) {
        props.push(extractPropertyFromSignature(member, sourceFile))
      }
    }
  } else if (ts.isTypeAliasDeclaration(decl) && decl.type) {
    if (ts.isTypeLiteralNode(decl.type)) {
      for (const member of decl.type.members) {
        if (ts.isPropertySignature(member) && member.name) {
          props.push(extractPropertyFromSignature(member, sourceFile))
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

function findDefaultExportFunction(sourceFile: ts.SourceFile): ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression | null {
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
    return null
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

  return func
}

export function extractPropsFromSource(content: string, fileName: string = 'source.tsx'): PropDefinition[] {
  const sourceFile = ts.createSourceFile(
    fileName,
    content,
    ts.ScriptTarget.Latest,
    true
  )

  const func = findDefaultExportFunction(sourceFile)
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
    // Create a TypeScript program to resolve imports
    const program = ts.createProgram([filePath], {
      target: ts.ScriptTarget.Latest,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      jsx: ts.JsxEmit.React,
      esModuleInterop: true,
      skipLibCheck: true,
      noEmit: true,
      allowImportingTsExtensions: true,
    })

    const sourceFile = program.getSourceFile(filePath)
    if (!sourceFile) {
      return []
    }

    const typeChecker = program.getTypeChecker()
    return extractPropsFromSourceFile(sourceFile, typeChecker)
  } catch (error) {
    console.error(`Error extracting props from ${filePath}:`, error)
    return []
  }
}

function extractPropsFromSourceFile(sourceFile: ts.SourceFile, typeChecker: ts.TypeChecker): PropDefinition[] {
  const func = findDefaultExportFunction(sourceFile)
  if (!func || !func.parameters || func.parameters.length === 0) {
    return []
  }

  // Get the first parameter's type
  const firstParam = func.parameters[0]
  if (!firstParam.type) {
    return []
  }

  return extractPropertiesFromTypeNode(firstParam.type, sourceFile, typeChecker)
}

function extractPropertiesFromTypeNode(
  typeNode: ts.TypeNode,
  sourceFile: ts.SourceFile,
  typeChecker: ts.TypeChecker
): PropDefinition[] {
  const props: PropDefinition[] = []

  if (ts.isTypeLiteralNode(typeNode)) {
    return extractPropertiesFromType(typeNode, sourceFile)
  } else if (ts.isTypeReferenceNode(typeNode)) {
    // Type reference like "Props" or "ComponentProps"
    const typeName = typeNode.typeName.getText(sourceFile)

    // First try to find in the same file
    let typeDecl = findTypeDeclaration(sourceFile, typeName)

    // If not found, try to resolve using typeChecker
    if (!typeDecl) {
      const type = typeChecker.getTypeAtLocation(typeNode)
      const symbol = type.getSymbol()
      if (symbol && symbol.declarations && symbol.declarations.length > 0) {
        const decl = symbol.declarations[0]
        if (ts.isInterfaceDeclaration(decl) || ts.isTypeAliasDeclaration(decl)) {
          typeDecl = decl
          // Use the source file where the declaration is located
          sourceFile = decl.getSourceFile()
        }
      }
    }

    if (typeDecl) {
      return extractPropertiesFromDeclaration(typeDecl, sourceFile, typeChecker)
    }
  }

  return props
}
