/**
 * @typedef {object} Debounce
 * @property {(fn?: () => void) => void} start
 * @property {() => void} stop
 */

/**
 * @returns {Debounce}
 */
export const useDebounce = () => {
	let animationFrameId = -1;
	return {
		start: (fn = () => null) => {
			cancelAnimationFrame(animationFrameId);
			animationFrameId = requestAnimationFrame(() => fn());
		},
		stop: () => cancelAnimationFrame(animationFrameId)
	};
};
