export const useDebounce = () => {
	let animationFrameId = 0;
	return {
		start: (fn = () => null) => {
			cancelAnimationFrame(animationFrameId);
			animationFrameId = requestAnimationFrame(() => fn());
		},
		stop: () => cancelAnimationFrame(animationFrameId)
	};
};
