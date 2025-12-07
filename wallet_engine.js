/**
 * SORCERER'S FORGE - Hyper-Optimized Solana Vanity Generator
 * RAW SPEED MODE: Uses direct Ed25519 keypair generation (no mnemonic)
 * Maximizes Attempts Per Second (APS) for vanity mining
 */

import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { fileURLToPath } from 'url';
import os from 'os';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const NUM_WORKERS = Math.max(1, os.cpus().length - 1);

// Base58 alphabet for Solana addresses
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

// Precompute valid suffix characters for fast rejection
const VALID_SUFFIX_CHARS = new Set(BASE58_ALPHABET.split(''));

/**
 * Validates that a string only contains valid Base58 characters
 */
export function validateSuffix(suffix) {
    for (const char of suffix) {
        if (!VALID_SUFFIX_CHARS.has(char)) {
            return { valid: false, invalidChar: char };
        }
    }
    return { valid: true };
}

/**
 * Parse comma-separated suffixes and validate each
 */
export function parseSuffixes(suffixString) {
    if (!suffixString || !suffixString.trim()) {
        return { valid: true, suffixes: [] };
    }
    
    const suffixes = suffixString.split(',')
        .map(s => s.trim())
        .filter(s => s.length > 0);
    
    for (const suffix of suffixes) {
        const validation = validateSuffix(suffix);
        if (!validation.valid) {
            return { valid: false, invalidChar: validation.invalidChar, invalidSuffix: suffix };
        }
    }
    
    return { valid: true, suffixes };
}

/**
 * Worker Thread Code - RAW SPEED MODE
 * No mnemonic generation - pure Ed25519 keypair generation
 * Synchronous loop for maximum throughput
 */
if (!isMainThread && parentPort) {
    const { workerId, criteria, batchSize } = workerData;
    const { prefix, suffixes, matchCase } = criteria;
    
    // Pre-compute targets for fast comparison
    const targetPre = matchCase ? (prefix || '') : (prefix || '').toUpperCase();
    const targetSuffixes = (suffixes || []).map(s => matchCase ? s : s.toUpperCase());
    const hasPrefix = targetPre.length > 0;
    const hasSuffixes = targetSuffixes.length > 0;
    
    let localAttempts = 0;
    let running = true;
    let recentAddresses = [];
    
    parentPort.on('message', (msg) => {
        if (msg.type === 'stop') {
            running = false;
        }
    });
    
    // Synchronous mining loop for maximum speed
    function mineLoop() {
        const startTime = Date.now();
        const REPORT_INTERVAL = 5000; // Report every 5000 attempts for less overhead
        const RECENT_SAMPLE_RATE = 500; // Sample addresses less frequently
        
        while (running) {
            // Tight inner loop - no async, no await
            for (let i = 0; i < batchSize && running; i++) {
                // RAW SPEED: Generate keypair directly using Keypair.generate()
                // This uses tweetnacl internally and is highly optimized
                const kp = Keypair.generate();
                const pk = kp.publicKey.toBase58();
                
                localAttempts++;
                
                // Sample addresses occasionally for display (reduces overhead)
                if (localAttempts % RECENT_SAMPLE_RATE === 0) {
                    recentAddresses.push(pk);
                    if (recentAddresses.length > 5) {
                        recentAddresses.shift();
                    }
                }
                
                // Fast string comparison
                const checkPk = matchCase ? pk : pk.toUpperCase();
                
                // Check prefix match
                let prefixMatch = !hasPrefix;
                if (hasPrefix && checkPk.startsWith(targetPre)) {
                    prefixMatch = true;
                }
                
                // Early exit if prefix doesn't match and we need it
                if (!prefixMatch) continue;
                
                // Check suffix match (any of the provided suffixes)
                let suffixMatch = !hasSuffixes;
                let matchedSuffix = '';
                
                if (hasSuffixes) {
                    for (let j = 0; j < targetSuffixes.length; j++) {
                        if (checkPk.endsWith(targetSuffixes[j])) {
                            suffixMatch = true;
                            matchedSuffix = targetSuffixes[j];
                            break;
                        }
                    }
                }
                
                if (prefixMatch && suffixMatch) {
                    // FOUND! Report the match but DON'T STOP - continue mining
                    // secretKey is 64 bytes: first 32 = private key, last 32 = public key
                    parentPort.postMessage({
                        type: 'found', // Changed from 'success' to 'found' - doesn't stop mining
                        workerId,
                        address: pk,
                        // Standard Solana JSON wallet format (array of 64 bytes)
                        secretKeyArray: Array.from(kp.secretKey),
                        // Also provide hex format for display
                        secretKeyHex: Buffer.from(kp.secretKey).toString('hex'),
                        // Base58 encoded private key for Phantom import (full 64 bytes)
                        privateKeyBase58: bs58.encode(kp.secretKey),
                        matchedSuffix,
                        matchedPrefix: hasPrefix ? targetPre : '',
                        attempts: localAttempts,
                        foundAt: Date.now()
                    });
                    // Continue mining - don't stop!
                }
            }
            
            // Report progress periodically
            if (localAttempts % REPORT_INTERVAL === 0) {
                const elapsed = (Date.now() - startTime) / 1000;
                const speed = elapsed > 0 ? Math.floor(localAttempts / elapsed) : 0;
                
                parentPort.postMessage({
                    type: 'progress',
                    workerId,
                    attempts: localAttempts,
                    speed,
                    recentAddresses: recentAddresses.slice() // Copy array
                });
                
                // Clear recent addresses after sending
                recentAddresses.length = 0;
            }
            
            // Minimal yield - only check for stop messages
            // Use setImmediate sparingly to not kill performance
            if (localAttempts % 50000 === 0) {
                setImmediate(() => mineLoop());
                return;
            }
        }
        
        parentPort.postMessage({ type: 'stopped', workerId, attempts: localAttempts });
    }
    
    // Start the synchronous loop
    try {
        mineLoop();
    } catch (e) {
        parentPort.postMessage({ type: 'error', workerId, message: e.message });
    }
}

