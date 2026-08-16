import type { Metadata, Viewport } from "next";
import { GlobalBackButton } from "@/components/global-back-button";
import { IncomingCallListener } from "@/components/incoming-call-listener";
import { NativeAppBridge } from "@/components/native-app-bridge";
import { VisitorTracker } from "@/components/visitor-tracker";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "WetDreams", template: "%s | WetDreams" },
  description: "Discover people, start conversations, and reward great company.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#f7f6f2",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <GlobalBackButton />
        <NativeAppBridge />
        <IncomingCallListener />
        <VisitorTracker />
        {children}
      </body>
    </html>
  );
}
