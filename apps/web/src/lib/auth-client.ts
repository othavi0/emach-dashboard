import { createAuthClient } from "better-auth/react";

// Sem baseURL: o client usa same-origin (window.location). Cobre dev em
// qualquer porta local E a origem única do dashboard em produção — não há
// segunda origem a apontar (diferente do ecommerce). Ver issue #125.
export const authClient = createAuthClient({});
