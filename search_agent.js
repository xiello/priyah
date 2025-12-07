/**
 * TRUTH-SEEKER v2.0 - Deep Verification Search Agent
 * Multi-stage pipeline: Fetch (Paginated) → Pre-Score → Verify → Scrape → Score
 * 
 * Upgrades:
 * - Pagination support (up to 50 results from multiple DuckDuckGo pages)
 * - Pre-scoring phase using keyword matching on title+snippet
 * - Concurrency control for verification (chunked processing)
 * - Depth and preFiltered metrics
 * 
 * GHOST & SHIELD v1.0:
 * - User-Agent rotation pool (never reuse sequentially)
 * - Privacy headers (DNT, Sec-GPC)
 * - Ad/Tracker domain blocklist
 * - Memory wiping after searches
 */

import * as cheerio from 'cheerio';

// ============================================
// GHOST PROTOCOL - User Agent Rotation
// ============================================
const USER_AGENT_POOL = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.1; rv:121.0) Gecko/20100101 Firefox/121.0'
];

let lastUserAgentIndex = -1;

function getRandomUserAgent() {
    let index;
    do {
        index = Math.floor(Math.random() * USER_AGENT_POOL.length);
    } while (index === lastUserAgentIndex && USER_AGENT_POOL.length > 1);
    lastUserAgentIndex = index;
    return USER_AGENT_POOL[index];
}

// Privacy headers for all requests
const PRIVACY_HEADERS = {
    'DNT': '1',
    'Sec-GPC': '1',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache'
};

// ============================================
// AEGIS SHIELD - Ad/Tracker Blocklist
// ============================================
const AD_TRACKER_BLOCKLIST = new Set([
    'doubleclick.net',
    'googlesyndication.com',
    'googleadservices.com',
    'google-analytics.com',
    'analytics.google.com',
    'facebook.com/tr',
    'connect.facebook.net',
    'ads.twitter.com',
    'ads.linkedin.com',
    'adsserver.',
    'adservice.',
    'tracking.',
    'tracker.',
    'pixel.',
    'beacon.',
    'clicktrack.',
    'clickserve.',
    'taboola.com',
    'outbrain.com',
    'criteo.com',
    'pubmatic.com',
    'rubiconproject.com',
    'openx.net',
    'adnxs.com',
    'advertising.com'
]);

// Suspicious TLDs often used for phishing
const SUSPICIOUS_TLDS = new Set([
    '.tk', '.ml', '.ga', '.cf', '.gq', '.xyz', '.top', '.work', '.click',
    '.link', '.info', '.online', '.site', '.website', '.space', '.pw',
    '.buzz', '.surf', '.monster', '.icu'
]);

// Known safe domains (whitelist)
const TRUSTED_DOMAINS = new Set([
    'wikipedia.org', 'github.com', 'stackoverflow.com', 'reddit.com',
    'medium.com', 'dev.to', 'mozilla.org', 'w3.org', 'python.org',
    'nodejs.org', 'npmjs.com', 'docs.google.com', 'microsoft.com',
    'apple.com', 'amazon.com', 'youtube.com', 'twitter.com', 'arxiv.org'
]);

// Phishing pattern heuristics
const PHISHING_PATTERNS = [
    /login.*verify/i,
    /secure.*update/i,
    /account.*suspend/i,
    /paypal.*\.(?!com)/i,
    /google.*\.(?!com)/i,
    /microsoft.*\.(?!com)/i,
    /amazon.*\.(?!com)/i,
    /bank.*login/i,
    /wallet.*connect.*(?!official)/i
];

function extractDomain(url) {
    try {
        const urlObj = new URL(url);
        return urlObj.hostname.toLowerCase();
    } catch {
        return null;
    }
}

function getRootDomain(hostname) {
    const parts = hostname.split('.');
    if (parts.length <= 2) return hostname;
    return parts.slice(-2).join('.');
}

/**
 * AEGIS SHIELD - Check if URL is from blocked ad/tracker domain
 */
function isBlockedTracker(url) {
    const domain = extractDomain(url);
    if (!domain) return false;
    
    for (const blocked of AD_TRACKER_BLOCKLIST) {
        if (domain.includes(blocked) || url.includes(blocked)) {
            return true;
        }
    }
    return false;
}

/**
 * Security Scanner - Analyzes URL for potential threats
 */
