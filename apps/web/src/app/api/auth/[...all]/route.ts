import { authDashboard } from "@emach/auth/dashboard";
import { toNextJsHandler } from "better-auth/next-js";

export const { GET, POST } = toNextJsHandler(authDashboard);
