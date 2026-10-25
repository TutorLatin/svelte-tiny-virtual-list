/**
 * @typedef {object} Debounce
 * @property {(fn?: () => void) => void} start
 * @property {() => void} stop
 */

/**
 * @returns {Debounce}
 */
export const useDebounce = () => {
	/** @type {number | null} */
	let animationFrameId = null;
	/** @type {(() => void) | undefined} */
	let callback;
	return {
		start: (fn = () => null) => {
			callback = fn;
			if (animationFrameId !== null) return;
			animationFrameId = requestAnimationFrame(() => {
				animationFrameId = null;
				const next = callback;
				callback = undefined;
				next?.();
			});
		},
		stop: () => {
			if (animationFrameId !== null) cancelAnimationFrame(animationFrameId);
			animationFrameId = null;
			callback = undefined;
		}
	};
};