export class SecurityScanner {
    constructor(options = {}) {
        this.virusTotalKey = options.virusTotalKey || null;
        this.cache = new Map();
        this.cacheMaxAge = 3600000;
    }
    
    checkTLD(url) {
        const domain = extractDomain(url);
        if (!domain) return { suspicious: true, reason: 'Invalid URL' };
        
        for (const tld of SUSPICIOUS_TLDS) {
            if (domain.endsWith(tld)) {
                return { suspicious: true, reason: `Suspicious TLD: ${tld}` };
            }
        }
        return { suspicious: false };
    }
    
    checkPhishingPatterns(url) {
        for (const pattern of PHISHING_PATTERNS) {
            if (pattern.test(url)) {
                return { suspicious: true, reason: 'Matches phishing pattern' };
            }
        }
        return { suspicious: false };
    }
    
    isTrusted(url) {
        const domain = extractDomain(url);
        if (!domain) return false;
        const root = getRootDomain(domain);
        return TRUSTED_DOMAINS.has(root) || TRUSTED_DOMAINS.has(domain);
    }
    
    async checkDomainAge(url) {
        const domain = extractDomain(url);
        if (!domain) return { suspicious: true, reason: 'Invalid domain' };
        
        if (this.isTrusted(url)) {
            return { suspicious: false, trusted: true };
        }
        
        const parts = domain.split('.');
        for (const part of parts) {
            if (part.length > 20 && /^[a-z0-9]+$/i.test(part)) {
                return { suspicious: true, reason: 'Suspicious subdomain pattern' };
            }
        }
        return { suspicious: false };
    }
    
    async checkVirusTotal(url) {
        if (!this.virusTotalKey) return null;
        
        try {
            const urlId = Buffer.from(url).toString('base64').replace(/=/g, '');
            const response = await fetch(`https://www.virustotal.com/api/v3/urls/${urlId}`, {
                headers: { 'x-apikey': this.virusTotalKey }
            });
            
            if (!response.ok) return null;
            
            const data = await response.json();
            const stats = data.data?.attributes?.last_analysis_stats;
            
            if (stats) {
                return {
                    malicious: stats.malicious || 0,
                    suspicious: stats.suspicious || 0,
                    harmless: stats.harmless || 0,
                    isSafe: (stats.malicious || 0) === 0 && (stats.suspicious || 0) === 0
                };
            }
            return null;
        } catch {
            return null;
        }
    }
    
    async scan(url) {
        const cached = this.cache.get(url);
        if (cached && Date.now() - cached.timestamp < this.cacheMaxAge) {
            return cached.result;
        }
        
        const result = {
            url,
            score: 100,
            flags: [],
            trusted: false,
            verdict: 'safe'
        };
        
        if (this.isTrusted(url)) {
            result.trusted = true;
            result.verdict = 'safe';
            this.cache.set(url, { result, timestamp: Date.now() });
            return result;
        }
        
        const tldCheck = this.checkTLD(url);
        if (tldCheck.suspicious) {
            result.score -= 30;
            result.flags.push(tldCheck.reason);
        }
        
        const phishCheck = this.checkPhishingPatterns(url);
        if (phishCheck.suspicious) {
            result.score -= 40;
            result.flags.push(phishCheck.reason);
        }
        
        const ageCheck = await this.checkDomainAge(url);
        if (ageCheck.suspicious) {
            result.score -= 25;
            result.flags.push(ageCheck.reason);
        }
        
        const vtResult = await this.checkVirusTotal(url);
        if (vtResult && !vtResult.isSafe) {
            result.score -= 50;
            result.flags.push(`VirusTotal: ${vtResult.malicious} malicious detections`);
        }
        
        if (result.score >= 80) {
            result.verdict = 'safe';
        } else if (result.score >= 50) {
            result.verdict = 'caution';
        } else {
            result.verdict = 'danger';
        }
        
        this.cache.set(url, { result, timestamp: Date.now() });
        return result;
    }
}

/**
 * Content Extractor - Scrapes and cleans page content
 */
