import { pgEnum } from "drizzle-orm/pg-core";

export const actorTypeEnum = pgEnum("actor_type", ["user", "apiKey", "system"]);
export type ActorType = (typeof actorTypeEnum.enumValues)[number];
