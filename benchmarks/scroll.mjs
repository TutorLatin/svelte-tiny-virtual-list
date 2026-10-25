import { cp, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { chromium } from 'playwright';
import { build } from 'vite';

const args = process.argv.slice(2);
if (args.includes('--help') || !args.includes('--baseline')) {
	console.log(`Usage: node benchmarks/scroll.mjs --baseline /path/to/previous/src/lib [--steps 200] [--rounds 3] [--output /tmp/scroll-results.json]

Compares production builds of the baseline and current VirtualList in the same browser.
Requires the project's dependencies and a Playwright Chromium installation.
Counts geometry reads and row style/index evaluations; reports browser scripting/task time.
Both scenarios replay native scroll events one animation frame apart. Wall time includes
frame pacing and is not a measure of component CPU time.`);
	process.exit(args.includes('--help') ? 0 : 1);
}

const option = (name, fallback) => {
	const index = args.indexOf(name);
	return index < 0 ? fallback : args[index + 1];
};
const baselinePath = path.resolve(option('--baseline', ''));
const steps = Number(option('--steps', '200'));
const rounds = Number(option('--rounds', '3'));
if (!Number.isInteger(steps) || steps < 1 || steps > 500) {
	throw new Error('--steps must be an integer between 1 and 500');
}
if (!Number.isInteger(rounds) || rounds < 1) {
	throw new Error('--rounds must be a positive integer');
}
const projectPath = fileURLToPath(new URL('../', import.meta.url));
const fixturePath = await mkdtemp(path.join(tmpdir(), 'virtual-list-scroll-'));
let browser;
let server;

try {
	await cp(baselinePath, path.join(fixturePath, 'baseline'), { recursive: true });
	await cp(path.join(projectPath, 'src/lib'), path.join(fixturePath, 'current'), {
		recursive: true
	});
	await symlink(path.join(projectPath, 'node_modules'), path.join(fixturePath, 'node_modules'));
	await writeFile(path.join(fixturePath, 'package.json'), '{"type":"module"}');
	await writeFile(
		path.join(fixturePath, 'index.html'),
		'<html><head></head><body><div id="app"></div><script type="module" src="/main.js"></script></body></html>'
	);
	await writeFile(
		path.join(fixturePath, 'main.js'),
		`import { mount } from 'svelte';
import Fixture from './Fixture.svelte';
mount(Fixture, { target: document.getElementById('app') });`
	);
	await writeFile(
		path.join(fixturePath, 'Fixture.svelte'),
		`<svelte:options runes={true} />
<script>
import Baseline from './baseline/VirtualList.svelte';
import Current from './current/VirtualList.svelte';
const Component = new URLSearchParams(location.search).get('variant') === 'baseline' ? Baseline : Current;
const stats = window.benchmarkStats = { geometryReads: 0, rowStyleEvaluations: 0, rowIndexEvaluations: 0, callbacks: 0 };
const originalRect = Element.prototype.getBoundingClientRect;
Element.prototype.getBoundingClientRect = function(...args) {
  if (this.classList.contains('virtual-list-wrapper') || this.classList.contains('virtual-list-inner')) stats.geometryReads++;
  return originalRect.apply(this, args);
};
function rowStyle(value) { stats.rowStyleEvaluations++; return value; }
function rowIndex(value) { stats.rowIndexEvaluations++; return value; }
</script>

<Component itemCount={10000} itemSize={1000} height={200} width={300} onItemsUpdated={() => stats.callbacks++}>
  {#snippet item({ index, style })}
    <div data-index={rowIndex(index)} style={rowStyle(style)}>Item {index}</div>
  {/snippet}
</Component>`
	);
	await build({
		configFile: false,
		root: fixturePath,
		logLevel: 'error',
		plugins: [svelte({ configFile: false })],
		build: { outDir: 'dist', minify: true }
	});

	const contentTypes = {
		'.html': 'text/html',
		'.js': 'application/javascript',
		'.css': 'text/css'
	};
	server = createServer(async (request, response) => {
		try {
			const pathname = new URL(request.url, 'http://localhost').pathname;
			const filename = pathname === '/' ? 'index.html' : pathname.slice(1);
			const target = path.resolve(fixturePath, 'dist', filename);
			if (!target.startsWith(path.join(fixturePath, 'dist') + path.sep)) {
				response.writeHead(403).end();
				return;
			}
			response.setHeader('Content-Type', contentTypes[path.extname(target)] || 'text/plain');
			response.end(await readFile(target));
		} catch {
			response.writeHead(404).end();
		}
	});
	await new Promise((resolve, reject) => {
		server.once('error', reject);
		server.listen(0, '127.0.0.1', resolve);
	});
	const address = server.address();
	if (!address || typeof address === 'string') throw new Error('Missing benchmark server address');
	const origin = `http://127.0.0.1:${address.port}`;
	browser = await chromium.launch({ headless: true });
	const samples = [];

	for (let round = 0; round < rounds; round++) {
		// Alternate execution order to reduce systematic warmup/order bias.
		const variants = round % 2 === 0 ? ['baseline', 'current'] : ['current', 'baseline'];
		for (const variant of variants) {
			for (const scenario of ['sub-row', 'changing-range']) {
				const page = await browser.newPage();
				const errors = [];
				page.on('pageerror', (error) => errors.push(error.message));
				await page.goto(`${origin}/?variant=${variant}`);
				try {
					await page.locator('[data-index="0"]').waitFor({ timeout: 10000 });
				} catch (error) {
					throw new Error(
						`${error.message}; browser errors: ${JSON.stringify(errors)}; body: ${await page.locator('body').innerHTML()}`,
						{ cause: error }
					);
				}
				const session = await page.context().newCDPSession(page);
				await session.send('Performance.enable');
				await page.evaluate(async (scenario) => {
					const wrapper = document.querySelector('.virtual-list-wrapper');
					const increment = scenario === 'sub-row' ? 2 : 1000;
					for (let index = 0; index < 60; index++) {
						wrapper.scrollTop = 5000 + index * increment;
						wrapper.dispatchEvent(new Event('scroll'));
						await new Promise(requestAnimationFrame);
					}
					await new Promise(requestAnimationFrame);
					for (const key in window.benchmarkStats) window.benchmarkStats[key] = 0;
				}, scenario);
				const before = await session.send('Performance.getMetrics');
				const result = await page.evaluate(
					async ({ scenario, steps }) => {
						const wrapper = document.querySelector('.virtual-list-wrapper');
						const initialOffset = wrapper.scrollTop;
						const initialRows = Array.from(document.querySelectorAll('[data-index]'), (element) =>
							Number(element.getAttribute('data-index'))
						);
						const started = performance.now();
						for (let index = 1; index <= steps; index++) {
							wrapper.scrollTop = initialOffset + index * (scenario === 'sub-row' ? 2 : 1000);
							wrapper.dispatchEvent(new Event('scroll'));
							await new Promise(requestAnimationFrame);
						}
						await new Promise(requestAnimationFrame);
						return {
							...window.benchmarkStats,
							wallMilliseconds: performance.now() - started,
							initialOffset,
							finalOffset: wrapper.scrollTop,
							initialRows,
							finalRows: Array.from(document.querySelectorAll('[data-index]'), (element) =>
								Number(element.getAttribute('data-index'))
							)
						};
					},
					{ scenario, steps }
				);
				const after = await session.send('Performance.getMetrics');
				const metrics = (entry) =>
					Object.fromEntries(entry.metrics.map(({ name, value }) => [name, value]));
				const beforeMetrics = metrics(before);
				const afterMetrics = metrics(after);
				const sample = {
					round: round + 1,
					variant,
					scenario,
					steps,
					...result,
					scriptMilliseconds: (afterMetrics.ScriptDuration - beforeMetrics.ScriptDuration) * 1000,
					taskMilliseconds: (afterMetrics.TaskDuration - beforeMetrics.TaskDuration) * 1000,
					layoutCount: afterMetrics.LayoutCount - beforeMetrics.LayoutCount,
					errors
				};
				samples.push(sample);
				console.log(JSON.stringify(sample));
				await page.close();
				if (errors.length > 0) throw new Error(`Browser errors: ${errors.join(', ')}`);
				if (
					result.finalOffset !==
						result.initialOffset + steps * (scenario === 'sub-row' ? 2 : 1000) ||
					!result.finalRows.includes(Math.floor(result.finalOffset / 1000))
				) {
					throw new Error('Scroll replay did not render the expected final visible row');
				}
			}
		}
	}
	const report = {
		browser: browser.version(),
		node: process.version,
		baselinePath,
		currentPath: path.join(projectPath, 'src/lib'),
		itemCount: 10000,
		itemSize: 1000,
		viewport: { height: 200, width: 300 },
		steps,
		rounds,
		samples
	};
	const output = option('--output');
	if (output) await writeFile(path.resolve(output), JSON.stringify(report, null, 2) + '\n');
} finally {
	await browser?.close();
	await new Promise((resolve) => (server ? server.close(resolve) : resolve()));
	await rm(fixturePath, { recursive: true, force: true });
}