export class ContentExtractor {
    extract(html, url) {
        const $ = cheerio.load(html);
        
        $('script, style, nav, header, footer, aside, iframe, noscript').remove();
        $('[role="navigation"], [role="banner"], [role="contentinfo"]').remove();
        $('.sidebar, .menu, .nav, .header, .footer, .ad, .advertisement').remove();
        $('#sidebar, #menu, #nav, #header, #footer, #comments').remove();
        
        let mainContent = '';
        const selectors = ['article', 'main', '.content', '.post', '.entry', '[role="main"]', 'body'];
        
        for (const selector of selectors) {
            const el = $(selector).first();
            if (el.length) {
                mainContent = el.text();
                if (mainContent.trim().length > 200) break;
            }
        }
        
        mainContent = mainContent
            .replace(/\s+/g, ' ')
            .replace(/\n\s*\n/g, '\n')
            .trim();
        
        const title = $('title').text().trim() || 
                     $('h1').first().text().trim() || 
                     $('meta[property="og:title"]').attr('content') || '';
        
        const description = $('meta[name="description"]').attr('content') ||
                           $('meta[property="og:description"]').attr('content') || '';
        
        return {
            title,
            description,
            content: mainContent.substring(0, 5000),
            wordCount: mainContent.split(/\s+/).length,
            url
        };
    }
}

/**
 * LLM Relevance Scorer - Uses local Ollama or keyword fallback
 */
export class RelevanceScorer {
    constructor(options = {}) {
        this.ollamaHost = options.ollamaHost || 'http://127.0.0.1:11434';
        this.model = options.model || null;
        this.timeout = options.timeout || 15000;
        this.enabled = options.enabled !== false;
        this.availableModel = null;
        this.modelChecked = false;
    }
    
    async findAvailableModel() {
        if (this.modelChecked) return this.availableModel;
        this.modelChecked = true;
        
        const modelsToTry = this.model ? [this.model] : [
            'llama3.2:1b', 'llama3.2:3b', 'qwen2:1.5b', 'phi3:mini',
            'llama3.1:8b', 'llama3:8b', 'mistral:7b', 'gemma2:2b'
        ];
        
        try {
            const response = await fetch(`${this.ollamaHost}/api/tags`, {
                headers: { 'User-Agent': 'PriyahClient/3.0' }
            });
            
            if (!response.ok) return null;
            
            const data = await response.json();
            const installedModels = (data.models || []).map(m => m.name.toLowerCase());
            
            for (const model of modelsToTry) {
                const modelBase = model.split(':')[0].toLowerCase();
                if (installedModels.some(m => m.includes(modelBase))) {
                    this.availableModel = installedModels.find(m => m.includes(modelBase));
                    console.log(`Using model for scoring: ${this.availableModel}`);
                    return this.availableModel;
                }
            }
            
            if (installedModels.length > 0) {
                this.availableModel = installedModels[0];
                return this.availableModel;
            }
        } catch (e) {
            console.log('Cannot connect to Ollama for scoring:', e.message);
        }
        return null;
    }
    
    /**
     * Keyword-based relevance scoring (fast, used for pre-scoring)
     */
    keywordScore(query, content) {
        const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
        const contentLower = (content || '').toLowerCase();
        
        let matches = 0;
        let totalWeight = 0;
        
        for (const word of queryWords) {
            const count = (contentLower.match(new RegExp(word, 'g')) || []).length;
            if (count > 0) {
                matches++;
                totalWeight += Math.min(count, 5);
            }
        }
        
        if (queryWords.length === 0) return { score: 50, reason: 'No query words', method: 'keyword' };
        
        const matchRatio = matches / queryWords.length;
        const densityBonus = Math.min(totalWeight / queryWords.length, 3) * 10;
        const score = Math.min(100, Math.round(matchRatio * 70 + densityBonus));
        
        return {
            score,
            reason: `${matches}/${queryWords.length} keywords found`,
            method: 'keyword'
        };
    }
    
    async score(query, content) {
        if (!this.enabled) {
            return this.keywordScore(query, content);
        }
        
        const model = await this.findAvailableModel();
        if (!model) {
            return this.keywordScore(query, content);
        }
        
        const prompt = `Score how relevant this content is to the query. Reply with ONLY a number 0-100.

Query: "${query}"

Content: "${(content || '').substring(0, 1500)}"

Relevance score (0-100):`;

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this.timeout);
            
