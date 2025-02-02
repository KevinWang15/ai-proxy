const puppeteer = require('puppeteer-extra');

class BrowserManager {
    constructor(config, browserSetup, pageHandler) {
        this.config = config;
        this.browserSetup = browserSetup;
        this.pageHandler = pageHandler;
    }

    async launch() {
        await this.browserSetup.setupUserDataDirectory();
        const customExecutablePath = await this.browserSetup.customizeChromeTesting();
        console.log('Custom Chrome path:', customExecutablePath);

        const launchOptions = this.browserSetup.getLaunchOptions(customExecutablePath, this.config);
        const browser = await puppeteer.launch(launchOptions);

        await this._setupBrowserEvents(browser);
        await this._initializeFirstPage(browser);

        return browser;
    }

    async _setupBrowserEvents(browser) {
        browser.on('targetcreated', async (target) => {
            if (target.type() === 'page') {
                const pages = await browser.pages();
                if (!this.pageHandler.ipCheckHasPassed && pages.length > 1) {
                    await (await target.page()).close();
                } else {
                    await this.pageHandler.setupPage(await target.page());
                }
            }
        });

        browser.on('targetdestroyed', () => this._closeIfNoPages(browser));
        browser.on('disconnected', () => {
            console.log('Browser has been closed');
            process.exit(0);
        });
    }

    async _closeIfNoPages(browser) {
        const pages = await browser.pages();
        if (pages.length === 0) {
            await browser.close();
        }
    }

    async _initializeFirstPage(browser) {
        const [page] = await browser.pages();
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
