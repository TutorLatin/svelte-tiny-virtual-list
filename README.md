<p align="center"><img src="./static/logo.svg" alt="Logo" width="225"></p>
<h2 align="center">@tutorlatin/svelte-tiny-virtual-list</h2>
<p align="center">A tiny but mighty list virtualization library, with zero dependencies &#128170;</p>
<p align="center">
  <a href="https://www.npmjs.com/package/@tutorlatin/svelte-tiny-virtual-list"><img src="https://img.shields.io/npm/v/@tutorlatin/svelte-tiny-virtual-list?style=for-the-badge" alt="NPM VERSION"></a>
  <a href="https://www.npmjs.com/package/@tutorlatin/svelte-tiny-virtual-list"><img src="https://img.shields.io/npm/dt/@tutorlatin/svelte-tiny-virtual-list?style=for-the-badge" alt="NPM DOWNLOADS"></a>
  <a href="https://www.npmjs.com/package/@tutorlatin/svelte-tiny-virtual-list"><img src="https://img.shields.io/librariesio/release/npm/@tutorlatin/svelte-tiny-virtual-list?style=for-the-badge" alt="DEPENDENCIES"></a>
</p>
<p align="center">
  <a href="#about">About</a> •
  <a href="#features">Features</a> •
  <a href="#installation">Installation</a> •
  <a href="#usage">Usage</a> •
  <a href="#examples--demo">Examples</a> •
  <a href="#license">License</a>
</p>

## About

