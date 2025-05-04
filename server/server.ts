import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs/promises'; // Use promises version of fs
import WebSocket, { WebSocketServer } from 'ws';
import cors from 'cors';
import {
    Abi,
    Hex,
    decodeAbiParameters,
    decodeFunctionData,
    parseAbiItem, // Helper for constructor decoding if needed
} from 'viem'; // Import viem functions

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server }); // Use WebSocketServer type

// Define a type for the pending request data
interface PendingRequest {
    res: Response;
    originalId: number | string;
    method: string;
    timeoutId?: NodeJS.Timeout;
}

// Define type for loaded artifact data
interface LoadedArtifact {
    name: string;
    path: string; // Original path for reference
    abi: Abi;
    bytecode: Hex | undefined; // Creation bytecode (bytecode.object)
}

// Store loaded artifacts
let loadedArtifacts: LoadedArtifact[] = [];

// Store pending RPC requests: Map<requestId, PendingRequest>
const pendingRequests = new Map<string, PendingRequest>();

// --- Configuration ---
// TODO: Make project path configurable via CLI args
const projectPath = process.cwd(); // Default to current working directory
const artifactsOutDir = path.join(projectPath, 'out'); // Default artifacts dir

const PORT: number = parseInt(process.env.PORT || '3001', 10);

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

// --- Artifact Loading ---
async function loadArtifacts(dir: string): Promise<LoadedArtifact[]> {
    console.log(`Loading artifacts from: ${dir}`);
    const artifacts: LoadedArtifact[] = [];
    try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                // Recursively search subdirectories (like Contract.sol/)
                artifacts.push(...await loadArtifacts(fullPath));
            } else if (entry.isFile() && entry.name.endsWith('.json')) {
                // Found a JSON file, attempt to parse as artifact
                try {
                    const content = await fs.readFile(fullPath, 'utf-8');
                    const json = JSON.parse(content);
                    // Basic validation: Check for abi and bytecode.object
                    if (json.abi && Array.isArray(json.abi) && json.bytecode?.object) {
                        const contractName = path.basename(entry.name, '.json'); // Extract name
                        artifacts.push({
                            name: contractName,
                            path: fullPath,
                            abi: json.abi as Abi,
                            bytecode: json.bytecode.object as Hex,
                        });
                        console.log(`  Loaded artifact: ${contractName}`);
                    }
                } catch (parseError) {
                    console.warn(`  Skipping non-artifact JSON or parse error: ${fullPath}`, parseError);
                }
            }
        }
    } catch (err: any) {
        if (err.code === 'ENOENT') {
            console.warn(`Artifact directory not found: ${dir}. Decoding will be unavailable.`);
        } else {
            console.error(`Error reading artifact directory ${dir}:`, err);
        }
    }
    return artifacts;
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
    const responseType = isSigningMethod ? 'signResponse' : 'rpcResponse';

    // --- Attempt to Decode Transaction Data if Signing ---
    let decodedInfo: any = null; // Holds decoding result
    if (isSigningMethod && method === 'eth_sendTransaction' && params?.[0]) {
        const tx = params[0] as any; // Transaction object
        const txData = tx.data || tx.input; // Get data/input field

        if (txData && txData !== '0x') {
            try {
                if (!tx.to) { // Contract Deployment
                    console.log(`[${originalId}] Attempting deployment decode for data: ${txData.substring(0, 40)}...`);
                    const matchedArtifact = loadedArtifacts.find(
                        artifact => artifact.bytecode && txData.startsWith(artifact.bytecode)
                    );

                    if (matchedArtifact) {
                        console.log(`[${originalId}] Matched deployment bytecode for: ${matchedArtifact.name}`);
                        const constructorAbi = matchedArtifact.abi.find(item => item.type === 'constructor');
                        let constructorArgs: any[] = [];

                        if (constructorAbi?.inputs && constructorAbi.inputs.length > 0) {
                            const bytecodeLength = matchedArtifact.bytecode?.length ?? 0;
                            const argsData = `0x${txData.slice(bytecodeLength)}` as Hex;
                            if (argsData.length > 2) { // Check if there's actual arg data
                                try {
                                     constructorArgs = decodeAbiParameters(constructorAbi.inputs, argsData);
                                     console.log(`[${originalId}] Decoded constructor args:`, constructorArgs);
                                } catch (decodeErr) {
                                     console.warn(`[${originalId}] Failed to decode constructor args for ${matchedArtifact.name}:`, decodeErr);
                                     constructorArgs = ['<decoding failed>'];
                                }
                            } else {
                                 console.log(`[${originalId}] No constructor args data found.`);
                            }
                        } else {
                             console.log(`[${originalId}] No constructor found or no inputs defined for ${matchedArtifact.name}.`);
                        }
                        decodedInfo = {
                            type: 'deployment',
                            contractName: matchedArtifact.name,
                            constructorArgs: constructorArgs,
                        };
                    } else {
                        console.log(`[${originalId}] No matching bytecode found for deployment.`);
                    }
                } else { // Function Call
                    console.log(`[${originalId}] Attempting function call decode for data: ${txData.substring(0, 10)}...`);
                    let foundMatch = false;
                    for (const artifact of loadedArtifacts) {
                        try {
                            const decoded = decodeFunctionData({ abi: artifact.abi, data: txData });
                            console.log(`[${originalId}] Matched function call: ${artifact.name}.${decoded.functionName}`);
                            decodedInfo = {
                                type: 'functionCall',
                                contractName: artifact.name,
                                functionName: decoded.functionName,
                                args: decoded.args ?? [], // Ensure args is an array
                            };
                            foundMatch = true;
                            break; // Stop on first match
                        } catch (e) {
                            // Ignore errors (usually "Function not found" or ABI mismatch)
                        }
                    }
                    if (!foundMatch) {
                         console.log(`[${originalId}] No matching function signature found in loaded ABIs.`);
                    }
                }
            } catch (err) {
                console.error(`[${originalId}] Error during transaction decoding:`, err);
            }
        }
    }
    // --- End Decoding ---


    // 1. Generate a unique request ID for tracking the response
    const requestId = `req-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    console.log(`   ${isSigningMethod ? 'Intercepted' : 'Forwarding'} request ${requestId} for method ${method} (Original ID: ${originalId}) to frontend.`);

    // 2. Store the original response object (`res`), original ID, and method
    const pendingData: PendingRequest = { res, originalId, method };
    pendingRequests.set(requestId, pendingData);
    console.log(`   Request ${requestId} stored. Pending requests: ${pendingRequests.size}`);

    // 3. Broadcast the request details to the frontend via WebSocket
    broadcast({
        type: requestType,
        requestId: requestId,
        payload: {
            method,
            params,
            id: originalId,
            decoded: decodedInfo // Include decoding result
        }
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
    // Load artifacts before starting the server
    loadArtifacts(artifactsOutDir)
        .then(artifacts => {
            loadedArtifacts = artifacts;
            console.log(`Successfully loaded ${loadedArtifacts.length} artifacts.`);
            return startServer(); // Start server after loading
        })
        .catch(err => {
            console.error("Server failed to start due to artifact loading or server error:", err);
            process.exit(1);
        });
}
