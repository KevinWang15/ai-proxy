const puppeteer = require('puppeteer-extra');
const {spawn, exec, execSync} = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const os = require("os");
const net = require('net');
const psList = require('ps-list');
const rimraf = require('rimraf');
const {nanoid} = require('nanoid');

function uaIdentity() {
    const identityFilePath = path.join(__dirname, 'identity.txt');
    if (fs.existsSync(identityFilePath)) {
        return '[[' + fs.readFileSync(identityFilePath, 'utf-8').trim() + ']]';
    } else {
        const newIdentity = nanoid(128);
        fs.writeFileSync(identityFilePath, newIdentity, 'utf-8');
        return '[[' + newIdentity + ']]';
    }
}

class BrowserManager {
    constructor(config, browserSetup, pageHandler) {
        this.config = config;
        this.browserSetup = browserSetup;
        this.pageHandler = pageHandler;
        this.chromeProcess = null;
        this.debugPort = null;
        this.extensionPath = path.join(__dirname, 'proxy-auth-ext');
    }


    /**
     * Synchronously kills a process by PID.
     * Ensures the kill operation completes before returning.
     */
    killProcess(pid) {
        try {
            if (os.platform() === 'win32') {
                // Use synchronous taskkill on Windows
                execSync(`taskkill /F /PID ${pid}`, {stdio: 'ignore'});
            } else {
                // On Unix-like systems, SIGKILL synchronously
                process.kill(pid, 'SIGKILL');
            }
            console.log(`Killed Chrome process with PID: ${pid}`);
        } catch (err) {
            console.error(`Failed to kill process ${pid}: ${err.message}`);
        }
    }

    /**
     * Asynchronously finds and kills any Chrome processes
     * using the "custom-chrome-data" user data dir.
     */
    async killExistingChromeInstances() {
        if (os.platform() === 'win32') {
            // --- Windows approach: WMIC /FORMAT:LIST ---
            const stdout = await new Promise((resolve, reject) => {
                exec('wmic process get Name,CommandLine,ProcessId /FORMAT:LIST', (error, out) => {
                    if (error) return reject(error);
                    resolve(out);
                });
            });

            // Split into lines
            const lines = stdout.split(/\r?\n/);
            let block = {};

            const processBlock = () => {
                if (block.Name && block.ProcessId) {
                    const cmdLower = (block.CommandLine || '').toLowerCase();
                    const pid = parseInt(block.ProcessId, 10);

                    // Check for Chrome + custom data dir
                    if (
                        cmdLower.includes('--user-data-dir') &&
                        cmdLower.includes('custom-chrome-data')
                    ) {
                        this.killProcess(pid);
                    }
                }
                block = {};
            };

            for (let line of lines) {
                line = line.trim();
                if (!line) {
                    // Blank line => end of a process block
                    processBlock();
                    continue;
                }
                // Lines are like "Name=chrome.exe"
                const [key, ...rest] = line.split('=');
                if (!key || rest.length === 0) continue;

                // Accumulate into block
                block[key.trim()] = rest.join('=').trim();
            }
            // If there's a trailing block, process it
            processBlock();

        } else {
            // --- macOS/Linux approach: ps-list has proc.cmd available ---
            try {
                const processes = await psList();

                for (const proc of processes) {
                    const cmd = (proc.cmd || '').toLowerCase();
                    if (cmd.includes('--user-data-dir') && cmd.includes('custom-chrome-data')) {
                        this.killProcess(proc.pid);
                    }
                }
            } catch (err) {
                console.error('Error while trying to kill existing Chrome instances (Unix):', err);
            }
        }
    }

    async setupExtension() {

        // Clean up any existing extension directory
        await rimraf(this.extensionPath);

        // Create the extension directory
        fs.mkdirSync(this.extensionPath, {recursive: true});

        // Create manifest.json with Manifest V3
        const manifest = {
            "manifest_version": 3,
            "name": "Proxy Authentication",
            "version": "1.0",
            "permissions": [
                "webRequest",
                "webRequestAuthProvider"
            ],
            "background": {
                "service_worker": "background.js",
                "type": "module"
            },
            "host_permissions": [
                "<all_urls>"
            ]
        };

        // Create background.js with proxy credentials
        const background = `
            const credentials = {
                username: "${this.config.proxyConfig.username}",
                password: "${this.config.proxyConfig.password}"
            };

            chrome.webRequest.onAuthRequired.addListener(
                (details) => {
                    if (details.isProxy) {
                        return {
                            authCredentials: credentials
                        };
                    }
                },
                {urls: ["<all_urls>"]},
                ["blocking"]
            );
        `;

        // Write the extension files
        fs.writeFileSync(
            path.join(this.extensionPath, 'manifest.json'),
            JSON.stringify(manifest, null, 2)
        );
        fs.writeFileSync(
            path.join(this.extensionPath, 'background.js'),
            background
        );

        return this.extensionPath;
    }

