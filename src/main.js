import { Actor, log } from 'apify';
import { CheerioCrawler } from 'crawlee';

import { getPageRecord, getAndEnqueueLinkUrls } from './page-handler.js';
import { sendEmailNotification } from './notification.js';
import {
    normalizeUrl,
    getResults,
    saveResults,
    getBrokenLinks,
    getBaseUrlRequest,
    hasBaseDomain,
    isErrorHttpStatus,
    removeLastSlash,
} from './tools.js';
import { MAX_REQUEST_RETRIES } from './consts.js';

// Initialize the Apify Actor
await Actor.init();

// Track start time for duration calculation
const startTime = Date.now();

// Get input configuration - defaults MUST match input_schema.json
const input = await Actor.getInput() ?? {};
const {
    baseUrl: inputBaseUrl,
    maxPages = 500,              // Must match input_schema.json default
    maxCrawlDepth = 10,          // Must match input_schema.json default
    maxConcurrency = 10,         // Must match input_schema.json default
    checkExternalLinks = true,   // Must match input_schema.json default
    saveOnlyBrokenLinks = true,  // Must match input_schema.json default
    crawlSubdomains = false,     // Must match input_schema.json default
    notificationEmails = [],     // Must match input_schema.json default
    proxyConfiguration,          // Has default in input_schema.json
} = input;

// Validate and normalize base URL
const baseUrl = normalizeUrl(inputBaseUrl);

if (!baseUrl) {
    throw new Error('Invalid baseUrl provided. Please provide a valid URL.');
}

// Validate numeric inputs are within schema bounds
const validatedMaxPages = Math.max(1, Math.min(maxPages, 50000));
const validatedMaxConcurrency = Math.max(1, Math.min(maxConcurrency, 50));
const validatedMaxCrawlDepth = Math.max(1, Math.min(maxCrawlDepth, 50));

// Set log level to reduce verbosity
log.setLevel(log.LEVELS.INFO);

log.info('🔗 Broken Link Finder Started', {
    baseUrl,
    maxPages: validatedMaxPages,
    maxCrawlDepth: validatedMaxCrawlDepth,
    maxConcurrency: validatedMaxConcurrency,
    checkExternalLinks,
    saveOnlyBrokenLinks,
    crawlSubdomains,
});

// Setup request queue with initial URL (depth 0)
const requestQueue = await Actor.openRequestQueue();
await requestQueue.addRequest({
    ...getBaseUrlRequest(baseUrl),
    uniqueKey: baseUrl,
    userData: {
        ...getBaseUrlRequest(baseUrl).userData,
        depth: 0,
    },
});

// Persistent storage for records
const records = await Actor.getValue('RECORDS') ?? [];
Actor.on('persistState', async () => {
    await Actor.setValue('RECORDS', records);
});

// Stats tracking
let pagesProcessed = 0;
let linksFound = 0;

// Configure retry behavior
const { WITH_SUBDOMAINS, WITHOUT_SUBDOMAINS } = MAX_REQUEST_RETRIES;
const maxRequestRetries = crawlSubdomains ? WITH_SUBDOMAINS : WITHOUT_SUBDOMAINS;

// Create optimized CheerioCrawler with validated inputs
const crawler = new CheerioCrawler({
    proxyConfiguration: proxyConfiguration
        ? await Actor.createProxyConfiguration(proxyConfiguration)
        : undefined,
    requestQueue,
    maxConcurrency: validatedMaxConcurrency,
    maxRequestsPerCrawl: validatedMaxPages,
    maxRequestRetries: 1,
    requestHandlerTimeoutSecs: 30,
    navigationTimeoutSecs: 20,
    useSessionPool: true,
    persistCookiesPerSession: true,

    async requestHandler(context) {
        const { request: { url, userData } } = context;
        const currentDepth = userData?.depth ?? 0;

        try {
            const normalizedUrl = removeLastSlash(url);

            // Extract page information
            const record = await getPageRecord(context);

            // Check if we're within the base domain
            const isWithinBaseDomain = hasBaseDomain(baseUrl, normalizedUrl);
            const crawlCurrentSubdomain = crawlSubdomains && isWithinBaseDomain;

            // Extract and check links from ALL pages within depth limit
            if ((record.isBaseWebsite || isWithinBaseDomain || crawlCurrentSubdomain) && currentDepth < validatedMaxCrawlDepth) {
                const { linkUrls, linkData } = await getAndEnqueueLinkUrls(
                    context,
                    baseUrl,
                    currentDepth + 1,
                    validatedMaxCrawlDepth,
                    checkExternalLinks
                );
                record.linkUrls = linkUrls;
                record.linkData = linkData;
                linksFound += linkUrls.length;
            }

            records.push(record);
            pagesProcessed++;

            // Log progress every 10 pages or at specific milestones
            if (pagesProcessed % 10 === 0 || pagesProcessed === 1) {
                const progress = validatedMaxPages ? Math.round((pagesProcessed / validatedMaxPages) * 100) : 0;
                log.info(`📊 Progress: ${pagesProcessed}/${validatedMaxPages} pages (${progress}%), ${linksFound} links`);
            }
        } catch (error) {
            log.warning(`⚠️ Error on ${url}: ${error.message}`);

            records.push({
                url,
                httpStatus: null,
                errorMessage: error.message,
                referrer: context.request.userData?.referrer,
            });
        }
    },

    async errorHandler({ request, response }) {
        const statusCode = response?.statusCode;
        if (statusCode && isErrorHttpStatus(statusCode)) {
            request.maxRetries = 0;
        }
    },

    async failedRequestHandler({ request }) {
        const url = normalizeUrl(request.url);

        const errorMessages = request.errorMessages || [];
        records.push({
            url,
            httpStatus: null,
            errorMessage: errorMessages[errorMessages.length - 1] || 'Unknown error',
            referrer: request.userData?.referrer,
        });
    },
});

// Run the crawler
await crawler.run();

log.info('📝 Processing results...');

// Process results and push clean flat records to dataset
const results = await getResults(baseUrl, records, saveOnlyBrokenLinks);

// Get broken links for notification and summary
const brokenLinks = getBrokenLinks(results);

// Save summary to key-value store
await saveResults(results, baseUrl, brokenLinks, startTime);

// Send email notifications if broken links found and emails provided
if (brokenLinks.length > 0 && notificationEmails && notificationEmails.length > 0) {
    await sendEmailNotification(results, baseUrl, notificationEmails);
}

log.info('✅ Broken Link Finder Complete', {
    pagesChecked: pagesProcessed,
    maxPagesAllowed: validatedMaxPages,
    linksChecked: linksFound,
    brokenLinks: brokenLinks.length,
});

await Actor.exit();
