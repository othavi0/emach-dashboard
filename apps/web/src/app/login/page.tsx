import { redirect } from "next/navigation";

import AuthCard from "@/components/auth-card";
import { getCurrentSession } from "@/lib/session";

export default async function LoginPage() {
	const session = await getCurrentSession();

	if (session?.user) {
		redirect("/dashboard");
	}

	return (
		<main className="flex flex-1 items-center justify-center px-6 py-12">
			<AuthCard />
		</main>
	);
}
