const express = require('express');
const http = require('http');
const path = require('path');
const WebSocket = require('ws');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server }); // Attach WebSocket server to the HTTP server

const PORT = process.env.PORT || 3001; // Default port

// --- Middleware ---
app.use(cors()); // Enable CORS for all origins (adjust for production later if needed)
app.use(express.json()); // Parse JSON request bodies

// --- WebSocket Handling ---
wss.on('connection', (ws) => {
  console.log('Client connected via WebSocket');

  ws.on('message', (message) => {
    console.log('Received message from client:', message);
    // Handle incoming messages from frontend (e.g., signed tx results)
    // For now, just echo back
    try {
      const parsedMessage = JSON.parse(message);
      ws.send(JSON.stringify({ type: 'echo', payload: parsedMessage }));
    } catch (e) {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON received' }));
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
  const { method, params, id } = req.body;
  console.log(`Received RPC call: ${method}`, params);

  // TODO: Implement RPC method handling
  // - Forward calls to a real node (Anvil/Infura/etc.)
  // - Intercept eth_sendTransaction, eth_signTransaction
  // - Handle eth_accounts, eth_chainId locally

  if (method === 'eth_chainId') {
    // Example: Return a placeholder chain ID
    // In reality, this should come from the connected wallet via frontend
    res.json({ jsonrpc: '2.0', result: '0x1', id }); // 0x1 is Ethereum Mainnet
  } else if (method === 'eth_accounts') {
     // Example: Return empty array, frontend will provide via wallet
     res.json({ jsonrpc: '2.0', result: [], id });
  } else if (method === 'eth_sendTransaction') {
    console.log('Intercepted eth_sendTransaction');
    // 1. Generate a unique request ID for this transaction
    const txRequestId = `tx-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    // 2. Store the request details and the 'res' object to respond later
    //    (Need a proper request manager for this)
    console.log(`   Request ID: ${txRequestId}`);
    // 3. Broadcast the transaction details to the frontend via WebSocket
    broadcast({
      type: 'signRequest',
      requestId: txRequestId,
      payload: { method, params, id } // Send original RPC details
    });
    // 4. IMPORTANT: Don't respond to the HTTP request yet!
    //    We need to wait for the frontend to send back the signed tx via WebSocket/another API call.
    //    This part needs a robust mechanism to correlate responses.
    //    For now, we'll just send a placeholder error back immediately.
     res.status(501).json({ jsonrpc: '2.0', error: { code: -32000, message: 'eth_sendTransaction handling not fully implemented yet' }, id });

  } else {
    // For other methods, potentially forward to a real node
    // Placeholder for now: Method not found
    res.status(400).json({ jsonrpc: '2.0', error: { code: -32601, message: 'Method not found' }, id });
  }
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
