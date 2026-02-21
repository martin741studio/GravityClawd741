import crypto from 'crypto';
import { config } from '../config.js';

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

/**
 * Encrypts a string using AES-256-CBC.
 */
export function encrypt(text: string): string {
    if (!config.encryptionKey) return text; // Fallback to plaintext if key is missing (not recommended)

    try {
        const iv = crypto.randomBytes(IV_LENGTH);
        const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(config.encryptionKey, 'hex'), iv);
        let encrypted = cipher.update(text);
        encrypted = Buffer.concat([encrypted, cipher.final()]);
        return iv.toString('hex') + ':' + encrypted.toString('hex');
    } catch (error) {
        console.error('[Crypto] Encryption failed:', error);
        return text;
    }
}

/**
 * Decrypts a string using AES-256-CBC.
 */
export function decrypt(text: string): string {
    if (!config.encryptionKey || !text.includes(':')) return text;

    try {
        const textParts = text.split(':');
        const iv = Buffer.from(textParts.shift()!, 'hex');
        const encryptedText = Buffer.from(textParts.join(':'), 'hex');
        const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(config.encryptionKey, 'hex'), iv);
        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString();
    } catch (error) {
        // If decryption fails, it might be plaintext or wrong key
        // console.error('[Crypto] Decryption failed (or content is plaintext).');
        return text;
    }
}
