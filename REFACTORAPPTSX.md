# Refactoring `App.tsx` for Improved Modularity and Maintainability

## 1. Introduction

The `App.tsx` component has grown significantly and currently handles a wide range of responsibilities, including WebSocket management, RPC request processing, transaction signing logic for multiple modes (Browser Wallet, EIP-7702), transaction tracking, and UI state management. This refactoring guide outlines steps to break down `App.tsx` into smaller, more focused modules, primarily using custom React hooks for stateful logic and UI-related concerns, and service modules for business logic.

## 2. General Approach

*   **Custom Hooks (`src/hooks/`):** For encapsulating React-specific logic, including state management (`useState`, `useRef`), effects (`useEffect`), and context interactions if any.
*   **Service Modules (`src/services/`):** For abstracting business logic, API interactions (like the EIP-7702 UserOperation flow), and complex computations that are not directly tied to React's rendering lifecycle.
*   **(Optional but Recommended) Global State Management:** Consider a lightweight global state manager like Zustand if prop drilling becomes too complex or if certain states are truly global. For now, the focus is on modularization via hooks and services.

## 3. Actionable Refactoring Steps

The following areas of `App.tsx` should be extracted into their own modules:

### Step 3.1: WebSocket Management

*   **Goal:** Isolate WebSocket connection lifecycle, message sending, and initial message parsing/routing.
*   **Action:** Create `src/hooks/useWebSocketManager.ts`.
    *   **Responsibilities:**
        *   Manage WebSocket connection state (`wsStatus`: 'connecting', 'open', 'closed', 'error').
        *   Handle `onopen`, `onerror`, `onclose` events.
        *   Provide a stable `wsRef.current` for the WebSocket instance.
        *   Expose a function to send messages (e.g., `sendMessage(type: string, payload: any)`).
        *   Handle `onmessage`: Parse incoming JSON. Based on `message.type` (`rpcRequest`, `signRequest`), it should call appropriate handlers passed to it or manage state updates (e.g., for `signRequest`).
    *   **State to Manage:** `wsStatus`, `wsRef`.
    *   **Functions to Expose:** `wsStatus`, `sendMessage`, potentially functions to register handlers for specific incoming message types.
    *   **In `App.tsx`:**
        *   Call `useWebSocketManager`, passing callbacks for handling `rpcRequest` and `signRequest` messages.
        *   The `useEffect` block for WebSocket connection in `App.tsx` will be moved into this hook.

### Step 3.2: Transaction Tracking & Polling

*   **Goal:** Centralize all logic related to tracking transaction statuses, polling for receipts, and updating confirmations.
*   **Action:** Create `src/hooks/useTransactionTracker.ts`.
    *   **Responsibilities:**
        *   Manage the `_trackedTxs` state and its `trackedTxsRef`.
        *   Implement the `POLLING_INTERVAL` logic for fetching transaction receipts for 'pending' or 'checking' transactions.
        *   Integrate `useWatchBlockNumber` to update confirmations for confirmed transactions.
        *   Provide functions to add a new transaction to tracking and to update existing ones.
    *   **State to Manage:** `_trackedTxs` map, `trackedTxsRef`.
    *   **Functions to Expose:** The `_trackedTxs` map (or `trackedTxsRef.current`), `addTrackedTx(txInfo: TrackedTxInfo)`, `updateTrackedTx(hash: Hex, updates: Partial<TrackedTxInfo>)`.
    *   **In `App.tsx`:**
        *   Call `useTransactionTracker`.
        *   Use the exposed `_trackedTxs` for rendering `TrackedTransactionsList`.
        *   Call `addTrackedTx` when new transactions are initiated (e.g., after `walletClient.sendTransaction` or after an EIP-7702 UserOp is submitted).

### Step 3.3: EIP-7702 Session Management

*   **Goal:** Isolate the state and logic for managing the EIP-7702 session private key and derived account.
*   **Action:** Create `src/hooks/useEip7702Session.ts`.
    *   **Responsibilities:**
        *   Manage `eip7702PrivateKey` state (including initial generation).
        *   Manage `_eip7702SessionAccount` state and `eip7702SessionAccountRef`.
        *   Handle the derivation of the account from the private key.
    *   **State to Manage:** `eip7702PrivateKey`, `_eip7702SessionAccount`, `eip7702SessionAccountRef`.
    *   **Functions to Expose:** `eip7702PrivateKey`, `sessionAccount` (from ref), `setEip7702PrivateKey`, `generateNewEip7702Key`.
    *   **In `App.tsx`:**
        *   Call `useEip7702Session`.
        *   Pass the exposed values to `Eip7702ModeDisplay` and use `sessionAccount` in EIP-7702 transaction logic.

