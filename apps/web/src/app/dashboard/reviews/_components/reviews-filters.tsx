"use client";

import { Badge } from "@emach/ui/components/badge";
import { DatePicker } from "@emach/ui/components/date-picker";
import { Input } from "@emach/ui/components/input";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@emach/ui/components/select";
import { Tabs, TabsList, TabsTrigger } from "@emach/ui/components/tabs";
import Link from "next/link";

import { FiltersBar } from "@/components/filters-bar";
import { formatDateParam, parseDateParam } from "@/lib/date-params";
import { useDebouncedParam, useFilterState } from "@/lib/use-filter-state";

import { REVIEW_TABS } from "../status-meta";
import { StarRating } from "./star-rating";

const BASE = "/dashboard/reviews";
const TRACKED = ["tab", "rating", "q", "from", "to"] as const;
const RATING_ALL = "__all__";
const RATING_OPTIONS = [5, 4, 3, 2, 1] as const;

interface ReviewsFiltersProps {
	counts: Record<string, number>;
	filters: {
		from?: string;
		q?: string;
		rating?: number;
		tab: string;
		to?: string;
	};
}

/** Mantém os filtros não-status na querystring ao trocar de aba. */
function buildTabHref(
	tabKey: string,
	filters: ReviewsFiltersProps["filters"]
): string {
	const params = new URLSearchParams();
	if (tabKey !== "all") {
		params.set("tab", tabKey);
	}
	if (filters.rating) {
		params.set("rating", String(filters.rating));
	}
	if (filters.q) {
		params.set("q", filters.q);
	}
	if (filters.from) {
		params.set("from", filters.from);
	}
	if (filters.to) {
		params.set("to", filters.to);
	}
	const qs = params.toString();
	return qs ? `${BASE}?${qs}` : BASE;
}

export function ReviewsFilters({ counts, filters }: ReviewsFiltersProps) {
	const currentTab = filters.tab || "all";
	const { searchParams, setParam, clearAll, hasActive } = useFilterState({
		basePath: BASE,
		trackedKeys: TRACKED,
	});
	const [q, setQ] = useDebouncedParam({ basePath: BASE, key: "q" });
	const [from, setFrom] = useDebouncedParam({ basePath: BASE, key: "from" });
	const [to, setTo] = useDebouncedParam({ basePath: BASE, key: "to" });
	const currentRating = searchParams.get("rating") ?? RATING_ALL;

	return (
		<div className="flex flex-col gap-4">
			<Tabs value={currentTab}>
				<TabsList scrollable>
					{REVIEW_TABS.map((tab) => {
						const isActive = currentTab === tab.key;
						const count = counts[tab.key] ?? 0;
						return (
							<TabsTrigger
								key={tab.key}
								nativeButton={false}
								render={<Link href={buildTabHref(tab.key, filters)} />}
								value={tab.key}
							>
								<span>{tab.label}</span>
								<Badge
									className="ml-2"
									variant={isActive ? "default" : "secondary"}
								>
									{count}
								</Badge>
							</TabsTrigger>
						);
					})}
				</TabsList>
			</Tabs>

			<FiltersBar hasActive={hasActive} onClear={clearAll}>
				<div className="flex flex-1 flex-col gap-1">
					<label className="text-muted-foreground text-xs" htmlFor="reviews-q">
						Buscar cliente, produto ou texto
					</label>
					<Input
						id="reviews-q"
						onChange={(e) => setQ(e.target.value)}
						placeholder="Ex: Larissa, Furadeira ou parte do comentário"
						value={q}
					/>
				</div>

				<div className="flex flex-col gap-1 md:w-40">
					<label
						className="text-muted-foreground text-xs"
						htmlFor="reviews-from"
					>
						De
					</label>
					<DatePicker
						id="reviews-from"
						onChange={(d) => setFrom(formatDateParam(d))}
						value={parseDateParam(from)}
					/>
				</div>

				<div className="flex flex-col gap-1 md:w-40">
					<label className="text-muted-foreground text-xs" htmlFor="reviews-to">
						Até
					</label>
					<DatePicker
						id="reviews-to"
						min={parseDateParam(from)}
						onChange={(d) => setTo(formatDateParam(d))}
						value={parseDateParam(to)}
					/>
				</div>

				<div className="flex flex-col gap-1 md:w-44">
					<label
						className="text-muted-foreground text-xs"
						htmlFor="reviews-rating"
					>
						Nota
					</label>
					<Select
						onValueChange={(v) =>
							setParam("rating", v === RATING_ALL ? null : (v as string))
						}
						value={currentRating}
					>
						<SelectTrigger id="reviews-rating">
							<SelectValue>
								{(v: string) =>
									v === RATING_ALL ? (
										"Todas as notas"
									) : (
										<StarRating rating={Number(v)} />
									)
								}
							</SelectValue>
						</SelectTrigger>
						<SelectContent>
							<SelectGroup>
								<SelectItem value={RATING_ALL}>Todas as notas</SelectItem>
								{RATING_OPTIONS.map((r) => (
									<SelectItem key={r} value={String(r)}>
										<StarRating rating={r} />
									</SelectItem>
								))}
							</SelectGroup>
						</SelectContent>
					</Select>
				</div>
			</FiltersBar>
		</div>
	);
}
