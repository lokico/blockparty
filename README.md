# Block Party

Easy, zero-config, convention-based React components.

## Hello, World

A component in Block Party is called a Block. Here is a simple Block:

```typescript
export interface Props {
	who: string
}

export default ({ who }: Props) => (
	<h1>Hello, {who}!</h1>
)
```

Create a new directory and paste the above into a file called `index.tsx`. You've just created your first Block!

### Run the Storybook

Block Party includes a storybook-style UI for quick previews of your Blocks.

Just run `npx blockparty` in the directory with your Block. The preview will automatically update if changes are made to the Block's source code.

### Publish the Storybook

You may want to publish a static site build of the storybook UI, for instance during a CI run on a git repo.

To create a static site build of the storybook, run `npx blockparty build` from the root (where each block is in a different subdirectory).

By default, the output goes into a `dist` directory, but you can specify a different path on the command line. For instance, if you are using GitHub Pages, you may want to put it in the `docs` directory:

```
npx blockparty build . docs
```

## Metadata

If the Block has a `README.md` file in its directory, frontmatter can be added to the beginning of the file to provide metadata:

```markdown
---
name: Hello Component
description: Greets whomever is specified.
foo: bar
...

---

# Detailed documentation...

Blah blah blah
```

If the `name` or `description` fields are not present in the frontmatter, Block Party will extract them from the README content:

- **Name**: The first heading (`# Heading`) in the document
- **Description**: The first paragraph of text after the heading

For example:

```markdown
# Hello Component

Greets whomever is specified.

## Usage

...
```

Both of the above `README.md` files will yield the name, "Hello Component" and description, "Greets whomever is specified."

The name and description are displayed in the storybook UI.

## Documenting Props

You can add JSDoc comments to your props to provide helpful descriptions in the storybook UI:

```typescript
export interface Props {
  /**
   * The person's name to greet
   */
  who: string

  /**
   * Optional greeting message (default: 'Hello')
   */
  greeting?: string
}

export default ({ who, greeting = 'Hello' }: Props) => (
  <h1>{greeting}, {who}!</h1>
)
```


