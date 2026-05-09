import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SupabaseProvider } from "@/components/supabase/supabase-provider";
import { WorkflowSyncRunner } from "@/components/sync/workflow-sync-runner";
import { Toaster } from "@/components/ui/toaster";
import { SupportEmailOutboxAutoFlush } from "@/components/support/support-email-outbox-autoflush";

export const metadata: Metadata = {
  title: "WorkFlow",
  description: "Offline-first maintenance PWA for field technicians",
  applicationName: "WorkFlow",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "WorkFlow"
  },
  formatDetection: { telephone: false }
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-dvh bg-background text-foreground antialiased">
        <SupabaseProvider>
          <WorkflowSyncRunner />
          {children}
          <SupportEmailOutboxAutoFlush />
          <Toaster />
        </SupabaseProvider>
      </body>
    </html>
  );
}

