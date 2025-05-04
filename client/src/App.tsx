import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi'; // Import useWalletClient
import { useEffect, useState, useRef } from 'react';
import { Address, TransactionRequest } from 'viem'; // Import TransactionRequest

// Define types for RPC payload and signing request
type RpcPayload = { method: string; params: any[]; id: number | string; decoded?: DecodedInfo | null };
// Define structure for decoded info (adjust as needed based on backend output)
interface DecodedInfoBase {
    type: 'deployment' | 'functionCall';
    contractName: string;
// Define structure for a single decoded argument
interface DecodedArg {
    name: string;
    type: string;
    value: any;
}

}
interface DecodedDeploymentInfo extends DecodedInfoBase {
    type: 'deployment';
    constructorArgs?: DecodedArg[]; // Now an array of DecodedArg
}
interface DecodedFunctionInfo extends DecodedInfoBase {
    type: 'functionCall';
    functionName: string;
    args?: DecodedArg[]; // Now an array of DecodedArg
}
type DecodedInfo = DecodedDeploymentInfo | DecodedFunctionInfo;

type SignRequest = { requestId: string; payload: RpcPayload };


function App() {
  const { address, chainId, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient(); // Get wallet client for signing
  const wsRef = useRef<WebSocket | null>(null);
  const [messages, setMessages] = useState<any[]>([]); // Log of all messages
  const [pendingSignRequests, setPendingSignRequests] = useState<SignRequest[]>([]); // State for signing requests
  const [wsStatus, setWsStatus] = useState<'connecting' | 'open' | 'closed' | 'error'>('connecting');

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
      console.log('WebSocket Message Received:', event.data);
      try {
        const message = JSON.parse(event.data);
        setMessages((prev) => [...prev, message]); // Add message to state

        // Handle incoming requests from backend
        if (message.type === 'rpcRequest') {
          handleRpcRequest(message.requestId, message.payload);
        } else if (message.type === 'signRequest') {
          console.log('Received signRequest:', message);
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

  // --- RPC Request Handling ---
  const handleRpcRequest = async (requestId: string, payload: { method: string; params: any[]; id: number | string }) => {
    // --- Access the WebSocket instance via the ref ---
    const currentWs = wsRef.current;
    // --- ---

    console.log(`Handling RPC Request ${requestId}:`, payload);

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
      console.log(`Sending RPC Response for ${requestId}:`, message);
      socketInstance.send(message); // Use the passed instance
    } else {
      // Log based on the state of the passed instance
      console.error(`WebSocket not open (state: ${socketInstance.readyState}), cannot send response for ${requestId}`);
    }
  };

  // --- Sign Transaction Handler ---
  const handleSignTransaction = async (request: SignRequest) => {
    const { requestId, payload } = request;
    const currentWs = wsRef.current;

    console.log(`Attempting to sign request ${requestId}:`, payload);

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
        const rawTx = payload.params[0] as any; // Receive as 'any' initially for inspection
        console.log(`[${requestId}] Raw transaction object received:`, JSON.stringify(rawTx, null, 2));

        // --- Sanitize the transaction object ---
        const sanitizedTx: TransactionRequest = {
          // ...rawTx,
          // Explicitly convert gas-related fields and value from hex strings to bigint
          ...(rawTx.gas && { gas: BigInt(rawTx.gas) }), // Optional: gas/gasLimit
          ...(rawTx.gasPrice && { gasPrice: BigInt(rawTx.gasPrice) }), // For legacy tx
          ...(rawTx.maxFeePerGas && { maxFeePerGas: BigInt(rawTx.maxFeePerGas) }), // For EIP-1559 tx
          ...(rawTx.maxPriorityFeePerGas && { maxPriorityFeePerGas: BigInt(rawTx.maxPriorityFeePerGas) }), // For EIP-1559 tx
          ...(rawTx.value && { value: BigInt(rawTx.value) }),
          // Nonce needs to be a number for viem
          ...(rawTx.nonce !== undefined && { nonce: typeof rawTx.nonce === 'string' ? parseInt(rawTx.nonce, 16) : rawTx.nonce }),
          // Ensure 'from' is correctly typed as Address (string)
          ...(rawTx.from && { from: rawTx.from as Address }),
          // DO NOT explicitly set 'to' or 'data' here initially; handle below
        };

        // --- Explicitly handle 'data' (preferring 'input' from Foundry) ---
        if (rawTx.input !== undefined && rawTx.input !== null) {
          sanitizedTx.data = rawTx.input as `0x${string}`;
          console.log(`[${requestId}] Mapping rawTx.input to sanitizedTx.data`);
        } else if (rawTx.data !== undefined && rawTx.data !== null) {
          sanitizedTx.data = rawTx.data as `0x${string}`;
          console.log(`[${requestId}] Using rawTx.data for sanitizedTx.data`);
        }
        // --- Delete the original 'input' field if it exists ---
        delete sanitizedTx.input;
        // --- ---

        // --- Explicitly handle the 'to' field ---
        if (rawTx.to !== null && rawTx.to !== undefined) {
          // If 'to' exists in the raw transaction, add it as Address
          sanitizedTx.to = rawTx.to as Address;
          console.log(`[${requestId}] Setting 'to' address: ${sanitizedTx.to}`);
        } else {
          // If 'to' is null or undefined (contract creation), set to ZERO ADDRESS
          // as sendTransaction might require *some* address.
          console.log(`[${requestId}] 'to' address is null/undefined (contract creation).`);
          // Ensure 'to' is omitted from the object passed to window.ethereum.request
          delete sanitizedTx.to;
        }
        // --- ---

        // Remove potentially problematic fields if they are null/undefined after sanitization
        // (e.g., don't send both gasPrice and EIP-1559 fields)
        if (sanitizedTx.maxFeePerGas !== undefined || sanitizedTx.maxPriorityFeePerGas !== undefined) {
            delete sanitizedTx.gasPrice; // Remove legacy gasPrice if EIP-1559 fields exist
        } else if (sanitizedTx.gasPrice !== undefined) {
             delete sanitizedTx.maxFeePerGas;
             delete sanitizedTx.maxPriorityFeePerGas;
        }
        // Removed the redundant delete block for 'to' here

        console.log(`[${requestId}] Sanitized transaction object being sent:`, JSON.stringify(sanitizedTx, (_key, value) =>
            typeof value === 'bigint' ? value.toString() : value // Convert BigInts for logging
        , 2));

        // Always use viem's walletClient now
        console.log(`[${requestId}] Using walletClient.sendTransaction...`);
        result = await walletClient.sendTransaction(sanitizedTx);
        console.log(`Transaction sent via walletClient for ${requestId}, hash: ${result}`);

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

      // Remove the request from the UI *before* sending the response
      setPendingSignRequests((prev) => prev.filter((req) => req.requestId !== requestId));
      // Send success response back
      sendSignResponse(currentWs, requestId, { result });

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
  // Note: This is similar to sendRpcResponse but uses a different type
  const sendSignResponse = (socketInstance: WebSocket, requestId: string, response: { result?: any; error?: any }) => {
    if (socketInstance.readyState === WebSocket.OPEN) {
      const message = JSON.stringify({
        type: 'signResponse', // Use 'signResponse' type
        requestId: requestId,
        ...response,
      });
      console.log(`Sending Sign Response for ${requestId}:`, message);
      socketInstance.send(message);
    } else {
      console.error(`WebSocket not open (state: ${socketInstance.readyState}), cannot send sign response for ${requestId}`);
    }
  };


  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center p-4">
      <header className="w-full max-w-4xl flex justify-between items-center p-4 border-b border-gray-700">
        <h1 className="text-xl md:text-2xl font-bold">⚡️ Forge Dashboard</h1>
        <ConnectButton />
      </header>

      <main className="w-full max-w-4xl mt-8 p-4 bg-gray-800 rounded shadow-lg">
        <h2 className="text-xl mb-4">Dashboard Status</h2>
        <div className="mb-4">
          {/* Display status based on wsStatus state */}
          <p>WebSocket Status: {
             wsStatus === 'open' ? <span className="text-green-400">Connected</span> :
             wsStatus === 'connecting' ? <span className="text-yellow-400">Connecting...</span> :
             <span className="text-red-400">{wsStatus === 'error' ? 'Error' : 'Disconnected'}</span>
          }</p>
          <p>Wallet Status: {isConnected ? <span className="text-green-400">Connected</span> : <span className="text-red-400">Not Connected</span>}</p>
          {isConnected && (
            <>
              <p>Address: <span className="font-mono text-sm">{address}</span></p>
              <p>Chain ID: {chainId}</p>
            </>
          )}
        </div>

        {/* Section for Pending Signing Requests */}
        {pendingSignRequests.length > 0 && (
          <div className="mt-8 w-full">
            <h3 className="text-xl mb-4 text-yellow-400">Pending Actions</h3>
            {pendingSignRequests.map((request) => (
              <div key={request.requestId} className="mb-4 p-4 border border-yellow-600 rounded bg-gray-800 shadow-md">
                <h4 className="text-lg font-semibold mb-2">Request ID: <span className="font-mono text-sm">{request.requestId}</span></h4>
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
                    disabled={!walletClient || !isConnected}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Approve in Wallet
                  </button>
                  <button
                    onClick={() => handleRejectTransaction(request.requestId)}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded text-white font-semibold"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Section for Message Log */}
        <h3 className="text-lg mt-6 mb-2">Message Log</h3>
        <div className="h-64 overflow-y-auto bg-gray-700 p-2 rounded font-mono text-xs">
          {messages.length === 0 && <p>No messages received yet.</p>}
          {messages.slice().reverse().map((msg, index) => ( // Show newest first
            <pre key={messages.length - index -1} className="whitespace-pre-wrap break-all mb-1 p-1 bg-gray-600 rounded">{JSON.stringify(msg, null, 2)}</pre>
          ))}
        </div>
      </main>
    </div>
  )
}

export default App
