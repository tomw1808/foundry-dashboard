import { SignRequest } from '@/types'; // Assuming types are in src/types.ts
import { WalletClient } from 'viem';

interface PendingActionsListProps {
    pendingSignRequests: SignRequest[];
    signingRequestId: string | null; // ID of the request currently being signed
    handleSignTransaction: (request: SignRequest) => Promise<void>;
    handleRejectTransaction: (requestId: string) => void;
    walletClient: WalletClient | null | undefined;
    isConnected: boolean;
}

export function PendingActionsList({
    pendingSignRequests,
    signingRequestId, // New prop
    handleSignTransaction,
    handleRejectTransaction,
    walletClient,
    isConnected
}: PendingActionsListProps) {

    if (pendingSignRequests.length === 0) {
        return null; // Don't render section if empty
    }

    return (
        <div className="mt-8 w-full">
            <h3 className="text-xl mb-4 text-yellow-400">Pending Actions</h3>
            {pendingSignRequests
                .sort((a, b) => a.receivedAt - b.receivedAt) // Sort by receivedAt, oldest first
                .map((request) => {
                    const receivedTime = new Date(request.receivedAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                        fractionalSecondDigits: 3,
                        hour12: false
                    });
                    return (
                        <div key={request.requestId} className="mb-4 p-4 border border-yellow-600 rounded bg-gray-800 shadow-md">
                            <div className="flex justify-between items-center mb-2">
                                <h4 className="text-lg font-semibold">Request ID: <span className="font-mono text-sm">{request.requestId}</span></h4>
                                <span className="text-xs text-gray-400">Received: {receivedTime}</span>
                            </div>
                            <p className="mb-1">Method: <span className="font-semibold">{request.payload.method}</span></p>

                            {/* Display Decoded Info if available */}
                    {request.payload.decoded ? (
                        <div className="mb-3 p-2 border border-blue-500 rounded bg-gray-700">
                            <p className="text-blue-300 font-semibold mb-1">Decoded Action:</p>
                            {request.payload.decoded.type === 'deployment' && (
                                <>
                                    <p>Deploy Contract: <span className="font-bold">{request.payload.decoded.contractName}</span></p>
                                    {request.payload.decoded.constructorArgs && request.payload.decoded.constructorArgs.length > 0 && (
                                        <p>Constructor Args:</p>
                                    )}
                                    {(!request.payload.decoded.constructorArgs || request.payload.decoded.constructorArgs.length === 0) && (
                                        <p>Constructor Args: <span className="italic">None</span></p>
                                    )}
                                </>
                            )}
                            {request.payload.decoded.type === 'functionCall' && (
                                <>
                                    <p>Call Function: <span className="font-bold">{request.payload.decoded.contractName}.{request.payload.decoded.functionName}</span></p>
                                    {request.payload.decoded.args && request.payload.decoded.args.length > 0 && (
                                        <p>Arguments:</p>
                                    )}
                                    {(!request.payload.decoded.args || request.payload.decoded.args.length === 0) && (
                                        <p>Arguments: <span className="italic">None</span></p>
                                    )}
                                </>
                            )}
                            {/* Common area for displaying args */}
                            {(request.payload.decoded.type === 'deployment' && request.payload.decoded.constructorArgs && request.payload.decoded.constructorArgs.length > 0) && (
                                <div className="text-xs bg-gray-600 p-2 rounded max-h-40 overflow-y-auto mt-1">
                                    {request.payload.decoded.constructorArgs.map((arg, index) => (
                                        <div key={index} className="mb-1">
                                            <span className="font-semibold text-gray-300">{arg.name}</span> (<span className="italic text-gray-400">{arg.type}</span>):
                                            <pre className="inline whitespace-pre-wrap break-all ml-1">{JSON.stringify(arg.value, (_, val) => typeof val === 'bigint' ? val.toString() : val, 2)}</pre>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {(request.payload.decoded.type === 'functionCall' && request.payload.decoded.args && request.payload.decoded.args.length > 0) && (
                                <div className="text-xs bg-gray-600 p-2 rounded max-h-40 overflow-y-auto mt-1">
                                    {request.payload.decoded.args.map((arg, index) => (
                                        <div key={index} className="mb-1">
                                            <span className="font-semibold text-gray-300">{arg.name}</span> (<span className="italic text-gray-400">{arg.type}</span>):
                                            <pre className="inline whitespace-pre-wrap break-all ml-1">{JSON.stringify(arg.value, (_, val) => typeof val === 'bigint' ? val.toString() : val, 2)}</pre>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="mb-3">
                            <p>Parameters:</p>
                            <pre className="whitespace-pre-wrap break-all text-xs bg-gray-700 p-2 rounded max-h-40 overflow-y-auto">
                                {JSON.stringify(request.payload.params, null, 2)}
                            </pre>
                        </div>
                    )}
                    {/* End Decoded Info Display */}

                    <div className="flex space-x-4">
                        <button
                            onClick={() => handleSignTransaction(request)}
                            disabled={!walletClient || !isConnected || signingRequestId === request.requestId}
                            className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                        >
                            {signingRequestId === request.requestId ? 'Processing...' : 'Approve in Wallet'}
                        </button>
                        <button
                            onClick={() => handleRejectTransaction(request.requestId)}
                            disabled={signingRequestId === request.requestId}
                            className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                        >
                            Reject
                        </button>
                    </div>
                </div>
            ))}
        </div>
    );
}
