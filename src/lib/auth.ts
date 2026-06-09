import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined),
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
        "https://www.googleapis.com/auth/calendar.events"
      ],
      accessType: "offline",
      prompt: "consent"
    },
  },
  plugins: [
    nextCookies(),
  ]
});
