"use client";

import { Button } from "@emach/ui/components/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRef } from "react";

import type { ToolDetailImage } from "../_lib/tool-detail-data";

const MAX_IMAGES = 8;

export function ImageCarousel({ images }: { images: ToolDetailImage[] }) {
	const shown = images.slice(0, MAX_IMAGES);
	const trackRef = useRef<HTMLDivElement>(null);

	if (shown.length === 0) {
		return <div className="aspect-video rounded-md bg-muted" />;
	}

	const overflows = shown.length > 4;

	function scrollByPage(dir: 1 | -1) {
		const track = trackRef.current;
		if (!track) {
			return;
		}
		const reduce = window.matchMedia(
			"(prefers-reduced-motion: reduce)"
		).matches;
		track.scrollBy({
			left: dir * track.clientWidth * 0.8,
			behavior: reduce ? "auto" : "smooth",
		});
	}

	return (
		<div className="relative">
			<div
				className="flex gap-2 overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
				ref={trackRef}
				style={{ scrollSnapType: "x mandatory" }}
			>
				{shown.map((img) => (
					// biome-ignore lint/performance/noImgElement: Supabase public URL
					// biome-ignore lint/correctness/useImageSize: thumb Supabase, dimensões via CSS
					<img
						alt=""
						className="aspect-square w-[calc((100%-1.5rem)/4)] flex-shrink-0 rounded-md object-cover"
						key={img.id}
						src={img.url}
						style={{ scrollSnapAlign: "start" }}
					/>
				))}
			</div>

			{overflows && (
				<>
					<Button
						aria-label="Imagens anteriores"
						className="absolute top-1/2 left-1 -translate-y-1/2"
						onClick={() => scrollByPage(-1)}
						size="icon-sm"
						variant="secondary"
					>
						<ChevronLeft aria-hidden className="size-4" />
					</Button>
					<Button
						aria-label="Próximas imagens"
						className="absolute top-1/2 right-1 -translate-y-1/2"
						onClick={() => scrollByPage(1)}
						size="icon-sm"
						variant="secondary"
					>
						<ChevronRight aria-hidden className="size-4" />
					</Button>
				</>
			)}
		</div>
	);
}
