import { buttonVariants } from "@emach/ui/components/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@emach/ui/components/empty";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { BannerList } from "./_components/banner-list";
import { fetchBanners } from "./actions";

export const metadata: Metadata = {
	title: "Banners",
};

export default async function BannersPage() {
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
