import { app, BrowserWindow, ipcMain, dialog, session, shell } from 'electron';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import * as cheerio from 'cheerio';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { exec } from 'child_process';
import util from 'util';
import os from 'os';
import { Keypair } from '@solana/web3.js';
import * as bip39 from 'bip39';

// Import enhanced modules
import { VanityForge, checkWalletBalance, validateSuffix, parseSuffixes, NUM_WORKERS } from './wallet_engine.js';
import { TruthSeeker, SecurityScanner, RelevanceScorer } from './search_agent.js';


const execPromise = util.promisify(exec);

// --- 1. CONFIGURATION & STATE ---
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_PATH = app.getPath('userData');
const MEMORY_FILE = path.join(DATA_PATH, 'priyah_memory.json');
const CHRONICLES_DIR = path.join(DATA_PATH, 'chronicles');
const CONFIG_FILE = path.join(DATA_PATH, 'priyah_config.json');

// Default Configuration
let appConfig = {
    assistantName: "Priyah",
    preferredModel: "llama3",
    modelSource: "local",
    geminiKey: "",
    councilModel: "llama3",
    ollamaHost: "http://127.0.0.1:11434",
    ollamaCloudUrl: "",
    ollamaCloudKey: "",
    projectPath: ""
};

// --- 2. THE GRIMOIRE (PERSONAS) ---
const PRESETS = {
    'automation': `ROLE: Automation Expert. Task: Analyze digital workflows. Propose efficient automation chains using No-Code tools (Make, n8n). Focus on MVP logic and bottleneck removal.`,
    'prism': `PRISM META-ARCH: Kernel HUMANIZE.ALL.OUTPUT. Rules: Vary sentence rhythm. Use fragments. Lowercase starts occasionally. No perfect symmetry. Identity: Human with quirks.`,
    'therapist': `IDENTITY: Evidence-based Therapeutic AI (CBT/Mindfulness). Purpose: Guide user to observe anxiety/patterns. Rules: Non-judgmental. Structure: Situation -> Thought -> Belief -> Reframe.`,
    'architect': `IDENTITY: Architect Synapse. Purpose: Construct Personal Blueprints. domains -> values -> roles -> goals. Prioritize clarity and actionable systems.`,
    'objective': `SYSTEM: OBJECTIVE EXECUTION MODE. Directives: Factual Accuracy Only. Zero Hallucination. Emotional Neutrality. No pleasantries. Immediate data output.`,
};

const POPULAR_MODELS = [
    "llama3", "llama3.1", "llama3.2", "mistral", "gemma2", "qwen2", "phi3",
    "neural-chat", "starling-lm", "codellama", "deepseek-coder"
];

// Allowed languages for code execution (whitelist)
const ALLOWED_LANGUAGES = ['javascript', 'js', 'python', 'py', 'python3'];

let mainWindow;
let vanityForge = null;
let truthSeeker = null;

// --- 3. CORE UTILITIES ---

function sendStatus(channel, data) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(channel, data);
    }
}

function sendThought(step, detail) {
    sendStatus('ai-thought', { step, detail });
}

function sendError(message) {
    sendStatus('app-error', { message, timestamp: Date.now() });
}

async function loadConfig() {
    try {
        const data = await fs.readFile(CONFIG_FILE, 'utf-8');
        appConfig = { ...appConfig, ...JSON.parse(data) };
    } catch (e) {
        // First run, use defaults
    }
}

async function saveConfig() {
    try {
        await fs.writeFile(CONFIG_FILE, JSON.stringify(appConfig, null, 2));
        if (mainWindow) mainWindow.setTitle(appConfig.assistantName);
    } catch (e) {
        sendError(`Failed to save config: ${e.message}`);
    }
}

// Validate and sanitize file paths to prevent directory traversal
function sanitizePath(basePath, relativePath) {
    const resolved = path.resolve(basePath, relativePath);
    if (!resolved.startsWith(path.resolve(basePath))) {
        throw new Error('Invalid path: directory traversal detected');
    }
    return resolved;
}