Instead of rendering all your data in a huge list, the virtual list component just renders the items that are visible, keeping your page nice and light.  
This is heavily inspired by [react-tiny-virtual-list](https://github.com/clauderic/react-tiny-virtual-list) and uses most of its code and functionality!

This is a maintained fork of [svelte-tiny-virtual-list](https://github.com/jonasgeiler/svelte-tiny-virtual-list).

### Features

- **Tiny & dependency free** – Only ~5kb gzipped
- **Render millions of items**, without breaking a sweat
- **Scroll to index** or **set the initial scroll offset**
- **Supports fixed** or **variable** heights/widths
- **Vertical** or **Horizontal** lists
- [`svelte-infinite-loading`](https://github.com/jonasgeiler/svelte-infinite-loading) compatibility

## Installation

With [npm](https://www.npmjs.com/):

```shell
$ npm install @tutorlatin/svelte-tiny-virtual-list
```

With [yarn](https://yarnpkg.com/):

```shell
$ yarn add @tutorlatin/svelte-tiny-virtual-list
```

With [pnpm](https://pnpm.io/):

```shell
$ pnpm install @tutorlatin/svelte-tiny-virtual-list
```

## Usage

```svelte
<script>
	import VirtualList from '@tutorlatin/svelte-tiny-virtual-list';

	const data = ['A', 'B', 'C', 'D', 'E', 'F' /* ... */];
</script>

<VirtualList height={600} itemCount={data.length} itemSize={50}>
	{#snippet item({ style, index })}
		<div {style}>
			Letter: {data[index]}, Row: #{index}
		</div>
	{/snippet}
</VirtualList>
```

Also works pretty well with [`svelte-infinite-loading`](https://github.com/jonasgeiler/svelte-infinite-loading):

```svelte
<script>
	import VirtualList from '@tutorlatin/svelte-tiny-virtual-list';
	import InfiniteLoading from 'svelte-infinite-loading';

	let data = $state(['A', 'B', 'C', 'D', 'E', 'F' /* ... */]);

	function infiniteHandler({ detail: { complete, error } }) {
		try {
			// Normally you'd make an http request here...

			const newData = ['G', 'H', 'I', 'J', 'K', 'L' /* ... */];

			data = [...data, ...newData];
			complete();
		} catch (e) {
			error();
		}
	}
</script>

<VirtualList height={600} itemCount={data.length} itemSize={50}>
	{#snippet item({ style, index })}
		<div {style}>
			Letter: {data[index]}, Row: #{index}
		</div>
	{/snippet}

	{#snippet footer()}
		<div>
			<InfiniteLoading on:infinite={infiniteHandler} />
		</div>
	{/snippet}
</VirtualList>
```

### Props

<!-- prettier-ignore -->
| Property          | Type                                               | Default              | Description                                                                                                                                                                                                                     |
| ----------------- | -------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| itemCount         | `number`                                           | REQUIRED             | The number of items you want to render.                                                                                                                                                                                         |
| itemSize          | `number \| number[] \| (index: number) => number`  | REQUIRED             | Either a fixed height/width (depending on the `scrollDirection`), an array containing the heights of all the items in your list (**⚠ if passing an array, do not mutate in place: replace the array reference to trigger updates**), or a function that returns the height of an item given its index: `(index: number) => number`. |
| width             | `number \| string`                                 | `'100%'` | Width of the list view box. When `scrollDirection` is `'horizontal'`, this property determines the number of rendered items.                                                                   |
| height            | `number \| string`                                 | `'100%'` | Height of the list view box. When `scrollDirection` is `'vertical'`, this property determines the number of rendered items.                                                                    |
| scrollDirection   | `'vertical' \| 'horizontal'`                       | `'vertical'`         | Whether the list should scroll vertically or horizontally.                                                                                                                                                                      |
| scrollOffset      | `number`                                           | `0`                  | Used to control the scroll offset, but also useful for setting an initial scroll offset.                                                                                                                                        |
| scrollToIndex     | `number`                                           | `-1`                 | Item index to scroll to (by forcefully scrolling if necessary).                                                                                                                                                                 |
| scrollToAlignment | `'start' \| 'center' \| 'end' \| 'auto'`           | `'start'`            | Used in combination with `scrollToIndex`, this prop controls the alignment of the scrolled to item. Use `'auto'` to scroll the least amount required to ensure that the specified `scrollToIndex` item is fully visible.        |
| scrollToBehaviour | `'smooth' \| 'instant' \| 'auto'`                  | `'instant'`          | Used in combination with `scrollToIndex`, this prop controls the behaviour of the scrolling. See: [Element: scroll() method - Web APIs                                                                                          | MDN](https://developer.mozilla.org/en-US/docs/Web/API/Element/scroll#behavior). |
| stickyIndices     | `number[]`                                         | `[]`                 | An array of indexes (eg. `[0, 10, 25, 30]`) to make certain items in the list sticky (`position: sticky`)                                                                                                                       |
| overscanCount     | `number`                                           | `3`                  | Number of extra buffer items to render above/below the visible items. Tweaking this can help reduce scroll flickering on certain browsers/devices.                                                                              |
| estimatedItemSize | `number`                                           | `0`                  | Used to estimate the total size of the list before all of its items have actually been measured. The estimated total height is progressively adjusted as items are rendered.                                                    |
| getKey            | `((index: number) => any) \| null`                 | `undefined`          | Function that returns the key of an item in the list, which is used to uniquely identify an item. This is useful for dynamic data coming from a database or similar. By default, it's using the item's index.                   |
| onAfterScroll     | `({ event: ScrollEvent, offset: number }) => void` | `undefined`          | Function that fires after handling the scroll event. Props: `event: ScrollEvent` - The original scroll event, `offset: number` - Either the value of `wrapper.scrollTop` or `wrapper.scrollLeft`                                |
| onListItemsUpdate | `({ start: number, end: number }) => void`         | `undefined`          | Function that fires when the visible items are updated. Props: `start: number` - Index of the first visible item, `end: number` - Index of the last visible item.                                                               |

### Snippets

- `item` - Snippet for each item
  - Prop: `{ index, style }`
    - `index: number` - Item index
    - `style: string` - Item style, must be applied to the snippet (look above for example)
- `header` - Snippet for the elements that should appear at the top of the list
- `footer` - Snippet for the elements that should appear at the bottom of the list (e.g. `InfiniteLoading` component from `svelte-infinite-loading`)

### Styling

You can style the elements of the virtual list like this:

```svelte
<script>
	import VirtualList from '@tutorlatin/svelte-tiny-virtual-list';

	const data = ['A', 'B', 'C', 'D', 'E', 'F' /* ... */];
</script>

<div class="list">
	<VirtualList height={600} itemCount={data.length} itemSize={50}>
		{#snippet item({ style, index })}
			<div {style}>
				Letter: {data[index]}, Row: #{index}
			</div>
		{/snippet}
	</VirtualList>
</div>

<style>
	.list :global(.virtual-list-wrapper) {
		background-color: yellow;
		/* ... */
	}

	.list :global(.virtual-list-inner) {
		background-color: red;
		/* ... */
	}

	.list {
		--virtual-list-sticky-bg: red;
	}
</style>
```

## Examples / Demo

- **Basic setup**
  - [Elements of equal height](https://svelte.dev/playground/59a98b2a0b53421e8fce3df8e66f5e3b)
  - [Variable heights](https://svelte.dev/playground/51952d1becb345c18154a0a61106617f)
  - [Horizontal list](https://svelte.dev/playground/d1ca5e2462cf46d5966c98c2cbf80be5)
- **Controlled props**
  - [Scroll to index](https://svelte.dev/playground/8610d15e77d34667a65d981b9327a7ad)
  - [Controlled scroll offset](https://svelte.dev/playground/39452c8fe30b4f618760a1198f6b9769)
- [Hacker News using svelte-infinite-loading](https://svelte.dev/playground/6719ab725cfd440b9bd3cfa9b85d9d3a)

## License

[MIT License](https://github.com/jonasgeiler/svelte-tiny-virtual-list/blob/main/LICENSE.md)
