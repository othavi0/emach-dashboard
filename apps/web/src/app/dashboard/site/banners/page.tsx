import { buttonVariants } from "@emach/ui/components/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@emach/ui/components/empty";
import { Skeleton } from "@emach/ui/components/skeleton";
import type { Metadata } from "next";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { fetchBanners } from "./actions";

const BannerList = dynamic(
	() => import("./_components/banner-list").then((m) => m.BannerList),
	{ loading: () => <Skeleton className="h-64 w-full" /> }
);

export const metadata: Metadata = {
	title: "Banners",
};

export default function BannersPage() {
	return (
		<Suspense>
			<BannersPageContent />
		</Suspense>
	);
}

async function BannersPageContent() {
	const banners = await fetchBanners();

	return (
		<>
			<PageHeader
				action={
					<Link
						className={buttonVariants({ variant: "default" })}
						href="/dashboard/site/banners/new"
					>
						Novo banner
					</Link>
				}
				description="Gerencie os slides do carrossel principal do site."
				title="Banners da home"
			/>
			{banners.length === 0 ? (
				<Empty>
					<EmptyHeader>
						<EmptyTitle>Nenhum banner cadastrado</EmptyTitle>
						<EmptyDescription>
							Crie o primeiro banner do carrossel da home.
						</EmptyDescription>
					</EmptyHeader>
					<EmptyContent>
						<Link
							className={buttonVariants({ variant: "default" })}
							href="/dashboard/site/banners/new"
						>
							Novo banner
						</Link>
					</EmptyContent>
				</Empty>
			) : (
				<BannerList banners={banners} />
			)}
		</>
	);
}
