import { Circle } from 'lucide-react';
import { WsStatus } from '@/types';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip"; // Assuming this path is correct for your tooltip component

interface DashboardHeaderProps {
    wsStatus: WsStatus;
}

export function DashboardHeader({ wsStatus }: DashboardHeaderProps) {
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
            <h1 className="text-xl md:text-2xl font-bold">⚡️ Foundry Dashboard</h1>
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Circle className={`h-5 w-5 ${statusColor}`} />
                    </TooltipTrigger>
                    <TooltipContent>
                        <p>{statusTooltip}</p>
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>
        </header>
    );
}
