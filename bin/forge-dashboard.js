#!/usr/bin/env node

// Note: This script will be compiled to JS in the 'dist' folder.
// Imports should work relative to the compiled location or use absolute paths/module resolution.

// Using require for compatibility with CommonJS output and older 'open' version
const open = require('open');
// Import from the compiled server location
const { startServer } = require('../server/server'); // Adjust path relative to dist/bin/forge-dashboard.js

// Basic argument parsing (can use libraries like yargs for more complex needs)
const args: string[] = process.argv.slice(2);
const portArg: string | undefined = args.find(arg => arg.startsWith('--port='));
const defaultPort = 3001; // Keep default port consistent
let port: number = defaultPort;

if (portArg) {
    const portNum = parseInt(portArg.split('=')[1], 10);
    if (!isNaN(portNum) && portNum > 0 && portNum < 65536) {
        port = portNum;
    } else {
        console.warn(`Invalid port specified: "${portArg}". Using default port ${defaultPort}.`);
    }
}

async function main() {
    try {
        // Start the server and get the actual port it's listening on
        const actualPort: number = await startServer(port);
        const url = `http://localhost:${actualPort}`;
        console.log(`Forge Dashboard server started. Opening dashboard at ${url}`);

        // Open the URL in the default browser
        await open(url);

    } catch (error: any) { // Catch as 'any' or 'unknown' and check properties
        // Specific check for EADDRINUSE
        if (error && error.code === 'EADDRINUSE') {
            console.error(`Error: Port ${port} is already in use.`);
            console.error('Please try specifying a different port using --port=<number>');
        } else {
            console.error('Failed to start Forge Dashboard server:', error);
        }
        process.exit(1); // Exit with error code
    }
}

main();