/**
 * VanityForge - Main Controller Class
 */
export class VanityForge {
    constructor(options = {}) {
        this.workers = [];
        this.isRunning = false;
        this.foundWallets = []; // Store all found wallets
        this.telemetry = {
            totalAttempts: 0,
            keysPerSecond: 0,
            activeWorkers: 0,
            startTime: null,
            speedHistory: [],
            workerStats: {},
            foundCount: 0
        };
        this.dataPath = options.dataPath || './forge_data';
        this.encryptionKey = options.encryptionKey || null;
        this.onProgress = options.onProgress || (() => {});
        this.onFound = options.onFound || (() => {}); // Called when wallet found (doesn't stop)
        this.onError = options.onError || (() => {});
    }
    
    /**
     * Encrypt sensitive data before storage
     */
    encrypt(data) {
        if (!this.encryptionKey) return JSON.stringify(data);
        
        const iv = crypto.randomBytes(16);
        const key = crypto.scryptSync(this.encryptionKey, 'solana-forge-salt', 32);
        const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
        
        let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
        encrypted += cipher.final('hex');
        const authTag = cipher.getAuthTag();
        
        return JSON.stringify({
            iv: iv.toString('hex'),
            authTag: authTag.toString('hex'),
            data: encrypted
        });
    }
    
