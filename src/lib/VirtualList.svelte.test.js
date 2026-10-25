import { expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import VirtualListTest from '../test/VirtualListTest.svelte';

/** @import { ItemSize, VirtualListProps } from './types.js' */

async function nextFrames(count = 4) {
	for (let frame = 0; frame < count; frame++) {
		await new Promise((resolve) => requestAnimationFrame(resolve));
	}
}

/** @param {HTMLElement} container */
function getWrapper(container) {
	const wrapper = container.querySelector('.virtual-list-wrapper');
	if (!(wrapper instanceof HTMLDivElement)) throw new Error('Missing virtual-list wrapper');
	return wrapper;
}

/**
 * @param {HTMLElement} container
 * @param {number} index
 */
function getRow(container, index) {
	return /** @type {HTMLDivElement | null} */ (container.querySelector(`[data-index="${index}"]`));
}

/** @param {Partial<VirtualListProps>} initialOptions */
async function renderList(initialOptions = {}, headerHeight = 0) {
	const screen = await render(VirtualListTest, { initialOptions, headerHeight });
	return { ...screen, wrapper: getWrapper(screen.container) };
}

test('an empty list mounts without attempting to measure an item', async () => {
	const { container, wrapper } = await renderList({ itemCount: 0 });
	await nextFrames();
	expect(container.querySelectorAll('[data-index]')).toHaveLength(0);
	expect(wrapper.scrollHeight).toBe(wrapper.clientHeight);
});

/** @type {{ name: string; itemSize: ItemSize; estimatedItemSize: number }[]} */
const sizingCases = [
	{ name: 'numeric sizes', itemSize: 20, estimatedItemSize: 0 },
	{ name: 'callback sizes with an estimate', itemSize: () => 20, estimatedItemSize: 20 },
	{ name: 'callback sizes without an estimate', itemSize: () => 20, estimatedItemSize: 0 }
];

for (const sizing of sizingCases) {
	test(`an initial index is honored with ${sizing.name}`, async () => {
		const { container, wrapper } = await renderList({
			itemSize: sizing.itemSize,
			estimatedItemSize: sizing.estimatedItemSize,
			scrollToIndex: 50
		});
		await expect.poll(() => wrapper.scrollTop).toBe(1000);
		await expect
			.element(page.elementLocator(container).getByText('Item 50', { exact: true }))
			.toBeVisible();
	});

	test(`an initial offset is applied after layout with ${sizing.name}`, async () => {
		const { container, wrapper } = await renderList({
			itemSize: sizing.itemSize,
			estimatedItemSize: sizing.estimatedItemSize,
			scrollOffset: 1000
		});
		await expect.poll(() => wrapper.scrollTop).toBe(1000);
		await expect
			.element(page.elementLocator(container).getByText('Item 50', { exact: true }))
			.toBeVisible();
	});
}

test('growing the list and changing the target in one update uses the new count', async () => {
	const { component, container, wrapper } = await renderList({ itemCount: 10 });
	await nextFrames();
	component.updateOptions({ itemCount: 100, scrollToIndex: 50 });
	await expect.poll(() => wrapper.scrollTop).toBe(1000);
	await expect
		.element(page.elementLocator(container).getByText('Item 50', { exact: true }))
		.toBeVisible();
});

test('replacing the size callback invalidates previously measured rows', async () => {
	const { component, container, wrapper } = await renderList({
		itemSize: () => 20,
		estimatedItemSize: 20
	});
	await expect.poll(() => getRow(container, 0)?.style.height).toBe('20px');
	component.updateOptions({ itemSize: () => 40, estimatedItemSize: 40 });
	await expect.poll(() => getRow(container, 0)?.style.height).toBe('40px');
	await expect.poll(() => wrapper.scrollHeight).toBe(4000);
});

test('shrinking a callback-based list discards measurements beyond the new count', async () => {
	const { component, container, wrapper } = await renderList({
		itemSize: () => 20,
		estimatedItemSize: 20,
		scrollOffset: 1000
	});
	await expect.poll(() => wrapper.scrollTop).toBe(1000);
	component.updateOptions({ itemCount: 5 });
	await expect.poll(() => wrapper.scrollTop).toBe(0);
	await expect.poll(() => container.querySelectorAll('[data-index]').length).toBe(5);
	await expect
		.poll(
			() =>
				/** @type {HTMLElement | null} */ (container.querySelector('.virtual-list-inner'))?.style
					.height
		)
		.toBe('100px');
	await expect
		.element(page.elementLocator(container).getByText('Item 0', { exact: true }))
		.toBeVisible();
});

test('shrinking and clearing row data never renders stale out-of-range indices', async () => {
	const initialRows = Array.from({ length: 100 }, (_, index) => ({ label: `Row ${index}` }));
	const { component, container } = await render(VirtualListTest, {
		initialRows,
		initialOptions: { scrollOffset: 1000 }
	});
	const wrapper = getWrapper(container);
	await expect.poll(() => wrapper.scrollTop).toBe(1000);
	await expect
		.element(page.elementLocator(container).getByText('Row 50', { exact: true }))
		.toBeVisible();
	component.replaceRows(initialRows.slice(0, 5));
	await expect.poll(() => container.querySelectorAll('[data-index]').length).toBe(5);
	await expect
		.element(page.elementLocator(container).getByText('Row 0', { exact: true }))
		.toBeVisible();
	component.replaceRows([]);
	await nextFrames();
	expect(container.querySelectorAll('[data-index]')).toHaveLength(0);
});

test('smooth scrolling reaches the requested item', async () => {
	const { component, wrapper } = await renderList();
	await nextFrames();
	component.updateOptions({ scrollToIndex: 50, scrollToBehaviour: 'smooth' });
	await expect.poll(() => Math.round(wrapper.scrollTop), { timeout: 5000 }).toBe(1000);
});

test('setting the target back to -1 leaves the current scroll position unchanged', async () => {
	const { component, wrapper } = await renderList();
	await nextFrames();
	component.updateOptions({ scrollToIndex: 50 });
	await expect.poll(() => wrapper.scrollTop).toBe(1000);
	component.updateOptions({ scrollToIndex: -1 });
	await nextFrames();
	expect(wrapper.scrollTop).toBe(1000);
});

test('adding and removing sticky indices updates cached row positioning', async () => {
	const { component, container } = await renderList();
	await expect.poll(() => getRow(container, 0)?.style.position).toBe('absolute');
	component.updateOptions({ stickyIndices: [0] });
	await expect.poll(() => getRow(container, 0)?.style.position).toBe('sticky');
	component.updateOptions({ stickyIndices: [] });
	await expect.poll(() => getRow(container, 0)?.style.position).toBe('absolute');
});

test('changing direction updates row geometry and the scrolling axis', async () => {
	const { component, container, wrapper } = await renderList({ scrollOffset: 1000 });
	await expect.poll(() => wrapper.scrollTop).toBe(1000);
	component.updateOptions({ scrollDirection: 'horizontal' });
	await expect.poll(() => wrapper.scrollLeft).toBe(1000);
	await expect.poll(() => getRow(container, 50)?.style.width).toBe('20px');
	await expect.poll(() => getRow(container, 50)?.style.height).toBe('100%');
	await expect.poll(() => getRow(container, 50)?.style.left).toBe('1000px');
});

test('a header is excluded from the visible item offset', async () => {
	const { container, wrapper } = await renderList({ overscanCount: 0 }, 500);
	await nextFrames();
	wrapper.scrollTop = 500;
	await nextFrames();
	await expect
		.element(page.elementLocator(container).getByText('Item 0', { exact: true }))
		.toBeVisible();
	await expect
		.poll(() => container.querySelector('[data-index]')?.getAttribute('data-index'))
		.toBe('0');
});

test('scrolling to an item includes the header size in the target offset', async () => {
	const { component, container, wrapper } = await renderList({}, 500);
	await nextFrames();
	component.updateOptions({ scrollToIndex: 50 });
	await expect.poll(() => wrapper.scrollTop).toBe(1500);
	await expect
		.element(page.elementLocator(container).getByText('Item 50', { exact: true }))
		.toBeVisible();
});

test('end alignment of the first item accounts for a tall header', async () => {
	const { container, wrapper } = await renderList(
		{ scrollToIndex: 0, scrollToAlignment: 'end' },
		500
	);
	await expect.poll(() => wrapper.scrollTop).toBe(320);
	await expect
		.element(page.elementLocator(container).getByText('Item 0', { exact: true }))
		.toBeVisible();
});

test('changing the header height refreshes the visible item range', async () => {
	const { container, rerender, wrapper } = await renderList({ overscanCount: 0 }, 500);
	wrapper.style.overflowAnchor = 'none';
	await nextFrames();
	wrapper.scrollTop = 500;
	await expect
		.element(page.elementLocator(container).getByText('Item 0', { exact: true }))
		.toBeVisible();
	await rerender({ headerHeight: 0 });
	await expect.poll(() => getRow(container, 0)).toBeNull();
	expect(wrapper.scrollTop).toBe(500);
	await expect
		.element(page.elementLocator(container).getByText('Item 25', { exact: true }))
		.toBeVisible();
});

test('changing overscan refreshes the rendered range without scrolling', async () => {
	const { component, container } = await renderList({ overscanCount: 0 });
	await expect.poll(() => container.querySelectorAll('[data-index]').length).toBe(10);
	component.updateOptions({ overscanCount: 5 });
	await expect.poll(() => container.querySelectorAll('[data-index]').length).toBe(15);
});

for (const estimatedItemSize of [0, 20]) {
	test(`callback sizes remain lazy with estimate ${estimatedItemSize}`, async () => {
		let measurements = 0;
		const { container } = await renderList({
			itemCount: 100000,
			estimatedItemSize,
			itemSize: () => {
				measurements++;
				return 20;
			}
		});
		await expect
			.element(page.elementLocator(container).getByText('Item 0', { exact: true }))
			.toBeVisible();
		await nextFrames();
		expect(measurements).toBeGreaterThan(0);
		expect(measurements).toBeLessThan(100);
	});
}
