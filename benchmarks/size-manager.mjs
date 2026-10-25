import { stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
	options: {
		baseline: { type: 'string' },
		rows: { type: 'string', default: '1000000' },
		queries: { type: 'string', default: '100000' },
		rounds: { type: 'string', default: '7' },
		output: { type: 'string' },
		help: { type: 'boolean', default: false }
	}
});

if (values.help) {
	console.log(`Usage: node --expose-gc benchmarks/size-manager.mjs [options]

Measures fixed-size list initialization, updates, lookups, and visible-range queries.
Runs two warmup samples, then reports the median of the measured samples.
Retained heap measurements require --expose-gc and use up to three samples.

Options:
  --baseline <path>  Compare with an old SizeAndPositionManager.js file or src/lib directory
  --rows <count>     Large-list row count (default: 1000000)
  --queries <count>  Queries per sample (default: 100000)
  --rounds <count>   Measured CPU samples (default: 7)
  --output <file>    Save JSON results, including individual samples and checksums
  --help            Show this message

The baseline module must retain its relative imports, such as constants.js.
Each baseline/current workload must produce the same checksum.`);
	process.exit(0);
}

const rows = Number(values.rows);
const queries = Number(values.queries);
const rounds = Number(values.rounds);
for (const [name, value] of Object.entries({ rows, queries, rounds })) {
	if (!Number.isSafeInteger(value) || value < 1) {
		throw new Error(`--${name} must be a positive safe integer`);
	}
}

const warmups = 2;
const collectGarbage = globalThis.gc;
if (!collectGarbage) {
	console.warn('Run with node --expose-gc to enable retained-heap measurements.');
}
const retainedReference = Symbol('size-manager-benchmark');
const median = (samples) => {
	const sorted = [...samples].sort((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);
	return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

function measure(work) {
	for (let round = 0; round < warmups; round++) work();
	const samplesMs = [];
	let checksum;
	for (let round = 0; round < rounds; round++) {
		collectGarbage?.();
		const start = performance.now();
		const result = work();
		samplesMs.push(performance.now() - start);
		if (checksum !== undefined && checksum !== result) {
			throw new Error('A repeated workload produced inconsistent checksums');
		}
		checksum = result;
	}
	return { medianMs: median(samplesMs), samplesMs, checksum };
}

function measureHeap(Manager, itemCount) {
	if (!collectGarbage) return null;
	const samplesBytes = [];
	let checksum;
	try {
		for (let round = 0; round < Math.min(rounds, 3); round++) {
			collectGarbage();
			const before = process.memoryUsage().heapUsed;
			globalThis[retainedReference] = new Manager(32, itemCount, 0);
			collectGarbage();
			samplesBytes.push(process.memoryUsage().heapUsed - before);
			checksum = globalThis[retainedReference].getTotalSize();
			delete globalThis[retainedReference];
		}
	} finally {
		delete globalThis[retainedReference];
		collectGarbage();
	}
	return { medianBytes: median(samplesBytes), samplesBytes, checksum };
}

function benchmark(Manager) {
	const cpu = {};
	const heap = {};
	for (const itemCount of new Set([Math.min(rows, 100000), rows])) {
		cpu[`construct ${itemCount} rows`] = measure(() =>
			new Manager(32, itemCount, 0).getTotalSize()
		);
		heap[`${itemCount} rows`] = measureHeap(Manager, itemCount);
	}

	const manager = new Manager(32, rows, 0);
	cpu['10 count/size updates'] = measure(() => {
		let checksum = 0;
		for (let step = 0; step < 10; step++) {
			manager.updateConfig(32 + (step % 2), rows + (step % 2), 0);
			checksum += manager.getTotalSize();
		}
		return checksum;
	});
	manager.updateConfig(32, rows, 0);

	cpu[`${queries} position lookups`] = measure(() => {
		let checksum = 0;
		for (let index = 0; index < queries; index++) {
			const position = manager.getSizeAndPositionForIndex((index * 7919) % rows);
			checksum += position.offset + position.size;
		}
		return checksum;
	});
	cpu[`${queries} nearest-item queries`] = measure(() => {
		let checksum = 0;
		for (let index = 0; index < queries; index++) {
			checksum += manager.findNearestItem((index * 7919) % (32 * rows));
		}
		return checksum;
	});
	cpu[`${queries} visible-range queries`] = measure(() => {
		let checksum = 0;
		for (let index = 0; index < queries; index++) {
			const range = manager.getVisibleRange(600, (index * 7919) % (32 * rows), 3);
			checksum += range.start + range.end;
		}
		return checksum;
	});
	const wideQueries = Math.max(1, Math.floor(queries / 100));
	cpu[`${wideQueries} wide-viewport queries`] = measure(() => {
		let checksum = 0;
		for (let index = 0; index < wideQueries; index++) {
			const range = manager.getVisibleRange(320000, (index * 7919) % (32 * rows), 3);
			checksum += range.start + range.end;
		}
		return checksum;
	});
	return { cpu, heap };
}

const currentPath = fileURLToPath(new URL('../src/lib/SizeAndPositionManager.js', import.meta.url));
const modules = { current: currentPath };
if (values.baseline) {
	const baseline = path.resolve(values.baseline);
	modules.baseline = (await stat(baseline)).isDirectory()
		? path.join(baseline, 'SizeAndPositionManager.js')
		: baseline;
}
const results = {};
for (const [name, modulePath] of Object.entries(modules)) {
	const { default: Manager } = await import(pathToFileURL(modulePath).href);
	results[name] = benchmark(Manager);
}

if (results.baseline) {
	for (const kind of ['cpu', 'heap']) {
		for (const [name, current] of Object.entries(results.current[kind])) {
			const baseline = results.baseline[kind][name];
			if (current && baseline && current.checksum !== baseline.checksum) {
				throw new Error(`Baseline/current checksum mismatch: ${name}`);
			}
		}
	}
}

console.log(
	`Node ${process.version}, ${rows} rows; CPU medians in milliseconds (${rounds} samples).`
);
console.table(
	Object.fromEntries(
		Object.entries(results.current.cpu).map(([name, current]) => {
			const baseline = results.baseline?.cpu[name];
			return [
				name,
				{
					current: +current.medianMs.toFixed(4),
					...(baseline && {
						baseline: +baseline.medianMs.toFixed(4),
						speedup: `${(baseline.medianMs / current.medianMs).toFixed(1)}x`
					})
				}
			];
		})
	)
);
if (collectGarbage) {
	console.log('Retained heap in bytes (small changes are subject to GC noise).');
	console.table(
		Object.fromEntries(
			Object.entries(results.current.heap).map(([name, current]) => [
				name,
				{
					current: current.medianBytes,
					...(results.baseline && { baseline: results.baseline.heap[name].medianBytes })
				}
			])
		)
	);
}
if (values.output) {
	await writeFile(
		values.output,
		`${JSON.stringify(
			{
				node: process.version,
				platform: process.platform,
				arch: process.arch,
				rows,
				queries,
				rounds,
				warmups,
				modules,
				results
			},
			null,
			2
		)}\n`
	);
	console.log(`Saved results to ${values.output}`);
}