    async isPortAvailable(port) {
        return new Promise((resolve) => {
            const server = net.createServer()
                .once('error', () => {
                    resolve(false);
                })
                .once('listening', () => {
                    server.close();
                    resolve(true);
                })
                .listen(port);
        });
    }

    async findAvailablePort(minPort = 10000, maxPort = 65535, maxAttempts = 50) {
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const port = Math.floor(Math.random() * (maxPort - minPort + 1) + minPort);
            if (await this.isPortAvailable(port)) {
                return port;
            }
        }
        throw new Error('Could not find an available port after maximum attempts');
    }

    async launch() {
        try {
            await this.browserSetup.setupUserDataDirectory();
            const extensionPath = await this.setupExtension();

            await this.killExistingChromeInstances();

            this.debugPort = await this.findAvailablePort();
            console.log(`Selected available debug port: ${this.debugPort}`);

            const customExecutablePath = await this.browserSetup.customizeChromeTesting();
            console.log('Launching Chrome as an independent process...');

            this.chromeProcess = spawn(customExecutablePath, [
                '--ignore-certificate-errors',
                '--allow-insecure-localhost',
                '--ignore-urlfetcher-cert-requests',
                `--remote-debugging-port=${this.debugPort}`,
                '--no-default-browser-check',
                '--disable-infobars',
                '--start-maximized',
                '--user-data-dir=' + this.browserSetup.userDataDir,
                '--force-dark-mode',
                `--proxy-server=${this.config.proxyConfig.server}`,
                `--load-extension=${extensionPath}`,
                '--no-sandbox',
                `--user-agent=${uaIdentity()}Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36`,
                '--disable-dev-shm-usage',
                '--disable-background-networking',
                '--disable-breakpad',
                '--disable-crash-reporter',
                '--disable-default-apps',
                '--disable-popup-blocking',
                '--disable-sync',
                '--disable-translate',
                '--metrics-recording-only',
                '--safebrowsing-disable-auto-update',
                '--password-store=basic',
                '--disable-blink-features=AutomationControlled',
                '--disable-background-timer-throttling',
                '--disable-renderer-backgrounding',
                '--force-color-profile=srgb',
                os.platform() === 'darwin' ? '--use-mock-keychain' : null
            ].filter(x => x), {
                detached: true,
                stdio: 'ignore'
            });

            this.chromeProcess.unref();
            console.log(`Chrome launched with PID: ${this.chromeProcess.pid}`);

            await this.waitForChrome();

            console.log('Connecting Puppeteer to Chrome...');
            const browser = await puppeteer.connect({
                browserURL: `http://localhost:${this.debugPort}`,
                defaultViewport: null
            });

            console.log('Puppeteer connected to Chrome, setting up Chrome...');

            await this._initializeFirstPage(browser);

            console.log("Puppeteer setup complete. Disconnecting...");
            await browser.disconnect();

            console.log("Puppeteer has exited. Chrome will continue running.");
            process.exit(0);
        } catch (error) {
            console.error('Error during browser launch:', error);
            throw error;
        }
    }

    async _initializeFirstPage(browser, maxRetries = 3, retryDelay = 1000) {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const pages = await browser.pages();
                const page = pages[0];

                if (!page) {
                    if (attempt === maxRetries) {
                        throw new Error('Failed to get browser page after maximum retries');
                    }
                    console.log(`Page is nil, attempt ${attempt}/${maxRetries}. Retrying...`);
                    await new Promise(resolve => setTimeout(resolve, retryDelay));
                    continue;
                }

                await this.pageHandler.setupPage(page);
                await this.pageHandler.loadAndSetCookies(page);
                await page.goto('https://chatgpt.com/');
                return page;

            } catch (error) {
                if (attempt === maxRetries) {
                    throw new Error(`Failed to initialize first page: ${error.message}`);
                }
                console.error(`Attempt ${attempt}/${maxRetries} failed: ${error.message}`);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
            }
        }
    }

    async waitForChrome(retries = 20, delay = 500) {
        console.log(`Waiting for Chrome to start on port ${this.debugPort}...`);
        for (let i = 0; i < retries; i++) {
            try {
                await new Promise((resolve, reject) => {
                    http.get(`http://localhost:${this.debugPort}/json/version`, (res) => {
                        if (res.statusCode === 200) {
                            resolve();
                        } else {
                            reject();
                        }
                    }).on('error', reject);
                });
                console.log('Chrome is ready!');
                return;
            } catch (err) {
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        throw new Error('Chrome did not start in time.');
    }
}

module.exports = {BrowserManager};