import { useAccount, usePublicClient, useWalletClient, useWatchBlockNumber } from 'wagmi';
import { useEffect, useState, useRef } from 'react';
import { Address, BlockTag, Hex, serializeSignature, toHex } from 'viem';

// Import types and components
import { SignRequest, TrackedTxInfo, RpcPayload } from '@/types';
import { getExplorerLink, copyToClipboard, generateTxLabel, sanitizeTransactionRequest } from '@/lib/utils'; // Import sanitizeTransactionRequest
import { Simple7702Account, UserOperationV8, MetaTransaction, CandidePaymaster, createUserOperationHash } from "abstractionkit"; // EIP-7702

import { DashboardStatus } from '@/components/DashboardStatus';
import { PendingActionsList } from '@/components/PendingActionsList';
import { TrackedTransactionsList } from '@/components/TrackedTransactionsList';
// import { Switch } from '@/components/ui/switch'; // No longer needed
// import { Label } from '@/components/ui/label';   // No longer needed
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"; // For new UI
import { generatePrivateKey, privateKeyToAccount, PrivateKeyAccount, sign } from 'viem/accounts'; // For EIP-7702 session key
import { Eip7702ModeDisplay } from '@/components/Eip7702ModeDisplay'; // New component
import { createWalletClient, http } from 'viem'; // Added for local EIP-7702 client

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
  const [activeMode, setActiveMode] = useState<'browser' | 'eip7702' | 'erc4337'>('browser'); // New mode state
  const [eip7702PrivateKey, setEip7702PrivateKey] = useState<Hex | null>(null); // State for session private key
  const [eip7702SessionAccount, setEip7702SessionAccount] = useState<PrivateKeyAccount | null>(null); // Derived session account
  // Config error state for EIP-7702 URLs (can still be useful)
  const [eip7702ConfigError, setEip7702ConfigError] = useState<string | null>(null);

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
        setEip7702SessionAccount(account);
        console.log("Derived EIP-7702 session account:", account.address);
      } catch (error) {
        console.error("Failed to derive account from private key:", error);
        setEip7702SessionAccount(null);
        // Optionally provide user feedback about invalid key in the Eip7702ModeDisplay component
      }
    } else {
      setEip7702SessionAccount(null);
    }
  }, [eip7702PrivateKey]); // Run when private key changes


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

    console.log(`Attempting to sign request ${requestId} for method ${payload.method}, Mode: ${activeMode}`);

    // Basic checks needed regardless of mode
    if (!currentWs || currentWs.readyState !== WebSocket.OPEN || !chainId || !publicClient) {
        const reason = !currentWs || currentWs.readyState !== WebSocket.OPEN ? 'WebSocket not open'
                     : !chainId ? 'Chain ID not available'
                     : 'Public client not available';
        console.error(`${reason}, cannot sign transaction for ${requestId}`);
        if (currentWs && currentWs.readyState === WebSocket.OPEN) {
            sendSignResponse(currentWs, requestId, { error: { code: -32000, message: reason } });
        }
        setPendingSignRequests((prev) => prev.filter((req) => req.requestId !== requestId));
        return;
    }

    // Mode-specific checks
    if (activeMode === 'browser') {
        // Browser mode requires connected browser wallet
        if (!walletClient || !address) {
            const reason = !walletClient ? 'Browser wallet client not available' : 'Browser wallet address not available';
            console.error(`${reason}, cannot sign transaction in Browser Wallet mode for ${requestId}`);
            sendSignResponse(currentWs, requestId, { error: { code: -32000, message: reason } });
            setPendingSignRequests((prev) => prev.filter((req) => req.requestId !== requestId));
            return;
        }
    } else if (activeMode === 'eip7702') {
        // EIP-7702 mode requires a session account and configured URLs (for Sepolia)
        if (!eip7702SessionAccount) {
            const reason = 'EIP-7702 session account not available. Generate or set a private key.';
            console.error(`${reason}, cannot sign transaction in EIP-7702 mode for ${requestId}`);
            sendSignResponse(currentWs, requestId, { error: { code: -32000, message: reason } });
            setPendingSignRequests((prev) => prev.filter((req) => req.requestId !== requestId));
            return;
        }
        if (chainId === 11155111 && !areCandideUrlsConfigured) {
            const configErrorMessage = "EIP-7702 Bundler/Paymaster URLs not configured in .env file. Please set VITE_CANDIDE_SEPOLIA_BUNDLER_URL and VITE_CANDIDE_SEPOLIA_PAYMASTER_URL.";
            console.error(`[${requestId}] ${configErrorMessage}`);
            setEip7702ConfigError(configErrorMessage); // Show error in UI
            sendSignResponse(currentWs, requestId, { error: { code: -32000, message: "EIP-7702 provider URLs not configured." } });
            setPendingSignRequests((prev) => prev.filter((req) => req.requestId !== requestId));
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

      if (activeMode === 'eip7702' && chainId === 11155111 && eip7702SessionAccount) { // Check mode and session account
        // --- EIP-7702 Flow (using Session Private Key) ---
        console.log(`[${requestId}] Starting EIP-7702 flow using session account ${eip7702SessionAccount.address}...`);

        // Create a local WalletClient for the session account
        const localWalletClient = createWalletClient({
            account: eip7702SessionAccount,
            chain: publicClient.chain, // Use the chain object from the public client
            transport: http(rpcUrlForSessionClient)
        });
        console.debug(`[${requestId}] Created local WalletClient for session account.`);


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
        // Instantiate Simple7702Account using the SESSION account address
        const smartAccount = new Simple7702Account(
            eip7702SessionAccount.address, // Use session account address
            { entrypointAddress: CANDIDE_ENTRY_POINT_ADDRESS }
        );

        // Prepare MetaTransaction (MD step 4.2.5)
        const metaTx: MetaTransaction = {
            to: sanitizedTx.to as Address, // We've ensured 'to' exists
            value: sanitizedTx.value || 0n,
            data: sanitizedTx.data || "0x",
        };
        console.debug({ metaTx }, "Prepared MetaTransaction for EIP-7702");

        // Prepare & Sign EIP-7702 Authorization using the LOCAL wallet client
        // Nonce is for the SESSION account
        const sessionAccountNonceForAuth = await publicClient.getTransactionCount({ address: eip7702SessionAccount.address, blockTag: 'pending' });
        const designatedContractAddress = SIMPLE7702_DEFAULT_DELEGATEE_ADDRESS;

        console.debug(`Signing EIP-7702 Auth: SessionAccount=${eip7702SessionAccount.address}, DesignatedContract=${designatedContractAddress}, SessionAccountAuthNonce=${sessionAccountNonceForAuth}`);
        const eip7702FullSignature = await localWalletClient.signAuthorization({
            account: eip7702SessionAccount, // Sign with the session account
            contractAddress: designatedContractAddress,
            nonce: sessionAccountNonceForAuth,
            chainId: chainId,
            // authority & executor: Using viem defaults.
        });

        console.debug({eip7702FullSignature}); //log the full signature

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
            { eip7702Auth: {
              chainId: BigInt(chainId)
            } }
        ) as UserOperationV8;
        console.debug({ userOp: userOperation }, "UserOperation created by abstractionkit");
        delete eip7702FullSignature.v;
        userOperation.eip7702Auth = {...eip7702FullSignature, chainId: toHex(chainId), nonce: toHex(sessionAccountNonceForAuth), yParity: eip7702FullSignature.yParity ? toHex(eip7702FullSignature.yParity) : "0x0"};

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
        const userOpSignature = serializeSignature(await sign({hash: userOpHash as Hex, privateKey: eip7702PrivateKey || "0x0"}));
        userOperation.signature = userOpSignature;
        
        console.debug(`UserOperation signature obtained: ${userOpSignature}`);

        // Send UserOperation (using abstractionkit) (MD step 4.2.10)
        console.debug("Sending UserOperation to bundler...");
        const sendUserOpResponse = await smartAccount.sendUserOperation(userOperation, ACTUAL_BUNDLER_URL); // Use configured Bundler URL
        console.info(`UserOperation sent. UserOpHash from sendUserOpResponse: ${sendUserOpResponse.userOperationHash}`);
        result = sendUserOpResponse.userOperationHash; // Store UserOpHash as the initial result

        // Asynchronously wait for UserOperation inclusion and update tracking
        sendUserOpResponse.included()
            .then(receiptResult => {
                console.info(`UserOperation included. TxHash: ${receiptResult.receipt?.transactionHash}, Success: ${receiptResult.success}`);
                setTrackedTxs(prevMap => {
                    const userOpHashToUpdate = sendUserOpResponse.userOperationHash as Hex;
                    const existingTx = prevMap.get(userOpHashToUpdate);
                    if (existingTx) {
                        const updatedTxInfo: TrackedTxInfo = {
                            ...existingTx,
                            status: receiptResult.success ? 'success' : 'reverted',
                            blockNumber: receiptResult.receipt?.blockNumber,
                            actualTxHash: receiptResult.receipt?.transactionHash as Hex | undefined,
                            // contractAddress might need parsing from logs if it's a deployment via UserOp
                        };
                        return new Map(prevMap).set(userOpHashToUpdate, updatedTxInfo);
                    }
                    return prevMap;
                });
            })
            .catch(inclusionError => {
                console.error({ err: inclusionError, userOpHash: sendUserOpResponse.userOperationHash }, "Error waiting for UserOperation inclusion");
                setTrackedTxs(prevMap => {
                    const userOpHashToUpdate = sendUserOpResponse.userOperationHash as Hex;
                    const existingTx = prevMap.get(userOpHashToUpdate);
                    if (existingTx) {
                        // Mark as reverted on inclusion error, or keep as pending if a more specific error handling is desired
                        return new Map(prevMap).set(userOpHashToUpdate, { ...existingTx, status: 'reverted' });
                    }
                    return prevMap;
                });
            });
        // The initial tracking entry (with 'pending' status) is handled by the common success logic below.

      } else {
        // --- Standard Flow (Non-EIP-7702 or conditions not met) ---
        if (payload.method === 'eth_sendTransaction' && payload.params?.[0]) {
            const rawTx = payload.params[0] as any;
            const sanitizedTx = sanitizeTransactionRequest(rawTx, requestId);

            console.log(`[${requestId}] Sanitized transaction object for standard flow:`, JSON.stringify(sanitizedTx, (_key, value) =>
                typeof value === 'bigint' ? value.toString() : value
            , 2));

            console.log(`[${requestId}] Calling walletClient.sendTransaction...`);
            result = await walletClient?.sendTransaction(sanitizedTx);
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
      const currentChainId = chainId; // Already checked for existence
      const decodedInfo = request.payload.decoded;

      if (txHashOrUserOpHash && currentChainId) {
          // Determine label based on active mode
          const txLabel = activeMode === 'eip7702' && chainId === 11155111
              ? `EIP-7702 Session: ${generateTxLabel(decodedInfo)} (UserOp)`
              : `Browser Wallet: ${generateTxLabel(decodedInfo)}`; // Default/Browser mode label

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


  // Determine RPC URL for potential local client use
  let rpcUrlForLocalClient = CANDIDE_SEPOLIA_RPC_URL; // Default/fallback for Sepolia
  if (publicClient && publicClient.transport && typeof publicClient.transport.config?.url === 'string') {
      const clientRpcUrl = publicClient.transport.config.url;
      if (clientRpcUrl.startsWith('http://') || clientRpcUrl.startsWith('https://')) {
          rpcUrlForLocalClient = clientRpcUrl;
      }
  }


  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center p-4">
      {/* Replace Header with Tabs */}
      <header className="w-full max-w-4xl flex justify-between items-center p-4 border-b border-gray-700">
          <h1 className="text-xl md:text-2xl font-bold">⚡️ Foundry Dashboard</h1>
          {/* ConnectButton can stay if desired, or be moved */}
      </header>

      <main className="w-full max-w-4xl mt-8 p-4 bg-gray-800 rounded shadow-lg">

        <Tabs value={activeMode} onValueChange={(value) => setActiveMode(value as any)} className="w-full">
            <TabsList className="grid w-full grid-cols-3 mb-6">
                <TabsTrigger value="browser">Browser Wallet</TabsTrigger>
                <TabsTrigger value="eip7702" disabled={!isConnected || chainId !== 11155111}>
                    EIP-7702 Session
                    {(!isConnected || chainId !== 11155111) && <span className="text-xs text-yellow-500 ml-1">(Sepolia Only)</span>}
                </TabsTrigger>
                <TabsTrigger value="erc4337" disabled>ERC-4337 (Soon)</TabsTrigger>
            </TabsList>

            {/* Content for Browser Wallet Mode (Default) */}
            <TabsContent value="browser">
                 <p className="text-sm text-gray-400 mb-4">Standard mode: Transactions are signed and sent directly by your connected browser wallet.</p>
                 {/* Status, Pending Actions, Tracked Txs will be shown below the tabs */}
            </TabsContent>

            {/* Content for EIP-7702 Mode */}
            <TabsContent value="eip7702">
                 <Eip7702ModeDisplay
                    privateKey={eip7702PrivateKey}
                    sessionAccount={eip7702SessionAccount}
                    setPrivateKey={setEip7702PrivateKey}
                    rpcUrl={rpcUrlForLocalClient}
                    chainId={chainId}
                 />
                 {/* Status, Pending Actions, Tracked Txs will be shown below the tabs */}
            </TabsContent>

             {/* Content for ERC-4337 Mode */}
            <TabsContent value="erc4337">
                <p className="text-center text-gray-500 italic mt-8">Full ERC-4337 Smart Account support coming soon...</p>
            </TabsContent>

        </Tabs>

        {/* Common Sections - Shown regardless of tab */}
        <h2 className="text-xl mb-4 mt-8 border-t border-gray-700 pt-6">Dashboard Status</h2>
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
