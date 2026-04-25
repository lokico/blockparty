# Block Party

[![NPM Version](https://img.shields.io/npm/v/blockparty)](https://www.npmjs.com/package/blockparty)

Easy, zero-config, convention-based React components.

## Hello, World

A component in Block Party is called a Block. Here is a simple Block:

```tsx
export function Hello({ who }: { who: string }) {
  return <h1>Hello, {who}!</h1>
}
```

Paste the above into any `.tsx` file and you've just created your first Block! Block Party will find any exported function component whose name starts with a capital letter and returns JSX — no special file naming required.

A single file can contain multiple Blocks:

```tsx
export function Hello({ who }: { who: string }) {
  return <h1>Hello, {who}!</h1>
}

export function Goodbye({ who }: { who: string }) {
  return <h1>Goodbye, {who}!</h1>
}
```

Default exports work too:

```tsx
export default function Hello({ who }: { who: string }) {
  return <h1>Hello, {who}!</h1>
}
```

## Storybook

### Run the Storybook

Block Party includes a storybook-style UI for quick previews of your Blocks.

Just run `npx blockparty` from the directory containing your `.tsx` files, or from a root directory to search recursively. The preview will automatically update if changes are made to any of the Blocks' source code.

### Publish the Storybook

You may want to publish a static site build of the storybook UI, for instance during a CI run on a git repo.

To create a static site build of the storybook, run `npx blockparty build` from the root.

By default, the output goes into a `dist` directory, but you can specify a different path on the command line. For instance, if you are using GitHub Pages, you may want to put it in the `docs` directory:

```
npx blockparty build . docs
```

## Metadata

If a directory contains a file named `index.tsx`, a `README.md` in the same directory can provide metadata for the Blocks in that file. Frontmatter can be added to the beginning of the README:

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

```tsx
interface Props {
  /** The person's name to greet */
  who: string
  /** Optional greeting message (default: 'Hello') */
  greeting?: string
}

export function Hello({ who, greeting = 'Hello' }: Props) {
  return <h1>{greeting}, {who}!</h1>
}
```

## Styling

The easiest way to style your Block is to just put styles right in the code:

```tsx
export function Hello({ who, greeting = 'Hello' }: { who: string, greeting?: string }) {
  const headingStyle: React.CSSProperties = {
    fontSize: '24px',
    color: '#111827',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  }
  return <h1 style={headingStyle}>{greeting}, {who}!</h1>
}
```

You can also use a CSS module, which is a CSS file ending in `.module.css`.

```css
.heading {
  font-size: 24px;
  color: #111827;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}
```

For instance, if you name the above `styles.module.css`, you can import it in your code like so:

```tsx
import styles from './styles.module.css'

export function Hello({ who, greeting = 'Hello' }: { who: string, greeting?: string }) {
  return <h1 className={styles.heading}>{greeting}, {who}!</h1>
}
```

## Hacking on Block Party

### Running the CLI

To run the Block Party CLI command (e.g. `npx blockparty`) from within the git checkout, run:

```
npm run cli -- ...
```
Where everything after the hypens are arguments to the Block Party CLI.

### Running the tests

```
npm test
```

### Preparing a release

1. Bump the version:
```
npm version patch|minor|major
```

2. Push the new git tag:
```
git push --tags
```

3. Publish to NPM:
```
npm publish
```