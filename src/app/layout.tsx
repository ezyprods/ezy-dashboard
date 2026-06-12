import type { Metadata } from "next";
import { AudioProvider } from "@/lib/contexts/AudioContext";
import { ContextMenuProvider } from "@/lib/contexts/ContextMenuContext";
import { GlobalAudioPlayer } from "@/components/layout/GlobalAudioPlayer";
import { DialogProvider } from "@/components/ui/DialogProvider";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ezy",
  description: "Plataforma de gestión de producción musical para productores independientes.",
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
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var t = localStorage.getItem('theme');
                  if (t === 'light') {
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
        <ContextMenuProvider>
          <AudioProvider>
            {children}
            <GlobalAudioPlayer />
            <DialogProvider />
            <Toaster theme="dark" position="bottom-right" className="!font-sans" />
          </AudioProvider>
        </ContextMenuProvider>
      </body>
    </html>
  );
}
