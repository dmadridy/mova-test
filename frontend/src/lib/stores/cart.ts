import { writable, derived } from 'svelte/store';
import { db } from '$lib/db';
import type { Product } from '$lib/db';

export interface CartItem {
	product_id: string;
	name: string;
	price_cents: number;
	qty: number;
}

export function createCartStore() {
	let tenantId = '';
	let loadedFor = '';
	let epoch = 0;
	let inflight: Promise<void> | null = null;
	let inflightId = '';
	// Las escrituras van en orden: dos clicks seguidos no pueden guardar
	// el carrito viejo encima del nuevo.
	let write = Promise.resolve();
	const { subscribe, update, set } = writable<CartItem[]>([]);

	function persist(items: CartItem[]) {
		const id = tenantId;
		if (!id) return;
		const snapshot = items.map((item) => ({ ...item }));
		write = write
			.then(() => db.cart.put({ tenant_id: id, items: snapshot }))
			.then(() => undefined)
			.catch(() => undefined);
	}

	return {
		subscribe,
		/**
		 * Lee el carrito de este comercio. Otro tenant no ve estas líneas:
		 * la fila está claveada por `tenant_id`.
		 */
		load(id: string): Promise<void> {
			if (loadedFor === id) return Promise.resolve();
			if (inflight && inflightId === id) return inflight;
			tenantId = id;
			const seen = epoch;
			inflightId = id;
			inflight = db.cart
				.get(id)
				.then((row) => {
					if (tenantId !== id || seen !== epoch) {
						if (tenantId === id) loadedFor = id;
						return;
					}
					set(row?.items ?? []);
					loadedFor = id;
				})
				.catch(() => {
					if (tenantId === id) loadedFor = id;
				})
				.finally(() => {
					if (inflightId === id) {
						inflight = null;
						inflightId = '';
					}
				});
			return inflight;
		},
		add(product: Pick<Product, 'id' | 'name' | 'price_cents'>) {
			epoch++;
			update((items) => {
				const existing = items.find((i) => i.product_id === product.id);
				const next = existing
					? items.map((i) =>
							i.product_id === product.id ? { ...i, qty: i.qty + 1 } : i
						)
					: [
							...items,
							{
								product_id: product.id,
								name: product.name,
								price_cents: product.price_cents,
								qty: 1
							}
						];
				persist(next);
				return next;
			});
		},
		remove(product_id: string) {
			epoch++;
			update((items) => {
				const next = items.filter((i) => i.product_id !== product_id);
				persist(next);
				return next;
			});
		},
		/** Vacía la venta en curso de este comercio, también en IndexedDB. */
		clear() {
			epoch++;
			set([]);
			persist([]);
		},
		/**
		 * Suelta la sesión en memoria sin borrar el carrito guardado.
		 * Al volver a entrar al mismo comercio, `load` lo recupera.
		 */
		unload() {
			epoch++;
			tenantId = '';
			loadedFor = '';
			set([]);
		},
		/** Termina las escrituras ya encoladas a IndexedDB. */
		persisted() {
			return write;
		}
	};
}

export const cartStore = createCartStore();

export const cartTotal = derived(cartStore, ($cart) =>
	$cart.reduce((sum, item) => sum + item.price_cents * item.qty, 0)
);
