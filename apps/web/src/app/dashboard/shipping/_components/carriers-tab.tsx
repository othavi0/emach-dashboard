import { fetchCarriersPage } from "../actions";
import { CarrierCardGrid } from "./carrier-card-grid";
import { CarrierCreateSheet } from "./carrier-create-sheet";

export async function CarriersTab() {
	const { items, nextCursor } = await fetchCarriersPage({ cursor: null });

	return (
		<div className="flex flex-col gap-4">
			<CarrierCardGrid initial={items} initialCursor={nextCursor} />
			<CarrierCreateSheet />
		</div>
	);
}
