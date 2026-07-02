"use client";

import { LazyTab } from "@/components/entity/lazy-tab";
import { CustomerAddressesList } from "../../_components/customer-addresses-list";
import type { CustomerAddressRow } from "../../data";
import { fetchCustomerAddressesTabAction } from "../_lib/tab-actions";

export function AddressesTabLoader({ clientId }: { clientId: string }) {
	return (
		<LazyTab load={() => fetchCustomerAddressesTabAction(clientId)}>
			{(addresses: CustomerAddressRow[]) => (
				<CustomerAddressesList addresses={addresses} />
			)}
		</LazyTab>
	);
}
