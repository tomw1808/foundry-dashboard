# Forge Dashboard ⚡️🦊

**Bring the power of browser wallets like MetaMask to your Foundry workflow.**

Ever missed the convenience of Truffle Dashboard when working with Foundry? Wished you could use your familiar browser wallet to sign transactions triggered by `forge script --broadcast` without juggling private keys or complex setups?

Forge Dashboard aims to bridge that gap. It's a lightweight, local tool that acts as a secure intermediary between your Foundry scripts and your browser wallet.

## The Problem Solved 🧩

Foundry is an incredibly powerful toolkit for smart contract development. However, interacting with deployed contracts or broadcasting transactions via `forge script` often requires handling private keys directly or using hardware wallets via specific flags. While secure, this can sometimes slow down the rapid iteration loop, especially during testing and deployment phases on testnets or even local nodes like Anvil.

Tools like Truffle Dashboard provided a neat solution by letting developers use their browser wallets (already configured with accounts, nonces managed, etc.) to sign and send transactions initiated from the command line. Forge Dashboard brings this crucial piece of developer experience to the Foundry ecosystem.

## How it Works ⚙️

Forge Dashboard runs a small local server that does three main things:

1.  **Listens for JSON-RPC Requests:** It exposes a local RPC endpoint (e.g., `http://localhost:3001/api/rpc`). You point `forge script` or other tools to this endpoint using the `--rpc-url` flag.
2.  **Decodes Transaction Data:** When run within a Foundry project context, the server reads your compiled contract artifacts (`./out` directory) and attempts to decode `eth_sendTransaction` requests into human-readable function calls or contract deployments.
3.  **Communicates with a Frontend:** It serves a simple web interface that connects to your browser wallet (MetaMask, etc.) via WebSocket.

When `forge script` needs to send a transaction (`eth_sendTransaction`), the flow is:

1.  `forge script` sends the request to the Forge Dashboard server (`/api/rpc`).
2.  The server attempts to decode the transaction data using the ABIs found in the specified project path.
3.  The server pushes the request (including any decoded information) via WebSocket to the connected web frontend.
4.  The frontend displays the request details (decoded, if possible) and prompts you to approve or reject.
5.  You approve/reject in your browser wallet (e.g., MetaMask).
6.  The frontend sends the signed transaction (or rejection error) back to the local server via WebSocket.
7.  The server relays the JSON-RPC response back to the waiting `forge script` process.

Other standard RPC calls (`eth_chainId`, `eth_call`, etc.) are proxied to the frontend wallet via the WebSocket connection.

## Architectural Decisions 🏗️

We considered several approaches before settling on the current architecture (Node.js/Express backend + React frontend):

*   **Why not just a frontend?** Browsers operate in a security sandbox and cannot directly accept incoming network connections from local processes like `forge script`. A backend process is *required* to listen for these connections.
*   **Polling vs. WebSockets/SSE:** While polling could work, the latency introduced (waiting for the frontend to poll for a pending transaction) would make the signing experience feel sluggish. Users expect near-instant feedback when a signing request is initiated. WebSockets (or Server-Sent Events) allow the backend to instantly push the request to the frontend, triggering the wallet prompt immediately.
*   **Next.js vs. Express + React:**
    *   Next.js is a fantastic framework, but handling persistent WebSocket/SSE connections cleanly often requires stepping outside its standard API route model and implementing a custom server anyway.
    *   A dedicated Express backend makes handling WebSockets/SSE, API routes (`/api/rpc`), and serving the static React frontend build very straightforward.
    *   For packaging as a simple CLI tool (`npm install -g forge-dashboard && forge-dashboard`), the Express + static React build approach results in a potentially cleaner and leaner package compared to bundling a full Next.js application structure (`.next` directory).

## Getting Started 🚀

1.  **Installation:**
    ```bash
    npm install -g forge-dashboard
    # or if cloned locally:
    # npm install && npm run build
    ```

2.  **Running the Dashboard:**
    *   Navigate to your Foundry project directory in your terminal.
    *   Run the dashboard command:
        ```bash
        forge-dashboard
        ```
    *   This starts the server (defaulting to port 3001) and opens the dashboard UI in your browser. It will automatically look for artifacts in `./out`.

3.  **Command-Line Options:**
    *   `--port <number>` or `-p <number>`: Specify a different port for the server (default: 3001).
    *   `--path <directory>` or `-d <directory>`: Specify the path to your Foundry project root if you are running the command from outside the project directory (default: current working directory).

    *Example:*
    ```bash
    # Run on port 4000, pointing to a specific project
    forge-dashboard --port 4000 --path /path/to/my-foundry-project
    ```

4.  **Connecting from Foundry:**
    *   Use the `--rpc-url` flag with `forge script`, `forge test`, or other commands, pointing to the dashboard's RPC endpoint:
        ```bash
        forge script script/MyScript.s.sol --rpc-url http://localhost:3001/api/rpc --broadcast
        # Or if using a different port:
        # forge script script/MyScript.s.sol --rpc-url http://localhost:4000/api/rpc --broadcast
        ```

5.  **Using the Dashboard UI:**
    *   Connect your browser wallet (e.g., MetaMask) to the dashboard webpage. Ensure it's connected to the correct network you intend to interact with.
    *   When a transaction request arrives from Foundry, it will appear in the "Pending Actions" section.
    *   Review the details (decoded information will be shown if available).
    *   Click "Approve in Wallet" to trigger the signing prompt in your browser wallet, or "Reject" to cancel.

## Transaction Decoding 🧐

Forge Dashboard enhances the signing experience by attempting to decode transaction data (`eth_sendTransaction`) into a more human-readable format, similar to Truffle Dashboard.

*   **How it Works:** When started, the backend server reads contract artifacts (`.json` files containing ABIs and bytecode) from your Foundry project's output directory (usually `./out`, configurable via `--path`).
*   **Function Calls:** For transactions targeting a contract (`to` address is present), it tries to match the transaction `data` against the function signatures in the loaded ABIs. If successful, it displays the contract name, function name, and decoded arguments.
*   **Contract Deployments:** For contract creation transactions (`to` address is null), it tries to match the beginning of the transaction `data` against the creation bytecode of the loaded artifacts. If successful, it displays the name of the contract being deployed and decodes any constructor arguments.
*   **Fallback:** If decoding is not possible (e.g., artifacts not found, ABI mismatch, or interacting with an external contract not in your project), the raw transaction parameters will be displayed.

---

*This is an early-stage project. Contributions and feedback are welcome!*
