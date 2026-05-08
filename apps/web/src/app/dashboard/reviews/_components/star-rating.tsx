import { StarIcon } from "lucide-react";

const STAR_COUNT = 5;

export function StarRating({ rating }: { rating: number }) {
	const clamped = Math.max(0, Math.min(STAR_COUNT, Math.round(rating)));
	return (
		<span
			aria-label={`${clamped} de ${STAR_COUNT} estrelas`}
			className="inline-flex items-center gap-0.5 text-warning"
			role="img"
		>
			{Array.from({ length: STAR_COUNT }, (_, i) => (
				<StarIcon
					aria-hidden="true"
					className={
						i < clamped ? "size-3.5 fill-current" : "size-3.5 opacity-30"
					}
					key={`star-${i}-${i < clamped ? "on" : "off"}`}
				/>
			))}
		</span>
	);
}
