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
    receivedAt: number; // Timestamp when the request was received by the frontend
    sequenceNumber: number; // Sequential counter for ordering
};
export type SignRequest = {
    requestId: string;
    payload: RpcPayload;
};

// Define type for tracked transaction info
export interface TrackedTxInfo {
    hash: Hex;
    status: 'pending' | 'success' | 'reverted' | 'checking';
    confirmations: number;
    blockNumber?: bigint | null;
    contractAddress?: Address | null;
    timestamp: number;
    chainId: number;
    label: string;
    actualTxHash?: Hex; // For UserOps, the final transaction hash
    isEip7702Deployment?: boolean; // Flag for EIP-7702 contract deployments
}

// Type for WebSocket status display
export type WsStatus = 'connecting' | 'open' | 'closed' | 'error';
