import { useState } from 'react';
import { Hex } from 'viem';
import { PrivateKeyAccount, generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Eye, EyeOff, Copy, RefreshCw } from 'lucide-react';
import { copyToClipboard } from '@/lib/utils';

interface Eip7702ModeDisplayProps {
    privateKey: Hex | null;
    sessionAccount: PrivateKeyAccount | null;
    setPrivateKey: (key: Hex | null) => void;
    rpcUrl: string; // Needed for local client later
    chainId: number | undefined; // Needed for local client later
}

export function Eip7702ModeDisplay({
    privateKey,
    sessionAccount,
    setPrivateKey,
    // rpcUrl, // Pass down for potential local client use - not used yet
    // chainId, // Pass down for potential local client use - not used yet
}: Eip7702ModeDisplayProps) {
    const [showPrivateKey, setShowPrivateKey] = useState(false);
    const [inputPrivateKey, setInputPrivateKey] = useState<string>('');
    const [inputError, setInputError] = useState<string | null>(null);

    const handleRegenerate = () => {
        const newKey = generatePrivateKey();
        setPrivateKey(newKey);
        setInputPrivateKey(''); // Clear input field
        setInputError(null);
    };

    const handleSetPrivateKey = () => {
        setInputError(null);
        const trimmedKey = inputPrivateKey.trim();
        if (!trimmedKey.startsWith('0x') || trimmedKey.length !== 66) {
            setInputError('Invalid private key format. Must be a 0x-prefixed 66-character hex string.');
            return;
        }
        try {
            // Validate by trying to create account (will throw if invalid)
            privateKeyToAccount(trimmedKey as Hex);
            setPrivateKey(trimmedKey as Hex);
        } catch (error) {
            console.error("Error setting private key:", error);
            setInputError('Invalid private key.');
        }
    };

    return (
        <div className="mt-6 p-4 border border-purple-600 rounded bg-gray-800 shadow-md">
            <h3 className="text-lg font-semibold mb-3 text-purple-300">EIP-7702 Session Account</h3>
            <p className="text-sm text-gray-400 mb-4">
                This temporary account signs EIP-7702 authorizations. Transactions on Sepolia are routed through <a href="https://Candide.dev" target='_blank' rel="noopener noreferrer" className="underline hover:text-blue-100">Candide.dev</a> Paymaster/Bundler Architecture.
            </p>

            {sessionAccount ? (
                <div className="mb-4">
                    <Label className="text-gray-400">Session Account Address:</Label>
                    <div className="flex items-center space-x-2 mt-1">
                        <span className="font-mono text-sm text-purple-200 truncate">{sessionAccount.address}</span>
                        <button onClick={() => copyToClipboard(sessionAccount.address)} title="Copy Address" className="text-gray-500 hover:text-white">
                            <Copy size={14} />
                        </button>
                    </div>
                </div>
            ) : (
                 <p className="text-sm text-yellow-400 mb-4">No valid session account derived. Please generate or provide a valid private key.</p>
            )}

            {privateKey && (
                <div className="mb-4">
                    <Label className="text-gray-400">Session Private Key:</Label>
                    <div className="flex items-center space-x-2 mt-1">
                        <span className={`font-mono text-sm break-all ${showPrivateKey ? 'text-purple-200' : 'text-gray-500'}`}>
                            {showPrivateKey ? privateKey : '******************************************************************'}
                        </span>
                        <button onClick={() => setShowPrivateKey(!showPrivateKey)} title={showPrivateKey ? "Hide Key" : "Show Key"} className="text-gray-500 hover:text-white ml-2 flex-shrink-0">
                            {showPrivateKey ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                        {showPrivateKey && (
                             <button onClick={() => copyToClipboard(privateKey)} title="Copy Private Key" className="text-gray-500 hover:text-white flex-shrink-0">
                                <Copy size={14} />
                            </button>
                        )}
                    </div>
                </div>
            )}

            <div className="flex items-end space-x-2 mb-4">
                 <Button onClick={handleRegenerate} variant="outline" size="sm" className="text-purple-300 border-purple-500 hover:bg-purple-900">
                    <RefreshCw size={14} className="mr-1" /> Regenerate
                </Button>
            </div>


            <div className="space-y-2">
                 <Label htmlFor="manual-pk" className="text-gray-400">Set Private Key Manually:</Label>
                 <div className="flex items-center space-x-2">
                    <Input
                        id="manual-pk"
                        type="password" // Use password type to obscure input
                        placeholder="0x..."
                        value={inputPrivateKey}
                        onChange={(e) => setInputPrivateKey(e.target.value)}
                        className="font-mono text-sm flex-grow bg-gray-700 border-gray-600"
                    />
                    <Button onClick={handleSetPrivateKey} size="sm">Set Key</Button>
                 </div>
                 {inputError && <p className="text-xs text-red-400 mt-1">{inputError}</p>}
            </div>
        </div>
    );
}
