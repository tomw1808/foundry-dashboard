import { Copy } from 'lucide-react';
import { Address } from 'viem';
import { WsStatus } from '@/types'; // Assuming types are in src/types.ts

interface DashboardStatusProps {
    wsStatus: WsStatus;
    isConnected: boolean;
    address?: Address | null;
    chainId?: number | null;
    processedRequests: number;
    copyToClipboard: (text: string | null | undefined) => void;
}

export function DashboardStatus({
    // wsStatus, // Removed from props
    isConnected,
    address,
    chainId,
    processedRequests,
    copyToClipboard
}: DashboardStatusProps) {
    return (
        <div className="mb-4">
            {/* WebSocket Status is now in DashboardHeader */}
            <p>Wallet Status: {isConnected ? <span className="text-green-400">Connected</span> : <span className="text-red-400">Not Connected</span>}</p>
            {isConnected && address && ( // Ensure address exists
                <>
                    <div className="flex items-center space-x-2">
                        <p>Address:</p>
                        <span className="font-mono text-sm">{address}</span>
                        <button onClick={() => copyToClipboard(address)} title="Copy Address" className="text-gray-500 hover:text-white">
                            <Copy size={14} />
                        </button>
                    </div>
                    <p>Chain ID: {chainId ?? 'N/A'}</p>
                    <p>Processed Requests: {processedRequests}</p> {/* Display counter */}
                </>
            )}
        </div>
    );
}
