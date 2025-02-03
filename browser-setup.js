const { chromium } = require('playwright'); // Import Playwright's chromium module
const path = require('path');
const fs = require('fs');
const os = require('os');

class BrowserSetup {
    constructor() {
        this.userDataDir = path.join(__dirname, 'custom-chrome-data');
    }

    async customizeChromeTesting() {
        // Playwright supports ARM Linux natively, no need for special handling here.
        if (os.platform() === 'win32' || os.platform() === 'linux') {
            console.log('Browser customization skipped on ' + os.platform());
            return chromium.executablePath();  // This is how we get the executable path in Playwright
        }

        // For macOS, simply use the default Playwright Chromium path
        return chromium.executablePath();
    }

    async setupUserDataDirectory() {
        if (!fs.existsSync(this.userDataDir)) {
            fs.mkdirSync(this.userDataDir);
        }
        await this._updateChromePreferences();
    }

    async _updateChromePreferences() {
        const preferencesPath = path.join(this.userDataDir, 'Default', 'Preferences');
        if (fs.existsSync(preferencesPath)) {
            const preferences = JSON.parse(fs.readFileSync(preferencesPath, 'utf8'));
            Object.assign(preferences, this._getDefaultPreferences());
            fs.writeFileSync(preferencesPath, JSON.stringify(preferences));
        }
    }

    _getDefaultPreferences() {
        return {
            profile: {
                exit_type: "Normal",
                exited_cleanly: true,
                content_settings: {
                    exceptions: {}
                }
            },
            session: {
                restore_on_startup: 4
            }
        };
    }

    getLaunchOptions(customExecutablePath, config) {
        return {
            executablePath: customExecutablePath,
            headless: false,
            args: this._getChromeLaunchArgs(config),
            ignoreHTTPSErrors: true,
        };
    }

    _getChromeLaunchArgs(config) {
        return [
            '--no-default-browser-check',
            '--disable-infobars',
            '--start-maximized',
            '--ignore-certifcate-errors',
            '--ignore-certifcate-errors-spki-list',
            '--force-dark-mode',
            `--proxy-server=${config.proxyConfig.server}`
        ];
    }
}

module.exports = {
    BrowserSetup
};
