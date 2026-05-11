import { redirect } from "next/navigation";

import AuthCard from "@/components/auth-card";
import { getCurrentSession, getUserStatus } from "@/lib/session";

export default async function LoginPage() {
	const session = await getCurrentSession();

	if (session?.user) {
		const status = getUserStatus(session);
		if (status === "pending") {
			redirect("/pending");
		}
		if (status === "suspended") {
			redirect("/suspended");
		}
		redirect("/dashboard");
	}

	return (
		<main className="flex flex-1 items-center justify-center px-6 py-12">
			<AuthCard />
		</main>
	);
}
