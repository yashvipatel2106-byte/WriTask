import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Providers from "@/components/Provider";
import "./globals.css";
import { SocketProvider } from "@/components/context/SocketProvider";
import { themeInitScript } from "@/components/context/themeContext";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "WriTask",
  description: "Plan. Collaborate. Deliver. On time.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* Must be a plain, parser-blocking inline script (not next/script)
            — it has to run synchronously before first paint to set the
            .dark class before hydration, or the wrong theme flashes for a
            frame. next/script (even beforeInteractive) goes through Next's
            own script-loading runtime and isn't guaranteed to land that
            early. suppressHydrationWarning quiets React's "script tag in a
            component" dev warning, which doesn't apply here — this element
            is static HTML executed by the browser's parser, not something
            React re-renders or hydrates. */}
        <script
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: themeInitScript }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <SocketProvider>
          <Providers>{children}</Providers>
        </SocketProvider>
      </body>
    </html>
  );
}