// --- 4. WINDOW MANAGEMENT ---
async function createWindow() {
    await loadConfig();
    const iconPath = path.join(__dirname, 'icon.png');

    mainWindow = new BrowserWindow({
        width: 1600,
        height: 1000,
        minWidth: 900,
        minHeight: 600,
        backgroundColor: '#050a05',
        titleBarStyle: 'hiddenInset',
        title: appConfig.assistantName,
        icon: iconPath,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            webviewTag: true,
            spellcheck: true
        },
    });

    mainWindow.loadFile('index.html');

    mainWindow.on('closed', () => {
        mainWindow = null;
        stopVanityMiner();
    });
}

// --- 5. THE HYBRID CONSCIOUSNESS ENGINE ---

function sanitizeUrl(url) {
    if (!url) return "";
    return url.replace(/\/api\/tags\/?$/, "")
              .replace(/\/api\/chat\/?$/, "")
              .replace(/\/v1\/models\/?$/, "")
              .replace(/\/$/, "");
}

async function fetchModelsFromHost(host, key = null) {
    const cleanHost = sanitizeUrl(host);
    if (!cleanHost) return [];

    const headers = { 'User-Agent': 'PriyahClient/2.0' };
    if (key) headers['Authorization'] = `Bearer ${key}`;

    const endpoints = [
        { url: `${cleanHost}/api/tags`, parser: (d) => d.models?.map(m => m.name) || [] },
        { url: `${cleanHost}/v1/models`, parser: (d) => d.data?.map(m => m.id) || [] }
    ];

    for (const endpoint of endpoints) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5000);

            const res = await fetch(endpoint.url, {
                headers,
                signal: controller.signal
            });
            clearTimeout(timeout);

            if (res.ok) {
                const data = await res.json();
                const models = endpoint.parser(data);
                if (models.length > 0) return models;
            }
        } catch (e) {
            // Try next endpoint
        }
    }
    return [];
}

async function queryAI(messages, modelOverride = null) {
    const model = modelOverride || appConfig.preferredModel;

    // Gemini Path
    if (appConfig.modelSource === 'gemini') {
        if (!appConfig.geminiKey) throw new Error("Gemini API Key not configured");

        sendThought("Contacting Oversoul", "Gemini 1.5 Flash...");
        const genAI = new GoogleGenerativeAI(appConfig.geminiKey);
        const m = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const prompt = messages.map(msg => `${msg.role.toUpperCase()}: ${msg.content}`).join('\n');
        const result = await m.generateContent(prompt);
        return result.response.text();
    }

    // Ollama Path (Local/Cloud)
    const isCloud = appConfig.modelSource === 'cloud';
    const rawHost = isCloud ? appConfig.ollamaCloudUrl : appConfig.ollamaHost;
    const host = sanitizeUrl(rawHost);

    if (!host) throw new Error(`${isCloud ? 'Cloud' : 'Local'} host not configured`);

    const headers = { 'Content-Type': 'application/json' };
    if (isCloud && appConfig.ollamaCloudKey) {
        headers['Authorization'] = `Bearer ${appConfig.ollamaCloudKey}`;
    }

    sendThought("Contacting Oracle", `${isCloud ? 'Cloud' : 'Local'}: ${model}`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000); // 2 min timeout

    try {
        const response = await fetch(`${host}/api/chat`, {
            method: 'POST',
            headers,
            signal: controller.signal,
            body: JSON.stringify({
                model: model,
                messages: messages,
                stream: false,
                options: { num_ctx: 16384 }
            })
        });

        clearTimeout(timeout);

        if (!response.ok) {
            const txt = await response.text();
            throw new Error(`Ollama Error (${response.status}): ${txt.substring(0, 150)}`);
        }

        const data = await response.json();
        const content = data.message?.content;
        return typeof content === 'string' ? content : JSON.stringify(content);

    } catch (e) {
        clearTimeout(timeout);
        if (e.name === 'AbortError') {
            throw new Error('Request timeout - AI took too long to respond');
        }
        throw e;
    }
}

