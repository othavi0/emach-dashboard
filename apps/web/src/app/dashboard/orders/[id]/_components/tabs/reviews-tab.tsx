import { OrderReviewsSection } from "../../../_components/order-reviews-section";
import type { OrderReviewRow } from "../../../data";

export function ReviewsTab({ rows }: { rows: OrderReviewRow[] }) {
	return <OrderReviewsSection rows={rows} />;
}
