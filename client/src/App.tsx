import { useAccount, usePublicClient, useWalletClient, useWatchBlockNumber } from 'wagmi';
import { useEffect, useState, useRef } from 'react';
import { Address, BlockTag, Hex } from 'viem';

// Import types and components
import { SignRequest, TrackedTxInfo, RpcPayload } from '@/types';
import { getExplorerLink, copyToClipboard, generateTxLabel, sanitizeTransactionRequest } from '@/lib/utils'; // Import sanitizeTransactionRequest
import { Simple7702Account, UserOperationV8, MetaTransaction, CandidePaymaster } from "abstractionkit"; // EIP-7702
import { parseSignature } from 'viem'; // EIP-7702
// Helper from abstractionkit or replicate its bigintToHex logic if needed for eip7702Auth object
const bigintToHexAK = (val: bigint): Hex => ('0x' + (val === 0n ? '0' : val.toString(16))) as Hex; // EIP-7702
import { DashboardHeader } from '@/components/DashboardHeader';
import { DashboardStatus } from '@/components/DashboardStatus';
import { PendingActionsList } from '@/components/PendingActionsList';
import { TrackedTransactionsList } from '@/components/TrackedTransactionsList';
import { Switch } from '@/components/ui/switch'; // Assuming you have a Switch component (e.g., from shadcn)
import { Label } from '@/components/ui/label';   // Assuming you have a Label component

// --- Configuration Constants for Candide EIP-7702 ---
// TODO: Replace with your actual Candide API keys if they are different from public/demo ones
const CANDIDE_SEPOLIA_RPC_URL = "https://ethereum-sepolia-rpc.publicnode.com";
const CANDIDE_SEPOLIA_BUNDLER_URL = "YOUR_CANDIDE_SEPOLIA_BUNDLER_URL_OR_API_KEY_ENDPOINT"; // e.g., https://api.candide.dev/bundler/v3/sepolia/YOUR_API_KEY
const CANDIDE_SEPOLIA_PAYMASTER_URL = "YOUR_CANDIDE_SEPOLIA_PAYMASTER_URL_OR_API_KEY_ENDPOINT"; // e.g., https://api.candide.dev/paymaster/v3/sepolia/YOUR_API_KEY
// Entry point used by Candide's Simple7702Account (v0.8.0 as per abstractionkit constants)
const CANDIDE_ENTRY_POINT_ADDRESS = "0x0000000071727De22E5E9d8bAF0edAc6f37da032";
// Default delegatee for Simple7702Account
const SIMPLE7702_DEFAULT_DELEGATEE_ADDRESS = "0xe6Cae83BdE06E4c305530e199D7217f42808555B" as Address;


