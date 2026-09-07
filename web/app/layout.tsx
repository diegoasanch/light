import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

const sans = localFont({
  src: "./fonts/ibm-plex-sans-latin-400-normal.woff2",
  variable: "--font-sans",
});
const mono = localFont({
  src: "./fonts/ibm-plex-mono-latin-400-normal.woff2",
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "light — PCB",
  description:
    "Interactive 3D viewer for the light RGB controller PCB, built from the KiCad design data",
};

export const viewport: Viewport = {
  themeColor: "#05070d",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        {/* Kick off the board data + model downloads in parallel with the JS
            bundle instead of serially after hydration. */}
        <link rel="preload" href="/pcb/board.json" as="fetch" />
        <link rel="preload" href="/pcb/components.glb" as="fetch" />
      </head>
      <body className={`${sans.variable} ${mono.variable}`}>{children}</body>
    </html>
  );
}
