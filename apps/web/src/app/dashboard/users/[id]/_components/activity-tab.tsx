import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@emach/ui/components/tabs";

import { getUserActivity, getUserAffectedActivity } from "../../data";
import { ActivityAffectingUserView } from "./activity-affecting-user-view";
import { ActivityByUserView } from "./activity-by-user-view";

export async function ActivityTab({ userId }: { userId: string }) {
	const [byUser, affecting] = await Promise.all([
		getUserActivity(userId, null, 25),
		getUserAffectedActivity(userId, null, 25),
	]);

	return (
		<Tabs defaultValue="affecting">
			<TabsList>
				<TabsTrigger value="affecting">Feito com</TabsTrigger>
				<TabsTrigger value="by">Feito por</TabsTrigger>
			</TabsList>
			<TabsContent value="affecting">
				<ActivityAffectingUserView
					initial={affecting.items}
					initialCursor={affecting.nextCursor}
					userId={userId}
				/>
			</TabsContent>
			<TabsContent value="by">
				<ActivityByUserView
					initial={byUser.items}
					initialCursor={byUser.nextCursor}
					userId={userId}
				/>
			</TabsContent>
		</Tabs>
	);
}
