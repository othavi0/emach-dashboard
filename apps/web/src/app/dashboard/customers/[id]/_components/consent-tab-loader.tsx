"use client";

import { LazyTab } from "@/components/entity/lazy-tab";
import { CustomerConsentList } from "../../_components/customer-consent-list";
import type { CustomerConsentByKind } from "../../data";
import { fetchCustomerConsentTabAction } from "../_lib/tab-actions";

export function ConsentTabLoader({ clientId }: { clientId: string }) {
	return (
		<LazyTab load={() => fetchCustomerConsentTabAction(clientId)}>
			{(consentByKind: CustomerConsentByKind) => (
				<CustomerConsentList consentByKind={consentByKind} />
			)}
		</LazyTab>
	);
}