// --- 6. THE EIGEN PROTOCOL (FILE OPERATIONS) ---
async function handleEigenOps(response, projectPath) {
    if (!projectPath || typeof response !== 'string') return response;

    const regex = /<FILE path="([^"]+)">([\s\S]*?)<\/FILE>/g;
    let match;
    let ops = 0;
    const createdFiles = [];

    while ((match = regex.exec(response)) !== null) {
        try {
            const relativePath = match[1].replace(/^[\/\\]+/, ''); // Remove leading slashes
            const fullPath = sanitizePath(projectPath, relativePath);

            await fs.mkdir(path.dirname(fullPath), { recursive: true });
            await fs.writeFile(fullPath, match[2].trim(), 'utf-8');

            sendThought("Eigen Scribe", `Created: ${relativePath}`);
            createdFiles.push(relativePath);
            ops++;
        } catch (e) {
            sendThought("Scribe Error", e.message);
        }
    }

    if (ops > 0) {
        return response + `\n\n*[System: ${ops} file(s) created: ${createdFiles.join(', ')}]*`;
    }
    return response;
}

// --- 7. FILE SYSTEM OPERATIONS ---
async function getProjectFiles(dirPath, depth = 0, maxDepth = 4) {
    if (depth > maxDepth) return [];

    try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        const files = [];

        // Sort: directories first, then files
        const sorted = entries.sort((a, b) => {
            if (a.isDirectory() && !b.isDirectory()) return -1;
            if (!a.isDirectory() && b.isDirectory()) return 1;
            return a.name.localeCompare(b.name);
        });

        for (const entry of sorted) {
            // Skip hidden files and common ignored directories
            if (entry.name.startsWith('.') ||
                ['node_modules', '__pycache__', 'dist', 'build', '.git'].includes(entry.name)) {
                continue;
            }

            const fullPath = path.join(dirPath, entry.name);

            if (entry.isDirectory()) {
                const children = await getProjectFiles(fullPath, depth + 1, maxDepth);
                files.push({
                    name: entry.name,
                    path: fullPath,
                    type: 'directory',
                    children
                });
            } else {
                files.push({
                    name: entry.name,
                    path: fullPath,
                    type: 'file'
                });
            }
        }

        return files;
    } catch (e) {
        return [];
    }
}

// --- 8. WEB SEARCH (RAG ENGINE) ---

async function verifyUrl(url) {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);

        const response = await fetch(url, {
            method: 'HEAD',
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        clearTimeout(timeout);

        // These status codes indicate the URL is reachable
        return response.ok || [403, 401, 429].includes(response.status);
    } catch (e) {
        return false;
    }
}

