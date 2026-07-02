"use client";

import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@emach/ui/components/tabs";
import { PenLine, Target } from "lucide-react";

import type { UserActivityTabData } from "../_lib/tab-actions";
import { ActivityAffectingUserView } from "./activity-affecting-user-view";
import { ActivityByUserView } from "./activity-by-user-view";

interface Props extends UserActivityTabData {
	userId: string;
}

export function ActivityTabClient({ affecting, byUser, userId }: Props) {
	return (
		<Tabs defaultValue="affecting">
			<TabsList>
				<TabsTrigger value="affecting">
					<Target aria-hidden className="size-3.5" />
					Feito com
				</TabsTrigger>
				<TabsTrigger value="by">
					<PenLine aria-hidden className="size-3.5" />
					Feito por
				</TabsTrigger>
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
