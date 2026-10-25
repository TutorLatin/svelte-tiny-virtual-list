<script>
	import { untrack } from 'svelte';
	import VirtualList from '../lib/VirtualList.svelte';

	/** @import { VirtualListProps } from '../lib/types.js' */
	/** @typedef {{ label: string }} Row */

	/** @type {{ initialOptions?: Partial<VirtualListProps>; headerHeight?: number; initialRows?: Row[] }} */
	let { initialOptions = {}, headerHeight = 0, initialRows } = $props();

	let rows = $state.raw(untrack(() => initialRows));

	/** @type {VirtualListProps} */
	let options = $state.raw(
		untrack(() => ({
			height: 200,
			width: 300,
			itemCount: initialRows?.length ?? 100,
			itemSize: 20,
			...initialOptions
		}))
	);

	/** @param {Partial<VirtualListProps>} next */
	export function updateOptions(next) {
		options = { ...options, ...next };
	}

	/** @param {Row[]} next */
	export function replaceRows(next) {
		rows = next;
		options = { ...options, itemCount: next.length };
	}
</script>

<VirtualList {...options}>
	{#snippet header()}
		{#if headerHeight > 0}
			<div style:height="{headerHeight}px">List header</div>
		{/if}
	{/snippet}
	{#snippet item({ index, style })}
		<div data-index={index} {style}>
			{#if rows}{rows[index].label}{:else}Item {index}{/if}
		</div>
	{/snippet}
</VirtualList>
