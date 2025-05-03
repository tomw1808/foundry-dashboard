# Forge Dashboard ⚡️🦊

**Bring the power of browser wallets like MetaMask to your Foundry workflow.**

Ever missed the convenience of Truffle Dashboard when working with Foundry? Wished you could use your familiar browser wallet to sign transactions triggered by `forge script --broadcast` without juggling private keys or complex setups?

Forge Dashboard aims to bridge that gap. It's a lightweight, local tool that acts as a secure intermediary between your Foundry scripts and your browser wallet.

## The Problem Solved 🧩

Foundry is an incredibly powerful toolkit for smart contract development. However, interacting with deployed contracts or broadcasting transactions via `forge script` often requires handling private keys directly or using hardware wallets via specific flags. While secure, this can sometimes slow down the rapid iteration loop, especially during testing and deployment phases on testnets or even local nodes like Anvil.

Tools like Truffle Dashboard provided a neat solution by letting developers use their browser wallets (already configured with accounts, nonces managed, etc.) to sign and send transactions initiated from the command line. Forge Dashboard brings this crucial piece of developer experience to the Foundry ecosystem.

## How it Works ⚙️

Forge Dashboard runs a small local server that does two main things:

1.  **Listens for JSON-RPC Requests:** It exposes a local RPC endpoint (e.g., `http://localhost:3001/api/rpc`). You point `forge script` to this endpoint using the `--rpc-url` flag.
2.  **Communicates with a Frontend:** It serves a simple web interface that connects to your browser wallet (MetaMask, etc.).

When `forge script` needs to send a transaction (`eth_sendTransaction`), the flow is:

1.  `forge script` sends the request to the Forge Dashboard server.
2.  The server immediately pushes this request (using WebSockets/SSE for low latency) to the connected web frontend.
3.  The frontend prompts you in your browser wallet (e.g., MetaMask) to sign or reject the transaction.
4.  You approve/reject in MetaMask.
5.  The frontend sends the signed transaction (or rejection) back to the local server.
6.  The server relays the response back to the waiting `forge script` process.

All other standard RPC calls (`eth_chainId`, `eth_call`, etc.) are handled seamlessly.

## Architectural Decisions 🏗️

We considered several approaches before settling on the current architecture (Node.js/Express backend + React frontend):

*   **Why not just a frontend?** Browsers operate in a security sandbox and cannot directly accept incoming network connections from local processes like `forge script`. A backend process is *required* to listen for these connections.
*   **Polling vs. WebSockets/SSE:** While polling could work, the latency introduced (waiting for the frontend to poll for a pending transaction) would make the signing experience feel sluggish. Users expect near-instant feedback when a signing request is initiated. WebSockets (or Server-Sent Events) allow the backend to instantly push the request to the frontend, triggering the wallet prompt immediately.
*   **Next.js vs. Express + React:**
    *   Next.js is a fantastic framework, but handling persistent WebSocket/SSE connections cleanly often requires stepping outside its standard API route model and implementing a custom server anyway.
    *   A dedicated Express backend makes handling WebSockets/SSE, API routes (`/api/rpc`), and serving the static React frontend build very straightforward.
    *   For packaging as a simple CLI tool (`npm install -g forge-dashboard && forge-dashboard`), the Express + static React build approach results in a potentially cleaner and leaner package compared to bundling a full Next.js application structure (`.next` directory).

## Getting Started 🚀

*(Instructions will be added here once the tool is functional)*

---

*This is an early-stage project. Contributions and feedback are welcome!*