            const response = await fetch(`${this.ollamaHost}/api/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: controller.signal,
                body: JSON.stringify({
                    model,
                    prompt,
                    stream: false,
                    options: { temperature: 0.1, num_ctx: 2048, num_predict: 20 }
                })
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                return this.keywordScore(query, content);
            }
            
            const data = await response.json();
            const text = data.response || '';
            const numMatch = text.match(/\b(\d{1,3})\b/);
            
            if (numMatch) {
                return {
                    score: Math.min(100, Math.max(0, parseInt(numMatch[1]))),
                    reason: 'LLM scored',
                    method: 'llm'
                };
            }
            
            return this.keywordScore(query, content);
        } catch (e) {
            return this.keywordScore(query, content);
        }
    }
}

/**
 * TruthSeeker v2.0 - Multi-Page Deep Search Agent
 */
export class TruthSeeker {
    constructor(options = {}) {
        this.securityScanner = new SecurityScanner({
            virusTotalKey: options.virusTotalKey
        });
        this.contentExtractor = new ContentExtractor();
        this.relevanceScorer = new RelevanceScorer({
            ollamaHost: options.ollamaHost,
            model: options.scoringModel
        });
        
        this.minRelevance = options.minRelevance || 60;
        this.maxResults = options.maxResults || 5;
        this.timeout = options.timeout || 10000;
        this.concurrencyLimit = options.concurrencyLimit || 8;
        this.onStep = options.onStep || (() => {});
    }
    
    /**
     * Extract actual URL from DuckDuckGo redirect
     */
    extractDuckDuckGoUrl(href) {
        if (!href) return null;
        
        if (href.includes('duckduckgo.com/l/?')) {
            try {
                const urlObj = new URL(href, 'https://duckduckgo.com');
                const actualUrl = urlObj.searchParams.get('uddg');
                if (actualUrl) return decodeURIComponent(actualUrl);
            } catch {
                return null;
            }
        }
        
        if (href.startsWith('http://') || href.startsWith('https://')) {
            return href;
        }
        
        if (href.startsWith('//') && !href.includes('duckduckgo.com')) {
            return 'https:' + href;
        }
        
        return null;
    }
    
    /**
     * Parse results from DuckDuckGo HTML page
     */
    parseResultsPage(html) {
        const $ = cheerio.load(html);
        const results = [];
        
        $('.result').each((i, el) => {
            const title = $(el).find('.result__a').text().trim();
            const snippet = $(el).find('.result__snippet').text().trim();
            const rawHref = $(el).find('.result__a').attr('href');
            const url = this.extractDuckDuckGoUrl(rawHref);
            
            if (title && url) {
                results.push({ title, snippet, url });
            }
        });
        
        // Find "Next" page form data
        let nextParams = null;
        const nextForm = $('form.nav-link').last();
        if (nextForm.length) {
            const formInputs = {};
            nextForm.find('input').each((i, el) => {
                const name = $(el).attr('name');
                const value = $(el).attr('value');
                if (name) formInputs[name] = value || '';
            });
            if (Object.keys(formInputs).length > 0) {
                nextParams = formInputs;
            }
        }
        
        // Alternative: Look for next page link with 's' parameter
        if (!nextParams) {
            const nextLink = $('a.nav-link').last();
            if (nextLink.length) {
                const href = nextLink.attr('href');
                if (href && href.includes('s=')) {
                    try {
                        const urlObj = new URL(href, 'https://html.duckduckgo.com');
                        nextParams = Object.fromEntries(urlObj.searchParams);
                    } catch {}
                }
            }
        }
        
        return { results, nextParams };
    }
    
    /**
     * Step 1: Fetch search results with PAGINATION
     * Fetches multiple pages until limit reached or no more pages
     */
    async fetchCandidates(query, limit = 50) {
        this.onStep('fetch', `Searching: "${query}" (limit: ${limit})...`);
        
        const allCandidates = [];
        const seenUrls = new Set();
        let pagesFetched = 0;
        let currentParams = { q: query };
        
        try {
            while (allCandidates.length < limit && pagesFetched < 5) { // Max 5 pages
                pagesFetched++;
                
                // Build URL with params
                const searchParams = new URLSearchParams(currentParams);
                const url = `https://html.duckduckgo.com/html?${searchParams.toString()}`;
                
                this.onStep('fetch', `Fetching page ${pagesFetched}...`);
                
                const response = await fetch(url, {
                    method: 'GET',
                    headers: {
                        'User-Agent': getRandomUserAgent(),
                        'Accept': 'text/html,application/xhtml+xml',
                        ...PRIVACY_HEADERS
                    }
                });
                
                if (!response.ok) {
                    this.onStep('fetch', `Page ${pagesFetched} failed: ${response.status}`);
                    break;
                }
                
                const html = await response.text();
                const { results, nextParams } = this.parseResultsPage(html);
                
                // Add unique results
                for (const result of results) {
                    if (!seenUrls.has(result.url) && allCandidates.length < limit) {
                        seenUrls.add(result.url);
                        allCandidates.push(result);
                    }
                }
                
                this.onStep('fetch', `Page ${pagesFetched}: found ${results.length} results (total: ${allCandidates.length})`);
                
                // Check if we should fetch more pages
                if (!nextParams || results.length === 0) {
                    break; // No more pages
                }
                
                // Prepare next page params
                currentParams = { ...nextParams, q: query };
                
                // Small delay to be nice to DuckDuckGo
                await new Promise(r => setTimeout(r, 300));
            }
            
