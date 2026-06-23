import { fetchCarriersPage } from "../actions";
import { CarrierCardGrid } from "./carrier-card-grid";

export async function CarriersTab() {
	const { items, nextCursor } = await fetchCarriersPage({ cursor: null });

	return (
		<div className="flex flex-col gap-4">
			<CarrierCardGrid initial={items} initialCursor={nextCursor} />
		</div>
	);
}
