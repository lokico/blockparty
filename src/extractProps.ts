import { readFile } from 'fs/promises'
import * as ts from 'typescript'

export interface PropDefinition {
  name: string
  type: string
  optional: boolean
}

export function extractPropsFromSource(content: string, fileName: string = 'source.tsx'): PropDefinition[] {
  const sourceFile = ts.createSourceFile(
    fileName,
    content,
    ts.ScriptTarget.Latest,
    true
  )

  let propsInterface: ts.InterfaceDeclaration | ts.TypeAliasDeclaration | null = null
  const exportedTypes: (ts.InterfaceDeclaration | ts.TypeAliasDeclaration)[] = []

  function visit(node: ts.Node) {
    // Look for exported interfaces or type aliases
    if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) {
      const isExported = node.modifiers?.some(
        mod => mod.kind === ts.SyntaxKind.ExportKeyword
      )

      if (isExported) {
        exportedTypes.push(node)

        // If it's named "Props", use it
        if (node.name.text === 'Props') {
          propsInterface = node
        }
      }
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)

  // If no "Props" interface found but only one exported type, use that
  if (!propsInterface && exportedTypes.length === 1) {
    propsInterface = exportedTypes[0]
  }

  if (!propsInterface) {
    return []
  }

  const props: PropDefinition[] = []

  // Extract properties from interface or type alias
  if (ts.isInterfaceDeclaration(propsInterface)) {
    for (const member of propsInterface.members) {
      if (ts.isPropertySignature(member) && member.name) {
        const name = member.name.getText(sourceFile)
        const optional = !!member.questionToken
        const type = member.type ? member.type.getText(sourceFile) : 'any'

        props.push({ name, type, optional })
      }
    }
  } else if (ts.isTypeAliasDeclaration(propsInterface) && propsInterface.type) {
    const typeNode = propsInterface.type

    if (ts.isTypeLiteralNode(typeNode)) {
      for (const member of typeNode.members) {
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

export async function extractPropsFromFile(filePath: string): Promise<PropDefinition[]> {
  try {
    const content = await readFile(filePath, 'utf-8')
    return extractPropsFromSource(content, filePath)
  } catch (error) {
    console.error(`Error extracting props from ${filePath}:`, error)
    return []
  }
}
