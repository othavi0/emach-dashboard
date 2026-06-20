import { ListPageSkeleton } from "@/components/page-skeletons";

// Boundary de loading do segmento: é o que o router exibe durante a navegação
// client-side (o <Suspense> interno da page não serve de fallback de nav).
export default function Loading() {
	return <ListPageSkeleton />;
}