    /**
     * Decrypt stored data
     */
    decrypt(encryptedStr) {
        if (!this.encryptionKey) return JSON.parse(encryptedStr);
        
        const { iv, authTag, data } = JSON.parse(encryptedStr);
        const key = crypto.scryptSync(this.encryptionKey, 'solana-forge-salt', 32);
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'hex'));
        decipher.setAuthTag(Buffer.from(authTag, 'hex'));
        
        let decrypted = decipher.update(data, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        
        return JSON.parse(decrypted);
    }
    
    /**
     * Save found wallet to encrypted storage
     * Now saves raw secretKey instead of mnemonic
     */
    async saveWallet(walletData) {
        try {
            await fs.mkdir(this.dataPath, { recursive: true });
            
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `wallet_${timestamp}.json`;
            const filepath = path.join(this.dataPath, filename);
            
            // Save in standard Solana wallet format
            const walletToSave = {
                address: walletData.address,
                secretKey: walletData.secretKeyArray, // Standard format: array of 64 bytes
                secretKeyHex: walletData.secretKeyHex, // Hex format for display
                foundAt: new Date().toISOString(),
                searchCriteria: this.currentCriteria,
                matchedSuffix: walletData.matchedSuffix,
                matchedPrefix: walletData.matchedPrefix,
                attempts: walletData.attempts,
                note: 'Import secretKey array into Phantom/Solflare or use with @solana/web3.js'
            };
            
            const encrypted = this.encrypt(walletToSave);
            await fs.writeFile(filepath, encrypted, 'utf-8');
            
            // Also save a Solana CLI compatible file (just the array)
            const cliFilepath = path.join(this.dataPath, `${walletData.address.substring(0, 8)}_keypair.json`);
            await fs.writeFile(cliFilepath, JSON.stringify(walletData.secretKeyArray), 'utf-8');
            
            return filepath;
        } catch (e) {
            console.error('Failed to save wallet:', e);
            return null;
        }
    }
    
    /**
     * Load all saved wallets
     */
    async loadWallets() {
        try {
            const files = await fs.readdir(this.dataPath);
            const wallets = [];
            
            for (const file of files) {
                if (file.startsWith('wallet_') && file.endsWith('.json')) {
                    const content = await fs.readFile(path.join(this.dataPath, file), 'utf-8');
                    wallets.push(this.decrypt(content));
                }
            }
            
            return wallets;
        } catch (e) {
            return [];
        }
    }
    
    /**
     * Start the parallel mining operation
     */
    async start(criteria) {
        if (this.isRunning) {
            await this.stop();
        }
        
        // Parse and validate suffixes
        const suffixResult = parseSuffixes(criteria.suffixString || criteria.suffix || '');
        if (!suffixResult.valid) {
            this.onError(`Invalid character '${suffixResult.invalidChar}' in suffix '${suffixResult.invalidSuffix}'. Use Base58 only.`);
            return false;
        }
        
        // Validate prefix
        if (criteria.prefix) {
            const validation = validateSuffix(criteria.prefix);
            if (!validation.valid) {
                this.onError(`Invalid character '${validation.invalidChar}' in prefix. Use Base58 only.`);
                return false;
            }
        }
        
        // Need at least one search criteria
        if (!criteria.prefix && suffixResult.suffixes.length === 0) {
            this.onError('Please enter a prefix or at least one suffix to search for.');
            return false;
        }
        
        this.isRunning = true;
        this.currentCriteria = { ...criteria, suffixes: suffixResult.suffixes };
        this.foundWallets = []; // Reset found wallets on new run
        this.telemetry = {
            totalAttempts: 0,
            keysPerSecond: 0,
            activeWorkers: 0,
            startTime: Date.now(),
            speedHistory: [],
            workerStats: {},
            recentAddresses: [],
            failedAttempts: 0,
            foundCount: 0,
            targetSuffixes: suffixResult.suffixes,
            targetPrefix: criteria.prefix || ''
        };
        
        // Worker count: user-specified or default to cores-1, minimum 1
        const maxWorkers = NUM_WORKERS;
        const requestedWorkers = criteria.workers || maxWorkers;
        const numWorkers = Math.max(1, Math.min(requestedWorkers, maxWorkers));
        
        // Larger batch size for raw speed mode
        const batchSize = criteria.batchSize || 1000;
        
        for (let i = 0; i < numWorkers; i++) {
            const worker = new Worker(__filename, {
                workerData: {
                    workerId: i,
                    criteria: {
                        prefix: criteria.prefix || '',
                        suffixes: suffixResult.suffixes,
                        matchCase: criteria.matchCase || false
                    },
                    batchSize
                }
            });
            
            this.telemetry.workerStats[i] = { attempts: 0, speed: 0 };
            
            worker.on('message', async (msg) => {
                if (msg.type === 'progress') {
                    this.telemetry.workerStats[msg.workerId] = {
                        attempts: msg.attempts,
                        speed: msg.speed,
                        recentAddresses: msg.recentAddresses || []
                    };
                    this.updateTelemetry();
                    this.onProgress(this.telemetry);
                    
                } else if (msg.type === 'found') {
                    // Wallet found! Save it but DON'T stop mining
                    const walletData = {
                        address: msg.address,
                        secretKeyArray: msg.secretKeyArray,
                        secretKeyHex: msg.secretKeyHex,
                        privateKeyBase58: msg.privateKeyBase58,
                        matchedSuffix: msg.matchedSuffix,
                        matchedPrefix: msg.matchedPrefix,
                        attempts: msg.attempts,
                        foundAt: msg.foundAt || Date.now()
                    };
                    
                    // Save to disk
                    const savedPath = await this.saveWallet(walletData);
                    walletData.savedPath = savedPath;
                    
                    // Add to found wallets list
                    this.foundWallets.push(walletData);
                    this.telemetry.foundCount = this.foundWallets.length;
                    
                    // Notify UI but DON'T stop
                    this.onFound({
                        ...walletData,
                        totalFound: this.foundWallets.length,
                        telemetry: this.telemetry
                    });
                    
                } else if (msg.type === 'error') {
                    this.onError(msg.message);
                }
            });
            
            worker.on('error', (err) => {
                console.error(`Worker ${i} error:`, err);
                this.telemetry.activeWorkers--;
            });
            
            worker.on('exit', () => {
                this.telemetry.activeWorkers = Math.max(0, this.telemetry.activeWorkers - 1);
            });
            
            this.workers.push(worker);
            this.telemetry.activeWorkers++;
        }
        
        return true;
    }
    
    /**
     * Update aggregated telemetry from all workers
     */
    updateTelemetry() {
        let totalAttempts = 0;
        let totalSpeed = 0;
        let allRecentAddresses = [];
        
        for (const stats of Object.values(this.telemetry.workerStats)) {
            totalAttempts += stats.attempts;
            totalSpeed += stats.speed;
            if (stats.recentAddresses) {
                allRecentAddresses = allRecentAddresses.concat(stats.recentAddresses);
            }
        }
        
        this.telemetry.totalAttempts = totalAttempts;
        this.telemetry.keysPerSecond = totalSpeed;
        this.telemetry.activeWorkers = this.workers.length;
        this.telemetry.failedAttempts = totalAttempts;
        
        // Keep only the most recent addresses
        this.telemetry.recentAddresses = allRecentAddresses.slice(-10);
        
        // Record speed history for graphing
        this.telemetry.speedHistory.push({
            time: Date.now(),
            speed: totalSpeed
        });
        
        if (this.telemetry.speedHistory.length > 60) {
            this.telemetry.speedHistory.shift();
        }
    }
    
    /**
     * Stop all workers
     */
    async stop() {
        this.isRunning = false;
        
        for (const worker of this.workers) {
            worker.postMessage({ type: 'stop' });
        }
        
        await new Promise(resolve => setTimeout(resolve, 100));
        
        for (const worker of this.workers) {
            await worker.terminate();
        }
        
        this.workers = [];
        this.telemetry.activeWorkers = 0;
    }
    
    /**
     * Get current telemetry snapshot
     */
    getTelemetry() {
        return { ...this.telemetry };
    }
    
    /**
     * Get all found wallets
     */
    getFoundWallets() {
        return [...this.foundWallets];
    }
    
    /**
     * Clear found wallets list (but keeps saved files)
     */
    clearFoundWallets() {
        this.foundWallets = [];
        this.telemetry.foundCount = 0;
    }
}

/**
 * Check wallet balance via Solana RPC (Treasure Hunt mode)
 */
export async function checkWalletBalance(address, rpcUrl = 'https://api.mainnet-beta.solana.com') {
    try {
        const response = await fetch(rpcUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'getBalance',
                params: [address]
            })
        });
        
        const data = await response.json();
        if (data.result && data.result.value !== undefined) {
            return {
                address,
                balance: data.result.value / 1e9,
                hasBalance: data.result.value > 0
            };
        }
        
        return { address, balance: 0, hasBalance: false, error: data.error?.message };
    } catch (e) {
        return { address, balance: 0, hasBalance: false, error: e.message };
    }
}

export { NUM_WORKERS };
export default VanityForge;
