/**
 * @typedef {import('./types.js').ScrollBehaviour} ScrollBehaviour
 * @typedef {import('./types.js').Alignment} Alignment
 * @typedef {import('./types.js').Direction} Direction
 * @typedef {import('./types.js').VirtualListProps} VirtualListProps
 */

export const ALIGNMENT = /** @type {const} */ ({
	AUTO: 'auto',
	START: 'start',
	CENTER: 'center',
	END: 'end'
});

export const DIRECTION = /** @type {const} */ ({
	HORIZONTAL: 'horizontal',
	VERTICAL: 'vertical'
});

export const SCROLL_CHANGE_REASON = /** @type {const} */ ({
	OBSERVED: 0,
	REQUESTED: 1
});

export const SCROLL_PROP = /** @type {const} */ ({
	[DIRECTION.VERTICAL]: 'top',
	[DIRECTION.HORIZONTAL]: 'left'
});

export const SCROLL_PROP_LEGACY = /** @type {const} */ ({
	[DIRECTION.VERTICAL]: 'scrollTop',
	[DIRECTION.HORIZONTAL]: 'scrollLeft'
});

/**
 * @typedef {object} Defaults
 * @property {{ internal: number; external: NonNullable<VirtualListProps["height"]> }} height
 * @property {{ internal: number; external: NonNullable<VirtualListProps["width"]> }}  width
 * @property {NonNullable<VirtualListProps["estimatedItemSize"]>} estimatedItemSize
 * @property {NonNullable<VirtualListProps["stickyIndices"]>} stickyIndices
 * @property {Direction} scrollDirection
 * @property {NonNullable<VirtualListProps["scrollOffset"]>} scrollOffset
 * @property {NonNullable<VirtualListProps["scrollToIndex"]>} scrollToIndex
 * @property {Alignment} scrollToAlignment
 * @property {ScrollBehaviour} scrollToBehaviour
 * @property {NonNullable<VirtualListProps["overscanCount"]>} overscanCount
 */

export const DEFAULTS = /** @type {Defaults} */ ({
	height: { internal: 400, external: '100%' },
	width: { internal: 400, external: '100%' },
	estimatedItemSize: 0,
	stickyIndices: [],
	scrollDirection: DIRECTION.VERTICAL,
	scrollOffset: 0,
	scrollToIndex: -1,
	scrollToAlignment: ALIGNMENT.START,
	scrollToBehaviour: 'instant',
	overscanCount: 3
});
