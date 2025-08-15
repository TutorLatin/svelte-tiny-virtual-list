import { SCROLL_CHANGE_REASON } from '$lib/constants.js';

export class ListState {
	offset = $state(0);
	scrollChangeReason = $state(SCROLL_CHANGE_REASON.REQUESTED);
	width = $state(400);
	height = $state(400);

	constructor(offset = 0, width = 400, height = 400) {
		this.setScrollOffset(offset);
		this.setDims(width, height);
	}

	setScrollOffset(offset = this.offset, scrollChangeReason = this.scrollChangeReason) {
		if (Number.isFinite(offset) && offset !== this.offset) {
			this.offset = offset;
		}

		// Trusted (internal)
		if (scrollChangeReason !== this.scrollChangeReason) {
			this.scrollChangeReason = scrollChangeReason;
		}
	}

	setDims(width = this.width, height = this.height) {
		if (Number.isFinite(width) && width !== this.width) {
			this.width = width;
		}
		if (Number.isFinite(height) && height !== this.height) {
			this.height = height;
		}
	}
}
