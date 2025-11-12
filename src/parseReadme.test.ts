import { test, describe } from 'node:test'
import assert from 'node:assert'
import { parseFrontmatter, extractMarkdownMetadata } from './parseReadme.js'

describe('parseFrontmatter', () => {
  test('extracts frontmatter and remaining content', () => {
    const content = `---
name: Big Numbers
description: Display large numbers
---

# Heading

Content here`

    const result = parseFrontmatter(content)

    assert.strictEqual(result.frontmatter.name, 'Big Numbers')
    assert.strictEqual(result.frontmatter.description, 'Display large numbers')
    assert.strictEqual(result.content.trim(), '# Heading\n\nContent here')
  })

  test('handles frontmatter with quoted values', () => {
    const content = `---
name: "My Component"
description: 'A cool component'
---

Content`

    const result = parseFrontmatter(content)

    assert.strictEqual(result.frontmatter.name, 'My Component')
    assert.strictEqual(result.frontmatter.description, 'A cool component')
  })

  test('returns empty frontmatter when no frontmatter present', () => {
    const content = `# Heading

Just some content without frontmatter`

    const result = parseFrontmatter(content)

    assert.deepStrictEqual(result.frontmatter, {})
    assert.strictEqual(result.content, content)
  })

  test('handles frontmatter with multiple properties', () => {
    const content = `---
name: Component
description: A description
author: John Doe
version: 1.0.0
---

Content`

    const result = parseFrontmatter(content)

    assert.strictEqual(result.frontmatter.name, 'Component')
    assert.strictEqual(result.frontmatter.description, 'A description')
    assert.strictEqual(result.frontmatter.author, 'John Doe')
    assert.strictEqual(result.frontmatter.version, '1.0.0')
  })

  test('handles empty frontmatter', () => {
    const content = `---

---

Content`

    const result = parseFrontmatter(content)

    assert.deepStrictEqual(result.frontmatter, {})
    assert.strictEqual(result.content, 'Content')
  })
})

describe('extractMarkdownMetadata', () => {
  test('extracts name from first heading and description from first paragraph', () => {
    const content = `# Big Numbers

Display large numerical values with formatting

Additional content here`

    const result = extractMarkdownMetadata(content)

    assert.strictEqual(result.name, 'Big Numbers')
    assert.strictEqual(result.description, 'Display large numerical values with formatting')
  })

  test('handles h2 headings', () => {
    const content = `## Component Name

This is the description`

    const result = extractMarkdownMetadata(content)

    assert.strictEqual(result.name, 'Component Name')
    assert.strictEqual(result.description, 'This is the description')
  })

  test('handles headings with multiple hash marks', () => {
    const content = `#### Deep Heading

Description text`

    const result = extractMarkdownMetadata(content)

    assert.strictEqual(result.name, 'Deep Heading')
    assert.strictEqual(result.description, 'Description text')
  })

  test('skips empty lines between heading and description', () => {
    const content = `# Component


Description after blank lines`

    const result = extractMarkdownMetadata(content)

    assert.strictEqual(result.name, 'Component')
    assert.strictEqual(result.description, 'Description after blank lines')
  })

  test('returns undefined when no heading present', () => {
    const content = `Just some text without a heading`

    const result = extractMarkdownMetadata(content)

    assert.strictEqual(result.name, undefined)
    assert.strictEqual(result.description, undefined)
  })

  test('returns undefined description when no paragraph after heading', () => {
    const content = `# Component Name

## Another Heading`

    const result = extractMarkdownMetadata(content)

    assert.strictEqual(result.name, 'Component Name')
    assert.strictEqual(result.description, undefined)
  })

  test('handles heading-only content', () => {
    const content = `# Lonely Heading`

    const result = extractMarkdownMetadata(content)

    assert.strictEqual(result.name, 'Lonely Heading')
    assert.strictEqual(result.description, undefined)
  })

  test('handles content with leading whitespace', () => {
    const content = `

# Heading with Space

Description with space
`

    const result = extractMarkdownMetadata(content)

    assert.strictEqual(result.name, 'Heading with Space')
    assert.strictEqual(result.description, 'Description with space')
  })

  test('stops at next heading when looking for description', () => {
    const content = `# First Heading

## Second Heading

This should not be the description`

    const result = extractMarkdownMetadata(content)

    assert.strictEqual(result.name, 'First Heading')
    assert.strictEqual(result.description, undefined)
  })
})
