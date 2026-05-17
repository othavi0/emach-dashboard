import { pgEnum } from "drizzle-orm/pg-core";

export const actorTypeEnum = pgEnum("actor_type", ["user", "system"]);
export type ActorType = (typeof actorTypeEnum.enumValues)[number];