function App() {
  // --- Hooks ---
  const { address, chainId, isConnected } = useAccount();
  const publicClient = usePublicClient({ chainId });
  const { data: walletClient } = useWalletClient();
  const wsRef = useRef<WebSocket | null>(null);
  const [pendingSignRequests, setPendingSignRequests] = useState<SignRequest[]>([]);
  const [wsStatus, setWsStatus] = useState<'connecting' | 'open' | 'closed' | 'error'>('connecting');
  const [processedRequests, setProcessedRequests] = useState(0);
  const [trackedTxs, setTrackedTxs] = useState<Map<Hex, TrackedTxInfo>>(new Map());
  const [isEip7702Enabled, setIsEip7702Enabled] = useState(false); // State for EIP-7702 toggle

  // --- WebSocket Connection ---
  useEffect(() => {
    const wsUrl = `ws://${window.location.host}/socket`;
    console.log('Attempting to connect WebSocket to:', wsUrl);
    setWsStatus('connecting');
    const socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      console.log('WebSocket Connected');
      wsRef.current = socket; // Store instance in ref
      setWsStatus('open');
      socket.send(JSON.stringify({ type: 'clientHello', message: 'Frontend connected' }));
    };

    socket.onmessage = (event) => {
      // Access the current WebSocket instance via wsRef.current inside the handler
      // console.log('WebSocket Message Received:', event.data); // Reduce noise
      try {
        const message = JSON.parse(event.data);
        // setMessages((prev) => [...prev, message]); // Don't store every message

        // Handle incoming requests from backend
        if (message.type === 'rpcRequest') {
          // Log only the request type, not full payload by default
          console.log(`Received rpcRequest for method: ${message.payload?.method} (ID: ${message.requestId})`);
          handleRpcRequest(message.requestId, message.payload);
        } else if (message.type === 'signRequest') {
          console.log('Received signRequest:', message.requestId, message.payload?.method); // Log key info
          // Add to pending requests state if not already present
          setPendingSignRequests((prev) =>
             prev.find((req) => req.requestId === message.requestId)
               ? prev
               : [...prev, { requestId: message.requestId, payload: message.payload }]
          );
        }

      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };

    socket.onerror = (error) => {
      console.error('WebSocket Error:', error);
      wsRef.current = null; // Clear ref on error
      setWsStatus('error');
    };

    socket.onclose = () => {
      console.log('WebSocket Disconnected');
      wsRef.current = null; // Clear ref on close
      setWsStatus('closed');
      // Optional: Implement reconnection logic here
    };

    // Cleanup function
    return () => {
      socket.close();
    };
  }, []); // Run only once on component mount


  // --- Transaction Receipt Polling Effect ---
  const POLLING_INTERVAL = 4000; // Check every 4 seconds

  useEffect(() => {
      if (!publicClient || trackedTxs.size === 0 || !chainId) {
          return; // No client, nothing to track, or chainId missing
      }

      const intervalId = setInterval(async () => {
          const pendingHashes = Array.from(trackedTxs.entries())
              .filter(([_, tx]) => (tx.status === 'pending' || tx.status === 'checking') && tx.chainId === chainId) // Only poll for current chain
              .map(([hash, _]) => hash);

          if (pendingHashes.length === 0) return;

          console.trace(`Polling receipts for ${pendingHashes.length} transactions on chain ${chainId}...`);

          for (const hash of pendingHashes) {
              const txInfo = trackedTxs.get(hash);
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
                      // Stop polling for this one once receipt is found
                  } else {
                      // Still pending, reset status from 'checking' back to 'pending'
                      setTrackedTxs(prevMap => {
                           const currentTx = prevMap.get(hash);
                           if (!currentTx || currentTx.status !== 'checking') return prevMap;
                           return new Map(prevMap).set(hash, { ...currentTx, status: 'pending' });
                      });
                  }
              } catch (error: any) {
                  console.warn({ err: error, hash }, `Error fetching receipt for tx`);
                  // Reset status back to pending on error to allow retry
                   setTrackedTxs(prevMap => {
                       const currentTx = prevMap.get(hash);
                       if (!currentTx || currentTx.status !== 'checking') return prevMap;
                       return new Map(prevMap).set(hash, { ...currentTx, status: 'pending' });
                  });
              }
          }
      }, POLLING_INTERVAL);

      return () => clearInterval(intervalId); // Cleanup interval on unmount or dependency change

  }, [trackedTxs, publicClient, chainId]); // Re-run if trackedTxs, client or chain changes


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


  // --- RPC Request Handling ---
  const handleRpcRequest = async (requestId: string, payload: RpcPayload) => { // Use RpcPayload type
    // RPC handling logic remains here
    // --- Access the WebSocket instance via the ref ---
    const currentWs = wsRef.current;
    // --- ---

    // console.log(`Handling RPC Request ${requestId}:`, payload); // Reduce noise

    // Ensure wallet is connected, publicClient is available, AND WebSocket is open
    if (!isConnected || !address || !chainId || !publicClient || !currentWs || currentWs.readyState !== WebSocket.OPEN) {
      const wsState = currentWs ? WebSocket.OPEN ? 'open' : WebSocket.CONNECTING ? 'connecting' : WebSocket.CLOSING ? 'closing' : 'closed' : 'null';
      const errorMsg = !currentWs || currentWs.readyState !== WebSocket.OPEN ? `WebSocket not open (state: ${wsState})` : !publicClient ? 'RPC client unavailable' : 'Wallet not connected';
      console.error(`${errorMsg}, cannot handle RPC request ${requestId} (${payload.method})`);
      // Attempt to send error back only if WS was open initially
      if (currentWs && currentWs.readyState === WebSocket.OPEN) {
         sendRpcResponse(currentWs, requestId, { error: { code: -32000, message: errorMsg } });
      } else {
         console.warn(`Cannot send error response for ${requestId} because WebSocket is not open.`);
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
        case 'eth_getTransactionCount':
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

      // Use the captured WebSocket instance (currentWs) to send the response
      if (error) {
        sendRpcResponse(currentWs, requestId, { error });
      } else {
        sendRpcResponse(currentWs, requestId, { result });
        setProcessedRequests(count => count + 1); // Increment counter on success
      }

    } catch (err: any) {
      console.error(`Error processing RPC request ${requestId} (${payload.method}):`, err);
      // Use the captured WebSocket instance (currentWs) to send the error response
      sendRpcResponse(currentWs, requestId, { error: { code: -32603, message: err.message || 'Internal JSON-RPC error' } });
    }
  };

  // --- Send Response back via WebSocket ---
  // Modify to accept the WebSocket instance as the first argument
  const sendRpcResponse = (socketInstance: WebSocket, requestId: string, response: { result?: any; error?: any }) => {
    // No need to check null here as handleRpcRequest already does, but check state
    if (socketInstance.readyState === WebSocket.OPEN) {
      const message = JSON.stringify({
        type: 'rpcResponse',
        requestId: requestId, // Use the requestId passed to this function
        ...response,
      });
      // console.log(`Sending RPC Response for ${requestId}:`, message); // Reduce noise
      socketInstance.send(message);
    } else {
      // Log based on the state of the passed instance
      console.error(`WebSocket not open (state: ${socketInstance.readyState}), cannot send response for ${requestId}`);
    }
  };

  // --- Sign Transaction Handler ---
  const handleSignTransaction = async (request: SignRequest) => {
    // Signing logic remains here
    const { requestId, payload } = request;
    const currentWs = wsRef.current;

    console.log(`Attempting to sign request ${requestId} for method ${payload.method}, EIP7702: ${isEip7702Enabled}`);

    if (!walletClient || !currentWs || currentWs.readyState !== WebSocket.OPEN || !address || !chainId || !publicClient) {
      const reason = !walletClient ? 'Wallet client not available'
                   : !currentWs || currentWs.readyState !== WebSocket.OPEN ? 'WebSocket not open'
                   : !address ? 'EOA address not available'
                   : !chainId ? 'Chain ID not available'
                   : 'Public client not available';
      console.error(`${reason}, cannot sign transaction for ${requestId}`);
      if (currentWs && currentWs.readyState === WebSocket.OPEN) {
         sendSignResponse(currentWs, requestId, { error: { code: -32000, message: reason } });
      }
      setPendingSignRequests((prev) => prev.filter((req) => req.requestId !== requestId));
      return;
    }

    try {
      let result: any;

      if (isEip7702Enabled && chainId === 11155111 && address) { // Only for Sepolia for now & ensure address is available
        // --- EIP-7702 Flow ---
        console.log(`[${requestId}] Starting EIP-7702 flow...`);
        if (payload.method !== 'eth_sendTransaction' || !payload.params?.[0]) {
            sendSignResponse(currentWs, requestId, { error: { code: -32602, message: "EIP-7702 flow currently only supports eth_sendTransaction." } });
            setPendingSignRequests((prev) => prev.filter((req) => req.requestId !== requestId));
            throw new Error("EIP-7702 flow currently only supports eth_sendTransaction.");
        }
        const rawTx = payload.params[0] as any;
        const sanitizedTx = sanitizeTransactionRequest(rawTx, requestId);

        if (!sanitizedTx.to) { // Contract Creation
            console.error(`[${requestId}] Contract creation is not supported in EIP-7702 mode yet.`);
            sendSignResponse(currentWs, requestId, { error: { code: -32000, message: "Contract creation via EIP-7702 is not yet supported. Use a factory or disable EIP-7702 mode." } });
            setPendingSignRequests((prev) => prev.filter((req) => req.requestId !== requestId));
            return;
        }

        // --- EIP-7702 Specific Logic Starts Here ---
        const smartAccount = new Simple7702Account(
            address, // EOA address
            { entrypointAddress: CANDIDE_ENTRY_POINT_ADDRESS }
        );

        // Prepare MetaTransaction (MD step 4.2.5)
        const metaTx: MetaTransaction = {
            to: sanitizedTx.to as Address, // We've ensured 'to' exists
            value: sanitizedTx.value || 0n,
            data: sanitizedTx.data || "0x",
        };
        console.debug({ metaTx }, "Prepared MetaTransaction for EIP-7702");

        // Prepare & Sign EIP-7702 Authorization (MD step 4.2.6)
        const eoaNonceForAuth = await publicClient.getTransactionCount({ address, blockTag: 'pending' });
        const designatedContractAddress = SIMPLE7702_DEFAULT_DELEGATEE_ADDRESS;

        console.debug(`Signing EIP-7702 Auth: EOA=${address}, DesignatedContract=${designatedContractAddress}, EOAAuthNonce=${eoaNonceForAuth}`);
        const eip7702FullSignature = await walletClient.signAuthorization({
            account: address,
            contractAddress: designatedContractAddress,
            nonce: eoaNonceForAuth,
            chainId: BigInt(chainId),
            // authority & executor: Using viem defaults.
        });

        const { r, s, yParity } = parseSignature(eip7702FullSignature);

        const eip7702AuthForUserOpOverride = { // Matches Authorization7702Hex structure
            chainId: bigintToHexAK(BigInt(chainId)),
            address: address,
            nonce: bigintToHexAK(eoaNonceForAuth),
            yParity: yParity === 0n ? '0x00' : '0x01' as '0x00' | '0x01',
            r: r as Hex,
            s: s as Hex,
        };
        console.debug({ authData: eip7702AuthForUserOpOverride }, "Prepared EIP-7702 Auth data for UserOp override");

        // TODO: Implement full EIP-7702 logic here (Steps from MD 4.2.7 onwards)
        // 4. Create UserOperation (abstractionkit)
        // 5. Paymaster Sponsorship (abstractionkit)
        // 6. Sign UserOperation (abstractionkit hash + viem signMessage)
        // 7. Send UserOperation (abstractionkit)
        // 8. Track UserOperation (initial update to trackedTxs)
        // 9. Asynchronously update tracking with inclusion result

        // Placeholder result for now
        result = `eip7702_user_op_placeholder_for_${requestId}`; // Replace with actual UserOpHash
        console.warn(`[${requestId}] EIP-7702 flow not fully implemented. Placeholder result: ${result}`);
        // For now, we'll just send back a placeholder and not actually submit.

      } else {
        // --- Standard Flow (Non-EIP-7702 or conditions not met) ---
        if (payload.method === 'eth_sendTransaction' && payload.params?.[0]) {
            const rawTx = payload.params[0] as any;
            const sanitizedTx = sanitizeTransactionRequest(rawTx, requestId);

            console.log(`[${requestId}] Sanitized transaction object for standard flow:`, JSON.stringify(sanitizedTx, (_key, value) =>
                typeof value === 'bigint' ? value.toString() : value
            , 2));

            console.log(`[${requestId}] Calling walletClient.sendTransaction...`);
            result = await walletClient.sendTransaction(sanitizedTx);
            console.log(`[${requestId}] Transaction sent via walletClient, hash: ${result}`);
        } else {
            // Handle other signing methods (eth_sign, personal_sign, etc.) here if needed
         // Example:
         // if (payload.method === 'personal_sign' && payload.params?.[0] && payload.params?.[1]) {
         //   const message = payload.params[0];
         //   const account = payload.params[1] as Address;
         //   result = await walletClient.signMessage({ account, message });
         // } else { ... }
         throw new Error(`Unsupported signing method: ${payload.method}`);
        }
      }

      const txHashOrUserOpHash = result as Hex; // This is UserOpHash for EIP-7702, TxHash for standard
      const currentChainId = chainId;
      const decodedInfo = request.payload.decoded;

      if (txHashOrUserOpHash && currentChainId) {
          const txLabel = isEip7702Enabled && chainId === 11155111
              ? `EIP-7702: ${generateTxLabel(decodedInfo)} (UserOp)`
              : generateTxLabel(decodedInfo);

          const newTrackedTx: TrackedTxInfo = {
              hash: txHashOrUserOpHash, // Store UserOpHash for EIP-7702, TxHash for standard
              status: 'pending',
              confirmations: 0,
              timestamp: Date.now(),
              chainId: currentChainId,
              label: txLabel,
              // actualTxHash will be filled later for UserOps
          };
          setTrackedTxs(prevMap => new Map(prevMap).set(txHashOrUserOpHash, newTrackedTx));
      }
      // --- End Add to Tracked Txs ---

      // Remove the request from the UI *before* sending the response
      setPendingSignRequests((prev) => prev.filter((req) => req.requestId !== requestId));
      // Send success response back
      sendSignResponse(currentWs, requestId, { result });
      setProcessedRequests(count => count + 1); // Increment counter on success

    } catch (err: any) {
      // Remove the request from the UI *before* sending the error response
      setPendingSignRequests((prev) => prev.filter((req) => req.requestId !== requestId));
      console.error(`Error signing/sending transaction for ${requestId}:`, err);
      // Standard JSON-RPC error codes: https://eips.ethereum.org/EIPS/eip-1474#error-codes
      // 4001 is user rejection
      const errorCode = err.code === 4001 ? 4001 : -32000; // Use -32000 for generic internal errors
      const errorMessage = err.shortMessage || err.message || 'User rejected or transaction failed';
      sendSignResponse(currentWs, requestId, { error: { code: errorCode, message: errorMessage } });
    }
    // Removed finally block as state update is now done before sending response/error
  };

  // --- Reject Transaction Handler ---
  const handleRejectTransaction = (requestId: string) => {
    // Rejection logic remains here
    const currentWs = wsRef.current;
    console.log(`User rejected request ${requestId}`);
    if (currentWs && currentWs.readyState === WebSocket.OPEN) {
      sendSignResponse(currentWs, requestId, {
        error: { code: 4001, message: 'User rejected the request.' }
      });
    } else {
       console.warn(`Cannot send rejection for ${requestId} because WebSocket is not open.`);
    }
    // Remove the request from the UI
    setPendingSignRequests((prev) => prev.filter((req) => req.requestId !== requestId));
  };

  // --- Send Signing Response back via WebSocket ---
  const sendSignResponse = (socketInstance: WebSocket, requestId: string, response: { result?: any; error?: any }) => {
    // Sending sign response logic remains here
    if (socketInstance.readyState === WebSocket.OPEN) {
      const message = JSON.stringify({
        type: 'signResponse', // Use 'signResponse' type
        requestId: requestId,
        ...response,
      });
      // console.log(`Sending Sign Response for ${requestId}:`, message); // Reduce noise
      socketInstance.send(message);
    } else {
      console.error(`WebSocket not open (state: ${socketInstance.readyState}), cannot send sign response for ${requestId}`);
    }
  };


  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center p-4">
      <DashboardHeader />

      <main className="w-full max-w-4xl mt-8 p-4 bg-gray-800 rounded shadow-lg">
        <h2 className="text-xl mb-4">Dashboard Status</h2>
        <h2 className="text-xl mb-4">Settings</h2>
        <div className="flex items-center space-x-2 mb-6 p-3 bg-gray-700 rounded-md">
            <Switch
                id="eip7702-toggle"
                checked={isEip7702Enabled}
                onCheckedChange={setIsEip7702Enabled}
                disabled={!isConnected || chainId !== 11155111} // Example: Enable only for Sepolia and when connected
            />
            <Label htmlFor="eip7702-toggle" className="text-sm font-medium">
                Enable EIP-7702 Gasless Transactions (Sepolia Only)
            </Label>
            {(!isConnected || chainId !== 11155111) && isEip7702Enabled && (
                 <p className="text-xs text-yellow-400 ml-2">Connect to Sepolia to use EIP-7702 mode.</p>
            )}
        </div>

        <h2 className="text-xl mb-4">Dashboard Status</h2>
        <DashboardStatus
            wsStatus={wsStatus}
            isConnected={isConnected}
            address={address}
            chainId={chainId}
            processedRequests={processedRequests}
            copyToClipboard={copyToClipboard}
        />

        <PendingActionsList
            pendingSignRequests={pendingSignRequests}
            handleSignTransaction={handleSignTransaction}
            handleRejectTransaction={handleRejectTransaction}
            walletClient={walletClient}
            isConnected={isConnected}
        />

        <TrackedTransactionsList
            trackedTxs={trackedTxs}
            getExplorerLink={getExplorerLink}
            copyToClipboard={copyToClipboard}
        />

      </main>
    </div>
  )
}

export default App
