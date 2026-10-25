import { expect, test } from '@playwright/test';

test('index page has expected text from readme', async ({ page }) => {
	await page.goto('/');
	await expect(
		page.getByText('A tiny but mighty list virtualization library, with zero dependencies 💪')
	).toBeVisible();
});

test('equal-height example renders and scrolls a virtual list after navigation', async ({
	page
}) => {
	await page.goto('/');
	await page
		.locator('nav.left.drawer')
		.getByRole('link', { name: 'Elements of equal height', exact: true })
		.click();
	await expect(page).toHaveURL('/examples/elements-of-equal-height');

	const example = page.locator('#elements-of-equal-height-example');
	const firstItem = example.getByText('Item #0', { exact: true });
	const lastItem = example.getByText('Item #99999', { exact: true });
	await expect(firstItem).toBeVisible();
	await expect(lastItem).toHaveCount(0);
	expect(await example.locator('.virtual-list-row').count()).toBeLessThan(100);

	await example.locator('.virtual-list-wrapper').evaluate((element) => {
		element.scrollTop = element.scrollHeight;
	});
	await expect(lastItem).toBeVisible();
	await expect(firstItem).toHaveCount(0);
	expect(await example.locator('.virtual-list-row').count()).toBeLessThan(100);
});
