#!/usr/bin/env node

// Using require for compatibility with CommonJS output and older 'open' version
import open from 'open'; // Use import with esModuleInterop
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import path from 'path'; // Import path for resolving project path

// Import from the compiled server location
// Adjust path relative to dist/bin/forge-dashboard.js
import { startServer } from '../server/server';

async function main() {
    // --- Argument Parsing with yargs ---
    const argv = await yargs(hideBin(process.argv))
        .option('port', {
            alias: 'p',
            type: 'number',
            description: 'Port to run the dashboard server on',
            default: 3001
        })
        .option('path', {
            alias: 'd', // Directory
            type: 'string',
            description: 'Path to the Foundry project root directory',
            default: process.cwd(),
            coerce: (p) => path.resolve(p)
        })
        .option('verbose', {
            alias: 'v',
            type: 'count', // Count occurrences of -v flag
            description: 'Increase logging verbosity (-v, -vv, -vvv)'
        })
        .help()
        .alias('help', 'h')
        .argv;

    const port = argv.port;
    const projectPath = argv.path;
    const verbosity = argv.verbose; // Get verbosity count

    // Initial log before logger is fully configured in server
    console.log(`Verbosity level: ${verbosity}`);
    console.log(`Using project path: ${projectPath}`);
    console.log(`Attempting to start server on port: ${port}`);
    // --- End Argument Parsing ---

    try {
        // Pass projectPath and verbosity to startServer
        const actualPort: number = await startServer(port, projectPath, verbosity);
        const url = `http://localhost:${actualPort}`;
        // Use console.log here as logger isn't available in this scope easily
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
