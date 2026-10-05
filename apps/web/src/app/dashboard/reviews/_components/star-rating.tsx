import { StarIcon } from "lucide-react";

const STAR_POSITIONS = [1, 2, 3, 4, 5] as const;
const STAR_COUNT = STAR_POSITIONS.length;

export function StarRating({ rating }: { rating: number }) {
	const clamped = Math.max(0, Math.min(STAR_COUNT, Math.round(rating)));
	return (
		<span
			aria-label={`${clamped} de ${STAR_COUNT} estrelas`}
			className="inline-flex items-center gap-0.5 text-warning"
			role="img"
		>
			{STAR_POSITIONS.map((position) => (
				<StarIcon
					aria-hidden="true"
					className={
						position <= clamped
							? "size-3.5 fill-current"
							: "size-3.5 opacity-30"
					}
					key={position}
				/>
			))}
		</span>
	);
}
