<script>
	import VirtualList from '$lib/VirtualList.svelte';
</script>

<svelte:head>
	<title>Horizontal list | svelte-tiny-virtual-list</title>
</svelte:head>

<div id="horizontal-list-example" class="example-page">
	<h3>Horizontal list</h3>

	<article>
		<div class="row scroll">
			<VirtualList scrollDirection="horizontal" itemCount={100000} itemSize={150}>
				{#snippet item({ style, index })}
					<div {style} class="virtual-list-col">
						Item #{index}
					</div>
				{/snippet}
			</VirtualList>
		</div>
	</article>

	<!-- TODO: Show example code -->
</div>

<style>
	article > div {
		height: 200px;
	}
</style>
