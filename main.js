const {getConfig} = require('./config');
const {BrowserSetup} = require('./browser-setup');
const {PageHandler} = require('./page-handler');
const {BrowserManager} = require('./browser-manager');

async function main() {
    const nodeVersion = process.versions.node;
    const majorVersion = parseInt(nodeVersion.split('.')[0], 10);
    if (majorVersion < 18) {
        console.error('\x1b[31mError: This application requires Node.js version 18 or higher.\x1b[0m');
        console.error(`Current version: ${nodeVersion}`);
        console.error('Please upgrade your Node.js installation.');
        process.exit(1);
    }

    try {
        const config = await getConfig();
        const browserSetup = new BrowserSetup();
        const pageHandler = new PageHandler(config);
        const browserManager = new BrowserManager(config, browserSetup, pageHandler);
        await browserManager.launch();
    } catch (error) {
        console.error('Error in main:', error);
        process.exit(1);
    }
}

main();