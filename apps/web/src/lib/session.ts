import { auth, type Session } from "@emach/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export const getCurrentSession = async (): Promise<Session | null> => {
	return auth.api.getSession({
		headers: await headers(),
	});
};

export const requireCurrentSession = async (): Promise<Session> => {
	const session = await getCurrentSession();

	if (!session?.user) {
		redirect("/login");
	}

	return session;
};
