import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { DecodedInfo } from "@/types"; // Assuming types are in src/types.ts

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

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

// --- Helper: Sanitize Transaction Request for Viem ---
import { TransactionRequest, Address, Hex } from 'viem';

export function sanitizeTransactionRequest(rawTx: any, requestId?: string): TransactionRequest {
    const logPrefix = requestId ? `[${requestId}] ` : '';
    console.log(`${logPrefix}Raw transaction object received for sanitization:`, JSON.stringify(rawTx, null, 2));

    // Start with essential fields that don't need complex conversion first
    const sanitizedTx: Partial<TransactionRequest> & { input?: any } = { // Use Partial initially
        // Explicitly convert gas-related fields and value from hex strings to bigint
        ...(rawTx.gas && { gas: BigInt(rawTx.gas) }),
        ...(rawTx.gasPrice && { gasPrice: BigInt(rawTx.gasPrice) }),
        ...(rawTx.maxFeePerGas && { maxFeePerGas: BigInt(rawTx.maxFeePerGas) }),
        ...(rawTx.maxPriorityFeePerGas && { maxPriorityFeePerGas: BigInt(rawTx.maxPriorityFeePerGas) }),
        ...(rawTx.value && { value: BigInt(rawTx.value) }),
        // Nonce needs to be a number for viem
        ...(rawTx.nonce !== undefined && { nonce: typeof rawTx.nonce === 'string' ? parseInt(rawTx.nonce, 16) : rawTx.nonce }),
        // Ensure 'from' is correctly typed as Address (string)
        ...(rawTx.from && { from: rawTx.from as Address }),
        // Keep original input if present for data mapping logic below
        ...(rawTx.input && { input: rawTx.input }),
        // Keep original data if present
        ...(rawTx.data && { data: rawTx.data }),
        // Keep original to if present
        ...(rawTx.to && { to: rawTx.to }),
    };

    // --- Explicitly handle 'data' (preferring 'input' from Foundry) ---
    if (sanitizedTx.input !== undefined && sanitizedTx.input !== null) {
        sanitizedTx.data = sanitizedTx.input as Hex;
        console.log(`${logPrefix}Mapping rawTx.input to sanitizedTx.data`);
    } else if (sanitizedTx.data !== undefined && sanitizedTx.data !== null) {
        // data is already set from spread if it existed
        console.log(`${logPrefix}Using rawTx.data for sanitizedTx.data`);
    }
    // --- Delete the original 'input' field if it exists ---
    delete sanitizedTx.input; // Remove the temporary input field
    // --- ---

    // --- Explicitly handle the 'to' field ---
    if (sanitizedTx.to !== null && sanitizedTx.to !== undefined) {
        // If 'to' exists, ensure it's the correct type
        sanitizedTx.to = sanitizedTx.to as Address;
        console.log(`${logPrefix}Setting 'to' address: ${sanitizedTx.to}`);
    } else {
        // If 'to' is null or undefined (contract creation)
        console.log(`${logPrefix}'to' address is null/undefined (contract creation).`);
        // Ensure 'to' is omitted from the final object for viem
        delete sanitizedTx.to;
    }
    // --- ---

    // Remove potentially problematic gas fields
    if (sanitizedTx.maxFeePerGas !== undefined || sanitizedTx.maxPriorityFeePerGas !== undefined) {
        delete sanitizedTx.gasPrice; // Remove legacy gasPrice if EIP-1559 fields exist
    } else if (sanitizedTx.gasPrice !== undefined) {
        delete sanitizedTx.maxFeePerGas;
        delete sanitizedTx.maxPriorityFeePerGas;
    }

    // Cast to final type - ensure all required fields are present or handle appropriately
    // Note: 'from' might be optional if wallet handles it, 'data'/'value' are optional
    // 'gas', 'nonce', 'maxFeePerGas' etc might be filled by wallet if not provided
    return sanitizedTx as TransactionRequest;
}