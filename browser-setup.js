const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const { executablePath } = require('puppeteer');

puppeteer.use(StealthPlugin());

class BrowserSetup {
    constructor() {
        this.userDataDir = path.join(__dirname, 'custom-chrome-data');
    }

    async customizeChromeTesting() {
        const originalPath = executablePath();
        const baseDir = path.dirname(path.dirname(originalPath));
        const customAppName = 'Chrome for AI.app';
        const customAppPath = path.join(baseDir, "../..", customAppName);

        if (!fs.existsSync(customAppPath)) {
            await this._createCustomChromeApp(baseDir, customAppName, customAppPath);
        }

        const customExecutablePath = path.join(customAppPath, 'Contents/MacOS/Google Chrome for Testing');
        if (!fs.existsSync(customExecutablePath)) {
            throw new Error('Custom Chrome executable not found at: ' + customExecutablePath);
        }

        return customExecutablePath;
    }

    async _createCustomChromeApp(baseDir, customAppName, customAppPath) {
        console.log('Creating custom Chrome app...');
        const originalAppPath = path.join(baseDir, "../..", 'Google Chrome for Testing.app');

        if (!fs.existsSync(originalAppPath)) {
            throw new Error('Original Chrome app not found at: ' + originalAppPath);
        }

        execSync(`cp -r "${originalAppPath}" "${customAppPath}"`);
        this._updateAppInfo(customAppPath);
        this._updateAppIcon(customAppPath);
    }

    _updateAppInfo(customAppPath) {
        const infoPlistPath = path.join(customAppPath, 'Contents/Info.plist');
        if (fs.existsSync(infoPlistPath)) {
            execSync(`plutil -replace CFBundleName -string "Chrome for AI" "${infoPlistPath}"`);
            execSync(`plutil -replace CFBundleDisplayName -string "Chrome for AI" "${infoPlistPath}"`);
        }
    }

    _updateAppIcon(customAppPath) {
        const iconPath = path.join(__dirname, 'logo.icns');
        if (fs.existsSync(iconPath)) {
            const resourcesPath = path.join(customAppPath, 'Contents/Resources');
            execSync(`cp "${iconPath}" "${resourcesPath}/app.icns"`);
        }
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
            ignoreDefaultArgs: ["--disable-extensions", "--enable-automation"],
        };
    }

    _getChromeLaunchArgs(config) {
        return [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-infobars',
            '--window-position=0,0',
            '--ignore-certifcate-errors',
            '--ignore-certifcate-errors-spki-list',
            `--user-data-dir=${this.userDataDir}`,
            '--force-dark-mode',
            `--proxy-server=${config.proxyConfig.server}`
        ];
    }
}

module.exports = {
    BrowserSetup
};