            this.onStep('fetch', `Fetched ${allCandidates.length} candidates from ${pagesFetched} pages`);
            return { candidates: allCandidates, pagesFetched };
            
        } catch (e) {
            this.onStep('fetch', `Search failed: ${e.message}`);
            return { candidates: allCandidates, pagesFetched };
        }
    }
    
    /**
     * Process items in chunks with concurrency control
     */
    async processInChunks(items, processor, chunkSize = 8) {
        const results = [];
        
        for (let i = 0; i < items.length; i += chunkSize) {
            const chunk = items.slice(i, i + chunkSize);
            const chunkResults = await Promise.all(chunk.map(processor));
            results.push(...chunkResults);
        }
        
        return results;
    }
    
    /**
     * Step 2: Verify URL is live and accessible
     */
    async verifyLiveness(url) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            
            const response = await fetch(url, {
                method: 'HEAD',
                signal: controller.signal,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });
            
            clearTimeout(timeoutId);
            
            const alive = response.ok || [301, 302, 403].includes(response.status);
            return { alive, status: response.status };
        } catch {
            return { alive: false, status: 0 };
        }
    }
    
    /**
     * Step 3: Security scan
     */
    async scanSecurity(url) {
        return await this.securityScanner.scan(url);
    }
    
    /**
     * Step 4: Scrape and extract content
     */
    async scrapeContent(url) {
        // AEGIS SHIELD: Block tracker domains
        if (isBlockedTracker(url)) {
            return { success: false, error: 'Blocked: tracker domain' };
        }
        
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this.timeout);
            
            const response = await fetch(url, {
                signal: controller.signal,
                headers: {
                    'User-Agent': getRandomUserAgent(),
                    'Accept': 'text/html,application/xhtml+xml',
                    ...PRIVACY_HEADERS
                }
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) return null;
            
            const html = await response.text();
            return this.contentExtractor.extract(html, url);
        } catch {
            return null;
        }
    }
    
    /**
     * Step 5: Score relevance with LLM
     */
    async scoreRelevance(query, content) {
        return await this.relevanceScorer.score(query, content || '');
    }
    
    /**
     * Pre-score candidates using fast keyword matching on title + snippet
     */
    preScoreCandidates(query, candidates) {
        return candidates.map(c => {
            const combinedText = `${c.title} ${c.snippet}`;
            const preScore = this.relevanceScorer.keywordScore(query, combinedText);
            return { ...c, preScore: preScore.score };
        }).sort((a, b) => b.preScore - a.preScore);
    }
    
    /**
     * Full search pipeline with pagination, pre-scoring, and concurrency control
     */
    async search(query, options = {}) {
        const limit = options.candidateLimit || options.limit || 50;
        const scrapeLimit = options.scrapeLimit || Math.min(15, Math.ceil(limit / 4));
        
        // Step 1: Fetch candidates with pagination
        const { candidates, pagesFetched } = await this.fetchCandidates(query, limit);
        
        if (candidates.length === 0) {
            return { 
                results: [], 
                message: 'No search results found',
                depth: pagesFetched,
                preFiltered: 0
            };
        }
        
        // Step 2 & 3: Verify liveness and security (with concurrency control)
        this.onStep('verify', `Verifying ${candidates.length} sources (chunked)...`);
        
        const verified = await this.processInChunks(
            candidates,
            async (candidate) => {
                const liveness = await this.verifyLiveness(candidate.url);
                if (!liveness.alive) {
                    return { ...candidate, status: 'dead' };
                }
                
                const security = await this.scanSecurity(candidate.url);
                if (security.verdict === 'danger') {
                    return { ...candidate, status: 'unsafe', security };
                }
                
                return { ...candidate, status: 'live', liveness, security };
            },
            this.concurrencyLimit
        );
        
        // Filter to live & safe results
        const liveSafe = verified.filter(r => r.status === 'live');
        this.onStep('verify', `${liveSafe.length}/${candidates.length} sources verified safe`);
        
        if (liveSafe.length === 0) {
            return { 
                results: [], 
                message: 'No accessible sources found',
                depth: pagesFetched,
                preFiltered: 0
            };
        }
        
        // Step 4: PRE-SCORE all verified candidates on Title + Snippet
        this.onStep('prescore', `Pre-scoring ${liveSafe.length} candidates...`);
        const preScored = this.preScoreCandidates(query, liveSafe);
        
        // Take top candidates for expensive scraping
        const topCandidates = preScored.slice(0, scrapeLimit);
        const preFiltered = liveSafe.length - topCandidates.length;
        
        this.onStep('prescore', `Selected top ${topCandidates.length} for deep analysis (filtered ${preFiltered})`);
        
        // Step 5 & 6: Scrape and score (on top candidates only)
        this.onStep('analyze', 'Deep analyzing content relevance...');
        
        const analyzed = [];
        for (const candidate of topCandidates) {
            const content = await this.scrapeContent(candidate.url);
            
            if (content && content.content.length > 100) {
                const relevance = await this.scoreRelevance(query, content.content);
                
                analyzed.push({
                    title: content.title || candidate.title,
                    url: candidate.url,
                    snippet: content.description || candidate.snippet,
                    content: content.content.substring(0, 500),
                    security: candidate.security,
                    relevance: relevance.score,
                    relevanceReason: relevance.reason,
                    preScore: candidate.preScore,
                    wordCount: content.wordCount
                });
            } else {
                const relevance = await this.scoreRelevance(query, candidate.snippet);
                
                analyzed.push({
                    title: candidate.title,
                    url: candidate.url,
                    snippet: candidate.snippet,
                    content: candidate.snippet,
                    security: candidate.security,
                    relevance: relevance.score,
                    relevanceReason: relevance.reason,
                    preScore: candidate.preScore,
                    scrapeFailed: true
                });
            }
        }
        
        // AEGIS SHIELD: Filter by minimum relevance, safety, and blocklist
        const filtered = analyzed
            .filter(r => {
                // Reject unsafe results
                if (r.security?.verdict === 'danger') return false;
                // Reject tracker domains
                if (isBlockedTracker(r.url)) return false;
                // Minimum relevance threshold
                return r.relevance >= this.minRelevance;
            })
            .sort((a, b) => b.relevance - a.relevance)
            .slice(0, this.maxResults);
        
        this.onStep('complete', `Returning ${filtered.length} verified results`);
        
        // AMNESIA: Clear memory after search completes
        this.clearMemory();
        
        return {
            results: filtered,
            totalCandidates: candidates.length,
            verified: liveSafe.length,
            filtered: filtered.length,
            depth: pagesFetched,
            preFiltered: preFiltered,
            scraped: topCandidates.length,
            query
        };
    }
    
    /**
     * AMNESIA - Clear all cached data for privacy
     */
    clearMemory() {
        this.securityScanner.cache.clear();
        this.relevanceScorer.modelCache = null;
        console.log('[TruthSeeker] Memory cleared - AMNESIA protocol complete');
    }
    
    /**
     * Format results for AI context
     */
    formatForContext(searchResult) {
        if (!searchResult.results || searchResult.results.length === 0) {
            return '[WEB SEARCH] No verified results found.';
        }
        
        const formatted = searchResult.results.map((r, i) => {
            const shield = r.security?.trusted ? '🛡️' : 
                          r.security?.verdict === 'safe' ? '✅' :
                          r.security?.verdict === 'caution' ? '⚠️' : '❌';
            
            return `SOURCE [${i + 1}] ${shield} (${r.relevance}% relevant)
TITLE: ${r.title}
URL: ${r.url}
SUMMARY: ${r.snippet || r.content?.substring(0, 200)}`;
        }).join('\n\n');
        
        const stats = `[Depth: ${searchResult.depth} pages | Verified: ${searchResult.verified} | Pre-filtered: ${searchResult.preFiltered} | Scraped: ${searchResult.scraped}]`;
        
        return `[WEB SEARCH RESULTS - ${searchResult.filtered} verified sources]\n${stats}\n\n${formatted}`;
    }
}

export default TruthSeeker;
