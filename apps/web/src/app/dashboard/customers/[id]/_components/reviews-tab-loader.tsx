"use client";

import { LazyTab } from "@/components/entity/lazy-tab";
import { CustomerReviewsTable } from "../../_components/customer-reviews-table";
import type { CustomerReviewRow } from "../../data";
import { fetchCustomerReviewsTabAction } from "../_lib/tab-actions";

interface Props {
	canModerate: boolean;
	clientId: string;
}

export function ReviewsTabLoader({ canModerate, clientId }: Props) {
	return (
		<LazyTab load={() => fetchCustomerReviewsTabAction(clientId)}>
			{(reviews: CustomerReviewRow[]) => (
				<CustomerReviewsTable canModerate={canModerate} items={reviews} />
			)}
		</LazyTab>
	);
}
