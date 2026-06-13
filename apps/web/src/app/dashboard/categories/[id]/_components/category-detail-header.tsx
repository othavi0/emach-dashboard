import { Badge } from "@emach/ui/components/badge";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@emach/ui/components/breadcrumb";
import { FolderTree } from "lucide-react";
import Link from "next/link";
import { Fragment, type ReactNode } from "react";

import { EntityIdentityHeader } from "@/components/entity/entity-identity-header";

interface Props {
	actions?: ReactNode;
	ancestors: { id: string; name: string }[];
	isActive: boolean;
	name: string;
	path: string;
}

const CRUMB_LINK = "transition-colors hover:text-foreground";

export function CategoryDetailHeader({
	actions,
	ancestors,
	isActive,
	name,
	path,
}: Props) {
	return (
		<div className="flex flex-col gap-3">
			<Breadcrumb>
				<BreadcrumbList>
					<BreadcrumbItem>
						<Link className={CRUMB_LINK} href="/dashboard">
							Início
						</Link>
					</BreadcrumbItem>
					<BreadcrumbSeparator />
					<BreadcrumbItem>
						<Link className={CRUMB_LINK} href="/dashboard/categories">
							Categorias
						</Link>
					</BreadcrumbItem>
					{ancestors.map((a) => (
						<Fragment key={a.id}>
							<BreadcrumbSeparator />
							<BreadcrumbItem>
								<Link
									className={CRUMB_LINK}
									href={`/dashboard/categories/${a.id}`}
								>
									{a.name}
								</Link>
							</BreadcrumbItem>
						</Fragment>
					))}
					<BreadcrumbSeparator />
					<BreadcrumbItem>
						<BreadcrumbPage>{name}</BreadcrumbPage>
					</BreadcrumbItem>
				</BreadcrumbList>
			</Breadcrumb>

			<EntityIdentityHeader
				actions={actions}
				avatarClassName="rounded-lg after:rounded-lg"
				avatarFallback={<FolderTree aria-hidden className="size-5" />}
				badges={
					<Badge variant={isActive ? "success" : "outline"}>
						{isActive ? "Ativa" : "Inativa"}
					</Badge>
				}
				subtitle={<code className="text-xs">{path}</code>}
				title={name}
			/>
		</div>
	);
}
