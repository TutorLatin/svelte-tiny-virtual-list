import { expect, test } from '@playwright/test';

test('Hacker News loads page zero and links stories by objectID', async ({ page }) => {
	let firstPage = true;
	await page.route('https://hn.algolia.com/api/**', async (route) => {
		const hits = firstPage
			? [
					{
						objectID: '123456',
						created_at: '2026-01-01T00:00:00Z',
						title: 'Ask HN fixture story',
						author: 'fixture-author',
						url: null,
						points: 12,
						num_comments: 7
					},
					{
						objectID: '123457',
						created_at: '2026-01-01T00:00:00Z',
						title: 'External fixture story',
						author: 'fixture-author',
						url: 'https://example.com/article',
						points: 5,
						num_comments: 3
					}
				]
			: [];
		firstPage = false;
		await route.fulfill({ json: { hits } });
	});
	const firstRequest = page.waitForRequest((request) =>
		request.url().startsWith('https://hn.algolia.com/api/v1/search_by_date?')
	);
	await page.goto('/demos/hacker-news');
	expect(new URL((await firstRequest).url()).searchParams.get('page')).toBe('0');

	const selfStory = page.locator('.hacker-news-item').nth(0);
	const selfDiscussion = 'https://news.ycombinator.com/item?id=123456';
	await expect(selfStory.getByRole('link', { name: 'Ask HN fixture story' })).toHaveAttribute(
		'href',
		selfDiscussion
	);
	await expect(selfStory.locator('a[title]')).toHaveAttribute('href', selfDiscussion);
	await expect(selfStory.getByRole('link', { name: '7 comments' })).toHaveAttribute(
		'href',
		selfDiscussion
	);

	const externalStory = page.locator('.hacker-news-item').nth(1);
	await expect(externalStory.getByRole('link', { name: 'External fixture story' })).toHaveAttribute(
		'href',
		'https://example.com/article'
	);
	await expect(externalStory.getByRole('link', { name: '3 comments' })).toHaveAttribute(
		'href',
		'https://news.ycombinator.com/item?id=123457'
	);
});
