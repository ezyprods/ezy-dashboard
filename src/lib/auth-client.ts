import { createAuthClient } from "better-auth/react";

// En producción, NEXT_PUBLIC_BETTER_AUTH_URL debe estar configurada en Vercel.
// En desarrollo, usa la URL del navegador actual (siempre correcta en localhost).
const baseURL =
  typeof window !== "undefined"
    ? window.location.origin
    : process.env.NEXT_PUBLIC_BETTER_AUTH_URL ||
      process.env.BETTER_AUTH_URL ||
      "http://localhost:3000";

export const authClient = createAuthClient({ baseURL });
