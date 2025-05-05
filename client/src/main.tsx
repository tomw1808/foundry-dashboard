import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

import '@rainbow-me/rainbowkit/styles.css';
import { getDefaultConfig, RainbowKitProvider } from '@rainbow-me/rainbowkit';
import { WagmiProvider } from 'wagmi';
import { mainnet, sepolia, localhost, base, baseSepolia, arbitrum, arbitrumSepolia } from 'wagmi/chains'; // Add desired chains
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';

// Configure Wagmi and RainbowKit
// Replace with your actual WalletConnect Project ID
const WALLETCONNECT_PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || "YOUR_PROJECT_ID";
if (WALLETCONNECT_PROJECT_ID === "YOUR_PROJECT_ID") {
  console.warn("Please provide a WalletConnect Project ID in .env file (VITE_WALLETCONNECT_PROJECT_ID)");
}

const config = getDefaultConfig({
  appName: 'Forge Dashboard',
  projectId: WALLETCONNECT_PROJECT_ID,
  chains: [mainnet, sepolia, base, baseSepolia, arbitrum, arbitrumSepolia, localhost], // Include localhost for Anvil/Hardhat
  ssr: false, // Set to true if using server-side rendering
});

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>
          <App />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>,
)
