import { readFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'

export interface BlockMetadata {
  name?: string
  description?: string
}

export function parseFrontmatter(content: string): { frontmatter: Record<string, string>, content: string } {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/
  const match = content.match(frontmatterRegex)

  if (!match) {
    return { frontmatter: {}, content }
  }

  const frontmatterText = match[1]
  const remainingContent = match[2]

  const frontmatter: Record<string, string> = {}
  const lines = frontmatterText.split('\n')

  for (const line of lines) {
    const colonIndex = line.indexOf(':')
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim()
      const value = line.slice(colonIndex + 1).trim()
      // Remove quotes if present
      frontmatter[key] = value.replace(/^["']|["']$/g, '')
    }
  }

  return { frontmatter, content: remainingContent }
}

export function extractMarkdownMetadata(content: string): BlockMetadata {
  const lines = content.trim().split('\n')
  let name: string | undefined
  let description: string | undefined

  // Look for first heading
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()

    if (line.startsWith('#')) {
      // Found a heading - extract the name
      name = line.replace(/^#+\s*/, '').trim()

      // Look for the first non-empty paragraph after the heading
      for (let j = i + 1; j < lines.length; j++) {
        const nextLine = lines[j].trim()

        // Skip empty lines
        if (!nextLine) continue

        // Skip if it's another heading
        if (nextLine.startsWith('#')) break

        // Found a paragraph - this is the description
        description = nextLine
        break
      }

      break
    }
  }

  return { name, description }
}

export async function parseReadmeMetadata(dirPath: string): Promise<BlockMetadata> {
  const readmePath = join(dirPath, 'README.md')

  if (!existsSync(readmePath)) {
    return {}
  }

  try {
    const content = await readFile(readmePath, 'utf-8')
    const { frontmatter, content: remainingContent } = parseFrontmatter(content)

    let name: string | undefined = frontmatter.name
    let description: string | undefined = frontmatter.description

    // If name or description is missing from frontmatter, extract from markdown
    if (!name || !description) {
      const markdownMetadata = extractMarkdownMetadata(remainingContent)
      name = name || markdownMetadata.name
      description = description || markdownMetadata.description
    }

    const result: BlockMetadata = {}
    if (name) result.name = name
    if (description) result.description = description
    return result
  } catch (error) {
    console.error(`Error parsing README.md at ${readmePath}:`, error)
    return {}
  }
}
