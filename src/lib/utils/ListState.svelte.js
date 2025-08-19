import { DEFAULTS, SCROLL_CHANGE_REASON } from '$lib/constants.js';

/** @typedef {typeof SCROLL_CHANGE_REASON[keyof typeof SCROLL_CHANGE_REASON]} ScrollChangeReason */

export class ListState {
	/** @type {number} */
	offset = $state(DEFAULTS.scrollOffset);
	/** @type {ScrollChangeReason} */
	scrollChangeReason = $state(SCROLL_CHANGE_REASON.REQUESTED);
	/** @type {number} */
	width = $state(DEFAULTS.width.internal);
	/** @type {number} */
	height = $state(DEFAULTS.height.internal);

	/**
	 * @param {number} [offset=DEFAULTS.scrollOffset]
	 * @param {number} [width=DEFAULTS.width.internal]
	 * @param {number} [height=DEFAULTS.height.internal]
	 */
	constructor(
		offset = DEFAULTS.scrollOffset,
		width = DEFAULTS.width.internal,
		height = DEFAULTS.height.internal
	) {
		this.setScrollOffset(offset);
		this.setDims(width, height);
	}

	/**
	 * @param {number} [offset=this.offset]
	 * @param {ScrollChangeReason} [scrollChangeReason=this.scrollChangeReason]
	 */
	setScrollOffset(offset = this.offset, scrollChangeReason = this.scrollChangeReason) {
		if (Number.isFinite(offset) && offset !== this.offset) {
			this.offset = offset;
		}

		// Trusted (internal)
		if (scrollChangeReason !== this.scrollChangeReason) {
			this.scrollChangeReason = scrollChangeReason;
		}
	}

	/**
	 * @param {number} [width=this.width]
	 * @param {number} [height=this.height]
	 */
	setDims(width = this.width, height = this.height) {
		if (Number.isFinite(width) && width !== this.width) {
			this.width = width;
		}
		if (Number.isFinite(height) && height !== this.height) {
			this.height = height;
		}
	}
}
