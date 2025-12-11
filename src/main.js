import { Actor, log } from 'apify';
import { CheerioCrawler, sleep } from 'crawlee';

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

// Get input configuration
const input = await Actor.getInput() ?? {};
const {
    maxConcurrency = 5,
    maxPages,
    notificationEmails,
    saveOnlyBrokenLinks = false,
    crawlSubdomains = false,
    proxyConfiguration,
} = input;

const baseUrl = normalizeUrl(input.baseUrl);

if (!baseUrl) {
    throw new Error('Invalid baseUrl provided. Please provide a valid URL.');
}

log.info('Starting Broken Link Finder', { baseUrl, maxPages, crawlSubdomains });

// Setup request queue with initial URL
const requestQueue = await Actor.openRequestQueue();
await requestQueue.addRequest(getBaseUrlRequest(baseUrl));

// Persistent storage for records (internal use, not pushed to dataset)
const records = await Actor.getValue('RECORDS') ?? [];
Actor.on('persistState', async () => {
    await Actor.setValue('RECORDS', records);
});

// Configure retry behavior
const { WITH_SUBDOMAINS, WITHOUT_SUBDOMAINS } = MAX_REQUEST_RETRIES;
const maxRequestRetries = crawlSubdomains ? WITH_SUBDOMAINS : WITHOUT_SUBDOMAINS;

// Create optimized CheerioCrawler for fast HTTP-based crawling
const crawler = new CheerioCrawler({
    proxyConfiguration: proxyConfiguration
        ? await Actor.createProxyConfiguration(proxyConfiguration)
        : undefined,
    requestQueue,
    maxConcurrency: Math.min(maxConcurrency, 10),
    maxRequestsPerCrawl: maxPages,
    maxRequestRetries: 1,
    requestHandlerTimeoutSecs: 30,
    navigationTimeoutSecs: 20,

    // Use session pool for efficient HTTP requests
    useSessionPool: true,
    persistCookiesPerSession: true,

    async requestHandler(context) {
        let { request: { url } } = context;
        log.info('Crawling page...', { url });

        try {
            // Minimal rate limiting
            await sleep(100);

            // Normalize URL
            url = removeLastSlash(url);

            // Extract page information
            const record = await getPageRecord(context);

            // Determine if we should enqueue links from this page
            const crawlCurrentSubdomain = crawlSubdomains && hasBaseDomain(baseUrl, url);
            if (record.isBaseWebsite || crawlCurrentSubdomain) {
                // Extract links with metadata (text, type)
                const { linkUrls, linkData } = await getAndEnqueueLinkUrls(context, baseUrl);
                record.linkUrls = linkUrls;
                record.linkData = linkData;
            }

            // Store record internally (dataset is populated during results processing)
            records.push(record);

            log.debug('Page processed successfully', { url, linksFound: record.linkUrls?.length ?? 0 });
        } catch (error) {
            log.warning(`Error processing page: ${error.message}`, { url });

            // Create error record
            const errorRecord = {
                url,
                httpStatus: null,
                errorMessage: error.message,
                referrer: context.request.userData?.referrer,
            };

            records.push(errorRecord);
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
        log.warning(`Page failed after ${request.retryCount + 1} attempts`, { url });

        const errorMessages = request.errorMessages || [];
        const record = {
            url,
            httpStatus: null,
            errorMessage: errorMessages[errorMessages.length - 1] || 'Unknown error',
            referrer: request.userData?.referrer,
        };

        records.push(record);
    },
});

// Run the crawler
log.info(`Starting crawl of ${baseUrl}`);
await crawler.run();
log.info('Crawling finished, processing results...');

// Process results and push clean flat records to dataset
const results = await getResults(baseUrl, records, saveOnlyBrokenLinks);

// Get broken links for notification and summary
const brokenLinks = getBrokenLinks(results);

// Save summary to key-value store
await saveResults(results, baseUrl, brokenLinks, startTime);

// Send email notifications if broken links found
if (brokenLinks.length > 0 && notificationEmails?.length > 0) {
    log.info(`Found ${brokenLinks.length} broken links, sending notifications...`);
    await sendEmailNotification(results, baseUrl, notificationEmails);
}

log.info('Broken Link Finder completed', {
    totalPages: records.length,
    brokenLinks: brokenLinks.length,
});

await Actor.exit();
