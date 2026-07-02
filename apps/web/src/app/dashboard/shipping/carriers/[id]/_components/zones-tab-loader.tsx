"use client";

import { LazyTab } from "@/components/entity/lazy-tab";
import type { ZoneWithRates } from "../../../data";
import { fetchCarrierZonesAction } from "../_lib/tab-actions";
import { ZonesTab } from "./zones-tab";

export function ZonesTabLoader({ carrierId }: { carrierId: string }) {
	return (
		<LazyTab load={() => fetchCarrierZonesAction(carrierId)}>
			{(result: { canManage: boolean; zones: ZoneWithRates[] }) => (
				<ZonesTab
					canManage={result.canManage}
					carrierId={carrierId}
					zones={result.zones}
				/>
			)}
		</LazyTab>
	);
}
