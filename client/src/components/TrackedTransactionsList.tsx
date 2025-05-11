import { TrackedTxInfo } from '@/types'; // Assuming types are in src/types.ts
import { Copy, ExternalLink } from 'lucide-react';
import { Hex } from 'viem';

interface TrackedTransactionsListProps {
    trackedTxs: Map<Hex, TrackedTxInfo>;
    getExplorerLink: (chainId: number, type: 'tx' | 'address', hashOrAddress: string) => string | null;
    copyToClipboard: (text: string | null | undefined) => void;
}

export function TrackedTransactionsList({
    trackedTxs,
    getExplorerLink,
    copyToClipboard
}: TrackedTransactionsListProps) {
    return (
        <div className="mt-8 w-full">
            <h3 className="text-xl mb-4 text-gray-400">Tracked Transactions</h3>
            {trackedTxs.size === 0 ? (
                <p className="text-gray-500 italic">No transactions tracked yet.</p>
            ) : (
                <div className="space-y-3">
                    {/* Sort transactions by timestamp, newest first */}
                    {Array.from(trackedTxs.values())
                        .sort((a, b) => b.timestamp - a.timestamp)
                        .map((tx) => {
                            // Prioritize actualTxHash for the main explorer link if it exists, otherwise use the original hash (UserOpHash for EIP-7702)
                            const primaryHash = tx.actualTxHash || tx.hash;
                            const primaryExplorerLink = getExplorerLink(tx.chainId, 'tx', primaryHash);
                            const contractExplorerLink = tx.contractAddress ? getExplorerLink(tx.chainId, 'address', tx.contractAddress) : null;
                            const isConfirmed = tx.status === 'success' || tx.status === 'reverted';
                            const statusColor = tx.status === 'success' ? 'text-green-400' : tx.status === 'reverted' ? 'text-red-400' : 'text-yellow-400';

                            return (
                                <div key={tx.hash} className="p-3 border border-gray-700 rounded bg-gray-800 shadow-sm text-sm">
                                    <div className="flex justify-between items-center mb-1">
                                        <span className={`font-semibold ${statusColor}`}>
                                            Status: {tx.status.charAt(0).toUpperCase() + tx.status.slice(1)}
                                            {isConfirmed && ` (${tx.confirmations} conf.)`}
                                        </span>
                                        {/* Display Label */}
                                        <span className="text-gray-300 truncate" title={tx.label}>{tx.label}</span>
                                        <span className="text-xs text-gray-500 flex-shrink-0">{new Date(tx.timestamp).toLocaleString()}</span>
                                    </div>
                                    {/* Display UserOp Hash if actualTxHash is present (indicating an EIP-7702 tx that's been included) */}
                                    {tx.actualTxHash && tx.hash !== tx.actualTxHash && (
                                        <div className="flex items-center space-x-2 mb-1">
                                            <span className="text-gray-400 w-24 flex-shrink-0">UserOp Hash:</span>
                                            <span className="font-mono text-xs truncate">{tx.hash}</span>
                                            <button onClick={() => copyToClipboard(tx.hash)} title="Copy UserOp Hash" className="text-gray-500 hover:text-white">
                                                <Copy size={14} />
                                            </button>
                                            {/* Link for UserOp hash if a specific explorer for UserOps is ever used */}
                                        </div>
                                    )}

                                    {/* Display Transaction Hash (or primary hash if not an included UserOp) */}
                                    <div className="flex items-center space-x-2 mb-1">
                                        <span className="text-gray-400 w-24 flex-shrink-0">
                                            {tx.actualTxHash && tx.hash !== tx.actualTxHash ? "Tx Hash:" : "Hash:"}
                                        </span>
                                        <span className="font-mono text-xs truncate">{primaryHash}</span>
                                        <button onClick={() => copyToClipboard(primaryHash)} title={tx.actualTxHash && tx.hash !== tx.actualTxHash ? "Copy Transaction Hash" : "Copy Hash"} className="text-gray-500 hover:text-white">
                                            <Copy size={14} />
                                        </button>
                                        {primaryExplorerLink && (
                                            <a href={primaryExplorerLink} target="_blank" rel="noopener noreferrer" title="View on Explorer" className="text-blue-400 hover:text-blue-300">
                                                <ExternalLink size={14} />
                                            </a>
                                        )}
                                    </div>

                                    {tx.contractAddress && (
                                        <div className="flex items-center space-x-2">
                                            <span className="text-gray-400 w-24 flex-shrink-0">Contract Addr:</span>
                                            <span className="font-mono text-xs truncate">{tx.contractAddress}</span>
                                            <button onClick={() => copyToClipboard(tx.contractAddress)} title="Copy Address" className="text-gray-500 hover:text-white">
                                                <Copy size={14} />
                                            </button>
                                            {contractExplorerLink && (
                                                <a href={contractExplorerLink} target="_blank" rel="noopener noreferrer" title="View on Explorer" className="text-blue-400 hover:text-blue-300">
                                                    <ExternalLink size={14} />
                                                </a>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                </div>
            )}
        </div>
    );
}
