import { Network } from 'lucide-react';
import { WsStatus } from '@/types';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip"; // Assuming this path is correct for your tooltip component

interface DashboardHeaderProps {
    wsStatus: WsStatus;
    processedRequests: number;
}

export function DashboardHeader({ wsStatus, processedRequests }: DashboardHeaderProps) {
    let statusColor = '';
    let statusTooltip = '';

    switch (wsStatus) {
        case 'open':
            statusColor = 'text-green-500 fill-green-500'; // Added fill color
            statusTooltip = 'WebSocket Connected';
            break;
        case 'connecting':
            statusColor = 'text-yellow-500 fill-yellow-500'; // Added fill color
            statusTooltip = 'WebSocket Connecting...';
            break;
        case 'closed':
            statusColor = 'text-red-500 fill-red-500'; // Added fill color
            statusTooltip = 'WebSocket Disconnected';
            break;
        case 'error':
            statusColor = 'text-red-500 fill-red-500'; // Added fill color
            statusTooltip = 'WebSocket Connection Error';
            break;
        default:
            statusColor = 'text-gray-500 fill-gray-500'; // Added fill color
            statusTooltip = 'WebSocket Status Unknown';
    }

    return (
        <header className="w-full max-w-4xl flex justify-between items-center p-4 border-b border-gray-700 mb-6">
            <div className="flex items-center space-x-3">
                <h1 className="text-xl md:text-2xl font-bold">⚡️ Foundry Dashboard</h1>
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Network className={`h-5 w-5 ${statusColor}`} />
                        </TooltipTrigger>
                        <TooltipContent>
                            <p>{statusTooltip}</p>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            </div>
            <div className="flex items-center space-x-4">
                <div className="text-xs text-gray-400">
                    Requests: <span className="font-semibold text-gray-200">{processedRequests}</span>
                </div>
                <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false} />
            </div>
        </header>
    );
}
