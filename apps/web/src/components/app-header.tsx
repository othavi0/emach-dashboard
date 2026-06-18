"use client";

import { Button, buttonVariants } from "@emach/ui/components/button";
import { Skeleton } from "@emach/ui/components/skeleton";
import { cn } from "@emach/ui/lib/utils";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { authClient } from "@/lib/auth-client";

const DASHBOARD_ROUTE = "/dashboard";
const LOGIN_ROUTE = "/login";
const AUTH_ROUTES = [
	"/login",
	"/esqueci-senha",
	"/pending",
	"/suspended",
	"/redefinir-senha",
	"/convite",
	"/verificar-email",
];

export default function AppHeader() {
	const pathname = usePathname();

	const isDashboardRoute = pathname.startsWith(DASHBOARD_ROUTE);
	const isAuthRoute = AUTH_ROUTES.some((route) => pathname.startsWith(route));

	// Gate por pathname ANTES de qualquer hook de rede: em rota de dashboard/auth o
	// header não aparece, então não montamos o componente que chama useSession() —
	// evita um /api/auth/get-session redundante em todo full-load do dashboard.
	if (isDashboardRoute || isAuthRoute) {
		return null;
	}

	return <AppHeaderContent />;
}

function AppHeaderContent() {
	const router = useRouter();
	const { data: session, isPending } = authClient.useSession();

	const handleSignOut = async () => {
		await authClient.signOut({
			fetchOptions: {
				onSuccess: () => {
					router.replace(LOGIN_ROUTE);
					router.refresh();
				},
			},
		});
	};

	let authControls = (
		<Link
			className={buttonVariants({ size: "default", variant: "secondary" })}
			href={LOGIN_ROUTE}
		>
			Entrar
		</Link>
	);

	if (isPending) {
		authControls = <Skeleton className="h-8 w-32" />;
	} else if (session?.user) {
		authControls = (
			<div className="flex items-center gap-3">
				<div className="hidden text-right sm:block">
					<p className="font-medium text-sm">{session.user.name}</p>
					<p className="text-muted-foreground text-sm">{session.user.email}</p>
				</div>

				<Button onClick={handleSignOut} variant="outline">
					Sair
				</Button>
			</div>
		);
	}

	return (
		<header className="border-b">
			<div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 py-4">
				<div className="flex items-center gap-6">
					<Link
						className="font-semibold text-sm uppercase tracking-[0.24em]"
						href={session?.user ? DASHBOARD_ROUTE : LOGIN_ROUTE}
					>
						emach ferramentas
					</Link>

					{session?.user ? (
						<nav className="flex items-center gap-2">
							<Link
								className={cn(
									buttonVariants({
										variant: "ghost",
										size: "sm",
									})
								)}
								href={DASHBOARD_ROUTE}
							>
								Dashboard
							</Link>
						</nav>
					) : null}
				</div>

				{authControls}
			</div>
		</header>
	);
}
