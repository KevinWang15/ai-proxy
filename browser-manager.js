const { chromium } = require('playwright');

class BrowserManager {
    constructor(config, browserSetup, pageHandler) {
        this.config = config;
        this.browserSetup = browserSetup;
        this.pageHandler = pageHandler;
    }

    async launch() {
        await this.browserSetup.setupUserDataDirectory();
        const customExecutablePath = await this.browserSetup.customizeChromeTesting();
        console.log('Custom browser path:', customExecutablePath);

        const launchOptions = this.browserSetup.getLaunchOptions(customExecutablePath, this.config);

        // Launch persistent context with userDataDir
        const context = await chromium.launchPersistentContext(this.browserSetup.userDataDir, launchOptions);

        await this._setupBrowserEvents(context);
        await this._initializeFirstPage(context);

        return context;
    }

    async _setupBrowserEvents(context) {
        context.on('page', async (page) => {
            await this.pageHandler.setupPage(page);
        });

        context.on('disconnected', () => {
            console.log('Browser has been closed');
            process.exit(0);
        });
    }

    async _initializeFirstPage(context) {
        const page = await context.newPage();
        await this.pageHandler.setupPage(page);
        await this.pageHandler.loadAndSetCookies(page);

        await page.goto('about:blank');
        await this.pageHandler.performIpCheck(page);
        console.log('IP check passed');

        console.log('Navigating to chatgpt.com');
        await page.goto('https://chatgpt.com/');
    }
}

module.exports = {
    BrowserManager
};
