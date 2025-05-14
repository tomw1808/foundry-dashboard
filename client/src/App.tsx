import { useAccount, usePublicClient, useWalletClient, useWatchBlockNumber } from 'wagmi';
import { useEffect, useState, useRef, useCallback, useMemo } from 'react'; // Added useCallback
import { Address, BlockTag, Hex, serializeSignature, toHex } from 'viem';

// Import types and components
import { SignRequest, TrackedTxInfo, RpcPayload, WsStatus } from '@/types'; // WsStatus is used by the hook
import { getExplorerLink, copyToClipboard, generateTxLabel, sanitizeTransactionRequest } from '@/lib/utils'; // Import sanitizeTransactionRequest
import { Simple7702Account, UserOperationV8, MetaTransaction, CandidePaymaster, createUserOperationHash } from "abstractionkit"; // EIP-7702

import { DashboardStatus } from '@/components/DashboardStatus';
import { PendingActionsList } from '@/components/PendingActionsList';
import { TrackedTransactionsList } from '@/components/TrackedTransactionsList';
// import { Switch } from '@/components/ui/switch'; // No longer needed
// import { Label } from '@/components/ui/label';   // No longer needed
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"; // For new UI
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"; // For helper text
import { Button } from '@/components/ui/button'; // For copy button
import { Copy, Terminal } from 'lucide-react'; // For icons
import { ConnectButton } from '@rainbow-me/rainbowkit'; // Assuming RainbowKit ConnectButton

import { generatePrivateKey, privateKeyToAccount, PrivateKeyAccount, sign } from 'viem/accounts'; // For EIP-7702 session key
import { Eip7702ModeDisplay } from '@/components/Eip7702ModeDisplay'; // New component
import { createWalletClient, http, encodeFunctionData, getAddress } from 'viem'; // Added getAddress, encodeFunctionData & for local EIP-7702 client
import { useWebSocketManager } from '@/hooks/useWebSocketManager'; // Import the new hook

// --- Configuration Constants for Candide EIP-7702 ---
// Note: Bundler/Paymaster URLs are kept for now but won't be used in the immediate refactor
const CANDIDE_SEPOLIA_RPC_URL = "https://ethereum-sepolia-rpc.publicnode.com"; // Public RPC, can remain hardcoded or also be env var

// Bundler and Paymaster URLs from Vite environment variables (see .env.example)
// Fallback to placeholder strings for guidance if not set.
const VITE_CANDIDE_SEPOLIA_BUNDLER_URL = import.meta.env.VITE_CANDIDE_SEPOLIA_BUNDLER_URL;
const VITE_CANDIDE_SEPOLIA_PAYMASTER_URL = import.meta.env.VITE_CANDIDE_SEPOLIA_PAYMASTER_URL;

const BUNDLER_URL_PLACEHOLDER = "YOUR_CANDIDE_SEPOLIA_BUNDLER_URL_OR_API_KEY_ENDPOINT";
const PAYMASTER_URL_PLACEHOLDER = "YOUR_CANDIDE_SEPOLIA_PAYMASTER_URL_OR_API_KEY_ENDPOINT";

const ACTUAL_BUNDLER_URL = VITE_CANDIDE_SEPOLIA_BUNDLER_URL || BUNDLER_URL_PLACEHOLDER;
const ACTUAL_PAYMASTER_URL = VITE_CANDIDE_SEPOLIA_PAYMASTER_URL || PAYMASTER_URL_PLACEHOLDER;

const areCandideUrlsConfigured =
  ACTUAL_BUNDLER_URL !== BUNDLER_URL_PLACEHOLDER &&
  ACTUAL_PAYMASTER_URL !== PAYMASTER_URL_PLACEHOLDER &&
  !!ACTUAL_BUNDLER_URL && // Ensure they are not empty strings if env var is set to ""
  !!ACTUAL_PAYMASTER_URL;
// Entry point used by Candide's Simple7702Account (v0.8.0 as per abstractionkit constants)
const CANDIDE_ENTRY_POINT_ADDRESS = "0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108";
// Default delegatee for Simple7702Account - Updated to custom contract address
const SIMPLE7702_DEFAULT_DELEGATEE_ADDRESS = "0xf331ea1d57d32f82d70BCE5EcDa04F819E84CABd" as Address;


