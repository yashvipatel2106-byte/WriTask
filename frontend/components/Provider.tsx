"use client";

import StoreProvider from "@/components/store/StoreProvider";
import ReduxRouteSync from "@/components/store/ReduxRouteSync";
import { AuthProvider } from "@/components/context/authContext";
import { OrganizationProvider } from "@/components/context/organizationContext";
import { ThemeProvider } from "@/components/context/themeContext";
import { SidebarProvider } from "@/components/context/sidebarContext";
import { ToastProvider } from "@/components/ui/toast";
import { ConfirmProvider } from "@/components/ui/confirm";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <StoreProvider>
        <AuthProvider>
          <OrganizationProvider>
            <SidebarProvider>
              <ToastProvider>
                <ConfirmProvider>
                  <ReduxRouteSync />
                  {children}
                </ConfirmProvider>
              </ToastProvider>
            </SidebarProvider>
          </OrganizationProvider>
        </AuthProvider>
      </StoreProvider>
    </ThemeProvider>
  );
}