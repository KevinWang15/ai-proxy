class PageHandler {
    constructor(config) {
        this.config = config;
    }

    async setupPage(page) {
        await page.setViewport();

        if (this.config.proxyConfig.username) {
            await page.authenticate({
                username: this.config.proxyConfig.username,
                password: this.config.proxyConfig.password
            });
        }
    }

    async loadAndSetCookies(page) {
        try {
            const client = await page.target().createCDPSession();
            await client.send("Network.enable");
            await client.send("Network.clearBrowserCookies");

            for (const cookie of this.config.cookies) {
                await client.send("Network.setCookie", this._formatCookie(cookie));
            }
            return true;
        } catch (error) {
            console.error("Error loading or setting cookies via CDP:", error);
            return false;
        }
    }

    _formatCookie(cookie) {
        return {
            name: cookie.name,
            value: cookie.value,
            domain: cookie.domain,
            path: cookie.path || "/",
            expires: cookie.expirationDate,
            httpOnly: cookie.httpOnly || false,
            secure: cookie.secure || false,
            sameSite: cookie.sameSite === "unspecified" ? "None" : cookie.sameSite
        };
    }
}

module.exports = {
    PageHandler
};
