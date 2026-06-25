import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";

// Determina la URL base de la app — en producción viene de BETTER_AUTH_URL,
// en desarrollo usa localhost:3000.
const appURL =
  process.env.BETTER_AUTH_URL ||
  process.env.NEXT_PUBLIC_BETTER_AUTH_URL ||
  "http://localhost:3000";

// Construir lista de orígenes de confianza
const trustedOrigins: string[] = [appURL];
// En producción siempre confiamos en el dominio de Vercel
if (process.env.VERCEL_URL) {
  trustedOrigins.push(`https://${process.env.VERCEL_URL}`);
}

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: appURL,
  trustedOrigins,

  // ── Sesión permanente: prácticamente infinita ────────────────────────────
  session: {
    expiresIn: 60 * 60 * 24 * 365 * 100,  // 100 años en segundos (prácticamente infinito)
    updateAge: 60 * 60 * 24,          // Refrescar la cookie cada 24h para mantener el máximo que permite el navegador
    disableSessionRefresh: false,      // Asegurar que el refresco está ACTIVO
    cookieCache: {
      enabled: true,
      maxAge: 60 * 60 * 24,           // Cookie de caché dura 1 día (refresco diario)
    },
  },

  // ── Proveedor Google ─────────────────────────────────────────────────────
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      // Pedimos accesos a Drive y Calendar además del login básico
      scope: [
        "openid",
        "profile",
        "email",
        "https://www.googleapis.com/auth/drive.file",
        "https://www.googleapis.com/auth/calendar.events",
      ],
      accessType: "offline",
      prompt: "select_account consent",
    },
  },

  plugins: [nextCookies()],
});
