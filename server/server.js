import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import path from 'path';
import WebSocket, { WebSocketServer } from 'ws'; // Import WebSocketServer type
import cors from 'cors';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server }); // Use WebSocketServer type

// Define a type for the pending request data
interface PendingRequest {
    res: Response;
    originalId: number | string;
    method: string;
    timeoutId?: NodeJS.Timeout; // Optional timeout ID
}

// Store pending RPC requests: Map<requestId, PendingRequest>
const pendingRequests = new Map<string, PendingRequest>();

const PORT: number = parseInt(process.env.PORT || '3001', 10); // Ensure PORT is number

// --- Middleware ---
app.use(cors()); // Enable CORS for all origins (adjust for production later if needed)
app.use(express.json()); // Parse JSON request bodies

// --- WebSocket Handling ---
wss.on('connection', (ws: WebSocket) => { // Add type for ws
    console.log('Client connected via WebSocket');

    ws.on('message', (rawMessage: Buffer | ArrayBuffer | Buffer[]) => { // Add type for rawMessage
        const messageString = rawMessage.toString();
        console.log('Received message from client:', messageString);
        try {
            const message: any = JSON.parse(messageString); // Keep 'any' for flexibility or define stricter types

            // Check if it's a response to a pending request (RPC or Signing)
            if ((message.type === 'rpcResponse' || message.type === 'signResponse') && message.requestId) {
                const pending = pendingRequests.get(message.requestId);

                if (pending) {
                    console.log(`Received ${message.type} for pending request: ${message.requestId} (Method: ${pending.method})`);

                    // --- Clear the timeout ---
                    if (pending.timeoutId) {
                        clearTimeout(pending.timeoutId);
                        console.log(`Cleared timeout for request ${message.requestId}`);
                    }
                    // --- ---

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
                console.log('Received non-rpcResponse/non-signResponse message or message without requestId:', message);
                // Example echo for other messages
                ws.send(JSON.stringify({ type: 'echo', payload: message }));
            }

        } catch (e) {
            console.error('Failed to parse message or handle response:', e);
            ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON received or processing error' }));
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected');
        // Optional: Clean up any pending requests associated with this specific client if needed
    });

    ws.on('error', (error: Error) => { // Add type for error
        console.error('WebSocket error:', error);
    });

    // Send a welcome message
    ws.send(JSON.stringify({ type: 'welcome', message: 'Connected to Forge Dashboard WebSocket' }));
});

// Function to broadcast messages to all connected WebSocket clients
function broadcast(message: any): void { // Add type for message and return type
    const data = JSON.stringify(message);
    wss.clients.forEach((client: WebSocket) => { // Add type for client
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
// Define a type for the expected request body
interface RpcRequestBody {
    method: string;
    params: any[];
    id: number | string;
}

app.post('/api/rpc', (req: Request<any, any, RpcRequestBody>, res: Response) => { // Add types for req, res
    const { method, params, id: originalId } = req.body;
    console.log(`Received RPC call: ${method}, ID: ${originalId}`, params);

    // List of methods that require signing
    const signingMethods: string[] = [
        'eth_sendTransaction',
        'eth_signTransaction',
        'eth_sign',
        'personal_sign',
        'eth_signTypedData', // Covers V1, V3, V4
        'eth_signTypedData_v1',
        'eth_signTypedData_v3',
        'eth_signTypedData_v4',
    ];

    // Determine if it's a signing method or a regular RPC call
    const isSigningMethod = signingMethods.includes(method);
    const requestType = isSigningMethod ? 'signRequest' : 'rpcRequest';
    const responseType = isSigningMethod ? 'signResponse' : 'rpcResponse'; // Expected response type

    // 1. Generate a unique request ID for tracking the response
    const requestId = `req-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    console.log(`   ${isSigningMethod ? 'Intercepted' : 'Forwarding'} request ${requestId} for method ${method} (Original ID: ${originalId}) to frontend.`);

    // 2. Store the original response object (`res`), original ID, and method
    const pendingData: PendingRequest = { res, originalId, method };
    pendingRequests.set(requestId, pendingData);
    console.log(`   Request ${requestId} stored. Pending requests: ${pendingRequests.size}`);

    // 3. Broadcast the request details to the frontend via WebSocket
    broadcast({
        type: requestType, // Use 'signRequest' or 'rpcRequest'
        requestId: requestId, // The ID the frontend should use to respond
        payload: { method, params, id: originalId } // Send original RPC details
    });

    // 4. IMPORTANT: Do not respond to the HTTP request yet!
    //    The response will be sent when the frontend replies via WebSocket.

    // Optional: Add a timeout to prevent requests from hanging indefinitely
    // Increase timeout for signing methods as user interaction takes time
    const TIMEOUT_MS = isSigningMethod ? 5 * 60 * 1000 : 60 * 1000; // 5 minutes for signing, 1 minute for RPC
    const timeoutId = setTimeout(() => {
        const timedOutRequest = pendingRequests.get(requestId); // Get details before potentially deleting
        if (timedOutRequest) {
            console.error(`Request ${requestId} (Method: ${timedOutRequest.method}, Original ID: ${timedOutRequest.originalId}) timed out after ${TIMEOUT_MS / 1000}s.`);
            // Send appropriate error back to forge script
            // Check if response hasn't already been sent
            if (!timedOutRequest.res.headersSent) {
                 timedOutRequest.res.status(504).json({ // Gateway Timeout
                    jsonrpc: '2.0',
                    error: { code: -32000, message: `Request timed out waiting for ${responseType} from frontend wallet for method '${timedOutRequest.method}'` },
                    id: timedOutRequest.originalId
                });
            } else {
                 console.warn(`Request ${requestId} timed out, but headers already sent.`);
            }
            pendingRequests.delete(requestId); // Remove from map
            console.log(`Removed timed out request: ${requestId}. Pending: ${pendingRequests.size}`);
        }
    }, TIMEOUT_MS);

    // Store the timeoutId with the pending request so we can clear it if response arrives
    pendingData.timeoutId = timeoutId;

});


// --- Static file serving ---
// Serve static files from the React app's build directory
// Use path.resolve for potentially more robust path construction
const clientBuildPath = path.resolve(__dirname, '../../client/dist'); // Adjust relative path from dist/server/server.js
console.log(`Serving static files from: ${clientBuildPath}`); // Log path for debugging
app.use(express.static(clientBuildPath));

// The "catchall" handler: for any request that doesn't match one above,
// send back React's index.html file. This is needed for client-side routing.
app.get('*', (req: Request, res: Response) => { // Add types
    const indexPath = path.resolve(clientBuildPath, 'index.html');
    res.sendFile(indexPath, (err) => {
        if (err) {
            console.error("Error sending index.html:", err);
            // Avoid sending error response if headers already sent (e.g., by static middleware)
            if (!res.headersSent) {
                 res.status(500).send("Error serving application.");
            }
        }
    });
});


// --- Server startup logic ---
export function startServer(portToUse: number = PORT): Promise<number> { // Add types
    return new Promise((resolve, reject) => {
        server.listen(portToUse, () => { // Use server.listen (which includes WebSocket server)
            const address = server.address();
            let actualPort: number;
            if (typeof address === 'string' || address === null) {
                // This case might happen with IPC pipes, handle appropriately or throw error
                console.error("Server listening on pipe/path, not port:", address);
                actualPort = portToUse; // Fallback or handle error
            } else {
                actualPort = address.port;
            }
            console.log(`Forge Dashboard server listening on http://localhost:${actualPort}`);
            console.log(`WebSocket server listening on ws://localhost:${actualPort}`);
            resolve(actualPort); // Resolve with the actual port being used
        }).on('error', (err: NodeJS.ErrnoException) => { // Add type for err
            console.error(`Failed to start server on port ${portToUse}:`, err.message);
            reject(err);
        });
    });
}

// Export other components if needed for testing or extension
export { app, server, wss, broadcast };

// --- Allow running server directly ---
// Check if this module is the main module being run
if (require.main === module) {
    startServer().catch(err => {
        console.error("Server failed to start:", err);
        process.exit(1);
    });
}