function App() {
  // --- Hooks ---
  const { address, chainId, isConnected } = useAccount();
  const publicClient = usePublicClient({ chainId });
  const { data: walletClient } = useWalletClient();
  // wsRef and direct wsStatus state are removed, will be managed by useWebSocketManager
  const [pendingSignRequests, setPendingSignRequests] = useState<SignRequest[]>([]);
  const [processedRequests, setProcessedRequests] = useState(0);

  // --- Helper for BigInt serialization (defined early for use in callbacks) ---
  const jsonReplacer = useCallback((_key: string, value: any) => {
    if (typeof value === 'bigint') {
      return value.toString();
    }
    return value;
  }, []);

  // --- WebSocket Message Handling Callbacks (to be passed to the hook) ---
  const handleSignRequestReceived = useCallback((request: SignRequest) => {
    console.log('[App.tsx] Received signRequest:', request.requestId, request.payload?.method);
    setPendingSignRequests((prev) =>
      prev.find((req) => req.requestId === request.requestId)
        ? prev
        : [...prev, request]
    );
  }, []); // setPendingSignRequests is stable

  // Ref to hold the latest version of the RPC request handler
  const actualHandleRpcRequestRef = useRef<((requestId: string, payload: RpcPayload) => Promise<void>) | null>(null);

  // This callback is stable and passed to useWebSocketManager.
  // It calls the latest version of actualHandleRpcRequest via the ref.
  const stableOnRpcRequest = useCallback((requestId: string, payload: RpcPayload) => {
    if (actualHandleRpcRequestRef.current) {
      actualHandleRpcRequestRef.current(requestId, payload);
    } else {
      // This might happen if a message comes in before actualHandleRpcRequest is fully initialized.
      console.warn(`[App.tsx] stableOnRpcRequest called but actualHandleRpcRequestRef.current is not yet set for ${requestId}`, payload.method);
    }
  }, []); // Empty dependency array ensures this callback is stable

  const { wsStatus, sendMessage } = useWebSocketManager({
    onRpcRequest: stableOnRpcRequest,
    onSignRequestReceived: handleSignRequestReceived, // This is already stable
  });

  // --- Tracked Transactions State with Ref for Closures ---
  const [_trackedTxs, _setTrackedTxs] = useState<Map<Hex, TrackedTxInfo>>(new Map());
  const trackedTxsRef = useRef(_trackedTxs);

  const setTrackedTxs = (updater: React.SetStateAction<Map<Hex, TrackedTxInfo>>) => {
    _setTrackedTxs(prevMap => {
      const newMap = typeof updater === 'function' ? updater(prevMap) : updater;
      trackedTxsRef.current = newMap;
      return newMap;
    });
  };
  // Use _trackedTxs for useEffect dependencies if needed for re-running effects based on state change.
  // Use trackedTxsRef.current for accessing the latest value within closures like handleRpcRequest.

  const [activeMode, setActiveMode] = useState<'browser' | 'eip7702' | 'erc4337'>('browser'); // New mode state
  const [eip7702PrivateKey, setEip7702PrivateKey] = useState<Hex | null>(null); // State for session private key
  const [_eip7702SessionAccount, _setEip7702SessionAccount] = useState<PrivateKeyAccount | null>(null); // Derived session account
  const eip7702SessionAccountRef = useRef(_eip7702SessionAccount); // Ref for up-to-date access in closures
  const [signingRequestId, setSigningRequestId] = useState<string | null>(null); // Tracks the ID of the request being signed

  // --- WebSocket Connection logic is now in useWebSocketManager ---

  // --- Generate EIP-7702 Session Key Effect ---
  useEffect(() => {
    // Generate key only if switching to EIP-7702 mode and no key exists yet
    if (activeMode === 'eip7702' && !eip7702PrivateKey) {
      console.log("Generating initial EIP-7702 session private key...");
      const newPrivateKey = generatePrivateKey();
      setEip7702PrivateKey(newPrivateKey);
    }
  }, [activeMode, eip7702PrivateKey]); // Run when mode changes or key is cleared

  // --- Derive EIP-7702 Session Account Effect ---
  useEffect(() => {
    if (eip7702PrivateKey) {
      try {
        const account = privateKeyToAccount(eip7702PrivateKey);
        _setEip7702SessionAccount(account);
        eip7702SessionAccountRef.current = account;
        console.log("Derived EIP-7702 session account:", account.address);
      } catch (error) {
        console.error("Failed to derive account from private key:", error);
        _setEip7702SessionAccount(null);
        eip7702SessionAccountRef.current = null;
        // Optionally provide user feedback about invalid key in the Eip7702ModeDisplay component
      }
    } else {
      _setEip7702SessionAccount(null);
      eip7702SessionAccountRef.current = null;
    }
  }, [eip7702PrivateKey]); // Run when private key changes


  // --- Transaction Receipt Polling Effect ---
  const POLLING_INTERVAL = 4000; // Check every 4 seconds

  useEffect(() => {
    if (!publicClient || trackedTxsRef.current.size === 0 || !chainId) {
      return; // No client, nothing to track, or chainId missing
    }

    const intervalId = setInterval(async () => {
      const pendingHashes = Array.from(trackedTxsRef.current.entries())
        .filter(([_, tx]) => (tx.status === 'pending' || tx.status === 'checking') && tx.chainId === chainId) // Only poll for current chain
        .map(([hash, _]) => hash);

      if (pendingHashes.length === 0) return;

      console.trace(`Polling receipts for ${pendingHashes.length} transactions on chain ${chainId}...`);

      for (const hash of pendingHashes) {
        const txInfo = trackedTxsRef.current.get(hash);
        // Double check it's still pending/checking before fetching
        if (!txInfo || (txInfo.status !== 'pending' && txInfo.status !== 'checking')) {
          continue;
        }

        // Mark as checking to avoid simultaneous fetches if interval is short
        setTrackedTxs(prevMap => {
          const current = prevMap.get(hash);
          // Ensure it hasn't been updated by another process in the meantime
          if (current && (current.status === 'pending' || current.status === 'checking')) {
            return new Map(prevMap).set(hash, { ...current, status: 'checking' });
          }
          return prevMap; // No change needed
        });


        try {
          // Use the publicClient specific to the tx chainId if possible, else current
          // Note: This example uses the current publicClient, assuming polling only happens for the active chain.
          // For multi-chain support, you'd need clients per chainId.
          const receipt = await publicClient.getTransactionReceipt({ hash });

          if (receipt) {
            // Successfully found: update status to 'success' or 'reverted'
            console.debug(`Receipt found for ${hash}: Status ${receipt.status}`);
            setTrackedTxs(prevMap => {
              const currentTx = prevMap.get(hash);
              if (!currentTx) return prevMap; // Should exist, but safety check
              return new Map(prevMap).set(hash, {
                ...currentTx,
                status: receipt.status, // 'success' or 'reverted'
                blockNumber: receipt.blockNumber,
                contractAddress: receipt.contractAddress,
              });
            });
            // Polling for this hash will stop due to status change
          } else {
            // Not found, but no error thrown (RPC returned null for a pending tx)
            // This is an expected scenario for a pending transaction.
            console.trace(`[Polling] Receipt for ${hash} is null (still pending). Will retry.`);
            setTrackedTxs(prevMap => {
              const currentTx = prevMap.get(hash);
              // Reset to 'pending' only if it was 'checking'
              if (currentTx && currentTx.status === 'checking') {
                return new Map(prevMap).set(hash, { ...currentTx, status: 'pending' });
              }
              return prevMap; // No change if status wasn't 'checking' or tx disappeared
            });
          }
        } catch (error: any) {
          // Handle errors thrown by getTransactionReceipt
          if (error.name === 'TransactionReceiptNotFoundError') {
            // Specifically handle "not found" error: transaction is still pending.
            // This is an expected error during the lifecycle of a pending transaction.
            console.trace(`[Polling] Receipt not yet found for ${hash} (Error: ${error.message}). Will retry.`);
            setTrackedTxs(prevMap => {
              const currentTx = prevMap.get(hash);
              if (currentTx && currentTx.status === 'checking') {
                return new Map(prevMap).set(hash, { ...currentTx, status: 'pending' });
              }
              return prevMap;
            });
          } else {
            // For other types of errors (network, RPC internal, etc.)
            console.warn({ err: error, hash }, `Error fetching receipt for tx. Will retry.`);
            setTrackedTxs(prevMap => {
              const currentTx = prevMap.get(hash);
              if (currentTx && currentTx.status === 'checking') {
                return new Map(prevMap).set(hash, { ...currentTx, status: 'pending' });
              }
              return prevMap;
            });
          }
        }
      }
    }, POLLING_INTERVAL);

    return () => clearInterval(intervalId); // Cleanup interval on unmount or dependency change

  }, [_trackedTxs, publicClient, chainId]); // Re-run if _trackedTxs (actual state) changes


  // --- Block Number Watching Effect ---
  useWatchBlockNumber({
    onBlockNumber(blockNumber: bigint) { // blockNumber parameter is used directly below
      console.trace(`New block received: ${blockNumber}`);
      // Removed: setCurrentBlockNumber(blockNumber);
      // Update confirmations for already confirmed transactions
      setTrackedTxs(prevMap => {
        const newMap = new Map(prevMap);
        let changed = false;
        newMap.forEach((tx, hash) => {
          // Only update confirmations if the tx is on the current chain
          if (tx.chainId === chainId && (tx.status === 'success' || tx.status === 'reverted') && tx.blockNumber) {
            const confs = Number(blockNumber - tx.blockNumber) + 1; // Calculate confirmations
            if (tx.confirmations !== confs) {
              newMap.set(hash, { ...tx, confirmations: confs });
              changed = true;
            }
          }
        });
        return changed ? newMap : prevMap; // Return new map only if changed
      });
    },
  });


  // --- RPC Response Sender (uses sendMessage from hook) ---
  const sendRpcResponse = useCallback((requestId: string, response: { result?: any; error?: any }) => {
    if (wsStatus === 'open') {
      const message = JSON.stringify({
        type: 'rpcResponse',
        requestId: requestId,
        ...response,
      }, jsonReplacer);
      // console.log(`[App.tsx] Sending RPC Response for ${requestId}:`, message); // Reduce noise
      sendMessage(message);
    } else {
      console.error(`[App.tsx] WebSocket not open (state: ${wsStatus}), cannot send RPC response for ${requestId}`);
    }
  }, [wsStatus, sendMessage, jsonReplacer]);

  // --- RPC Request Handler (actual implementation) ---
  const actualHandleRpcRequest = useCallback(async (requestId: string, payload: RpcPayload) => {
    console.log(`[App.tsx] Handling RPC Request ${requestId}:`, payload.method);

    if (!isConnected || !address || !chainId || !publicClient || wsStatus !== 'open') {
      const errorMsg = wsStatus !== 'open' ? `WebSocket not open (state: ${wsStatus})`
        : !publicClient ? 'RPC client unavailable'
          : 'Wallet not connected';
      console.error(`[App.tsx] ${errorMsg}, cannot handle RPC request ${requestId} (${payload.method})`);
      if (wsStatus === 'open') { // Send error only if WS was open
        sendRpcResponse(requestId, { error: { code: -32000, message: errorMsg } });
      } else {
        console.warn(`[App.tsx] Cannot send error response for ${requestId} because WebSocket is not open.`);
      }
      return;
    }

    try {
      let result: any;
      let error: any;

      // Use wagmi/viem or direct window.ethereum calls based on the method
      switch (payload.method) {
        case 'eth_chainId':
          result = `0x${chainId.toString(16)}`;
          break;
        case 'eth_accounts':
          result = [address];
          break;
        case 'eth_requestAccounts': // Often used by dapps, similar to eth_accounts
          result = [address];
          break;
        case 'eth_getTransactionCount': {
          // Keep existing eth_getTransactionCount logic here
          try {
            // Extract address and block tag from params (handle potential undefined)
            const targetAddress = payload.params?.[0] as Address | undefined;
            const blockTag = payload.params?.[1] as 'latest' | 'pending' | 'earliest' | string | undefined;

            if (!targetAddress) {
              console.error(`Missing address parameter for eth_getTransactionCount in request ${requestId}`);
              error = { code: -32602, message: 'Invalid params: Missing address for eth_getTransactionCount' };
              break; // Exit case
            }

            console.log(`[${requestId}] Attempting to fetch nonce for ${targetAddress} at block ${blockTag || 'pending'} using publicClient...`);
            // Add a specific check for publicClient just before using it
            if (!publicClient) {
              console.error(`[${requestId}] publicClient is null or undefined when trying eth_getTransactionCount!`);
              error = { code: -32603, message: 'Internal error: publicClient not available' };
              break; // Exit case
            }

            const nonce = await publicClient.getTransactionCount({
              address: targetAddress,
              blockTag: (blockTag || 'pending') as BlockTag, // Default to 'pending' as scripts often need the next nonce
            });
            // If the above line completes, log success
            console.log(`[${requestId}] Successfully fetched nonce for ${targetAddress}: ${nonce}`);
            result = `0x${nonce.toString(16)}`;
          } catch (err: any) {
            // Log the specific error encountered during the fetch
            console.error(`[${requestId}] Error calling publicClient.getTransactionCount:`, err);
            error = { code: err.code || -32603, message: `Failed to get transaction count: ${err.message || 'Unknown error'}` };
          }
          break;
        }
        case 'eth_getTransactionReceipt': {
          const requestedTxHash = payload.params?.[0] as Hex | undefined;
          if (!requestedTxHash) {
            error = { code: -32602, message: 'Invalid params: Missing transaction hash for eth_getTransactionReceipt' };
            break;
          }

          let eip7702DeploymentInfo: TrackedTxInfo | undefined;
          // Iterate over trackedTxsRef.current to find if this txHash corresponds to an EIP-7702 deployment
          for (const txInfo of trackedTxsRef.current.values()) {
            if (txInfo.actualTxHash === requestedTxHash && txInfo.isEip7702Deployment) {
              eip7702DeploymentInfo = txInfo;
              break;
            }
          }

          if (eip7702DeploymentInfo) {
            console.log(`[${requestId}] Intercepting eth_getTransactionReceipt for EIP-7702 deployment: ${requestedTxHash}`);
            const CONTRACT_CREATED_EVENT_TOPIC = "0xcf78cf0d6f3d8371e1075c69c492ab4ec5d8cf23a1a239b6a51a1d00be7ca312" as const;
            try {
              const originalReceipt = await publicClient.getTransactionReceipt({ hash: requestedTxHash });
              if (originalReceipt) {
                let deployedContractAddress: Address | null = null;
                // The eip7702SessionAccountRef.current is the EOA that authorizes and, in this specific setup,
                // is stated to be the emitter of the ContractCreated event. Access via ref.
                const expectedEmitterAddress = eip7702SessionAccountRef.current?.address;

                console.log(`[${requestId}] eth_getTransactionReceipt EIP-7702: expectedEmitterAddress = ${expectedEmitterAddress}`);

                for (const log of originalReceipt.logs) {

                  // Check if the log is from the expected emitter and matches the event topic
                  if (expectedEmitterAddress && log.address.toLowerCase() === expectedEmitterAddress.toLowerCase() &&
                    log.topics[0]?.toLowerCase() === CONTRACT_CREATED_EVENT_TOPIC) {

                    console.log(`[${requestId}] Found ContractCreated event log from expected emitter ${expectedEmitterAddress}`, { log })

                    // The contract address is in the data field. Data is 0x + 64 hex chars (32 bytes).
                    // The address is the last 20 bytes (40 hex chars).
                    if (log.data && log.data.length === 66) { // 0x + 32 bytes * 2 chars/byte
                      const addressHex = `0x${log.data.substring(26)}`; // 2 (for "0x") + (32-20)*2 = 2 + 24 = 26
                      try {
                        deployedContractAddress = getAddress(addressHex); // Converts to checksummed address
                        console.log(`[${requestId}] Extracted deployed contract address from log data: ${deployedContractAddress}`);
                        break; // Found the address
                      } catch (checksumError) {
                        console.warn(`[${requestId}] Failed to checksum extracted address ${addressHex}:`, checksumError);
                        // Potentially log this as an issue, but don't break if other logs might be valid
                      }
                    } else {
                      console.warn(`[${requestId}] ContractCreated event log data has unexpected length: ${log.data}`);
                    }
                  }
                }

                console.log({ originalReceipt, deployedContractAddress })

                result = {
                  ...originalReceipt,
                  contractAddress: deployedContractAddress || originalReceipt.contractAddress || null, // Override or set contractAddress
                };
                console.log(`[${requestId}] Modified receipt for EIP-7702 deployment:`, JSON.stringify(result, jsonReplacer, 2));
              } else {
                result = null; // No receipt found
              }
            } catch (err: any) {
              console.error(`[${requestId}] Error fetching/modifying receipt for EIP-7702 deployment:`, err);
              error = { code: -32603, message: `Failed to get/modify receipt for EIP-7702 deployment: ${err.message || 'Unknown error'}` };
            }
          } else {
            // Standard handling if not an EIP-7702 deployment or no special handling needed
            try {
              console.log(`[${requestId}] Standard eth_getTransactionReceipt for: ${requestedTxHash}`);
              result = await publicClient.getTransactionReceipt({ hash: requestedTxHash });
              console.log(`[${requestId}] Standard receipt fetched:`, JSON.stringify(result, jsonReplacer, 2));
            } catch (err: any) {
              if (err.name === 'TransactionReceiptNotFoundError') {
                console.log(`[${requestId}] Transaction receipt not found for ${requestedTxHash} (standard flow). Returning null to client.`);
                result = null; // Foundry expects null if not found
              } else {
                console.error(`[${requestId}] Error calling publicClient.getTransactionReceipt (standard flow):`, err);
                error = { code: -32603, message: `Failed to get transaction receipt: ${err.message || 'Unknown error'}` };
              }
            }
          }
          // Normalize receipt fields before sending back to Foundry
          // This block should only run if 'result' is truthy (i.e., a receipt was actually found and not set to null due to TransactionReceiptNotFoundError)
          if (result) {
            // Fix 1: Normalize 'type' field
            if (typeof result.type === 'string' && result.type.toLowerCase() === 'eip7702') {
              console.warn(`[${requestId}] Normalizing receipt type from "${result.type}" to "0x4" (EIP-7702 standard type).`);
              result.type = '0x4'; // EIP-2718 type for EIP-7702
            } else if (result.type === null || result.type === undefined || typeof result.type === 'string') {
              // If type is missing from the receipt, default to '0x2' (EIP-1559) as a common modern type.
              // Foundry expects a type.
              console.warn(`[${requestId}] Receipt type is ${result.type}. Defaulting to "0x2".`);
              result.type = '0x2';
            }

            // Fix 2: Normalize 'status' field from 'success'/'reverted' string to '0x1'/'0x0' hex
            // Viem's getTransactionReceipt returns status as 'success' | 'reverted'. Foundry expects hex.
            if (result.status === 'success') {
              result.status = '0x1';
            } else if (result.status === 'reverted') {
              result.status = '0x0';
            }
            // If status is already '0x0', '0x1', or if it's null/undefined from the node,
            // this won't change it. If null/undefined, Foundry might still have issues,
            // but that's a data problem from the node. We ensure it's hex if it was 'success'/'reverted'.
          }
          break;
        }
        // Add cases for other common read-only methods if needed (eth_call, eth_estimateGas etc.)
        // case 'eth_call':
        //   result = await publicClient.call({ /* construct params */ });
        //   break;
        // case 'eth_estimateGas':
        //    result = await publicClient.estimateGas({ /* construct params */ });
        //    break;
        default:
          console.warn(`Unhandled RPC method in switch: ${payload.method}. Attempting direct request via window.ethereum.`);
          // Fallback for methods not explicitly handled (use with caution)
          try {
            result = await window.ethereum?.request({ method: payload.method, params: payload.params });
          } catch (err: any) {
            console.error(`Error handling method ${payload.method} directly:`, err);
            error = { code: err.code || -32603, message: err.message || 'Internal JSON-RPC error' };
          }
      }

      if (error) {
        sendRpcResponse(requestId, { error });
      } else {
        sendRpcResponse(requestId, { result });
        setProcessedRequests(count => count + 1);
      }

    } catch (err: any) {
      console.error(`[App.tsx] Error processing RPC request ${requestId} (${payload.method}):`, err);
      sendRpcResponse(requestId, { error: { code: -32603, message: err.message || 'Internal JSON-RPC error' } });
    }
  }, [
    isConnected, address, chainId, publicClient, wsStatus, sendRpcResponse, // sendRpcResponse is now stable
    trackedTxsRef, eip7702SessionAccountRef, // refs
    // jsonReplacer is used by sendRpcResponse, which has it as a dependency
  ]);

  // Effect to update the ref with the latest actualHandleRpcRequest
  // This ensures stableOnRpcRequest always calls the most up-to-date handler.
  useEffect(() => {
    actualHandleRpcRequestRef.current = actualHandleRpcRequest;
  }, [actualHandleRpcRequest]);

  // --- Sign Response Sender (uses sendMessage from hook) ---
  const sendSignResponse = useCallback((requestId: string, response: { result?: any; error?: any }) => {
    if (wsStatus === 'open') {
      const message = JSON.stringify({
        type: 'signResponse',
        requestId: requestId,
        ...response,
      }, jsonReplacer);
      // console.log(`[App.tsx] Sending Sign Response for ${requestId}:`, message); // Reduce noise
      sendMessage(message);
    } else {
      console.error(`[App.tsx] WebSocket not open (state: ${wsStatus}), cannot send sign response for ${requestId}`);
    }
  }, [wsStatus, sendMessage, jsonReplacer]);
  
  // Determine RPC URL for potential local client use (used by Eip7702ModeDisplay and EIP-7702 signing)
  const rpcUrlForSessionClient = useMemo(() => {
    let url = CANDIDE_SEPOLIA_RPC_URL; // Default/fallback
    if (publicClient && publicClient.transport && typeof publicClient.transport.config?.url === 'string') {
      const clientRpcUrl = publicClient.transport.config.url;
      if (clientRpcUrl.startsWith('http://') || clientRpcUrl.startsWith('https://')) {
        url = clientRpcUrl;
      }
    }
    return url;
  }, [publicClient]); // Depends on publicClient

  // --- Sign Transaction Handler ---
  const handleSignTransaction = useCallback(async (request: SignRequest) => {
    const { requestId, payload } = request;

    console.log(`[App.tsx] Attempting to sign request ${requestId} for method ${payload.method}, Mode: ${activeMode}`);
    setSigningRequestId(requestId);

    if (wsStatus !== 'open' || !chainId || !publicClient) {
      const reason = wsStatus !== 'open' ? `WebSocket not open (state: ${wsStatus})`
        : !chainId ? 'Chain ID not available'
          : 'Public client not available';
      console.error(`[App.tsx] ${reason}, cannot sign transaction for ${requestId}`);
      if (wsStatus === 'open') { // Send error only if WS was open
        sendSignResponse(requestId, { error: { code: -32000, message: reason } });
      }
      setPendingSignRequests((prev) => prev.filter((req) => req.requestId !== requestId));
      setSigningRequestId(null); // Clear signing ID as we are returning early
      return;
    }

    // Mode-specific checks
    if (activeMode === 'browser') {
      // Browser mode requires connected browser wallet
      if (!walletClient || !address) {
        const reason = !walletClient ? 'Browser wallet client not available' : 'Browser wallet address not available';
        console.error(`${reason}, cannot sign transaction in Browser Wallet mode for ${requestId}`);
        sendSignResponse(requestId, { error: { code: -32000, message: reason } });
        setPendingSignRequests((prev) => prev.filter((req) => req.requestId !== requestId));
        setSigningRequestId(null); // Clear signing ID
        return;
      }
    } else if (activeMode === 'eip7702') {
      // EIP-7702 mode requires a session account (use ref for current value) and configured URLs (for Sepolia)
      if (!eip7702SessionAccountRef.current) {
        const reason = 'EIP-7702 session account not available. Generate or set a private key.';
        console.error(`${reason}, cannot sign transaction in EIP-7702 mode for ${requestId}`);
        sendSignResponse(requestId, { error: { code: -32000, message: reason } });
        setPendingSignRequests((prev) => prev.filter((req) => req.requestId !== requestId));
        setSigningRequestId(null); // Clear signing ID
        return;
      }
      if (chainId === 11155111 && !areCandideUrlsConfigured) {
        const configErrorMessage = "EIP-7702 Bundler/Paymaster URLs not configured in .env file. Please set VITE_CANDIDE_SEPOLIA_BUNDLER_URL and VITE_CANDIDE_SEPOLIA_PAYMASTER_URL.";
        console.error(`[${requestId}] ${configErrorMessage}`);
        sendSignResponse(requestId, { error: { code: -32000, message: "EIP-7702 provider URLs not configured." } });
        setPendingSignRequests((prev) => prev.filter((req) => req.requestId !== requestId));
        setSigningRequestId(null); // Clear signing ID
        // Do not disable the mode here, just prevent the transaction
        return;
      }
    }

    // Determine RPC URL for local client creation if needed
    let rpcUrlForSessionClient = CANDIDE_SEPOLIA_RPC_URL; // Default/fallback
    if (publicClient && publicClient.transport && typeof publicClient.transport.config?.url === 'string') {
      const clientRpcUrl = publicClient.transport.config.url;
      if (clientRpcUrl.startsWith('http://') || clientRpcUrl.startsWith('https://')) {
        rpcUrlForSessionClient = clientRpcUrl;
      }
    }

    try {
      let result: any;
      const currentEip7702SessionAccount = eip7702SessionAccountRef.current; // Get current value from ref

      if (activeMode === 'eip7702' && chainId === 11155111 && currentEip7702SessionAccount) { // Check mode and session account from ref
        // --- EIP-7702 Flow (using Session Private Key) ---
        console.log(`[${requestId}] Starting EIP-7702 flow using session account ${currentEip7702SessionAccount.address}...`);

        // Create a local WalletClient for the session account
        const localWalletClient = createWalletClient({
          account: currentEip7702SessionAccount,
          chain: publicClient.chain, // Use the chain object from the public client
          transport: http(rpcUrlForSessionClient)
        });
        console.debug(`[${requestId}] Created local WalletClient for session account.`);


        if (payload.method !== 'eth_sendTransaction' || !payload.params?.[0]) {
          sendSignResponse(requestId, { error: { code: -32602, message: "EIP-7702 flow currently only supports eth_sendTransaction." } });
          setPendingSignRequests((prev) => prev.filter((req) => req.requestId !== requestId));
          setSigningRequestId(null); // Clear signing ID
          throw new Error("EIP-7702 flow currently only supports eth_sendTransaction.");
        }
        const rawTx = payload.params[0] as any;
        const sanitizedTx = sanitizeTransactionRequest(rawTx, requestId);

        // Instantiate Simple7702Account using the SESSION account address
        const smartAccount = new Simple7702Account(
          currentEip7702SessionAccount.address, // Use session account address from ref
          { entrypointAddress: CANDIDE_ENTRY_POINT_ADDRESS }
        );

        let metaTx: MetaTransaction;

        if (!sanitizedTx.to) { // Contract Creation
          console.log(`[${requestId}] Handling contract creation via EIP-7702 custom createContract method.`);
          if (!sanitizedTx.data) {
            throw new Error("Contract creation requested but no initCode (sanitizedTx.data) found.");
          }
          const initCodeFromFoundry = sanitizedTx.data as Hex;

          // ABI for your createContract function
          const createContractAbi = [{
            type: 'function',
            name: 'createContract',
            inputs: [{ name: 'initCode', type: 'bytes' }],
            // outputs: [{ name: 'newContract', type: 'address' }], // Optional: if your contract returns it
            stateMutability: 'payable', // Or 'nonpayable' if it doesn't handle value
          }] as const;

          const callDataForCreateContract = encodeFunctionData({
            abi: createContractAbi,
            functionName: 'createContract',
            args: [initCodeFromFoundry],
          });

          metaTx = {
            to: currentEip7702SessionAccount.address, // Target the Simple7702Account itself (using address from ref)
            value: sanitizedTx.value || 0n,    // Pass through any value sent with the deployment
            data: callDataForCreateContract,
          };
          console.debug({ metaTx }, "Prepared MetaTransaction for EIP-7702 contract creation");

        } else { // Standard function call
          metaTx = {
            to: sanitizedTx.to as Address,
            value: sanitizedTx.value || 0n,
            data: sanitizedTx.data || "0x",
          };
          console.debug({ metaTx }, "Prepared MetaTransaction for EIP-7702 function call");
        }

        // --- EIP-7702 Specific Logic Continues from here with metaTx ---

        // Prepare & Sign EIP-7702 Authorization using the LOCAL wallet client
        // Nonce is for the SESSION account
        const sessionAccountNonceForAuth = await publicClient.getTransactionCount({ address: currentEip7702SessionAccount.address, blockTag: 'pending' });
        const designatedContractAddress = SIMPLE7702_DEFAULT_DELEGATEE_ADDRESS;

        console.debug(`Signing EIP-7702 Auth: SessionAccount=${currentEip7702SessionAccount.address}, DesignatedContract=${designatedContractAddress}, SessionAccountAuthNonce=${sessionAccountNonceForAuth}`);
        const eip7702FullSignature = await localWalletClient.signAuthorization({
          account: currentEip7702SessionAccount, // Sign with the session account from ref
          contractAddress: designatedContractAddress,
          nonce: sessionAccountNonceForAuth,
          chainId: chainId,
          // authority & executor: Using viem defaults.
        });

        console.debug({ eip7702FullSignature }); //log the full signature

        // Determining the yParity based on v is not necessary anymore, viem does that automatically.

        // // Extract r, s, v directly from the result. No need for parseSignature.
        // const { r, s, v } = eip7702FullSignature;

        // // Validate v and calculate yParity
        // if (typeof v !== 'bigint') {
        //     throw new Error(`Invalid 'v' value received from signAuthorization: ${v}`);
        // }
        // const yParity = v - 27n; // 0n if v is 27, 1n if v is 28
        // if (yParity !== 0n && yParity !== 1n) {
        //      throw new Error(`Calculated invalid yParity (${yParity}) from v (${v})`);
        // }


        // const eip7702AuthForUserOpOverride = { // Structure for abstractionkit's eip7702Auth override
        //   chainId: BigInt(chainId), // Expected as bigint
        //   address: eip7702SessionAccount.address, // Use session account address
        //     nonce: BigInt(sessionAccountNonceForAuth),      // Use session account nonce
        //     yParity: yParity === 0n ? '0x00' : '0x01' as '0x00' | '0x01', // Convert 0n/1n to '0x00'/'0x01'
        //     r: r, // Already Hex
        //     s: s, // Already Hex
        // };
        // console.debug({ authData: eip7702AuthForUserOpOverride }, "Prepared EIP-7702 Auth data for UserOp override using session account");

        // RPC URL for UserOperation creation (already determined as rpcUrlForSessionClient)
        const rpcUrlForUserOp = rpcUrlForSessionClient;

        // Create UserOperation (using abstractionkit) (MD step 4.2.7)
        console.debug(`Creating UserOperation with abstractionkit using RPC: ${rpcUrlForUserOp}, Bundler: ${ACTUAL_BUNDLER_URL}`);
        let userOperation = await smartAccount.createUserOperation(
          [metaTx],
          rpcUrlForUserOp,
          ACTUAL_BUNDLER_URL, // Use configured Bundler URL
          {
            eip7702Auth: {
              chainId: BigInt(chainId)
            }
          }
        ) as UserOperationV8;
        console.debug({ userOp: userOperation }, "UserOperation created by abstractionkit");
        delete eip7702FullSignature.v;
        userOperation.eip7702Auth = { ...eip7702FullSignature, chainId: toHex(chainId), nonce: toHex(sessionAccountNonceForAuth), yParity: eip7702FullSignature.yParity ? toHex(eip7702FullSignature.yParity) : "0x0" };

        console.debug({ userOp: userOperation }, "UserOperation filled with eip7702Auth");
        // Paymaster Sponsorship (using abstractionkit) (MD step 4.2.8)
        console.debug("Applying paymaster sponsorship with CandidePaymaster...");
        const paymaster = new CandidePaymaster(ACTUAL_PAYMASTER_URL); // Use configured Paymaster URL
        const [paymasterUserOperation, sponsorMetadata] = await paymaster.createSponsorPaymasterUserOperation(
          userOperation,
          ACTUAL_BUNDLER_URL, // Bundler URL is needed by the paymaster service
        );
        userOperation = paymasterUserOperation as UserOperationV8; // Update userOperation with paymaster data
        console.debug({ userOp: userOperation, sponsorMeta: sponsorMetadata }, "UserOperation after paymaster sponsorship");

        // Sign UserOperation (for Simple7702Account) (MD step 4.2.9)
        console.debug("Getting UserOperation hash for signing...");
        const userOpHash = await createUserOperationHash(
          userOperation,
          CANDIDE_ENTRY_POINT_ADDRESS, // Ensure this matches the entrypoint Simple7702Account uses
          BigInt(chainId)
        );
        console.debug(`UserOperation hash to sign: ${userOpHash}`);

        console.debug("Signing UserOperation hash with LOCAL session walletClient...");
        //this does not work, as it prepends the message, using low-level sign instead.
        // const userOpSignature = await localWalletClient.signMessage({
        //     account: eip7702SessionAccount, // Sign with the session account
        //     message: { raw: toHex(userOpHash) },
        // });
        const userOpSignature = serializeSignature(await sign({ hash: userOpHash as Hex, privateKey: eip7702PrivateKey || "0x0" }));
        userOperation.signature = userOpSignature;

        console.debug(`UserOperation signature obtained: ${userOpSignature}`);

        // Send UserOperation (using abstractionkit) (MD step 4.2.10)
        console.debug("Sending UserOperation to bundler...");
        const sendUserOpResponse = await smartAccount.sendUserOperation(userOperation, ACTUAL_BUNDLER_URL);
        const userOpHashForTracking = sendUserOpResponse.userOperationHash as Hex;
        console.info(`UserOperation sent. UserOpHash for tracking: ${userOpHashForTracking}`);

        // Initial UI update: Add UserOp to trackedTxs with 'checking' status
        // Ensure currentChainId and payload.decoded are available here
        const currentChainIdForEip7702 = chainId; // Should be defined and checked earlier
        const decodedInfoForEip7702 = payload.decoded;

        if (currentChainIdForEip7702) {
          const initialTrackedTx: TrackedTxInfo = {
            hash: userOpHashForTracking,
            status: 'checking', // Indicates we are waiting for UserOp inclusion
            confirmations: 0,
            timestamp: Date.now(),
            chainId: currentChainIdForEip7702,
            label: `EIP-7702 Session: ${generateTxLabel(decodedInfoForEip7702)} (UserOp)`,
            isEip7702Deployment: !sanitizedTx.to, // Set based on original tx's 'to' field
            // actualTxHash will be filled after inclusion
          };
          setTrackedTxs(prevMap => new Map(prevMap).set(userOpHashForTracking, initialTrackedTx));
        }
        console.log({ sendUserOpResponse })

        console.log(`[${requestId}] UserOp ${userOpHashForTracking} sent! Waiting for inclusion...`);
        const receiptResult = await sendUserOpResponse.included(); // Wait for the UserOp to be included

        console.info(`[${requestId}] UserOperation ${userOpHashForTracking} included. TxHash: ${receiptResult.receipt?.transactionHash}, Success: ${receiptResult.success}`);
        result = receiptResult.receipt?.transactionHash; // This is the actual tx hash to send back to Foundry

        // Update trackedTxs with the final status and actual transaction hash
        setTrackedTxs(prevMap => {
          const existingTx = prevMap.get(userOpHashForTracking);
          if (existingTx) {
            const updatedTxInfo: TrackedTxInfo = {
              ...existingTx,
              status: receiptResult.success ? 'success' : 'reverted',
              blockNumber: receiptResult.receipt?.blockNumber,
              actualTxHash: receiptResult.receipt?.transactionHash as Hex | undefined,
              // isEip7702Deployment is carried over from existingTx via spread (...)
              // No need to explicitly set it again here as it's determined at initialTrackedTx creation
              // and doesn't change.
            };
            return new Map(prevMap).set(userOpHashForTracking, updatedTxInfo);
          }
          return prevMap; // Should ideally always find the existingTx
        });

      } else { // This 'else' corresponds to: if NOT (activeMode === 'eip7702' && chainId === 11155111 && currentEip7702SessionAccount)
        // --- Standard Flow (Browser Wallet or other conditions not met for EIP-7702) ---
        if (payload.method === 'eth_sendTransaction' && payload.params?.[0]) {
          const rawTx = payload.params[0] as any;
          // Sanitize the transaction initially.
          const baseSanitizedTx = sanitizeTransactionRequest(rawTx, requestId);

          let finalTxToSend = { ...baseSanitizedTx }; // Clone for potential modification

          if (activeMode === 'browser') {
            // For browser wallet mode, delegate nonce management to the wallet.
            // This can be more reliable as the wallet (e.g., MetaMask) has the most current view of its own nonce sequence,
            // especially if transactions are also initiated directly from the wallet UI.
            // Foundry provides a nonce from eth_getTransactionCount("pending"), but by removing it here,
            // we let the wallet use its internally determined next nonce.
            if (finalTxToSend.nonce !== undefined) {
              console.log(`[${requestId}] Browser mode: Removing nonce (${finalTxToSend.nonce}) from transaction. Wallet will assign nonce.`);
              delete finalTxToSend.nonce;
            } else {
              console.log(`[${requestId}] Browser mode: Nonce was not present in rawTx from Foundry. Wallet will assign nonce.`);
            }
          }
          // For other modes (e.g., if a future 'direct_private_key' mode was added here, or if EIP-7702 logic was moved here),
          // finalTxToSend would still contain the nonce if `activeMode !== 'browser'`.

          console.log(`[${requestId}] Final transaction object for ${activeMode} flow (method ${payload.method}):`, JSON.stringify(finalTxToSend, (_key, value) =>
            typeof value === 'bigint' ? value.toString() : value
            , 2));

          console.log(`[${requestId}] Calling walletClient.sendTransaction...`);
          // Ensure walletClient is available (already checked for browser mode, but good practice if this block structure changes)
          if (!walletClient) {
            throw new Error("Wallet client is not available for sending the transaction.");
          }
          result = await walletClient.sendTransaction(finalTxToSend); // Use the (potentially) modified transaction
          console.log(`[${requestId}] Transaction sent via walletClient, hash: ${result}`);
        } else {
          // Handle other signing methods (eth_sign, personal_sign, etc.)
          // These typically don't involve nonces in the same way eth_sendTransaction does.
          console.error(`[${requestId}] Unsupported signing method in standard/browser flow: ${payload.method}`);
          throw new Error(`Unsupported signing method in standard/browser flow: ${payload.method}`);
        }
      }

      const txHashFromFlow = result as Hex; // This is actualTxHash for EIP-7702, TxHash for standard
      const currentChainIdForTracking = chainId; // Already checked for existence
      const decodedInfoForTracking = request.payload.decoded;

      // For Browser Wallet mode, add the transaction to tracking.
      // EIP-7702 mode handles its own tracking internally now.
      if (activeMode === 'browser' && txHashFromFlow && currentChainIdForTracking) {
        const txLabel = `Browser Wallet: ${generateTxLabel(decodedInfoForTracking)}`;
        const newTrackedTx: TrackedTxInfo = {
          hash: txHashFromFlow,
          status: 'pending',
          confirmations: 0,
          timestamp: Date.now(),
          chainId: currentChainIdForTracking,
          label: txLabel,
        };
        setTrackedTxs(prevMap => new Map(prevMap).set(txHashFromFlow, newTrackedTx));
      }
      // --- End Add to Tracked Txs for Browser Wallet ---

      // Remove the request from the UI *before* sending the response
      setPendingSignRequests((prev) => prev.filter((req) => req.requestId !== requestId));
      sendSignResponse(requestId, { result }); // Use updated sendSignResponse
      setProcessedRequests(count => count + 1);

    } catch (err: any) {
      // If an error occurred during EIP-7702 flow, and we had a userOpHash, mark it as reverted.
      if (activeMode === 'eip7702' && payload.params?.[0]) { // Check if it was an EIP-7702 attempt
        // We need a way to get the userOpHash if it was generated before the error.
        // This part is tricky if the error happens before userOpHash is obtained.
        // For now, if an error is caught here, the initial 'checking' entry might remain.
        // A more robust solution would involve passing userOpHashForTracking out of the EIP-7702 block's try-catch.
        // However, if sendUserOpResponse.included() itself throws, the 'result' won't be set.
        trackedTxsRef.current.forEach((tx) => { // Attempt to find and update the UserOp status using the ref
          if (tx.label.includes(generateTxLabel(payload.decoded)) && tx.status === 'checking') {
            setTrackedTxs(prevMap => {
              const existingTx = prevMap.get(tx.hash); // prevMap here is from the setTrackedTxs closure, which is fine
              if (existingTx) {
                return new Map(prevMap).set(tx.hash, { ...existingTx, status: 'reverted' });
              }
              return prevMap;
            });
          }
        });
      }

      setPendingSignRequests((prev) => prev.filter((req) => req.requestId !== requestId));
      console.error(`[App.tsx] Error signing/sending transaction for ${requestId}:`, err);
      const errorCode = err.code === 4001 ? 4001 : -32000; // Standardize error code for user rejection
      const errorMessage = err.shortMessage || err.message || 'User rejected or transaction failed';
      sendSignResponse(requestId, { error: { code: errorCode, message: errorMessage } }); // Use updated sendSignResponse
    } finally {
      setSigningRequestId(null);
    }
  }, [
    activeMode, chainId, publicClient, walletClient, address, // wagmi state
    wsStatus, sendSignResponse, // from hook & memoized sender
    setPendingSignRequests, setSigningRequestId, setProcessedRequests, // local state setters
    eip7702SessionAccountRef, // ref
    sanitizeTransactionRequest, generateTxLabel, // utils
    areCandideUrlsConfigured, // constant
    // rpcUrlForSessionClient will be defined outside and passed as a dependency
    eip7702PrivateKey, // state for EIP-7702
    // jsonReplacer is used by sendSignResponse
    rpcUrlForSessionClient, // Now correctly placed after rpcUrlForSessionClient declaration
  ]);



  // Update the dependency array of handleSignTransaction to include the now-defined rpcUrlForSessionClient
  // This requires a re-definition or a more complex state update if handleSignTransaction itself needs to be memoized
  // For simplicity in this step, we'll assume the dependency array of handleSignTransaction will be updated
  // after this move. The key is to declare rpcUrlForSessionClient first.

  // --- Reject Transaction Handler ---
  const handleRejectTransaction = useCallback((requestId: string) => {
    console.log(`[App.tsx] User rejected request ${requestId}`);
    if (wsStatus === 'open') { // Use wsStatus from hook
      sendSignResponse(requestId, { // Use updated sendSignResponse
        error: { code: 4001, message: 'User rejected the request.' }
      });
    } else {
      console.warn(`[App.tsx] Cannot send rejection for ${requestId} because WebSocket is not open (state: ${wsStatus}).`);
    }
    setPendingSignRequests((prev) => prev.filter((req) => req.requestId !== requestId));
  }, [wsStatus, sendSignResponse]); // setPendingSignRequests is stable

  // rpcUrlForLocalClient is the same as rpcUrlForSessionClient, just aliased for clarity if needed elsewhere.
  // This was moved up, so rpcUrlForLocalClient can now be defined using the moved rpcUrlForSessionClient
  const rpcUrlForLocalClient = rpcUrlForSessionClient;


  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center p-4">
      {/* Replace Header with Tabs */}
      <header className="w-full max-w-4xl flex justify-between items-center p-4 border-b border-gray-700 mb-6">
        <h1 className="text-xl md:text-2xl font-bold">⚡️ Foundry Dashboard</h1>
        {/* ConnectButton will be moved into the Browser Wallet tab */}
      </header>

      {/* Dashboard Status moved above tabs */}
      <div className="w-full max-w-4xl p-4 bg-gray-800 rounded shadow-lg mb-6">
        <h2 className="text-xl mb-4">Dashboard Status</h2>
        <DashboardStatus
          wsStatus={wsStatus}
          isConnected={isConnected}
          address={address} // Pass browser wallet address here
          chainId={chainId}
          processedRequests={processedRequests}
          copyToClipboard={copyToClipboard}
        />
      </div>


      <main className="w-full max-w-4xl p-4 bg-gray-800 rounded shadow-lg">
        <Tabs value={activeMode} onValueChange={(value) => setActiveMode(value as any)} className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-6">
            <TabsTrigger value="browser">Browser Wallet</TabsTrigger>
            <TabsTrigger value="eip7702" disabled={!isConnected || chainId !== 11155111}>
              EIP-7702 Sponsored
              {(!isConnected || chainId !== 11155111) && <span className="text-xs text-yellow-500 ml-1">(Sepolia Only)</span>}
            </TabsTrigger>
            <TabsTrigger value="erc4337" disabled>ERC-4337 (Soon)</TabsTrigger>
          </TabsList>

          {/* Content for Browser Wallet Mode (Default) */}
          <TabsContent value="browser">
            <div className="space-y-4">
              <p className="text-sm text-gray-400">
                Standard mode: Transactions are signed and sent directly by your connected browser wallet.
              </p>
              <div className="flex flex-col items-left gap-4 justify-between space-x-4 p-3 bg-gray-700/50 rounded-md">
                <ConnectButton />
                {isConnected && address && (
                  <div className='flex flex-col'>
                    <div className="flex items-center space-x-2">
                      <span className="font-mono text-sm text-gray-300 truncate" title={address}>{address}</span>
                      <Button variant="ghost" size="icon" onClick={() => copyToClipboard(address)} title="Copy Address">
                        <Copy size={16} />
                      </Button>
                    </div>
                    <div className='text-sm text-gray-300'>

                      Call the Foundry-Script with

                      <span className='font-mono pl-2'>
                        forge script script/YourScript.s.sol --rpc-url http://localhost:3001/api/rpc --broadcast --sender {address} --unlocked
                      </span> <Button onClick={() => copyToClipboard(`forge script script/YourScript.s.sol --rpc-url http://localhost:3001/api/rpc --broadcast --sender ${address} --unlocked`)} title="Copy command" variant="ghost" size="icon" >
                        <Copy size={16} />
                      </Button>

                    </div>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          {/* Content for EIP-7702 Mode */}
          <TabsContent value="eip7702">
            <Eip7702ModeDisplay
              privateKey={eip7702PrivateKey}
              sessionAccount={_eip7702SessionAccount}
              setPrivateKey={setEip7702PrivateKey}
              rpcUrl={rpcUrlForLocalClient} // This prop might not be actively used by Eip7702ModeDisplay currently
              chainId={chainId} // This prop might not be actively used by Eip7702ModeDisplay currently
            />
            <Alert className="mt-6 border-blue-500 bg-blue-900/30 text-blue-200">
              <Terminal className="h-4 w-4 !text-blue-400" />
              <AlertTitle className="text-blue-300">Tip: Deterministic Deployments with Factories</AlertTitle>
              <AlertDescription className="text-sm text-blue-300/90 space-y-2">
                <p>
                  For EIP-7702 (and ERC-4337) smart accounts, contract deployments must go through the account's `execute` function.
                  Direct `new MyContract()` in Foundry scripts won't work as expected with these account types.
                </p>
                <p>
                  Instead, use a factory contract like <a href="https://book.getfoundry.sh/guides/deterministic-deployments-using-create2" target="_blank" rel="noopener noreferrer" className="underline hover:text-blue-100">Deterministic Deployer</a> (or a similar CREATE/CREATE2 factory) to deploy your contracts.
                  This gives you a deterministic address: simply add a salt to the contract instance.
                </p>

                <div className='text-mono'>
                  <code><blockquote>
                    {'Counter counter = new Counter\{salt: salt\}();'}
                  </blockquote></code>
                </div>
                <p>
                  Call the Foundry-Script with `forge script script/YourScript.s.sol --rpc-url http://localhost:3001/api/rpc --broadcast --sender {eip7702SessionAccountRef.current?.address} --unlocked`  <button onClick={() => copyToClipboard(`forge script script/YourScript.s.sol --rpc-url http://localhost:3001/api/rpc --broadcast --sender ${eip7702SessionAccountRef.current?.address} --unlocked`)} title="Copy Address" className="text-gray-500 hover:text-white">
                    <Copy size={14} />
                  </button>
                </p>
              </AlertDescription>
            </Alert>
          </TabsContent>

          {/* Content for ERC-4337 Mode */}
          <TabsContent value="erc4337">
            <p className="text-center text-gray-500 italic mt-8">Full ERC-4337 Smart Account support coming soon...</p>
          </TabsContent>

        </Tabs>

        {/* Common Sections - Shown regardless of tab, below the specific tab content */}
        {/* PendingActionsList and TrackedTransactionsList are now general */}
        <PendingActionsList
          pendingSignRequests={pendingSignRequests}
          signingRequestId={signingRequestId} // Pass down the signing request ID
          handleSignTransaction={handleSignTransaction}
          handleRejectTransaction={handleRejectTransaction}
          walletClient={walletClient}
          isConnected={isConnected}
        />

        <TrackedTransactionsList
          trackedTxs={_trackedTxs}
          getExplorerLink={getExplorerLink}
          copyToClipboard={copyToClipboard}
        />

      </main>
    </div>
  )
}

export default App
