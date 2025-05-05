import { useAccount, usePublicClient, useWalletClient, useWatchBlockNumber } from 'wagmi';
import { useEffect, useState, useRef } from 'react';
import { Address, TransactionRequest, Hex } from 'viem';

// Import types and components
import { SignRequest, TrackedTxInfo, WsStatus, RpcPayload } from '@/types';
import { getExplorerLink, copyToClipboard, generateTxLabel, sanitizeTransactionRequest } from '@/lib/utils'; // Import sanitizeTransactionRequest
import { DashboardHeader } from '@/components/DashboardHeader';
import { DashboardStatus } from '@/components/DashboardStatus';
import { PendingActionsList } from '@/components/PendingActionsList';
import { TrackedTransactionsList } from '@/components/TrackedTransactionsList';


function App() {
  // --- Hooks ---
  const { address, chainId, isConnected } = useAccount();
  const publicClient = usePublicClient({ chainId }); // Ensure publicClient uses current chainId
  const { data: walletClient } = useWalletClient();
  const wsRef = useRef<WebSocket | null>(null);
  const [pendingSignRequests, setPendingSignRequests] = useState<SignRequest[]>([]);
  const [wsStatus, setWsStatus] = useState<'connecting' | 'open' | 'closed' | 'error'>('connecting');
  const [processedRequests, setProcessedRequests] = useState(0);
  const [trackedTxs, setTrackedTxs] = useState<Map<Hex, TrackedTxInfo>>(new Map());

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
              blockTag: blockTag || 'pending', // Default to 'pending' as scripts often need the next nonce
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

    console.log(`Attempting to sign request ${requestId} for method ${payload.method}`); // Log less verbosely

    if (!walletClient || !currentWs || currentWs.readyState !== WebSocket.OPEN) {
      const reason = !walletClient ? 'Wallet client not available' : 'WebSocket not open';
      console.error(`${reason}, cannot sign transaction for ${requestId}`);
      // Optionally send error back if possible
      if (currentWs && currentWs.readyState === WebSocket.OPEN) {
         sendSignResponse(currentWs, requestId, { error: { code: -32000, message: reason } });
      }
      // Remove the request from UI even if we can't send error
      setPendingSignRequests((prev) => prev.filter((req) => req.requestId !== requestId));
      return;
    }

    try {
      let result: any;
      // Assuming eth_sendTransaction is the primary signing method for now
      if (payload.method === 'eth_sendTransaction' && payload.params?.[0]) {
        const rawTx = payload.params[0] as any;

        // --- Sanitize the transaction object using the utility function ---
        const sanitizedTx = sanitizeTransactionRequest(rawTx, requestId);
        // --- ---

        console.log(`[${requestId}] Sanitized transaction object being sent:`, JSON.stringify(sanitizedTx, (_key, value) =>
            typeof value === 'bigint' ? value.toString() : value // Convert BigInts for logging
        , 2));

        // Always use viem's walletClient now
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

      const txHash = result as Hex;
      const currentChainId = chainId; // Capture current chainId
      const decodedInfo = request.payload.decoded; // Get decoded info from original request

      if (txHash && currentChainId) {
          const newTrackedTx: TrackedTxInfo = {
              hash: txHash,
              status: 'pending',
              confirmations: 0,
              timestamp: Date.now(),
              chainId: currentChainId,
              label: generateTxLabel(decodedInfo), // Generate and store the label
          };
          // Update state immutably
          setTrackedTxs(prevMap => new Map(prevMap).set(txHash, newTrackedTx));
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
