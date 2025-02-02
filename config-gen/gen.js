const fs = require('fs');
const crypto = require('crypto');
const util = require('util');

const baseConfig = require("./base-config");

// Promisify the crypto.pbkdf2 function
const pbkdf2 = util.promisify(crypto.pbkdf2);

async function deriveKey(password, salt, iterations, keyLength, digest) {
    const passwordBuffer = Buffer.from(password, 'utf-8');
    const saltBuffer = Buffer.from(salt, 'utf-8');
    return pbkdf2(passwordBuffer, saltBuffer, iterations, keyLength, digest);
}

async function decrypt(encryptedData, password) {
    try {
        // Convert base64 to buffer
        const data = Buffer.from(encryptedData, 'base64');

        // Extract IV (first 12 bytes) and ciphertext with auth tag
        const iv = data.slice(0, 12);
        const ciphertextWithTag = data.slice(12);

        // The auth tag is the last 16 bytes
        const authTag = ciphertextWithTag.slice(-16);
        // The actual ciphertext is everything except the last 16 bytes
        const ciphertext = ciphertextWithTag.slice(0, -16);

        // Derive key using PBKDF2
        const key = await deriveKey(
            password,
            password + password,
            Math.pow(2, 10),
            32,
            'sha256'
        );

        // Create decipher
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(authTag);

        // Get decrypted data
        const decrypted = Buffer.concat([
            decipher.update(ciphertext),
            decipher.final()
        ]);

        return decrypted.toString('utf-8');
    } catch (error) {
        console.error('Decryption failed:', error);
        return null;
    }
}

async function main() {
    try {
        // Read the export file
        const exportData = JSON.parse(fs.readFileSync('cookies.json', 'utf-8'));

        // Verify the export format
        if (!exportData.version === 2 || !exportData.data) {
            throw new Error('Invalid export file format');
        }

        // Decrypt the data
        const decrypted = await decrypt(exportData.data, '123');

        if (!decrypted) {
            throw new Error('Decryption failed');
        }

        // Pretty print the results
        baseConfig.cookies = JSON.parse(decrypted);
        console.log(JSON.stringify(baseConfig, null, 2));

    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

main();