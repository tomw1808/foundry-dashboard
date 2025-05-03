import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, usePublicClient } from 'wagmi'; // Import usePublicClient
import { useEffect, useState } from 'react';
import { Address } from 'viem'; // Import Address type

function App() {
  const { address, chainId, isConnected } = useAccount();
  const publicClient = usePublicClient(); // Get the public client instance from Wagmi
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [messages, setMessages] = useState<any[]>([]); // Store incoming messages

  // --- WebSocket Connection ---
  useEffect(() => {
    // Use the proxy path defined in vite.config.ts
    // Ensure the protocol is ws:// or wss://
    const wsUrl = `ws://${window.location.host}/socket`; // Use '/socket' or your chosen proxy path
    console.log('Attempting to connect WebSocket to:', wsUrl);
    const socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      console.log('WebSocket Connected');
      setWs(socket);
      socket.send(JSON.stringify({ type: 'clientHello', message: 'Frontend connected' }));
    };

    socket.onmessage = (event) => {
      console.log('WebSocket Message Received:', event.data);
      try {
        const message = JSON.parse(event.data);
        setMessages((prev) => [...prev, message]); // Add message to state

        // Handle incoming RPC requests from backend
        if (message.type === 'rpcRequest') {
          handleRpcRequest(message.requestId, message.payload);
        }

      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };

    socket.onerror = (error) => {
      console.error('WebSocket Error:', error);
    };

    socket.onclose = () => {
      console.log('WebSocket Disconnected');
      setWs(null);
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
      console.error(`WebSocket not open (state: ${socketInstance.readyState}), cannot send RPC response for ${requestId}`);
    }
  };


  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center p-4">
      <header className="w-full max-w-4xl flex justify-between items-center p-4 border-b border-gray-700">
        <h1 className="text-2xl font-bold">⚡️ Forge Dashboard</h1>
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

        <h3 className="text-lg mt-6 mb-2">Incoming Messages / Requests</h3>
        <div className="h-64 overflow-y-auto bg-gray-700 p-2 rounded font-mono text-xs">
          {messages.length === 0 && <p>No messages received yet.</p>}
          {messages.map((msg, index) => (
            <pre key={index} className="whitespace-pre-wrap break-all mb-1 p-1 bg-gray-600 rounded">{JSON.stringify(msg, null, 2)}</pre>
          ))}
        </div>
      </main>
    </div>
  )
}

export default App
