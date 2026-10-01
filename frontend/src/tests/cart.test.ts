import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { get } from 'svelte/store';
import { cartStore, cartTotal } from '../lib/stores/cart';
import { db } from '../lib/db';

describe('cartStore', () => {
	beforeEach(async () => {
		cartStore.unload();
		await db.cart.clear();
	});

	it('adds a product to the cart', () => {
		cartStore.add({ id: 'p1', name: 'Café', price_cents: 350 });
		const items = get(cartStore);
		expect(items).toHaveLength(1);
		expect(items[0].product_id).toBe('p1');
		expect(items[0].qty).toBe(1);
		expect(get(cartTotal)).toBe(350);
	});

	it('increments qty when adding the same product twice', () => {
		cartStore.add({ id: 'p1', name: 'Café', price_cents: 350 });
		cartStore.add({ id: 'p1', name: 'Café', price_cents: 350 });
		const items = get(cartStore);
		expect(items).toHaveLength(1);
		expect(items[0].qty).toBe(2);
		expect(get(cartTotal)).toBe(700);
	});

	it('removes a product from the cart', () => {
		cartStore.add({ id: 'p1', name: 'Café', price_cents: 350 });
		cartStore.add({ id: 'p2', name: 'Agua', price_cents: 100 });
		cartStore.remove('p1');
		const items = get(cartStore);
		expect(items).toHaveLength(1);
		expect(items[0].product_id).toBe('p2');
		expect(get(cartTotal)).toBe(100);
	});

	it('clears all items from the cart', () => {
		cartStore.add({ id: 'p1', name: 'Café', price_cents: 350 });
		cartStore.add({ id: 'p2', name: 'Agua', price_cents: 100 });
		cartStore.clear();
		expect(get(cartStore)).toHaveLength(0);
		expect(get(cartTotal)).toBe(0);
	});

	it('restores the cart after closing the session in memory', async () => {
		await cartStore.load('tenant-A');
		cartStore.add({ id: 'p1', name: 'Café', price_cents: 350 });
		await cartStore.persisted();

		cartStore.unload();
		expect(get(cartStore)).toHaveLength(0);

		await cartStore.load('tenant-A');
		const items = get(cartStore);
		expect(items).toHaveLength(1);
		expect(items[0].product_id).toBe('p1');
		expect(items[0].qty).toBe(1);
	});

	it('does not show another tenant cart', async () => {
		await cartStore.load('tenant-A');
		cartStore.add({ id: 'p1', name: 'Café', price_cents: 350 });
		await cartStore.persisted();
		cartStore.unload();

		await cartStore.load('tenant-B');
		expect(get(cartStore)).toHaveLength(0);

		const saved = await db.cart.get('tenant-A');
		expect(saved?.items).toHaveLength(1);
	});

	it('clears the persisted cart of the current tenant', async () => {
		await cartStore.load('tenant-A');
		cartStore.add({ id: 'p1', name: 'Café', price_cents: 350 });
		cartStore.clear();
		await cartStore.persisted();

		cartStore.unload();
		await cartStore.load('tenant-A');
		expect(get(cartStore)).toHaveLength(0);
	});
});
