#!/usr/bin/env node

const path = require('path');
const open = require('open');
const { startServer } = require('../server/server.js'); // Use CommonJS require

// Basic argument parsing (can use libraries like yargs for more complex needs)
const args = process.argv.slice(2);
const portArg = args.find(arg => arg.startsWith('--port='));
const defaultPort = 3001; // Keep default port consistent
let port = defaultPort;

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
    const actualPort = await startServer(port);
    const url = `http://localhost:${actualPort}`;
    console.log(`Forge Dashboard server started. Opening dashboard at ${url}`);

    // Open the URL in the default browser
    await open(url);

  } catch (error) {
    // Specific check for EADDRINUSE
    if (error.code === 'EADDRINUSE') {
        console.error(`Error: Port ${port} is already in use.`);
        console.error('Please try specifying a different port using --port=<number>');
    } else {
        console.error('Failed to start Forge Dashboard server:', error);
    }
    process.exit(1); // Exit with error code
  }
}

main();
