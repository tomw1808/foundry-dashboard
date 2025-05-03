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
    console.log(`Handling RPC Request ${requestId}:`, payload);

    // Ensure wallet is connected AND publicClient is available
    if (!isConnected || !address || !chainId || !publicClient) {
      const errorMsg = !publicClient ? 'RPC client unavailable' : 'Wallet not connected';
      console.error(`${errorMsg}, cannot handle RPC request ${requestId} (${payload.method})`);
      sendRpcResponse(requestId, { error: { code: -32000, message: errorMsg } });
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

            console.log(`Fetching nonce for ${targetAddress} at block ${blockTag || 'pending'}`);
            const nonce = await publicClient.getTransactionCount({
              address: targetAddress,
              blockTag: blockTag || 'pending', // Default to 'pending' as scripts often need the next nonce
            });
            result = `0x${nonce.toString(16)}`;
            console.log(`Nonce for ${targetAddress}: ${result}`);
          } catch (err: any) {
            console.error(`Error getting transaction count for request ${requestId}:`, err);
            error = { code: err.code || -32603, message: `Failed to get transaction count: ${err.message}` };
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

      if (error) {
        sendRpcResponse(requestId, { error });
      } else {
        sendRpcResponse(requestId, { result });
      }

    } catch (err: any) {
      console.error(`Error processing RPC request ${requestId} (${payload.method}):`, err);
      sendRpcResponse(requestId, { error: { code: -32603, message: err.message || 'Internal JSON-RPC error' } });
    }
  };

  // --- Send Response back via WebSocket ---
  const sendRpcResponse = (requestId: string, response: { result?: any; error?: any }) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      const message = JSON.stringify({
        type: 'rpcResponse',
        requestId: requestId,
        ...response,
      });
      console.log(`Sending RPC Response for ${requestId}:`, message);
      ws.send(message);
    } else {
      console.error('WebSocket not connected, cannot send RPC response for', requestId);
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
          <p>WebSocket Status: {ws?.readyState === WebSocket.OPEN ? <span className="text-green-400">Connected</span> : <span className="text-red-400">Disconnected</span>}</p>
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
