import type { Metadata, Viewport } from "next";
import { AudioProvider } from "@/lib/contexts/AudioContext";
import { ContextMenuProvider } from "@/lib/contexts/ContextMenuContext";
import { GlobalAudioPlayer } from "@/components/layout/GlobalAudioPlayer";
import { DialogProvider } from "@/components/ui/DialogProvider";
import { ThemeProvider } from "@/lib/contexts/ThemeContext";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ezy",
  description: "Plataforma de gestión de producción musical para productores independientes.",
  applicationName: "Ezy",
  // iOS: "Añadir a pantalla de inicio" abre la app a pantalla completa, sin la barra de Safari
  appleWebApp: {
    capable: true,
    title: "Ezy",
    statusBarStyle: "black-translucent",
  },
  // iOS convierte en enlaces de llamada cualquier número largo (importes, BPM, fechas...)
  formatDetection: {
    telephone: false,
    email: false,
    address: false,
    date: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Evita el zoom automático de iOS Safari al enfocar inputs con texto < 16px.
  // iOS sigue permitiendo el pellizco para hacer zoom manual (ignora este límite para el gesto).
  maximumScale: 1,
  // Necesario para que env(safe-area-inset-*) funcione (notch, Dynamic Island, home indicator)
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0f" },
    { media: "(prefers-color-scheme: light)", color: "#f5f5f9" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="dark h-full antialiased" suppressHydrationWarning>
      <head>
        {/* Inline script to apply theme before first paint (anti-FOUC) */}
        <script
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var t = localStorage.getItem('ezy_theme');
                  var isSystemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                  if (t === 'light' || (t === 'system' && !isSystemDark)) {
                    document.documentElement.classList.remove('dark');
                    document.documentElement.classList.add('light');
                  }
                } catch(e) {}
              })();
            `,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          <ContextMenuProvider>
            <AudioProvider>
              {children}
              <GlobalAudioPlayer />
              <DialogProvider />
              <Toaster
                theme="dark"
                position="top-center"
                className="!font-sans"
                mobileOffset={{
                  top: "calc(env(safe-area-inset-top, 0px) + 12px)",
                  left: "calc(env(safe-area-inset-left, 0px) + 12px)",
                  right: "calc(env(safe-area-inset-right, 0px) + 12px)",
                }}
              />
            </AudioProvider>
          </ContextMenuProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
