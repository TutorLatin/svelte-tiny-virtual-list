<script>
	import { untrack } from 'svelte';
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

	/** @import { VirtualListProps, VirtualListEvents, VirtualListSnippets } from './types.js'; */

	/** @type {VirtualListProps & VirtualListEvents & VirtualListSnippets} */
	let {
		/* Props: */

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

		/* Events: */

		onItemsUpdated: handleItemsUpdated,
		onListItemsUpdate: handleListItemsUpdate, // DEPRECATED

		onAfterScroll: handleAfterScroll,

		/* Snippets: */

		item: itemSnippet,
		children: childrenSnippet, // DEPRECATED

		header: headerSnippet,
		footer: footerSnippet
	} = $props();

	/** @type {ReturnType<typeof useDebounce>} */
	const debounceRecomputeSizes = useDebounce();
	/** @type {ReturnType<typeof useDebounce>} */
	const debounceUpdateConfig = useDebounce();
	/** @type {ReturnType<typeof useDebounce>} */
	const debounceRefresh = useDebounce();

	/** @type {HTMLDivElement} */
	let wrapper;
	/** @type {Record<number, string>} */
	let styleCache = {};
	/** @type {Set<number>|null} */
	let stickySet = null;
	/** @type {ResizeObserver|undefined} */
	let ro;

	/** @type {string} */
	let wrapperStyle = $state('');
	/** @type {string} */
	let innerStyle = $state('');
	/** @type {number} */
	let wrapperHeight = $state(400);
	/** @type {number} */
	let wrapperWidth = $state(400);
	/** @type {number} */
	let totalSize = $state(0);

	/** @type {{ index: number, style: string, sticky?: boolean }[]} */
	let items = $state.raw([]);

	/** @type {ListState} */
	const _state = new ListState(scrollOffset || 0, width, height);

	/** @type {SizeAndPositionManager} */
	const sizeAndPositionManager = new SizeAndPositionManager(itemSize, itemCount, estimatedItemSize);

	// Velocity-aware overscan
	/** @type {number} */
	let lastTs = 0;
	/** @type {number} */
	let lastOffset = 0;
	/** @type {number} */
	let velocityPxPerMs = 0;
	/** @type {number} */
	const VELOCITY_ALPHA = 0.4;
	/** @type {number} */
	const MAX_OVERSCAN_BOOST = 20;

	const computeDynamicOverscan = () => {
		const boost = Math.min(MAX_OVERSCAN_BOOST, Math.round(velocityPxPerMs * 8));
		return overscanCount + (boost | 0);
	};

	/**
	 * Recomputes the visible items.
	 */
	const refresh = () => {
		const viewSize = scrollDirection === DIRECTION.VERTICAL ? _state.height : _state.width;
		const dynOverscan = computeDynamicOverscan();
		const { start, end } = sizeAndPositionManager.getVisibleRange(
			viewSize,
			_state.offset,
			dynOverscan
		);

		/** @type {{ index: number, style: string, sticky?: boolean }[]} */
		const next = [];

		if (stickySet) {
			for (const index of stickySet) {
				next.push({ index, style: getStyle(index, true), sticky: true });
			}
		}

		if (start !== undefined && end !== undefined) {
			for (let index = start; index <= end; index++) {
				if (stickySet && stickySet.has(index)) continue;
				next.push({ index, style: getStyle(index, false) });
			}

			if (handleItemsUpdated) {
				handleItemsUpdated({ start, end });
			}
			if (handleListItemsUpdate) {
				handleListItemsUpdate({ start, end });
			}
		}

		items = next;
	};

	/**
	 * Scrolls the list to a specific coordinate.
	 * @param {number} value
	 */
	const scrollTo = (value) => {
		try {
			wrapper.scroll({
				[SCROLL_PROP[scrollDirection]]: value,
				behavior: scrollToBehaviour
			});
		} catch {
			// Safari/legacy fallback
			wrapper[SCROLL_PROP_LEGACY[scrollDirection]] = value;
		}
	};

	/**
	 * Recomputes the sizes of the items in the list.
	 * @param {number} startIndex
	 */
	const recomputeSizes = (startIndex = scrollToIndex) => {
		styleCache = {};
		if (startIndex >= 0) {
			sizeAndPositionManager.resetItem(startIndex);
		}
		totalSize = sizeAndPositionManager.getTotalSize();
		debounceRefresh.start(refresh);
	};

	/**
	 * Calculates the offset for a given index based on the scroll direction and alignment.
	 * @param {number} index
	 * @param {import('./types.js').Alignment} align
	 */
	const getOffsetForIndex = (index, align = scrollToAlignment) => {
		if (index < 0 || index >= itemCount) index = 0;
		return sizeAndPositionManager.getUpdatedOffsetForIndex(
			align,
			scrollDirection === DIRECTION.VERTICAL ? _state.height : _state.width,
			_state.offset || 0,
			index
		);
	};

	/**
	 * Handles the scroll event on the wrapper element.
	 * @param {Event} event
	 */
	const handleScroll = (event) => {
		const offset = getWrapperOffset();
		if (offset < 0 || _state.offset === offset || event.target !== wrapper) return null;

		// velocity (EMA)
		const now = performance.now();
		const dt = now - lastTs || 16; // ms
		const dv = Math.abs(offset - lastOffset);
		const instVel = dv / dt; // px/ms
		velocityPxPerMs = VELOCITY_ALPHA * instVel + (1 - VELOCITY_ALPHA) * velocityPxPerMs;
		lastTs = now;
		lastOffset = offset;

		_state.setScrollOffset(offset, SCROLL_CHANGE_REASON.OBSERVED);

		if (handleAfterScroll) handleAfterScroll({ offset, event });
	};

	/**
	 * Returns the current scroll offset of the wrapper element.
	 * @returns {number}
	 */
	const getWrapperOffset = () => wrapper[SCROLL_PROP_LEGACY[scrollDirection]];

	/**
	 * Returns the style for a given item index.
	 * @param {number} index The index of the item
	 * @param {boolean} sticky Whether the item should be sticky or not
	 */
	const getStyle = (index, sticky) => {
		if (styleCache[index]) return styleCache[index];

		const { size, offset } = sizeAndPositionManager.getSizeAndPositionForIndex(index);

		let style;

		if (scrollDirection === DIRECTION.VERTICAL) {
			style = `left:0;width:100%;height:${size}px;`;
			if (sticky) {
				style +=
					`position:sticky;flex-grow:0;z-index:2;top:0;margin-top:${offset}px;margin-bottom:${-(offset + size)}px;` +
					`background:var(--virtual-list-sticky-bg, inherit);transform:translateZ(0);`;
			} else {
				style += `position:absolute;top:${offset}px;`;
			}
		} else {
			style = `top:0;width:${size}px;`;
			if (sticky) {
				style +=
					`position:sticky;z-index:2;left:0;margin-left:${offset}px;margin-right:${-(offset + size)}px;` +
					`background:var(--virtual-list-sticky-bg, inherit);transform:translateZ(0);`;
			} else {
				style += `position:absolute;height:100%;left:${offset}px;`;
			}
		}

		styleCache[index] = style;

		return styleCache[index];
	};

	// ================= Effects =================
	$effect(() => {
		const options = { passive: true };
		wrapper.addEventListener('scroll', handleScroll, options);

		if (typeof ResizeObserver !== 'undefined') {
			ro = new ResizeObserver((entries) => {
				for (const entry of entries) {
					const box = entry.contentBoxSize?.[0] || entry.contentBoxSize;
					if (box) {
						wrapperWidth = Math.round(entry.contentRect.width);
						wrapperHeight = Math.round(entry.contentRect.height);
					} else {
						wrapperWidth = Math.round(entry.contentRect.width);
						wrapperHeight = Math.round(entry.contentRect.height);
					}
				}
			});
			ro.observe(wrapper);
		}

		return () => {
			// @ts-expect-error because options is not really needed, but maybe in the future
			wrapper.removeEventListener('scroll', handleScroll, options);
			debounceRecomputeSizes.stop();
			debounceUpdateConfig.stop();
			debounceRefresh.stop();
			if (ro) ro.disconnect();
		};
	});

	$effect(() => {
		(itemCount, itemSize, estimatedItemSize);

		untrack(() => {
			const sizeIsNumber = Number.isFinite(itemSize);
			const sizeIsArray = Array.isArray(itemSize);
			const sizeIsFn = typeof itemSize === 'function';

			if (!Number.isFinite(itemCount) || !(sizeIsNumber || sizeIsArray || sizeIsFn)) return null;

			debounceUpdateConfig.start(() => {
				sizeAndPositionManager.updateConfig(itemSize, itemCount, estimatedItemSize);
				totalSize = sizeAndPositionManager.getTotalSize();
			});

			debounceRecomputeSizes.start(recomputeSizes);
		});
	});

	$effect(() => {
		(height, width, scrollDirection);

		untrack(() => {
			const heightUnit = typeof height === 'number' ? 'px' : '';
			const widthUnit = typeof width === 'number' ? 'px' : '';
			wrapperStyle = `height:${height}${heightUnit};width:${width}${widthUnit};`;
		});
	});

	$effect(() => {
		(height, width, wrapperHeight, wrapperWidth);

		untrack(() => {
			_state.setDims(
				Number.isFinite(width) ? width : wrapperWidth,
				Number.isFinite(height) ? height : wrapperHeight
			);
			debounceRecomputeSizes.start(recomputeSizes);
		});
	});

	$effect(() => {
		stickyIndices;

		untrack(() => {
			stickySet =
				Array.isArray(stickyIndices) && stickyIndices.length > 0 ? new Set(stickyIndices) : null;
			debounceRefresh.start(refresh);
		});
	});

	$effect(() => {
		(scrollToIndex, scrollToAlignment);

		untrack(() => {
			if (!Number.isFinite(scrollToIndex) || typeof scrollToAlignment !== 'string') return null;

			_state.setScrollOffset(
				getOffsetForIndex(scrollToIndex, scrollToAlignment),
				SCROLL_CHANGE_REASON.REQUESTED
			);
		});
	});

	$effect(() => {
		scrollOffset;

		untrack(() => {
			if (!Number.isFinite(scrollOffset)) return null;

			_state.setScrollOffset(scrollOffset, SCROLL_CHANGE_REASON.REQUESTED);
		});
	});

	$effect(() => {
		(_state.offset, _state.scrollChangeReason);

		untrack(() => {
			debounceRefresh.start(refresh);
		});
	});

	$effect(() => {
		_state.offset;

		untrack(() => {
			scrollTo(_state.offset);
		});
	});

	$effect(() => {
		(totalSize, scrollDirection);

		untrack(() => {
			if (scrollDirection === DIRECTION.VERTICAL) {
				innerStyle = `flex-direction:column;height:${totalSize}px;`;
			} else {
				innerStyle = `min-height:100%;width:${totalSize}px;`;
			}
		});
	});
</script>

<div bind:this={wrapper} class="virtual-list-wrapper" style={wrapperStyle}>
	{#if headerSnippet}
		{@render headerSnippet()}
	{/if}

	<div class="virtual-list-inner" style={innerStyle}>
		{#each items as item (getKey ? getKey(item.index) : item.index)}
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
