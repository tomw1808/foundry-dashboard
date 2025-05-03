const express = require('express');
const http = require('http');
const path = require('path');
const WebSocket = require('ws');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server }); // Attach WebSocket server to the HTTP server

// Store pending RPC requests: Map<requestId, { res: Response, originalId: number|string }>
const pendingRequests = new Map();

const PORT = process.env.PORT || 3001; // Default port

// --- Middleware ---
app.use(cors()); // Enable CORS for all origins (adjust for production later if needed)
app.use(express.json()); // Parse JSON request bodies

// --- WebSocket Handling ---
wss.on('connection', (ws) => {
  console.log('Client connected via WebSocket');

  ws.on('message', (rawMessage) => {
    console.log('Received message from client:', rawMessage.toString());
    try {
      const message = JSON.parse(rawMessage.toString());

      // Check if it's a response to a pending RPC request
      if (message.type === 'rpcResponse' && message.requestId) {
        const pending = pendingRequests.get(message.requestId);

        if (pending) {
          console.log(`Received response for pending request: ${message.requestId}`);
          // Construct the JSON-RPC response
          const jsonRpcResponse = {
            jsonrpc: '2.0',
            id: pending.originalId,
            ...(message.result !== undefined && { result: message.result }),
            ...(message.error !== undefined && { error: message.error }),
          };

          // Send the response back to the original caller (forge script)
          pending.res.json(jsonRpcResponse);

          // Remove the request from the pending map
          pendingRequests.delete(message.requestId);
          console.log(`Completed and removed request: ${message.requestId}. Pending: ${pendingRequests.size}`);

        } else {
          console.warn(`Received response for unknown or already completed request ID: ${message.requestId}`);
        }
      } else {
         // Handle other message types if needed
         console.log('Received non-rpcResponse message or message without requestId:', message);
         // Example echo for other messages
         ws.send(JSON.stringify({ type: 'echo', payload: message }));
      }

    } catch (e) {
      console.error('Failed to parse message or handle rpcResponse:', e);
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON received or processing error' }));
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });

  // Send a welcome message
  ws.send(JSON.stringify({ type: 'welcome', message: 'Connected to Forge Dashboard WebSocket' }));
});

// Function to broadcast messages to all connected WebSocket clients
function broadcast(message) {
  const data = JSON.stringify(message);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

// Example: Broadcast a message every 10 seconds
// setInterval(() => {
//   broadcast({ type: 'ping', timestamp: Date.now() });
// }, 10000);


// --- API Routes ---
app.post('/api/rpc', (req, res) => {
  const { method, params, id: originalId } = req.body; // Rename id to originalId for clarity
  console.log(`Received RPC call: ${method}, ID: ${originalId}`, params);

  // List of methods that require signing and should NOT be forwarded directly (yet)
  const signingMethods = [
    'eth_sendTransaction',
    'eth_signTransaction',
    'eth_sign',
    'personal_sign',
    'eth_signTypedData', // Covers V1, V3, V4
    'eth_signTypedData_v1',
    'eth_signTypedData_v3',
    'eth_signTypedData_v4',
  ];

  if (signingMethods.includes(method)) {
    console.log(`Intercepted signing method: ${method}. Handling not implemented yet.`);
    // TODO: Implement signing flow (store request, broadcast 'signRequest', wait for 'signResponse')
    res.status(501).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: `Signing method '${method}' handling not implemented yet` },
      id: originalId
    });
    return; // Stop processing here for signing methods
  }

  // For all other methods, forward to the frontend via WebSocket

  // 1. Generate a unique request ID for tracking the response
  const requestId = `req-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  console.log(`   Forwarding request ${requestId} for method ${method} (Original ID: ${originalId}) to frontend.`);

  // 2. Store the original response object (`res`) to reply later
  pendingRequests.set(requestId, { res, originalId });
  console.log(`   Request ${requestId} stored. Pending requests: ${pendingRequests.size}`);

  // 3. Broadcast the request details to the frontend via WebSocket
  broadcast({
    type: 'rpcRequest',
    requestId: requestId, // The ID the frontend should use to respond
    payload: { method, params, id: originalId } // Send original RPC details
  });

  // 4. IMPORTANT: Do not respond to the HTTP request yet!
  //    The response will be sent when the frontend replies via WebSocket.

  // Optional: Add a timeout to prevent requests from hanging indefinitely
  const TIMEOUT_MS = 60000; // 60 seconds
  setTimeout(() => {
    if (pendingRequests.has(requestId)) {
      console.error(`Request ${requestId} (Method: ${method}, Original ID: ${originalId}) timed out.`);
      const pending = pendingRequests.get(requestId);
      pending.res.status(504).json({ // Gateway Timeout
        jsonrpc: '2.0',
        error: { code: -32000, message: `Request timed out waiting for response from frontend wallet for method '${method}'` },
        id: pending.originalId
      });
      pendingRequests.delete(requestId);
      console.log(`Removed timed out request: ${requestId}. Pending: ${pendingRequests.size}`);
    }
  }, TIMEOUT_MS);

});

// --- Static file serving ---
// Serve static files from the React app's build directory
const clientBuildPath = path.join(__dirname, '../client/dist');
app.use(express.static(clientBuildPath));

// The "catchall" handler: for any request that doesn't match one above,
// send back React's index.html file. This is needed for client-side routing.
app.get('*', (req, res) => {
  res.sendFile(path.resolve(clientBuildPath, 'index.html'));
});


// --- Server startup logic ---
function startServer(portToUse = PORT) {
  return new Promise((resolve, reject) => {
    server.listen(portToUse, () => { // Use server.listen (which includes WebSocket server)
      const actualPort = server.address().port;
      console.log(`Forge Dashboard server listening on http://localhost:${actualPort}`);
      console.log(`WebSocket server listening on ws://localhost:${actualPort}`);
      resolve(actualPort); // Resolve with the actual port being used
    }).on('error', (err) => {
      console.error(`Failed to start server on port ${portToUse}:`, err.message);
      reject(err);
    });
  });
}

module.exports = { startServer, app, server, wss, broadcast }; // Export for bin script and potentially testing

// --- Allow running server directly ---
if (require.main === module) {
  startServer().catch(err => {
    console.error("Server failed to start:", err);
    process.exit(1);
  });
}