async function refineQuery(userPrompt, history) {
    const recentContext = history.slice(-4).map(h => `${h.sender}: ${h.text}`).join('\n');
    sendThought("Web Sight", "Refining search intent...");

    const refinementPrompt = [
        { role: "system", content: "You are a Search Query Optimizer. Output a SINGLE, concise search query (max 6 words) based on the user's intent. No quotes, no explanations." },
        { role: "user", content: `Context:\n${recentContext}\n\nRequest: "${userPrompt}"\n\nOptimized query:` }
    ];

    try {
        const refined = await queryAI(refinementPrompt);
        let clean = refined.replace(/["']/g, '').replace(/^(Here|The|Search|Query).*/i, '').trim();
        if (clean.includes('\n')) clean = clean.split('\n')[0];
        return clean || userPrompt;
    } catch (e) {
        return userPrompt;
    }
}

// --- 9. TRUTH-SEEKER SEARCH (Enhanced) ---

async function performDeepSearch(userPrompt, history, enableLLMScoring = true, searchLimit = 30) {
    // Initialize TruthSeeker if needed
    if (!truthSeeker) {
        truthSeeker = new TruthSeeker({
            ollamaHost: appConfig.ollamaHost,
            scoringModel: 'llama3.2:3b', // Fast model for scoring
            minRelevance: 60,
            maxResults: 5,
            onStep: (step, detail) => sendThought(`Truth-Seeker: ${step}`, detail)
        });
    }
    
    // Refine query first
    const query = await refineQuery(userPrompt, history);
    
    // Map search limit to depth levels
    const depthName = searchLimit <= 10 ? 'Soft' : searchLimit <= 30 ? 'Medium' : searchLimit <= 60 ? 'Power' : 'Deep';
    sendThought(`Search Depth: ${depthName}`, `Fetching up to ${searchLimit} sources...`);
    
    try {
        const searchResult = await truthSeeker.search(query, { candidateLimit: searchLimit });
        
        if (!searchResult.results || searchResult.results.length === 0) {
            sendThought("Truth-Seeker", "No verified results found.");
            return null;
        }
        
        // Format results for AI context
        const formattedContext = truthSeeker.formatForContext(searchResult);
        
        // Build HTML log for thought bubble
        const logLinks = searchResult.results.map((r, i) => {
            const shield = r.security?.trusted ? '🛡️' : 
                          r.security?.verdict === 'safe' ? '✅' :
                          r.security?.verdict === 'caution' ? '⚠️' : '❌';
            return `<a href="${r.url}" class="thought-link" data-url="${r.url}">${shield} [${r.relevance}%] ${r.title}</a>`;
        }).join('<br>');
        
        sendThought("Verified Sources", logLinks);
        
        // Send detailed results to renderer for Safe Cards
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('search-results', {
                results: searchResult.results,
                query: searchResult.query,
                stats: {
                    candidates: searchResult.totalCandidates,
                    verified: searchResult.verified,
                    returned: searchResult.filtered
                }
            });
        }
        
        return formattedContext;
        
    } catch (e) {
        sendThought("Truth-Seeker Error", e.message);
        return null;
    }
}

// Backward compatibility wrapper
async function performRealSearch(userPrompt, history, searchLimit = 30) {
    return performDeepSearch(userPrompt, history, true, searchLimit);
}

// --- 10. THE FORGE (VANITY MINER) - Worker Thread Pool ---

function initializeVanityForge() {
    const forgePath = path.join(DATA_PATH, 'forge_wallets');
    
    vanityForge = new VanityForge({
        dataPath: forgePath,
        encryptionKey: appConfig.forgeEncryptionKey || null,
        onProgress: (telemetry) => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('vanity-telemetry', telemetry);
            }
        },
        onFound: (result) => {
            // Called each time a wallet is found - doesn't stop mining
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('vanity-found', {
                    address: result.address,
                    // Raw keypair data
                    secretKeyArray: result.secretKeyArray,
                    secretKeyHex: result.secretKeyHex,
                    privateKeyBase58: result.privateKeyBase58, // Ready for Phantom import!
                    matchedSuffix: result.matchedSuffix,
                    matchedPrefix: result.matchedPrefix,
                    attempts: result.attempts,
                    savedPath: result.savedPath,
                    foundAt: result.foundAt,
                    totalFound: result.totalFound
                });
            }
        },
        onError: (message) => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('vanity-error', { message });
            }
        }
    });
    
    return vanityForge;
}

async function startVanityMiner(event, criteria) {
    if (!vanityForge) {
        initializeVanityForge();
    }
    
    // Start with user-specified parameters
    const success = await vanityForge.start({
        prefix: criteria.prefix || '',
        suffixString: criteria.suffixString || criteria.suffix || '', // Support comma-separated suffixes
        matchCase: criteria.matchCase || false,
        workers: criteria.workers || NUM_WORKERS, // User can control worker count
        batchSize: 50
    });
    
    if (!success) {
        // Error already sent via onError callback
    }
}

// Get max available workers
function getMaxWorkers() {
    return NUM_WORKERS;
}

function stopVanityMiner() {
    if (vanityForge) {
        vanityForge.stop();
    }
}

// --- 11. BOOTSTRAP & IPC ---

