"use client";

import { useEffect, useState } from "react";
import { RainbowKitProvider, darkTheme, lightTheme } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppProgressBar as ProgressBar } from "next-nprogress-bar";
import { useTheme } from "next-themes";
import { Toaster } from "react-hot-toast";
import { WagmiProvider } from "wagmi";
import { Header } from "~~/components/Header";
import { BlockieAvatar } from "~~/components/scaffold-eth";
import { useInitializeNativeCurrencyPrice } from "~~/hooks/scaffold-eth";
import { wagmiConfig } from "~~/services/web3/wagmiConfig";

const ScaffoldEthApp = ({ children }: { children: React.ReactNode }) => {
  useInitializeNativeCurrencyPrice();

  return (
    <>
      <div className={`flex flex-col min-h-screen `}>
        <Header />
        <main className="relative flex flex-col flex-1">{children}</main>
      </div>
      <Toaster />
    </>
  );
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    },
  },
});

export const ScaffoldEthAppWithProviders = ({ children }: { children: React.ReactNode }) => {
  const { resolvedTheme } = useTheme();
  const effectiveTheme = "light"; // Force light theme
  const isDarkMode = false; // Always use light mode
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);

    // Suppress analytics errors from external libraries
    const originalError = window.onerror;
    const originalUnhandledRejection = window.onunhandledrejection;
    const originalConsoleError = console.error;
    const originalConsoleWarn = console.warn;

    window.onerror = function (msg, url, lineNo, columnNo, error) {
      // Ignore analytics errors from Coinbase SDK
      const msgString = String(msg);
      if (
        msgString.includes("cca-lite.coinbase.com") ||
        msgString.includes("Analytics SDK") ||
        msgString.includes("ERR_BLOCKED_BY_CLIENT") ||
        msgString.includes("Failed to fetch") ||
        msgString.includes("coinbase") ||
        (url && url.includes("cca-lite.coinbase.com"))
      ) {
        return true; // Suppress the error
      }
      // Call the original handler for other errors
      if (originalError) {
        return originalError(msg, url, lineNo, columnNo, error);
      }
      return false;
    };

    // Suppress unhandled promise rejections from analytics
    window.onunhandledrejection = function (event) {
      if (
        event.reason &&
        (event.reason.message?.includes("Analytics SDK") ||
          event.reason.message?.includes("cca-lite.coinbase.com") ||
          event.reason.message?.includes("ERR_BLOCKED_BY_CLIENT") ||
          event.reason.message?.includes("Failed to fetch") ||
          event.reason.message?.includes("coinbase") ||
          event.reason.stack?.includes("cca-lite.coinbase.com") ||
          event.reason.stack?.includes("coinbase"))
      ) {
        event.preventDefault();
        return;
      }
      if (originalUnhandledRejection) {
        return originalUnhandledRejection.call(window, event);
      }
    };

    // Override console methods to suppress analytics logs
    console.error = function (...args) {
      const errorString = args.join(" ");
      if (
        errorString.includes("Analytics SDK") ||
        errorString.includes("cca-lite.coinbase.com") ||
        errorString.includes("ERR_BLOCKED_BY_CLIENT") ||
        errorString.includes("net::ERR_BLOCKED_BY_CLIENT") ||
        errorString.includes("Failed to fetch") ||
        errorString.includes("/metrics")
      ) {
        return;
      }
      return originalConsoleError.apply(console, args);
    };

    console.warn = function (...args) {
      const warnString = args.join(" ");
      if (warnString.includes("Analytics SDK") || warnString.includes("cca-lite.coinbase.com")) {
        return;
      }
      return originalConsoleWarn.apply(console, args);
    };

    return () => {
      window.onerror = originalError;
      window.onunhandledrejection = originalUnhandledRejection;
      console.error = originalConsoleError;
      console.warn = originalConsoleWarn;
    };
  }, []);

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          avatar={BlockieAvatar}
          theme={mounted ? (isDarkMode ? darkTheme() : lightTheme()) : lightTheme()}
        >
          <ProgressBar height="3px" color="#2299dd" />
          {mounted ? (
            <ScaffoldEthApp>{children}</ScaffoldEthApp>
          ) : (
            <div className="flex flex-col min-h-screen bg-white">
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <div className="animate-pulse">
                    <div className="h-8 w-32 bg-gray-300 rounded mb-4 mx-auto"></div>
                    <div className="h-4 w-48 bg-gray-200 rounded mx-auto"></div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
};