### Step 3.4: EIP-7702 Transaction Service

*   **Goal:** Abstract the complex multi-step process of creating and sending an EIP-7702 UserOperation.
*   **Action:** Create `src/services/eip7702Service.ts`.
    *   **Responsibilities:** This module will contain functions to handle the EIP-7702 specific parts of `handleSignTransaction`.
        *   Function to prepare `MetaTransaction` (for contract creation or function call).
        *   Function to create and sign EIP-7702 authorization.
        *   Function to construct `UserOperationV8` using `abstractionkit`, including `eip7702Auth` override.
        *   Function to apply paymaster sponsorship.
        *   Function to sign the `UserOperationV8`.
        *   Function to send the `UserOperationV8` and wait for inclusion.
    *   **Functions to Export:** e.g., `sendEip7702Transaction(params: { /* ... */ }): Promise<{ userOpHash: Hex, actualTxHash?: Hex, success: boolean }>`
        *   Parameters would include `sanitizedTx`, `sessionAccount`, `publicClient`, `chainId`, bundler/paymaster URLs, etc.
    *   **In `App.tsx` (or a dedicated signing hook/service):**
        *   Import and call functions from `eip7702Service.ts` within the EIP-7702 branch of `handleSignTransaction`.

### Step 3.5: RPC Request Handling Logic

*   **Goal:** Make `handleRpcRequest` in `App.tsx` a dispatcher, moving detailed logic for each RPC method elsewhere.
*   **Action:** Create `src/rpcHandlers.ts` (or `src/services/rpcService.ts`).
    *   **Responsibilities:**
        *   Export individual functions for each RPC method handled (e.g., `handleEthChainId(chainId)`, `handleEthAccounts(address)`, `handleEthGetTransactionCount(publicClient, params)`, `handleEthGetTransactionReceipt(publicClient, params, trackedTxsRef, eip7702SessionAccountRef)`).
        *   These functions will contain the logic currently inside the `switch` cases in `App.tsx`.
    *   **In `App.tsx` (or `useWebSocketManager`):**
        *   The `handleRpcRequest` function (or the message handler in `useWebSocketManager`) will import these handlers.
        *   The `switch` statement will call the appropriate handler function, passing necessary context (like `publicClient`, `address`, `chainId`, refs).

### Step 3.6: Transaction Signing Logic (`handleSignTransaction` & `handleRejectTransaction`)

*   **Goal:** Consolidate and simplify the transaction approval/rejection flow.
*   **Action:** Consider creating `src/hooks/useTransactionSigner.ts`.
    *   **Responsibilities:**
        *   Manage the `signingRequestId` state.
        *   Contain the main logic of `handleSignTransaction` (the decision tree for browser vs. EIP-7702).
            *   For browser mode: Call `walletClient.sendTransaction`.
            *   For EIP-7702 mode: Call the `eip7702Service.ts` functions.
        *   Contain the `handleRejectTransaction` logic.
        *   Interact with `useWebSocketManager` (or `wsRef`) to send responses.
        *   Interact with `useTransactionTracker` to add transactions.
    *   **State to Manage:** `signingRequestId`.
    *   **Functions to Expose:** `handleSignTransaction(request: SignRequest)`, `handleRejectTransaction(requestId: string)`, `signingRequestId`.
    *   **In `App.tsx`:**
        *   Call `useTransactionSigner`.
        *   Pass its exposed functions and state to `PendingActionsList`.

## 4. Refactoring `App.tsx`

After creating the above hooks and services, `App.tsx` will be significantly leaner:

*   It will initialize and use these custom hooks (e.g., `useWebSocketManager`, `useTransactionTracker`, `useEip7702Session`, `useTransactionSigner`).
*   It will primarily be responsible for:
    *   Orchestrating these hooks.
    *   Passing data and functions from hooks to the main UI components (`DashboardStatus`, `PendingActionsList`, `TrackedTransactionsList`, `Eip7702ModeDisplay`, `Tabs`).
    *   Rendering the overall page structure and layout.
*   The large `useEffect` blocks and complex functions like `handleRpcRequest` and `handleSignTransaction` will be drastically reduced or moved entirely into their respective hooks/services.

## 5. Testing

Each extracted hook and service module should ideally be tested independently to ensure its logic is correct. This becomes much easier with smaller, focused units of code.

---

This refactoring effort will improve code organization, make it easier to understand specific pieces of functionality, and enhance the overall maintainability and testability of the application.
