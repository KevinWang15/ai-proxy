const path = require('path');
const fs = require('fs');
const readline = require('readline');
const axios = require('axios');
const { CookieJar } = require('tough-cookie');
const { wrapper: axiosCookieJarSupport } = require('axios-cookiejar-support');

const PASSWORD_FILE = path.join(__dirname, 'password.txt');
const jar = new CookieJar();
axiosCookieJarSupport(axios);

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

async function fetchConfig(url) {
    try {
        const response = await axios.get(url, {
            jar,
            maxRedirects: 5,
        });
        return response.data;
    } catch (err) {
        throw new Error(`Failed to download the configuration file: ${err.message}`);
    }
}

function savePassword(password) {
    fs.writeFileSync(PASSWORD_FILE, password, 'utf-8');
}

module.exports = {
    getConfig
};

