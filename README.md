# Block Party

Convention-based web components with optional bridging to native code for use in a web view.

## Hello, World

A component in Block Party is called a Block. A Block is defined by convention, with the simplest Block being an `index.tsx` file with an exported `Props` interface and a default exported function that takes the props and returns a React component:

```typescript
export interface Props {
	who: string
}

export default ({ who }: Props) => (
	<h1>Hello, {who}!</h1>
)
```

Run `npx blockparty` to start a storybook where you can see your component and play with entering different values for `who`!

## Block Metadata

Each Block can have a `README.md` file in its directory to provide additional metadata. Block Party will extract the name and description from the README in two ways:

### Using Frontmatter

Add YAML frontmatter at the top of your README:

```markdown
---
name: My Component
description: A brief description of what this component does
---

# Detailed documentation...
```

### Using Markdown Structure

If frontmatter is not present (or missing the `name` or `description` fields), Block Party will extract metadata from the markdown structure:

- **Name**: The first heading (`# Heading`) in the document
- **Description**: The first paragraph of text after the heading

For example:

```markdown
# Big Numbers

Display large numerical values with formatting and animations.

## Usage

...
```

In this case, the name will be "Big Numbers" and the description will be "Display large numerical values with formatting and animations."

The description will be displayed in the storybook UI when you select the block.

