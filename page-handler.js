class PageHandler {
    constructor(config) {
        this.config = config;
        this.ipCheckHasPassed = false;
    }

    async setupPage(page) {
        await page.setViewport();

        // Enable request interception for all pages
        await page.setRequestInterception(true);
        page.on('request', request => {
            if (request.isNavigationRequest() && request.url() !== 'about:blank' && !this.ipCheckHasPassed) {
                request.abort();
            } else {
                request.continue();
            }
        });

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

    async performIpCheck(page) {
        await this._showInitialAlert(page);
        try {
            const ipInfo = await page.evaluate((config) => {
                return fetch(config.ipCheckerUrl).then(res => res.json());
            }, this.config);

            if (ipInfo.data.ip !== this.config.proxyConfig.ip) {
                throw new Error(`IP invalid, expected ${this.config.proxyConfig.ip} but got ${ipInfo.data.ip}`);
            }

            await this._showSuccessAlert(page, ipInfo.data.ip);
            this.ipCheckHasPassed = true;

            // After IP check passes, update request interception for all pages
            const pages = await page.browser().pages();
            for (const p of pages) {
                // Reset the request interception to allow normal navigation
                await p.setRequestInterception(false);
                await p.setRequestInterception(true);
                p.removeAllListeners('request');
                p.on('request', request => request.continue());
            }

            return true;
        } catch (error) {
            console.error('IP check failed:', error.message);
            throw error;
        }
    }

    async _showInitialAlert(page) {
        await page.evaluate(() => {
            const alertDiv = document.createElement('div');
            alertDiv.id = 'ip-check-alert';
            alertDiv.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background-color: red;
                color: yellow;
                font-weight: bold;
                border: 2px solid yellow;
                padding: 20px;
                border-radius: 10px;
                font-family: Arial, sans-serif;
                font-size: 18px;
                text-align: center;
                z-index: 9999;
            `;
            alertDiv.textContent = "Checking IP, do not do anything yet.";
            document.body.appendChild(alertDiv);
        });
    }

    async _showSuccessAlert(page, ip) {
        await page.evaluate((ip) => {
            const alertDiv = document.getElementById('ip-check-alert');
            if (alertDiv) {
                alertDiv.innerHTML = `IP check passed, your IP is ${ip}.<br/>Navigating to ChatGPT now...<br/><p style="font-size: 12px;opacity: 0.6">P.S. The initial load might be slow; consider waiting a little longer or restarting.</p>`;
                alertDiv.style.backgroundColor = '#d4edda';
                alertDiv.style.borderColor = '#c3e6cb';
                alertDiv.style.color = '#155724';
            }
        }, ip);
    }
}

module.exports = {
    PageHandler
};
