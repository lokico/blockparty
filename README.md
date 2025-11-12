# Block Party

Convention-based web components with optional bridging to native code for use in a web view.

## Hello, World

A component in Block Party is called a Block. A Block is defined by convention, with the simplest Block being an `index.ts` file with an exported `Props` interface and a default exported function that takes the props and returns TSX:

```typescript
export interface Props {
	who: string
}

export default ({ who }: Props) => (
	<h1>Hello, {who}!</h1>
)
```

Run `npx blockparty` to start a storybook where you can see your component and play with entering different values for `who`!

