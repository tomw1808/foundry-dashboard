import { Address, Hex } from 'viem';

// --- Shared Types ---

// Define structure for a single decoded argument
export interface DecodedArg {
    name: string;
    type: string;
    value: any;
}

// Define structure for decoded info (adjust as needed based on backend output)
export interface DecodedInfoBase {
    type: 'deployment' | 'functionCall';
    contractName: string;
}
export interface DecodedDeploymentInfo extends DecodedInfoBase {
    type: 'deployment';
    constructorArgs?: DecodedArg[]; // Now an array of DecodedArg
}
export interface DecodedFunctionInfo extends DecodedInfoBase {
    type: 'functionCall';
    functionName: string;
    args?: DecodedArg[]; // Now an array of DecodedArg
}
export type DecodedInfo = DecodedDeploymentInfo | DecodedFunctionInfo;

// Define types for RPC payload and signing request
export type RpcPayload = {
    method: string;
    params: any[];
    id: number | string;
    decoded?: DecodedInfo | null
};
export type SignRequest = { requestId: string; payload: RpcPayload };

// Define type for tracked transaction info
export interface TrackedTxInfo {
    hash: Hex;
    status: 'pending' | 'success' | 'reverted' | 'checking';
    confirmations: number;
    blockNumber?: bigint | null;
    contractAddress?: Address | null;
    timestamp: number;
    chainId: number;
    label: string; // Description of the transaction
}

// Type for WebSocket status display
export type WsStatus = 'connecting' | 'open' | 'closed' | 'error';
