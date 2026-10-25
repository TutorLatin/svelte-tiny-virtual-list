import { describe, expect, it, vi } from 'vitest';
import { ALIGNMENT } from './constants.js';
import SizeAndPositionManager from './SizeAndPositionManager.js';

const ITEM_SIZE = 10;

/**
 * @param {number} N
 * @returns {number[]}
 */
const range = (N) => Array.from({ length: N }, (_, k) => k + 1);

describe('SizeAndPositionManager', () => {
	/**
	 * @param {number} itemCount
	 * @param {number} estimatedItemSize
	 * @return {{sizeAndPositionManager: SizeAndPositionManager, itemSizeGetterCalls: number[]}}
	 */
	function getItemSizeAndPositionManager(itemCount = 100, estimatedItemSize = 15) {
		/** @type {number[]} */
		const itemSizeGetterCalls = [];

		const sizeAndPositionManager = new SizeAndPositionManager(
			(index) => {
				itemSizeGetterCalls.push(index);
				return ITEM_SIZE;
			},
			itemCount,
			estimatedItemSize
		);

		return {
			sizeAndPositionManager,
			itemSizeGetterCalls
		};
	}

	/**
	 * @param {number} itemCount
	 * @param {number} itemSize
	 * @return {{sizeAndPositionManager: SizeAndPositionManager, totalSize: number, itemSize: number}}
	 */
	function getItemSizeAndPositionManagerNumber(itemCount = 100, itemSize = 50) {
		const sizeAndPositionManager = new SizeAndPositionManager(itemSize, itemCount, 50);

		return {
			sizeAndPositionManager,
			itemSize,
			totalSize: itemSize * itemCount
		};
	}

	/**
	 * @param {number} itemCount
	 * @return {{sizeAndPositionManager: SizeAndPositionManager, totalSize: number, itemSize: number[]}}
	 */
	function getItemSizeAndPositionManagerArray(itemCount = 100) {
		const itemSize = range(itemCount).map(() => {
			return Math.max(Math.round(Math.random() * 100), 32);
		});

		const sizeAndPositionManager = new SizeAndPositionManager(itemSize, itemCount, 66);

		return {
			sizeAndPositionManager,
			itemSize,
			totalSize: itemSize.reduce((acc, curr) => {
				return acc + curr;
			}, 0)
		};
	}

	describe('updateConfig', () => {
		it('keeps function sizing lazy across unchanged configuration updates', () => {
			/** @type {number[]} */
			const calls = [];
			/** @param {number} index */
			const itemSize = (index) => {
				calls.push(index);
				return 10;
			};
			const manager = new SizeAndPositionManager(itemSize, 100000, 10);

			manager.updateConfig(itemSize, 100000, 10);
			manager.updateConfig(itemSize, 100000, 10);
			expect(calls).toEqual([]);
			manager.getSizeAndPositionForIndex(2);
			manager.updateConfig(itemSize, 100000, 10);
			manager.getSizeAndPositionForIndex(2);
			expect(calls).toEqual([0, 1, 2]);
		});

		it('preserves measured rows when appending items with the same sizing callback', () => {
			/** @type {number[]} */
			const calls = [];
			/** @param {number} index */
			const itemSize = (index) => {
				calls.push(index);
				return 10;
			};
			const manager = new SizeAndPositionManager(itemSize, 3, 10);
			manager.getSizeAndPositionForIndex(2);
			calls.splice(0);

			manager.updateConfig(itemSize, 5, 10);
			expect(manager.getTotalSize()).toBe(50);
			expect(manager.getSizeAndPositionForIndex(2)).toEqual({ offset: 20, size: 10 });
			expect(calls).toEqual([]);
			expect(manager.getSizeAndPositionForIndex(4)).toEqual({ offset: 40, size: 10 });
			expect(calls).toEqual([3, 4]);
		});

		it('discards cached measurements when the sizing callback changes', () => {
			const manager = new SizeAndPositionManager(() => 10, 100, 10);
			manager.getSizeAndPositionForIndex(5);

			manager.updateConfig(() => 20, 100, 20);
			expect(manager.getSizeAndPositionForIndex(5)).toEqual({ offset: 100, size: 20 });
			expect(manager.getTotalSize()).toBe(2000);
		});

		it('keeps measured rows within bounds after shrinking the list', () => {
			const itemSize = () => 10;
			const manager = new SizeAndPositionManager(itemSize, 100, 10);
			manager.getSizeAndPositionForIndex(99);

			manager.updateConfig(itemSize, 5, 10);
			expect(manager.getTotalSize()).toBe(50);
			expect(manager.getVisibleRange(50, 0, 0)).toEqual({ start: 0, end: 4 });
		});

		it('remeasures removed rows if the same callback is later given more items', () => {
			const sizes = [10, 20, 30];
			/** @param {number} index */
			const itemSize = (index) => sizes[index];
			const manager = new SizeAndPositionManager(itemSize, 3, 10);
			manager.getSizeAndPositionForIndex(2);

			manager.updateConfig(itemSize, 1, 10);
			sizes[1] = 40;
			sizes[2] = 50;
			manager.updateConfig(itemSize, 3, 10);

			expect(manager.getSizeAndPositionForIndex(2)).toEqual({ offset: 50, size: 50 });
			expect(manager.getTotalSize()).toBe(100);
		});

		it('returns an empty range when a measured list is cleared', () => {
			const sizes = [10, 20, 30];
			/** @param {number} index */
			const itemSize = (index) => sizes[index];
			const manager = new SizeAndPositionManager(itemSize, 3, 15);
			manager.getSizeAndPositionForIndex(2);

			manager.updateConfig(itemSize, 0, 15);
			expect(manager.getTotalSize()).toBe(0);
			expect(manager.getVisibleRange(50, 0, 0)).toEqual({});
		});

		it('updates estimates without discarding measured rows', () => {
			let calls = 0;
			const itemSize = () => {
				calls++;
				return 10;
			};
			const manager = new SizeAndPositionManager(itemSize, 100, 10);
			manager.getSizeAndPositionForIndex(9);

			manager.updateConfig(itemSize, 100, 20);
			expect(manager.getTotalSize()).toBe(1900);
			expect(manager.getSizeAndPositionForIndex(9)).toEqual({ offset: 90, size: 10 });
			expect(calls).toBe(10);
		});

		it('rebuilds sizes when switching between numeric, function, and array sizing', () => {
			const manager = new SizeAndPositionManager(10, 3, 10);
			manager.updateConfig(() => 20, 3, 20);
			expect(manager.getSizeAndPositionForIndex(2)).toEqual({ offset: 40, size: 20 });
			expect(manager.getTotalSize()).toBe(60);

			manager.updateConfig(5, 3, 10);
			expect(manager.getSizeAndPositionForIndex(2)).toEqual({ offset: 10, size: 5 });
			expect(manager.getTotalSize()).toBe(15);

			manager.updateConfig([10, 20, 30], 3, 10);
			expect(manager.getSizeAndPositionForIndex(2)).toEqual({ offset: 30, size: 30 });
			expect(manager.getTotalSize()).toBe(60);
		});
	});

	describe('findNearestItem', () => {
		it('should error if given NaN', () => {
			const { sizeAndPositionManager } = getItemSizeAndPositionManager();
			expect(() => sizeAndPositionManager.findNearestItem(NaN)).toThrow();
		});

		it('should handle offets outisde of bounds (to account for elastic scrolling)', () => {
			const { sizeAndPositionManager } = getItemSizeAndPositionManager();
			expect(sizeAndPositionManager.findNearestItem(-100)).toEqual(0);
			expect(sizeAndPositionManager.findNearestItem(1234567890)).toEqual(99);
		});

		it('should find the first item', () => {
			const { sizeAndPositionManager } = getItemSizeAndPositionManager();
			expect(sizeAndPositionManager.findNearestItem(0)).toEqual(0);
			expect(sizeAndPositionManager.findNearestItem(9)).toEqual(0);
		});

		it('should find the last item', () => {
			const { sizeAndPositionManager } = getItemSizeAndPositionManager();
			expect(sizeAndPositionManager.findNearestItem(990)).toEqual(99);
			expect(sizeAndPositionManager.findNearestItem(991)).toEqual(99);
		});

		it('should find the a item that exactly matches a specified offset in the middle', () => {
			const { sizeAndPositionManager } = getItemSizeAndPositionManager();
			expect(sizeAndPositionManager.findNearestItem(100)).toEqual(10);
		});

		it('should find the item closest to (but before) the specified offset in the middle', () => {
			const { sizeAndPositionManager } = getItemSizeAndPositionManager();
			expect(sizeAndPositionManager.findNearestItem(101)).toEqual(10);
		});
	});

	describe('getSizeAndPositionForIndex when itemSize is a function', () => {
		it('should error if an invalid index is specified', () => {
			const { sizeAndPositionManager } = getItemSizeAndPositionManager();
			expect(() => sizeAndPositionManager.getSizeAndPositionForIndex(-1)).toThrow();
			expect(() => sizeAndPositionManager.getSizeAndPositionForIndex(100)).toThrow();
		});

		it('should return the correct size and position information for the requested item', () => {
			const { sizeAndPositionManager } = getItemSizeAndPositionManager();
			expect(sizeAndPositionManager.getSizeAndPositionForIndex(0).offset).toEqual(0);
			expect(sizeAndPositionManager.getSizeAndPositionForIndex(0).size).toEqual(10);
			expect(sizeAndPositionManager.getSizeAndPositionForIndex(1).offset).toEqual(10);
			expect(sizeAndPositionManager.getSizeAndPositionForIndex(2).offset).toEqual(20);
		});

		it('should only measure the necessary items to return the information requested', () => {
			const { sizeAndPositionManager, itemSizeGetterCalls } = getItemSizeAndPositionManager();
			sizeAndPositionManager.getSizeAndPositionForIndex(0);
			expect(itemSizeGetterCalls).toEqual([0]);
		});

		it('should just-in-time measure all items up to the requested item if no items have yet been measured', () => {
			const { sizeAndPositionManager, itemSizeGetterCalls } = getItemSizeAndPositionManager();
			sizeAndPositionManager.getSizeAndPositionForIndex(5);
			expect(itemSizeGetterCalls).toEqual([0, 1, 2, 3, 4, 5]);
		});

		it('should just-in-time measure items up to the requested item if some but not all items have been measured', () => {
			const { sizeAndPositionManager, itemSizeGetterCalls } = getItemSizeAndPositionManager();
			sizeAndPositionManager.getSizeAndPositionForIndex(5);
			itemSizeGetterCalls.splice(0);
			sizeAndPositionManager.getSizeAndPositionForIndex(10);
			expect(itemSizeGetterCalls).toEqual([6, 7, 8, 9, 10]);
		});

		it('should return cached size and position data if item has already been measured', () => {
			const { sizeAndPositionManager, itemSizeGetterCalls } = getItemSizeAndPositionManager();
			sizeAndPositionManager.getSizeAndPositionForIndex(5);
			itemSizeGetterCalls.splice(0);
			sizeAndPositionManager.getSizeAndPositionForIndex(5);
			expect(itemSizeGetterCalls).toEqual([]);
		});
	});

	describe('getSizeAndPositionForIndex when itemSize is a number', () => {
		it('should error if an invalid index is specified', () => {
			const { sizeAndPositionManager } = getItemSizeAndPositionManagerNumber();
			expect(() => sizeAndPositionManager.getSizeAndPositionForIndex(-1)).toThrow();
			expect(() => sizeAndPositionManager.getSizeAndPositionForIndex(100)).toThrow();
		});

		it('should return the correct size and position information for the requested item', () => {
			const { sizeAndPositionManager, itemSize } = getItemSizeAndPositionManagerNumber();
			expect(sizeAndPositionManager.getSizeAndPositionForIndex(0).offset).toEqual(0);
			expect(sizeAndPositionManager.getSizeAndPositionForIndex(0).size).toEqual(itemSize);
			expect(sizeAndPositionManager.getSizeAndPositionForIndex(1).offset).toEqual(itemSize);
			expect(sizeAndPositionManager.getSizeAndPositionForIndex(2).offset).toEqual(itemSize * 2);
		});

		it('handles large fixed-size lists without resolving individual item sizes', () => {
			const resolveSize = vi
				.spyOn(SizeAndPositionManager.prototype, 'getSize')
				.mockImplementation(() => {
					throw new Error('Fixed-size lists must not measure individual items');
				});
			try {
				const manager = new SizeAndPositionManager(20, 1000000000, 0);
				expect(manager.getTotalSize()).toBe(20000000000);
				expect(manager.getSizeAndPositionForIndex(999999999)).toEqual({
					offset: 19999999980,
					size: 20
				});
				manager.updateConfig(25, 2000000000, 0);
				expect(manager.getTotalSize()).toBe(50000000000);
				manager.updateConfig(25, 10, 0);
				expect(manager.getSizeAndPositionForIndex(9)).toEqual({ offset: 225, size: 25 });
				expect(resolveSize).not.toHaveBeenCalled();
			} finally {
				resolveSize.mockRestore();
			}
		});

		it('keeps fixed-size range and nearest-item queries independent of the number of rows', () => {
			const manager = new SizeAndPositionManager(20, 100000, 0);
			const getPosition = manager.getSizeAndPositionForIndex.bind(manager);
			let reads = 0;
			const resolvePosition = vi
				.spyOn(manager, 'getSizeAndPositionForIndex')
				.mockImplementation((index) => {
					if (++reads > 4) throw new Error('Fixed-size queries must not scan individual rows');
					return getPosition(index);
				});
			expect(manager.findNearestItem(1500000)).toBe(75000);
			expect(manager.getVisibleRange(2000000, 0, 0)).toEqual({ start: 0, end: 99999 });
			expect(resolvePosition).not.toHaveBeenCalled();
		});

		it('calculates fractional positions without cumulative rounding drift', () => {
			const manager = new SizeAndPositionManager(0.1, 100000, 0);
			expect(manager.getTotalSize()).toBe(10000);
			expect(manager.getSizeAndPositionForIndex(99999)).toEqual({
				offset: 99999 * 0.1,
				size: 0.1
			});
			manager.resetItem(0);
			expect(manager.getSizeAndPositionForIndex(43)).toEqual({ offset: 43 * 0.1, size: 0.1 });
			expect(manager.getTotalSize()).toBe(10000);
		});

		it('rejects fractional and non-finite indices', () => {
			const manager = new SizeAndPositionManager(20, 100, 0);
			for (const index of [0.5, NaN, Infinity, -Infinity]) {
				expect(() => manager.getSizeAndPositionForIndex(index)).toThrow('outside of range');
			}
		});
	});

	describe('getSizeAndPositionForIndex when itemSize is an array', () => {
		it('should error if an invalid index is specified', () => {
			const { sizeAndPositionManager } = getItemSizeAndPositionManagerArray();
			expect(() => sizeAndPositionManager.getSizeAndPositionForIndex(-1)).toThrow();
			expect(() => sizeAndPositionManager.getSizeAndPositionForIndex(100)).toThrow();
		});

		it('should return the correct size and position information for the requested item', () => {
			const { sizeAndPositionManager, itemSize } = getItemSizeAndPositionManagerArray();
			expect(sizeAndPositionManager.getSizeAndPositionForIndex(0).offset).toEqual(0);
			expect(sizeAndPositionManager.getSizeAndPositionForIndex(0).size).toEqual(itemSize[0]);
			expect(sizeAndPositionManager.getSizeAndPositionForIndex(1).offset).toEqual(itemSize[0]);
			expect(sizeAndPositionManager.getSizeAndPositionForIndex(2).offset).toEqual(
				itemSize[0] + itemSize[1]
			);
		});
	});

	describe('getSizeAndPositionOfLastMeasuredItem', () => {
		it('should return an empty object if no cached items are present', () => {
			const { sizeAndPositionManager } = getItemSizeAndPositionManager();
			expect(sizeAndPositionManager.getSizeAndPositionOfLastMeasuredItem()).toEqual({
				offset: 0,
				size: 0
			});
		});

		it('should return size and position data for the highest/last measured item', () => {
			const { sizeAndPositionManager } = getItemSizeAndPositionManager();
			sizeAndPositionManager.getSizeAndPositionForIndex(5);
			expect(sizeAndPositionManager.getSizeAndPositionOfLastMeasuredItem()).toEqual({
				offset: 50,
				size: 10
			});
		});
	});

	describe('getTotalSize when itemSize is a function', () => {
		it('should calculate total size based purely on :estimatedItemSize if no measurements have been done', () => {
			const { sizeAndPositionManager } = getItemSizeAndPositionManager();
			expect(sizeAndPositionManager.getTotalSize()).toEqual(1500);
		});

		it('should calculate total size based on a mixture of actual item sizes and :estimatedItemSize if some items have been measured', () => {
			const { sizeAndPositionManager } = getItemSizeAndPositionManager();
			sizeAndPositionManager.getSizeAndPositionForIndex(49);
			expect(sizeAndPositionManager.getTotalSize()).toEqual(1250);
		});

		it('should calculate total size based on the actual measured sizes if all items have been measured', () => {
			const { sizeAndPositionManager } = getItemSizeAndPositionManager();
			sizeAndPositionManager.getSizeAndPositionForIndex(99);
			expect(sizeAndPositionManager.getTotalSize()).toEqual(1000);
		});
	});

	describe('getTotalSize when itemSize is a number', () => {
		it('should calculate total size by multiplying the itemCount with the itemSize', () => {
			const { sizeAndPositionManager, totalSize } = getItemSizeAndPositionManagerNumber();
			expect(sizeAndPositionManager.getTotalSize()).toEqual(totalSize);
		});

		it('preserves a computed zero size instead of using the estimate', () => {
			for (const size of [0, -0]) {
				const manager = new SizeAndPositionManager(size, 10, 15);
				expect(manager.getTotalSize()).toBe(0);
				expect(manager.getSizeAndPositionForIndex(9).offset).toBe(0);
				expect(manager.getVisibleRange(50, 0, 0)).toEqual({});
			}
		});
	});

	describe('getTotalSize when itemSize is an array', () => {
		it('should calculate total size by counting together all of the itemSize items', () => {
			const { sizeAndPositionManager, totalSize } = getItemSizeAndPositionManagerArray();
			expect(sizeAndPositionManager.getTotalSize()).toEqual(totalSize);
		});
	});

	describe('getUpdatedOffsetForIndex', () => {
		/**
		 * @typedef {Object} GetUpdatedOffsetForIndexParams
		 * @property {'auto' | 'start' | 'center' | 'end'} [align]
		 * @property {number} [itemCount]
		 * @property {number} [itemSize]
		 * @property {number} [containerSize]
		 * @property {number} [currentOffset]
		 * @property {number} [estimatedItemSize]
		 * @property {number} [targetIndex]
		 */
		/**
		 * @param {GetUpdatedOffsetForIndexParams} params
		 */
		function getUpdatedOffsetForIndexHelper({
			align = ALIGNMENT.START,
			itemCount = 10,
			itemSize = ITEM_SIZE,
			containerSize = 50,
			currentOffset = 0,
			estimatedItemSize = 15,
			targetIndex = 0
		}) {
			const sizeAndPositionManager = new SizeAndPositionManager(
				() => itemSize,
				itemCount,
				estimatedItemSize
			);

			return sizeAndPositionManager.getUpdatedOffsetForIndex(
				align,
				containerSize,
				currentOffset,
				targetIndex
			);
		}

		it('should scroll to the beginning', () => {
			expect(
				getUpdatedOffsetForIndexHelper({
					currentOffset: 100,
					targetIndex: 0
				})
			).toEqual(0);
		});

		it('should scroll to the end', () => {
			expect(
				getUpdatedOffsetForIndexHelper({
					currentOffset: 0,
					targetIndex: 9
				})
			).toEqual(50);
		});

		it('should scroll forward to the middle', () => {
			const targetIndex = 6;

			expect(
				getUpdatedOffsetForIndexHelper({
					currentOffset: 0,
					targetIndex
				})
			).toEqual(ITEM_SIZE * targetIndex);
		});

		it('should scroll backward to the middle', () => {
			expect(
				getUpdatedOffsetForIndexHelper({
					currentOffset: 50,
					targetIndex: 2
				})
			).toEqual(20);
		});

		it('should not scroll if an item is already visible', () => {
			const targetIndex = 3;
			const currentOffset = targetIndex * ITEM_SIZE;

			expect(
				getUpdatedOffsetForIndexHelper({
					currentOffset,
					targetIndex
				})
			).toEqual(currentOffset);
		});

		it('should honor specified :align values', () => {
			expect(
				getUpdatedOffsetForIndexHelper({
					align: ALIGNMENT.START,
					currentOffset: 0,
					targetIndex: 5
				})
			).toEqual(50);
			expect(
				getUpdatedOffsetForIndexHelper({
					align: ALIGNMENT.END,
					currentOffset: 50,
					targetIndex: 5
				})
			).toEqual(10);
			expect(
				getUpdatedOffsetForIndexHelper({
					align: ALIGNMENT.CENTER,
					currentOffset: 50,
					targetIndex: 5
				})
			).toEqual(30);
		});

		it('should not scroll past the safe bounds even if the specified :align requests it', () => {
			expect(
				getUpdatedOffsetForIndexHelper({
					align: ALIGNMENT.END,
					currentOffset: 50,
					targetIndex: 0
				})
			).toEqual(0);
			expect(
				getUpdatedOffsetForIndexHelper({
					align: ALIGNMENT.CENTER,
					currentOffset: 50,
					targetIndex: 1
				})
			).toEqual(0);
			expect(
				getUpdatedOffsetForIndexHelper({
					align: ALIGNMENT.START,
					currentOffset: 0,
					targetIndex: 9
				})
			).toEqual(50);

			// TRICKY: We would expect this to be positioned at 50.
			// But since the :estimatedItemSize is 15 and we only measure up to the 8th item,
			// The helper assumes it can scroll farther than it actually can.
			// Not sure if this edge case is worth "fixing" or just acknowledging...
			expect(
				getUpdatedOffsetForIndexHelper({
					align: ALIGNMENT.CENTER,
					currentOffset: 0,
					targetIndex: 8
				})
			).toEqual(55);
		});

		it('should always return an offset of 0 when :containerSize is 0', () => {
			expect(
				getUpdatedOffsetForIndexHelper({
					containerSize: 0,
					currentOffset: 50,
					targetIndex: 2
				})
			).toEqual(0);
		});
	});

	describe('getVisibleRange', () => {
		it('honors fractional fixed-size boundaries and overscan', () => {
			const manager = new SizeAndPositionManager(0.1, 1000, 0);
			expect(manager.findNearestItem(43 * 0.1)).toBe(43);
			expect(manager.findNearestItem(0.3)).toBe(2);
			expect(manager.findNearestItem(-1)).toBe(0);
			expect(manager.findNearestItem(1000)).toBe(999);
			expect(manager.getVisibleRange(3 * 0.1, 0, 0)).toEqual({ start: 0, end: 2 });
			expect(manager.getVisibleRange(0.5, 43 * 0.1, 2)).toEqual({ start: 41, end: 49 });
			expect(manager.getVisibleRange(0, 43 * 0.1, 0)).toEqual({ start: 43, end: 43 });
		});

		it('keeps fixed-size ranges bounded at the ends of the list', () => {
			const manager = new SizeAndPositionManager(20, 100, 0);
			expect(manager.getVisibleRange(50, -10, 0)).toEqual({ start: 0, end: 1 });
			expect(manager.getVisibleRange(50, 4000, 3)).toEqual({ start: 96, end: 99 });
			expect(manager.getVisibleRange(200, 1900, 3)).toEqual({ start: 92, end: 99 });
			expect(() => manager.getVisibleRange(50, NaN, 0)).toThrow('Invalid offset');
		});

		it('supports clearing and repopulating zero-sized fixed-size lists', () => {
			const manager = new SizeAndPositionManager(0, 100, 10);
			expect(manager.getSizeAndPositionForIndex(99)).toEqual({ offset: 0, size: 0 });
			expect(manager.getVisibleRange(200, 0, 3)).toEqual({});
			manager.updateConfig(20, 0, 10);
			expect(manager.getTotalSize()).toBe(0);
			expect(manager.getVisibleRange(200, 0, 3)).toEqual({});
			expect(() => manager.getSizeAndPositionForIndex(0)).toThrow('outside of range');
			manager.updateConfig(20, 100, 10);
			expect(manager.getVisibleRange(50, 20, 0)).toEqual({ start: 1, end: 3 });
		});

		it('measures the initial viewport lazily when the callback estimate is zero', () => {
			let calls = 0;
			const manager = new SizeAndPositionManager(
				() => {
					calls++;
					return 10;
				},
				100000,
				0
			);

			expect(manager.getVisibleRange(50, 0, 0)).toEqual({ start: 0, end: 4 });
			expect(calls).toBe(5);
			expect(manager.getVisibleRange(50, 50, 0)).toEqual({ start: 5, end: 9 });
			expect(calls).toBe(10);
		});

		it('does not call the sizing callback for an empty list with a zero estimate', () => {
			let calls = 0;
			const manager = new SizeAndPositionManager(
				() => {
					calls++;
					return 10;
				},
				0,
				0
			);

			expect(manager.getVisibleRange(50, 0, 0)).toEqual({});
			expect(calls).toBe(0);
		});

		it('should not return any indices if :itemCount is 0', () => {
			const { sizeAndPositionManager } = getItemSizeAndPositionManager(0);
			const { start, end } = sizeAndPositionManager.getVisibleRange(50, 0, 0);
			expect(start).toBeUndefined();
			expect(end).toBeUndefined();
		});

		it('should return a visible range of items for the beginning of the list', () => {
			const { sizeAndPositionManager } = getItemSizeAndPositionManager();
			const { start, end } = sizeAndPositionManager.getVisibleRange(50, 0, 0);
			expect(start).toEqual(0);
			expect(end).toEqual(4);
		});

		it('should return a visible range of items for the middle of the list where some are partially visible', () => {
			const { sizeAndPositionManager } = getItemSizeAndPositionManager();
			const { start, end } = sizeAndPositionManager.getVisibleRange(50, 425, 0);
			// 42 and 47 are partially visible
			expect(start).toEqual(42);
			expect(end).toEqual(47);
		});

		it('should return a visible range of items for the end of the list', () => {
			const { sizeAndPositionManager } = getItemSizeAndPositionManager();
			const { start, end } = sizeAndPositionManager.getVisibleRange(50, 950, 0);
			expect(start).toEqual(95);
			expect(end).toEqual(99);
		});
	});

	describe('resetItem', () => {
		it('should clear size and position metadata for the specified index and all items after it', () => {
			const { sizeAndPositionManager } = getItemSizeAndPositionManager();
			sizeAndPositionManager.getSizeAndPositionForIndex(5);
			sizeAndPositionManager.resetItem(3);
			expect(sizeAndPositionManager.getLastMeasuredIndex()).toEqual(2);
			sizeAndPositionManager.resetItem(0);
			expect(sizeAndPositionManager.getLastMeasuredIndex()).toEqual(-1);
		});

		it('should not clear size and position metadata for items before the specified index', () => {
			const { sizeAndPositionManager, itemSizeGetterCalls } = getItemSizeAndPositionManager();
			sizeAndPositionManager.getSizeAndPositionForIndex(5);
			itemSizeGetterCalls.splice(0);
			sizeAndPositionManager.resetItem(3);
			sizeAndPositionManager.getSizeAndPositionForIndex(4);
			expect(itemSizeGetterCalls).toEqual([3, 4]);
		});

		it('should not skip over any unmeasured or previously-cleared items', () => {
			const { sizeAndPositionManager } = getItemSizeAndPositionManager();
			sizeAndPositionManager.getSizeAndPositionForIndex(5);
			sizeAndPositionManager.resetItem(2);
			expect(sizeAndPositionManager.getLastMeasuredIndex()).toEqual(1);
			sizeAndPositionManager.resetItem(4);
			expect(sizeAndPositionManager.getLastMeasuredIndex()).toEqual(1);
			sizeAndPositionManager.resetItem(0);
			expect(sizeAndPositionManager.getLastMeasuredIndex()).toEqual(-1);
		});
	});
});