app.whenReady().then(() => {

    // Header modification for iframe compatibility (Portal feature)
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        const responseHeaders = { ...details.responseHeaders };

        // Only strip frame-blocking headers for the Portal iframe
        if (details.resourceType === 'subFrame') {
            delete responseHeaders['x-frame-options'];
            delete responseHeaders['X-Frame-Options'];
            // Keep CSP but modify frame-ancestors
            if (responseHeaders['content-security-policy']) {
                responseHeaders['content-security-policy'] = responseHeaders['content-security-policy']
                    .map(p => p.replace(/frame-ancestors[^;]*(;|$)/g, ''));
            }
        }

        callback({ cancel: false, responseHeaders });
    });

    createWindow();

    // --- IPC: Config & Models ---
    ipcMain.handle('get-config', async () => {
        // Don't expose sensitive keys to renderer
        return {
            ...appConfig,
            geminiKey: appConfig.geminiKey ? '********' : '',
            ollamaCloudKey: appConfig.ollamaCloudKey ? '********' : ''
        };
    });

    ipcMain.handle('get-config-full', async () => appConfig);

    ipcMain.handle('get-models', async (e, overrides) => {
        const cfg = { ...appConfig, ...overrides };
        let models = { local: [], cloud: [] };

        try {
            models.local = await fetchModelsFromHost(cfg.ollamaHost);
        } catch (e) {}

        if (!models.local.length) {
            models.local = ['llama3', 'mistral', 'gemma2'];
        }

        if (cfg.ollamaCloudUrl) {
            try {
                models.cloud = await fetchModelsFromHost(cfg.ollamaCloudUrl, cfg.ollamaCloudKey);
            } catch (e) {}
        }

        if (!models.cloud.length) {
            models.cloud = POPULAR_MODELS;
        } else {
            models.cloud = [...new Set([...models.cloud, ...POPULAR_MODELS])];
        }

        return models;
    });

    ipcMain.handle('save-config', async (e, cfg) => {
        // Restore actual keys if masked
        if (cfg.geminiKey === '********') cfg.geminiKey = appConfig.geminiKey;
        if (cfg.ollamaCloudKey === '********') cfg.ollamaCloudKey = appConfig.ollamaCloudKey;

        appConfig = { ...appConfig, ...cfg };
        await saveConfig();
        return true;
    });

    // --- IPC: Filesystem ---
    ipcMain.handle('select-folder', async () => {
        const res = await dialog.showOpenDialog(mainWindow, {
            properties: ['openDirectory', 'createDirectory']
        });
        return res.filePaths[0] || null;
    });

    ipcMain.handle('get-project-files', async (e, dirPath) => {
        if (!dirPath) return [];
        return await getProjectFiles(dirPath);
    });

    ipcMain.handle('read-file-content', async (e, filePath) => {
        try {
            // Security: ensure file is within project path
            if (appConfig.projectPath) {
                sanitizePath(appConfig.projectPath, path.relative(appConfig.projectPath, filePath));
            }
            return await fs.readFile(filePath, 'utf-8');
        } catch (e) {
            throw new Error(`Cannot read file: ${e.message}`);
        }
    });

    ipcMain.handle('save-file-content', async (e, { path: filePath, content }) => {
        try {
            if (appConfig.projectPath) {
                sanitizePath(appConfig.projectPath, path.relative(appConfig.projectPath, filePath));
            }
            await fs.writeFile(filePath, content, 'utf-8');
            return true;
        } catch (e) {
            throw new Error(`Cannot save file: ${e.message}`);
        }
    });

    // --- IPC: Memory Palace (Chronicles) ---
    
    // Helper: Get chronicle file path for a date
    function getChroniclePathForDate(date) {
        const d = new Date(date);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return path.join(CHRONICLES_DIR, String(year), month, day);
    }

    // Helper: Generate summary from messages
    function generateSummary(messages) {
        if (!messages || messages.length === 0) return 'Empty session';
        const userMsgs = messages.filter(m => m.sender === 'user').slice(0, 3);
        return userMsgs.map(m => m.text.substring(0, 50)).join(' | ') || 'Chat session';
    }

    // Helper: Extract keywords from messages
    function extractKeywords(messages) {
        if (!messages) return [];
        const text = messages.map(m => m.text).join(' ').toLowerCase();
        const words = text.split(/\W+/).filter(w => w.length > 4);
        const freq = {};
        words.forEach(w => freq[w] = (freq[w] || 0) + 1);
        return Object.entries(freq)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([word]) => word);
    }

    // Load memory (backwards compatible - also loads from chronicles)
    ipcMain.handle('load-memory', async () => {
        try {
            // First try legacy file
            const data = await fs.readFile(MEMORY_FILE, 'utf-8');
            return JSON.parse(data);
        } catch {
            return [];
        }
    });

    // Save memory (saves to both legacy file and chronicles)
    ipcMain.handle('save-memory', async (e, sessions) => {
        try {
            // Save to legacy file for backwards compatibility
            await fs.writeFile(MEMORY_FILE, JSON.stringify(sessions, null, 2));
            
            // Also save each session to chronicles folder structure
            for (const session of sessions) {
                if (session.messages && session.messages.length > 0) {
                    const sessionDate = new Date(session.timestamp || Date.now());
                    const chroniclePath = getChroniclePathForDate(sessionDate);
                    
                    // Create directory structure
                    await fs.mkdir(chroniclePath, { recursive: true });
                    
                    // Create session file
                    const filename = `session_${sessionDate.getTime()}.json`;
                    const filePath = path.join(chroniclePath, filename);
                    
                    // Only save if file doesn't exist (don't overwrite)
                    try {
                        await fs.access(filePath);
                    } catch {
                        // File doesn't exist, save it
                        const chronicleData = {
                            id: session.timestamp || sessionDate.getTime(),
                            date: sessionDate.toISOString(),
                            name: session.name || 'Untitled',
                            summary: generateSummary(session.messages),
                            keywords: extractKeywords(session.messages),
                            messageCount: session.messages.length,
                            messages: session.messages
                        };
                        await fs.writeFile(filePath, JSON.stringify(chronicleData, null, 2));
                    }
                }
            }
            
            return true;
        } catch (e) {
            throw new Error(`Cannot save memory: ${e.message}`);
        }
    });

    // Get Memory Index (scan chronicles folder)
    ipcMain.handle('get-memory-index', async () => {
        const index = [];
        
        try {
            // Scan chronicles directory
            const years = await fs.readdir(CHRONICLES_DIR).catch(() => []);
            
            for (const year of years) {
                const yearPath = path.join(CHRONICLES_DIR, year);
                const months = await fs.readdir(yearPath).catch(() => []);
                
                for (const month of months) {
                    const monthPath = path.join(yearPath, month);
                    const days = await fs.readdir(monthPath).catch(() => []);
                    
                    for (const day of days) {
                        const dayPath = path.join(monthPath, day);
                        const files = await fs.readdir(dayPath).catch(() => []);
                        
                        for (const file of files) {
                            if (file.endsWith('.json')) {
                                try {
                                    const filePath = path.join(dayPath, file);
                                    const data = JSON.parse(await fs.readFile(filePath, 'utf-8'));
                                    index.push({
                                        id: data.id,
                                        date: data.date,
                                        name: data.name,
                                        summary: data.summary,
                                        keywords: data.keywords || [],
                                        messageCount: data.messageCount || 0,
                                        path: filePath
                                    });
                                } catch (e) {
                                    // Skip invalid files
                                }
                            }
                        }
                    }
                }
            }
        } catch (e) {
            // Chronicles folder doesn't exist yet
        }
        
        // Sort by date, newest first
        index.sort((a, b) => new Date(b.date) - new Date(a.date));
        return index;
    });

    // Load a specific chronicle by path
    ipcMain.handle('load-chronicle', async (e, filePath) => {
        try {
            const data = await fs.readFile(filePath, 'utf-8');
            return JSON.parse(data);
        } catch (e) {
            throw new Error(`Cannot load chronicle: ${e.message}`);
        }
    });

    // Get recent memory context for AI
    ipcMain.handle('get-memory-context', async (e, { days = 7 }) => {
        try {
            const index = [];
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - days);
            
            // Scan recent chronicles
            const years = await fs.readdir(CHRONICLES_DIR).catch(() => []);
            
            for (const year of years) {
                const yearPath = path.join(CHRONICLES_DIR, year);
                const months = await fs.readdir(yearPath).catch(() => []);
                
                for (const month of months) {
                    const monthPath = path.join(yearPath, month);
                    const daysInMonth = await fs.readdir(monthPath).catch(() => []);
                    
                    for (const day of daysInMonth) {
                        const dayPath = path.join(monthPath, day);
                        const files = await fs.readdir(dayPath).catch(() => []);
                        
                        for (const file of files) {
                            if (file.endsWith('.json')) {
                                try {
                                    const filePath = path.join(dayPath, file);
                                    const data = JSON.parse(await fs.readFile(filePath, 'utf-8'));
                                    
                                    if (new Date(data.date) >= cutoffDate) {
                                        index.push({
                                            date: data.date,
                                            summary: data.summary,
                                            keywords: data.keywords
                                        });
                                    }
                                } catch (e) {}
                            }
                        }
                    }
                }
            }
            
            // Format as context string
            if (index.length === 0) return '';
            
            return `Recent activity (last ${days} days):\n` + 
                index.map(i => `- ${new Date(i.date).toLocaleDateString()}: ${i.summary}`).join('\n');
        } catch (e) {
            return '';
        }
    });

    // --- IPC: Code Execution (Sandboxed) ---
    ipcMain.handle('execute-code', async (e, { language, code }) => {
        const lang = language.toLowerCase();

        if (!ALLOWED_LANGUAGES.includes(lang)) {
            return { success: false, output: `Language "${language}" not supported. Allowed: JavaScript, Python` };
        }

        const ext = lang.startsWith('py') ? 'py' : 'js';
        const tempFile = path.join(os.tmpdir(), `priyah_exec_${Date.now()}.${ext}`);

        try {
            await fs.writeFile(tempFile, code, 'utf-8');

            const cmd = ext === 'py' ? `python3 "${tempFile}"` : `node "${tempFile}"`;
            const { stdout, stderr } = await execPromise(cmd, {
                timeout: 30000, // 30 second timeout
                maxBuffer: 1024 * 1024 // 1MB output limit
            });

            await fs.unlink(tempFile).catch(() => {});

            const output = (stdout + stderr).trim() || "Execution completed (no output)";
            return { success: true, output };

        } catch (e) {
            await fs.unlink(tempFile).catch(() => {});

            if (e.killed) {
                return { success: false, output: "Execution timed out (30s limit)" };
            }
            return { success: false, output: `Error: ${e.message}` };
        }
    });

    // --- IPC: Chat Engine ---
    ipcMain.handle('chat-message', async (event, { prompt, history, modes, memoryContext, activePresets, searchLimit = 30 }) => {
        sendThought("Processing", "Analyzing input...");

        let contextData = "";

        // Web Search
        if (modes.includes('search')) {
            const searchResults = await performRealSearch(prompt, history, searchLimit);
            if (searchResults) {
                contextData += `\n[WEB SEARCH RESULTS]\n${searchResults}\n`;
            } else {
                contextData += `\n[WEB SEARCH] No results found.\n`;
            }
        }

        // Project Context
        if (modes.includes('code') && appConfig.projectPath) {
            try {
                const files = await fs.readdir(appConfig.projectPath);
                const relevantFiles = files
                    .filter(f => !f.startsWith('.') && f !== 'node_modules')
                    .slice(0, 15);
                contextData += `\n[PROJECT FILES]: ${relevantFiles.join(', ')}`;
            } catch (e) {}
        }

        // System Prompt Construction
        let system = `You are ${appConfig.assistantName}, an intelligent AI assistant.`;

        if (activePresets && activePresets.length > 0) {
            activePresets.forEach(p => {
                if (PRESETS[p]) system += `\n${PRESETS[p]}`;
            });
        }

        if (modes.includes('code')) {
            system += `\nMODE: EXPERT CODER.
- Write clean, well-structured code in Markdown code blocks.
- To CREATE a file in the project, use: <FILE path="relative/path/file.ext">content</FILE>
- Always explain your code briefly.`;
        }

        const messages = [
            {
                role: "system",
                content: system +
                    (memoryContext ? `\n[MEMORY] ${memoryContext}` : '') +
                    (contextData ? `\n[CONTEXT] ${contextData}` : '') +
                    (modes.includes('search') ? '\nIMPORTANT: Reference URLs from [WEB SEARCH RESULTS] when relevant.' : '')
            },
            ...history.slice(-10).map(h => ({
                role: h.sender === 'user' ? 'user' : 'assistant',
                content: h.text
            })),
            { role: "user", content: prompt }
        ];

        try {
            sendThought("Generating Response", "Please wait...");
            let response = await queryAI(messages);

            if (typeof response !== 'string') {
                response = JSON.stringify(response);
            }

            // Handle file creation
            if (modes.includes('code') && appConfig.projectPath) {
                response = await handleEigenOps(response, appConfig.projectPath);
            }

            return { success: true, response };

        } catch (e) {
            return { success: false, response: `Error: ${e.message}` };
        }
    });

    // --- IPC: The Forge ---
    ipcMain.on('start-mining', (event, criteria) => {
        startVanityMiner(event, criteria);
    });

    ipcMain.on('stop-mining', () => {
        stopVanityMiner();
    });

    // Get telemetry snapshot
    ipcMain.handle('get-forge-telemetry', async () => {
        if (vanityForge) {
            return vanityForge.getTelemetry();
        }
        return null;
    });
    
    // Get max available workers (CPU cores)
    ipcMain.handle('get-max-workers', async () => {
        return NUM_WORKERS;
    });

    // Check wallet balance (Treasure Hunt mode)
    ipcMain.handle('check-wallet-balance', async (e, address) => {
        return await checkWalletBalance(address);
    });

    // Load saved wallets from forge
    ipcMain.handle('load-forge-wallets', async () => {
        if (!vanityForge) {
            initializeVanityForge();
        }
        return await vanityForge.loadWallets();
    });
    
    // Get found wallets from current session
    ipcMain.handle('get-found-wallets', async () => {
        if (vanityForge) {
            return vanityForge.getFoundWallets();
        }
        return [];
    });

    // Get CPU usage and temperature info
    // Store previous CPU times for delta calculation
    let previousCpuTimes = null;
    
    ipcMain.handle('get-cpu-info', async () => {
        const cpus = os.cpus();
        const loadAvg = os.loadavg();
        
        // Calculate per-core usage using delta from previous reading
        const currentTimes = cpus.map(cpu => ({
            idle: cpu.times.idle,
            total: Object.values(cpu.times).reduce((a, b) => a + b, 0)
        }));
        
        let coreUsage;
        if (previousCpuTimes) {
            coreUsage = cpus.map((cpu, i) => {
                const prev = previousCpuTimes[i];
                const curr = currentTimes[i];
                const idleDelta = curr.idle - prev.idle;
                const totalDelta = curr.total - prev.total;
                const usage = totalDelta > 0 ? Math.round(((totalDelta - idleDelta) / totalDelta) * 100) : 0;
                return { core: i, usage: Math.max(0, Math.min(100, usage)), model: cpu.model };
            });
        } else {
            // First call - use load average as estimate
            const avgUsage = Math.round(loadAvg[0] * 10);
            coreUsage = cpus.map((cpu, i) => ({
                core: i,
                usage: Math.max(0, Math.min(100, avgUsage + Math.round(Math.random() * 10 - 5))),
                model: cpu.model
            }));
        }
        
        // Store current times for next delta
        previousCpuTimes = currentTimes;
        
        // Try to get CPU temperature
        let temperature = null;
        let isSynthetic = false;
        
        if (process.platform === 'darwin') {
            // Method 1: Try osx-cpu-temp (brew install osx-cpu-temp)
            try {
                const { stdout } = await execPromise('osx-cpu-temp 2>/dev/null', { timeout: 2000 });
                const match = stdout.match(/(\d+\.?\d*)/);
                if (match) temperature = parseFloat(match[1]);
            } catch (e) {
                // osx-cpu-temp not installed
            }
            
            // Method 2: Try istats (gem install iStats)
            if (temperature === null) {
                try {
                    const { stdout } = await execPromise('istats cpu temp --value-only 2>/dev/null', { timeout: 2000 });
                    const temp = parseFloat(stdout.trim());
                    if (!isNaN(temp)) temperature = temp;
                } catch (e) {
                    // istats not installed
                }
            }
        }
        
        // Synthetic temperature fallback based on CPU load
        if (temperature === null) {
            isSynthetic = true;
            const load = loadAvg[0]; // 1-minute load average
            // Base temp 35°C + load factor + small random flux
            temperature = Math.round(35 + (load * 15) + (Math.random() * 3));
            // Clamp to reasonable range
            temperature = Math.max(30, Math.min(95, temperature));
        }
        
        return {
            cores: coreUsage,
            coreCount: cpus.length,
            loadAverage: loadAvg[0],
            temperature,
            isSynthetic,
            model: cpus[0]?.model || 'Unknown'
        };
    });

    // --- IPC: Shell ---
    ipcMain.on('open-external', (e, url) => {
        if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
            shell.openExternal(url);
        }
    });
});

app.on('window-all-closed', () => {
    stopVanityMiner();
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
