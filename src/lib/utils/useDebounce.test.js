import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { useDebounce } from './useDebounce.js';

/** @type {Map<number, FrameRequestCallback>} */
let frames;
/** @type {number} */
let nextId;

beforeEach(() => {
	frames = new Map();
	nextId = 0;
	vi.stubGlobal(
		'requestAnimationFrame',
		vi.fn((/** @type {FrameRequestCallback} */ callback) => {
			const id = nextId++;
			frames.set(id, callback);
			return id;
		})
	);
	vi.stubGlobal(
		'cancelAnimationFrame',
		vi.fn((/** @type {number} */ id) => frames.delete(id))
	);
});

afterEach(() => vi.unstubAllGlobals());

function runFrame() {
	const callbacks = [...frames.values()];
	frames.clear();
	for (const callback of callbacks) callback(0);
}

test('several starts queue one frame and execute only the latest callback', () => {
	const debounce = useDebounce();
	const first = vi.fn();
	const latest = vi.fn();
	debounce.start(first);
	debounce.start(latest);
	expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
	expect(cancelAnimationFrame).not.toHaveBeenCalled();
	runFrame();
	expect(first).not.toHaveBeenCalled();
	expect(latest).toHaveBeenCalledTimes(1);
});

test('starting within a callback queues a separate following frame', () => {
	const debounce = useDebounce();
	const next = vi.fn();
	debounce.start(() => debounce.start(next));
	runFrame();
	expect(requestAnimationFrame).toHaveBeenCalledTimes(2);
	expect(next).not.toHaveBeenCalled();
	expect(frames.size).toBe(1);
	runFrame();
	expect(next).toHaveBeenCalledTimes(1);
});

test('stop cancels frame zero and drops its callback', () => {
	const debounce = useDebounce();
	const callback = vi.fn();
	debounce.start(callback);
	debounce.stop();
	expect(cancelAnimationFrame).toHaveBeenCalledWith(0);
	runFrame();
	expect(callback).not.toHaveBeenCalled();
});

test('a stopped scheduler can restart with a new callback', () => {
	const debounce = useDebounce();
	const first = vi.fn();
	const next = vi.fn();
	debounce.start(first);
	debounce.stop();
	debounce.start(next);
	expect(requestAnimationFrame).toHaveBeenCalledTimes(2);
	runFrame();
	expect(first).not.toHaveBeenCalled();
	expect(next).toHaveBeenCalledTimes(1);
});

test('completed and idle frames are not cancelled', () => {
	const debounce = useDebounce();
	debounce.stop();
	debounce.start();
	runFrame();
	debounce.stop();
	expect(cancelAnimationFrame).not.toHaveBeenCalled();
	debounce.start();
	expect(requestAnimationFrame).toHaveBeenCalledTimes(2);
});
