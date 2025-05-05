import { DecodedInfo } from "@/types"; // Assuming types are in src/types.ts

// --- Helper: Block Explorer URLs ---
const BLOCK_EXPLORER_URLS: Record<number, string> = {
    1: 'https://etherscan.io',
    11155111: 'https://sepolia.etherscan.io',
    10: 'https://optimistic.etherscan.io',
    137: 'https://polygonscan.com',
    8453: 'https://basescan.org',
    // Add more chains as needed
};

export function getExplorerLink(chainId: number, type: 'tx' | 'address', hashOrAddress: string): string | null {
    const baseUrl = BLOCK_EXPLORER_URLS[chainId];
    if (!baseUrl) return null;
    return `${baseUrl}/${type}/${hashOrAddress}`;
}

// --- Helper: Copy to Clipboard ---
export const copyToClipboard = async (text: string | undefined | null) => {
    if (!text) return;
    try {
        await navigator.clipboard.writeText(text);
        console.log('Copied to clipboard:', text); // TODO: Add user feedback (e.g., toast)
    } catch (err) {
        console.error('Failed to copy:', err);
    }
};

// --- Helper: Generate Transaction Label ---
export function generateTxLabel(decodedInfo: DecodedInfo | null | undefined): string {
    if (!decodedInfo) {
        return 'Unknown Transaction';
    }
    if (decodedInfo.type === 'deployment') {
        // Basic label, could be enhanced to show args if needed
        return `Deploy ${decodedInfo.contractName}`;
    }
    if (decodedInfo.type === 'functionCall') {
        // Basic label, could show args count or simple representation
        const argsPreview = decodedInfo.args?.map(arg => arg.name || '?').join(', ') || '';
        return `Call ${decodedInfo.contractName}.${decodedInfo.functionName}(${argsPreview})`;
    }
    return 'Unknown Transaction';
}
