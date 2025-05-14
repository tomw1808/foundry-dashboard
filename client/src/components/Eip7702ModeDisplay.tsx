import { useState } from 'react';
import { Hex } from 'viem';
import { PrivateKeyAccount, generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch'; // Import Switch
import { AlertCircle, Eye, EyeOff, Copy, RefreshCw } from 'lucide-react'; // Import AlertCircle
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion"; // Import Accordion components
import { copyToClipboard } from '@/lib/utils';

interface Eip7702ModeDisplayProps {
    privateKey: Hex | null;
    sessionAccount: PrivateKeyAccount | null;
    setPrivateKey: (key: Hex | null) => void;
    persistKey: boolean;
    setPersistKey: (persist: boolean) => void;
    rpcUrl: string;
    chainId: number | undefined;
}

export function Eip7702ModeDisplay({
    privateKey,
    sessionAccount,
    setPrivateKey,
    persistKey,
    setPersistKey,
    // rpcUrl,
    // chainId,
}: Eip7702ModeDisplayProps) {
    const [showPrivateKey, setShowPrivateKey] = useState(false);
    const [inputPrivateKey, setInputPrivateKey] = useState<string>('');
    const [inputError, setInputError] = useState<string | null>(null);

    const forgeCommand = sessionAccount?.address
        ? `forge script script/YourScript.s.sol --rpc-url http://localhost:3001/api/rpc --broadcast --sender ${sessionAccount.address} --unlocked`
        : "";

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
        <div className="space-y-4">
            <p className="text-sm text-gray-400">
                EIP-7702 mode: Transactions are authorized by a temporary session key and sent via a Bundler/Paymaster.
                Currently configured for Sepolia via <a href="https://Candide.dev" target='_blank' rel="noopener noreferrer" className="underline hover:text-blue-100">Candide.dev</a>.
            </p>

            {sessionAccount ? (
                <div className="flex flex-col items-left gap-4 justify-between space-x-4 p-3 bg-gray-700/50 rounded-md">
                    <div className='flex flex-col'>
                        <div className="flex items-center space-x-2">
                            <span className="font-mono text-sm text-purple-300 truncate" title={sessionAccount.address}>
                                {sessionAccount.address}
                            </span>
                            <Button variant="ghost" size="icon" onClick={() => copyToClipboard(sessionAccount.address)} title="Copy EIP-7702 Address">
                                <Copy size={16} />
                            </Button>
                        </div>
                        <div className='text-sm text-gray-300'>
                            Call the Foundry-Script with
                            <span className='font-mono pl-2'>
                                {forgeCommand}
                            </span>
                            <Button onClick={() => copyToClipboard(forgeCommand)} title="Copy command" variant="ghost" size="icon" >
                                <Copy size={16} />
                            </Button>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="p-3 bg-yellow-800/30 border border-yellow-700 rounded-md text-yellow-300 text-sm">
                    No valid EIP-7702 session account derived. Please generate or provide a valid private key in the settings below.
                </div>
            )}

            <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="eip7702-settings" className="border-gray-700">
                    <AccordionTrigger className="text-base hover:no-underline text-gray-300 data-[state=open]:text-purple-300">
                        EIP-7702 Session Key Settings
                    </AccordionTrigger>
                    <AccordionContent className="pt-4">
                        <div className="space-y-4 p-4 border border-purple-600 rounded bg-gray-800 shadow-md">
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

                            <div className="space-y-2 mb-6">
                                <Label htmlFor="manual-pk" className="text-gray-400">Set Private Key Manually:</Label>
                                <div className="flex items-center space-x-2">
                                    <Input
                                        id="manual-pk"
                                        type="password"
                                        placeholder="0x..."
                                        value={inputPrivateKey}
                                        onChange={(e) => setInputPrivateKey(e.target.value)}
                                        className="font-mono text-sm flex-grow bg-gray-700 border-gray-600"
                                    />
                                    <Button onClick={handleSetPrivateKey} size="sm">Set Key</Button>
                                </div>
                                {inputError && <p className="text-xs text-red-400 mt-1">{inputError}</p>}
                            </div>

                            <div className="flex items-center space-x-2 mb-4">
                                <Switch
                                    id="persist-pk-toggle"
                                    checked={persistKey}
                                    onCheckedChange={setPersistKey}
                                />
                                <Label htmlFor="persist-pk-toggle" className="text-sm text-gray-300">
                                    Persist private key in browser local storage
                                </Label>
                            </div>
                            {persistKey && (
                                <div className="flex items-start space-x-2 p-3 bg-yellow-900/30 border border-yellow-700 rounded text-yellow-200 text-xs mb-4">
                                    <AlertCircle size={18} className="flex-shrink-0 mt-0.5 text-yellow-400" />
                                    <p>
                                        <strong>Warning:</strong> Storing private keys in local storage is convenient for development but insecure.
                                        Anyone with access to your browser console can potentially retrieve the key.
                                        Do not use this feature with real funds or on mainnet.
                                    </p>
                                </div>
                            )}
                        </div>
                    </AccordionContent>
                </AccordionItem>
            </Accordion>
        </div>
    );
}
