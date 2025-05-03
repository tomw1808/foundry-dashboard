/// <reference types="vite/client" />

// Add type definitions for window.ethereum if needed
interface Window {
    ethereum?: {
        isMetaMask?: true
        request: (request: { method: string, params?: Array<any> }) => Promise<any>
        on: (event: string, callback: (...args: any[]) => void) => void
        removeListener: (event: string, callback: (...args: any[]) => void) => void
        // Add other properties/methods if you use them
    }
}
