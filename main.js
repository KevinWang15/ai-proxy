const {getConfig} = require('./config');
const {BrowserSetup} = require('./browser-setup');
const {PageHandler} = require('./page-handler');
const {BrowserManager} = require('./browser-manager');

async function main() {
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