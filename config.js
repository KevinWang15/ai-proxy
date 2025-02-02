const path = require('path');
const fs = require('fs');
const readline = require('readline');
const { Cookie, CookieJar } = require('tough-cookie');

const PASSWORD_FILE = path.join(__dirname, 'password.txt');
const cookieJar = new CookieJar();

async function getConfig() {
    const password = await promptForPassword();
    const url = decodeBase64(password);
    try {
        console.log('Downloading and parsing config...');
        const config = await fetchConfig(url);
        console.log('Config downloaded and parsed successfully');
        savePassword(password);
        return config;
    } catch (error) {
        console.error('Error downloading or parsing the config:', error.message);
        throw error;
    }
}

function promptForPassword() {
    return new Promise((resolve) => {
        if (fs.existsSync(PASSWORD_FILE)) {
            const savedPassword = fs.readFileSync(PASSWORD_FILE, 'utf-8');
            console.log('Using previously saved password.');
            resolve(savedPassword.trim());
            return;
        }

        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });

        rl.question('Enter the password: ', (input) => {
            rl.close();
            resolve(input);
        });
    });
}

function decodeBase64(encoded) {
    try {
        return Buffer.from(encoded, 'base64').toString('utf-8');
    } catch (err) {
        throw new Error('Invalid base64-encoded string.');
    }
}

async function fetchConfig(url, maxRedirects = 5) {
    let currentUrl = url;
    let redirectCount = 0;

    while (redirectCount < maxRedirects) {
        // Get any existing cookies for this domain
        const cookies = await cookieJar.getCookiesSync(currentUrl);
        const cookieHeader = cookies.map(cookie => cookie.cookieString()).join('; ');

        const response = await fetch(currentUrl, {
            headers: {
                Cookie: cookieHeader || ''
            },
            redirect: 'manual' // Handle redirects manually
        });

        // Save any new cookies from the response
        const setCookieHeaders = response.headers.getSetCookie?.() ||
            response.headers.raw?.()['set-cookie'] ||
            [];

        for (const header of setCookieHeaders) {
            const cookie = Cookie.parse(header);
            if (cookie) {
                await cookieJar.setCookieSync(cookie, currentUrl);
            }
        }

        if (response.status >= 300 && response.status < 400) {
            // Handle redirect
            const location = response.headers.get('location');
            if (!location) {
                throw new Error('Redirect location not found');
            }
            currentUrl = new URL(location, currentUrl).toString();
            redirectCount++;
            continue;
        }

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        return response.json();
    }

    throw new Error('Too many redirects');
}

function savePassword(password) {
    fs.writeFileSync(PASSWORD_FILE, password, 'utf-8');
}

module.exports = {
    getConfig
};