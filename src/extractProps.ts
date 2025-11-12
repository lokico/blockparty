import { readFile } from 'fs/promises'
import * as ts from 'typescript'

export interface PropDefinition {
  name: string
  type: string
  optional: boolean
}

function extractPropertiesFromType(typeNode: ts.TypeNode, sourceFile: ts.SourceFile): PropDefinition[] {
  const props: PropDefinition[] = []

  if (ts.isTypeLiteralNode(typeNode)) {
    for (const member of typeNode.members) {
      if (ts.isPropertySignature(member) && member.name) {
        const name = member.name.getText(sourceFile)
        const optional = !!member.questionToken
        const type = member.type ? member.type.getText(sourceFile) : 'any'

        props.push({ name, type, optional })
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

function extractPropertiesFromDeclaration(
  decl: ts.InterfaceDeclaration | ts.TypeAliasDeclaration,
  sourceFile: ts.SourceFile
): PropDefinition[] {
  const props: PropDefinition[] = []

  if (ts.isInterfaceDeclaration(decl)) {
    for (const member of decl.members) {
      if (ts.isPropertySignature(member) && member.name) {
        const name = member.name.getText(sourceFile)
        const optional = !!member.questionToken
        const type = member.type ? member.type.getText(sourceFile) : 'any'

        props.push({ name, type, optional })
      }
    }
  } else if (ts.isTypeAliasDeclaration(decl) && decl.type) {
    if (ts.isTypeLiteralNode(decl.type)) {
      for (const member of decl.type.members) {
        if (ts.isPropertySignature(member) && member.name) {
          const name = member.name.getText(sourceFile)
          const optional = !!member.questionToken
          const type = member.type ? member.type.getText(sourceFile) : 'any'

          props.push({ name, type, optional })
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
