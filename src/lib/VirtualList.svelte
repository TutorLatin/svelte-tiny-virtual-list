<script>
	import { tick, untrack } from 'svelte';
	import SizeAndPositionManager from './SizeAndPositionManager.js';
	import {
		DIRECTION,
		SCROLL_CHANGE_REASON,
		SCROLL_PROP,
		SCROLL_PROP_LEGACY,
		DEFAULTS
	} from './constants.js';
	import { ListState } from './utils/ListState.svelte.js';
	import { useDebounce } from './utils/useDebounce.js';

	/** @import { VirtualListProps, VirtualListEvents, VirtualListSnippets, Alignment } from './types.js'; */
	/** @typedef {{ index: number, style: string }} RenderedItem */
	/** @type {VirtualListProps & VirtualListEvents & VirtualListSnippets} */
	let {
		height = DEFAULTS.height.external,
		width = DEFAULTS.width.external,
		itemCount,
		itemSize,
		estimatedItemSize = DEFAULTS.estimatedItemSize,
		stickyIndices = DEFAULTS.stickyIndices,
		getKey,
		scrollDirection = DEFAULTS.scrollDirection,
		scrollOffset = DEFAULTS.scrollOffset,
		scrollToIndex = DEFAULTS.scrollToIndex,
		scrollToAlignment = DEFAULTS.scrollToAlignment,
		scrollToBehaviour = DEFAULTS.scrollToBehaviour,
		overscanCount = DEFAULTS.overscanCount,
		onItemsUpdated: handleItemsUpdated,
		onListItemsUpdate: handleListItemsUpdate, // DEPRECATED
		onAfterScroll: handleAfterScroll,
		item: itemSnippet,
		children: childrenSnippet, // DEPRECATED
		header: headerSnippet,
		footer: footerSnippet
	} = $props();

	const debounceRefresh = useDebounce();
	/** @type {HTMLDivElement} */
	let wrapper;
	/** @type {HTMLDivElement} */
	let inner;
	/** @type {HTMLDivElement} */
	let header;
	/** @type {Record<number, RenderedItem>} */
	let itemCache = {};
	/** @type {{ start?: number, end?: number } | null} */
	let renderedRange = null;
	/** @type {Set<number>} */
	let stickySet = new Set();
	let wrapperStyle = $state('');
	let innerStyle = $state('');
	/** @type {RenderedItem[]} */
	let items = $state.raw([]);

	const _state = new ListState();
	const sizeAndPositionManager = untrack(
		() => new SizeAndPositionManager(itemSize, itemCount, estimatedItemSize)
	);

	/** @typedef {{ index: number, align: Alignment } | { offset: number }} ScrollRequest */
	/** @type {ScrollRequest | null} */
	let pendingScroll = null;
	let updateVersion = 0;
	let destroyed = false;
	let lastTs = 0;
	let lastOffset = 0;
	let velocityPxPerMs = 0;
	const VELOCITY_ALPHA = 0.4;
	const MAX_OVERSCAN_BOOST = 20;
	let viewportSize = 0;
	let listOffset = 0;

	const computeDynamicOverscan = () =>
		Math.max(0, overscanCount) + Math.min(MAX_OVERSCAN_BOOST, Math.round(velocityPxPerMs * 8));
	const getWrapperOffset = () => wrapper[SCROLL_PROP_LEGACY[scrollDirection]];
	const measureLayout = () => {
		const previousViewport = viewportSize;
		const previousOffset = listOffset;
		viewportSize =
			scrollDirection === DIRECTION.VERTICAL ? wrapper.clientHeight : wrapper.clientWidth;
		const outer = wrapper.getBoundingClientRect();
		const content = inner.getBoundingClientRect();
		listOffset =
			scrollDirection === DIRECTION.VERTICAL
				? content.top - outer.top + wrapper.scrollTop - wrapper.clientTop
				: content.left - outer.left + wrapper.scrollLeft - wrapper.clientLeft;
		// Recheck position each frame: CSS margins can move the list without a resize event.
		return viewportSize !== previousViewport || listOffset !== previousOffset;
	};

	/** @param {number} index */
	const getItem = (index) => {
		const cached = itemCache[index];
		if (cached) return cached;
		const { size, offset } = sizeAndPositionManager.getSizeAndPositionForIndex(index);
		const sticky = stickySet.has(index);
		let style;
		if (scrollDirection === DIRECTION.VERTICAL) {
			style = `left:0;width:100%;height:${size}px;`;
			style += sticky
				? `position:sticky;flex-grow:0;z-index:2;top:0;margin-top:${offset}px;margin-bottom:${-(offset + size)}px;`
				: `position:absolute;top:${offset}px;`;
		} else {
			style = `top:0;width:${size}px;`;
			style += sticky
				? `position:sticky;flex-shrink:0;z-index:2;left:0;margin-left:${offset}px;margin-right:${-(offset + size)}px;`
				: `position:absolute;height:100%;left:${offset}px;`;
		}
		if (sticky)
			style += 'background:var(--virtual-list-sticky-bg, inherit);transform:translateZ(0);';
		return { index, style };
	};

	/** @param {number} offset */
	const refresh = (offset) => {
		const visibleSize = Math.max(0, viewportSize - Math.max(0, listOffset - offset));
		const range =
			visibleSize > 0
				? sizeAndPositionManager.getVisibleRange(
						visibleSize,
						Math.max(0, offset - listOffset),
						computeDynamicOverscan()
					)
				: {};
		if (!renderedRange || range.start !== renderedRange.start || range.end !== renderedRange.end) {
			/** @type {RenderedItem[]} */
			const next = [];
			/** @type {Record<number, RenderedItem>} */
			const nextCache = {};
			for (const index of stickySet) {
				const item = getItem(index);
				next.push(item);
				nextCache[index] = item;
			}
			if (range.start !== undefined && range.end !== undefined) {
				for (let index = range.start; index <= range.end; index++) {
					if (stickySet.has(index)) continue;
					const item = getItem(index);
					next.push(item);
					nextCache[index] = item;
				}
			}
			// Keep descriptor identity for overlapping rows, and retain only the current window.
			itemCache = nextCache;
			renderedRange = range;
			if (next.length !== items.length || next.some((item, index) => item !== items[index])) {
				items = next;
			}
		}
		// Reading and styling rows may measure additional callback-sized items.
		const totalSize = sizeAndPositionManager.getTotalSize();
		const style =
			scrollDirection === DIRECTION.VERTICAL
				? `flex-direction:column;height:${totalSize}px;`
				: `min-height:100%;width:${totalSize}px;`;
		const extentChanged = innerStyle !== style;
		if (extentChanged) innerStyle = style;
		if (range.start !== undefined && range.end !== undefined) {
			handleItemsUpdated?.({ start: range.start, end: range.end });
			handleListItemsUpdate?.({ start: range.start, end: range.end });
		}
		return extentChanged;
	};

	/** @param {number} index @param {Alignment} align */
	const getOffsetForIndex = (index, align) => {
		index = Math.min(index, itemCount - 1);
		const datum = sizeAndPositionManager.getSizeAndPositionForIndex(index);
		// Measure enough rows after the target to align it even with a zero estimate.
		sizeAndPositionManager.getVisibleRange(viewportSize, datum.offset, computeDynamicOverscan());
		const start = listOffset + datum.offset;
		const end = start - viewportSize + datum.size;
		switch (align) {
			case 'end':
				return Math.max(0, end);
			case 'center':
				return Math.max(0, start - (viewportSize - datum.size) / 2);
			case 'auto':
				return Math.max(0, Math.max(end, Math.min(start, getWrapperOffset())));
			default:
				return Math.max(0, start);
		}
	};

	/** @param {number} value */
	const scrollTo = (value) => {
		try {
			wrapper.scroll({ [SCROLL_PROP[scrollDirection]]: value, behavior: scrollToBehaviour });
		} catch {
			wrapper[SCROLL_PROP_LEGACY[scrollDirection]] = value;
		}
	};

	/** @param {number} version */
	const update = async (version) => {
		const request = pendingScroll;
		const layoutChanged = measureLayout();
		let target;
		if (itemCount > 0 && viewportSize > 0) {
			// Bootstrap a lazily sized list before it has any measured extent.
			if (sizeAndPositionManager.getTotalSize() === 0) {
				sizeAndPositionManager.getVisibleRange(viewportSize, 0, computeDynamicOverscan());
			}
			if (request) {
				target =
					'index' in request
						? getOffsetForIndex(request.index, request.align)
						: Math.max(0, request.offset);
				sizeAndPositionManager.getVisibleRange(
					viewportSize,
					Math.max(0, target - listOffset),
					computeDynamicOverscan()
				);
			}
		}
		const extentChanged = refresh(getWrapperOffset());
		if (!request && !layoutChanged && !extentChanged) return;
		// The spacer and row styles must be in the DOM before the browser can scroll.
		await tick();
		if (destroyed || version !== updateVersion) return;
		let appliedRequest = false;
		if (target !== undefined && request === pendingScroll) {
			appliedRequest = true;
			pendingScroll = null;
			scrollTo(target);
		}
		const offset = getWrapperOffset();
		if (appliedRequest || offset !== _state.offset) {
			_state.setScrollOffset(offset, SCROLL_CHANGE_REASON.OBSERVED);
			refresh(offset);
		}
	};

	const scheduleUpdate = () => {
		const version = ++updateVersion;
		debounceRefresh.start(() => {
			void update(version);
		});
	};

	/** @param {Event} event */
	const handleScroll = (event) => {
		const offset = getWrapperOffset();
		if (offset < 0 || offset === _state.offset || event.target !== wrapper) return;
		const now = performance.now();
		const dt = now - lastTs || 16;
		velocityPxPerMs =
			(VELOCITY_ALPHA * Math.abs(offset - lastOffset)) / dt +
			(1 - VELOCITY_ALPHA) * velocityPxPerMs;
		lastTs = now;
		lastOffset = offset;
		_state.setScrollOffset(offset, SCROLL_CHANGE_REASON.OBSERVED);
		// Observed offsets only refresh rows; they must never start another scroll.
		scheduleUpdate();
		handleAfterScroll?.({ offset, event });
	};

	/** @type {{itemCount: number, itemSize: import('./types.js').ItemSize, estimatedItemSize: number, height: number | string, width: number | string, scrollDirection: import('./types.js').Direction, stickyIndices: number[], scrollToIndex: number, scrollToAlignment: Alignment, scrollOffset: number} | undefined} */
	let previous;
	$effect(() => {
		const current = {
			itemCount,
			itemSize,
			estimatedItemSize,
			height,
			width,
			scrollDirection,
			stickyIndices,
			scrollToIndex,
			scrollToAlignment,
			scrollOffset
		};
		overscanCount;
		untrack(() => {
			const configChanged =
				!previous ||
				itemCount !== previous.itemCount ||
				itemSize !== previous.itemSize ||
				estimatedItemSize !== previous.estimatedItemSize;
			const axisChanged = !!previous && scrollDirection !== previous.scrollDirection;
			const layoutChanged =
				configChanged || axisChanged || height !== previous?.height || width !== previous?.width;
			if (configChanged && previous)
				sizeAndPositionManager.updateConfig(itemSize, itemCount, estimatedItemSize);
			if (configChanged || axisChanged || stickyIndices !== previous?.stickyIndices) {
				if (
					itemSize !== previous?.itemSize ||
					axisChanged ||
					stickyIndices !== previous?.stickyIndices
				) {
					itemCache = {};
				}
				renderedRange = null;
				stickySet = new Set(
					stickyIndices.filter(
						(index) => Number.isInteger(index) && index >= 0 && index < itemCount
					)
				);
			}
			wrapperStyle = `height:${height}${typeof height === 'number' ? 'px' : ''};width:${width}${typeof width === 'number' ? 'px' : ''};`;
			const indexChanged =
				scrollToIndex !== previous?.scrollToIndex ||
				scrollToAlignment !== previous?.scrollToAlignment;
			if (
				Number.isInteger(scrollToIndex) &&
				scrollToIndex >= 0 &&
				(indexChanged || layoutChanged)
			) {
				pendingScroll = { index: scrollToIndex, align: scrollToAlignment };
			} else if (
				!previous ||
				scrollOffset !== previous.scrollOffset ||
				(previous.itemCount === 0 && itemCount > 0)
			) {
				pendingScroll = Number.isFinite(scrollOffset) ? { offset: scrollOffset } : null;
			} else if (indexChanged) {
				pendingScroll = null;
			} else if (axisChanged) {
				pendingScroll = { offset: _state.offset };
			}
			previous = current;
			scheduleUpdate();
		});
	});

	$effect(() => {
		destroyed = false;
		wrapper.addEventListener('scroll', handleScroll, { passive: true });
		const observer =
			typeof ResizeObserver !== 'undefined'
				? new ResizeObserver(() => scheduleUpdate())
				: undefined;
		observer?.observe(wrapper);
		observer?.observe(header);
		return () => {
			destroyed = true;
			updateVersion++;
			wrapper.removeEventListener('scroll', handleScroll);
			observer?.disconnect();
			debounceRefresh.stop();
		};
	});
</script>

<div bind:this={wrapper} class="virtual-list-wrapper" style={wrapperStyle}>
	<div bind:this={header} class="virtual-list-header">
		{#if headerSnippet}{@render headerSnippet()}{/if}
	</div>

	<div bind:this={inner} class="virtual-list-inner" style={innerStyle}>
		{#each items.filter((item) => item.index < itemCount) as item (getKey ? getKey(item.index) : item.index)}
			{@render (childrenSnippet || itemSnippet)({ style: item.style, index: item.index })}
		{/each}
	</div>

	{#if footerSnippet}
		{@render footerSnippet()}
	{/if}
</div>

<style>
	.virtual-list-wrapper {
		overflow: auto;
		will-change: transform;
		-webkit-overflow-scrolling: touch;
		contain: layout paint;
	}

	.virtual-list-inner {
		position: relative;
		display: flex;
		width: 100%;
		contain: layout paint;
	}
</style>
