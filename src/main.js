import { Actor, log } from 'apify';
import { PuppeteerCrawler, sleep } from 'crawlee';
import _ from 'underscore';

import { getPageRecord, getAndEnqueueLinkUrls } from './page-handler.js';
import { sendEmailNotification } from './notification.js';
import { normalizeUrl, getResults, saveResults, getBrokenLinks, saveRecordToDataset, getBaseUrlRequest, hasBaseDomain, isErrorHttpStatus, removeLastSlash } from './tools.js';
import { DEFAULT_VIEWPORT, NAVIGATION_TIMEOUT, MAX_REQUEST_RETRIES } from './consts.js';


await Actor.init();

const input = await Actor.getInput();
const { maxConcurrency, maxPages, notificationEmails, saveOnlyBrokenLinks, crawlSubdomains, proxyConfiguration } = input;

const baseUrl = normalizeUrl(input.baseUrl);

const requestQueue = await Actor.openRequestQueue();
await requestQueue.addRequest(getBaseUrlRequest(baseUrl));

const records = await Actor.getValue('RECORDS') || [];
Actor.on('persistState', async () => { await Actor.setValue('RECORDS', records); });

const { WITH_SUBDOMAINS, WITHOUT_SUBDOMAINS } = MAX_REQUEST_RETRIES;
const maxRequestRetries = crawlSubdomains ? WITH_SUBDOMAINS : WITHOUT_SUBDOMAINS;

const crawler = new PuppeteerCrawler({
    proxyConfiguration: proxyConfiguration ? await Actor.createProxyConfiguration(proxyConfiguration) : undefined,
    requestQueue,
    maxConcurrency: Math.min(maxConcurrency || 1, 2), // Limit max concurrency to 2 for lightweight operation
    maxRequestsPerCrawl: maxPages,
    maxRequestRetries: 1, // Reduce retries for faster operation
    requestHandlerTimeoutSecs: 30, // Reduced timeout
    browserPoolOptions: {
        maxOpenPagesPerBrowser: 1, // Only 1 page per browser for memory efficiency
        retireBrowserAfterPageCount: 10, // Retire browser after 10 pages to prevent memory leaks
        preLaunchHooks: [(_pageId, launchContext) => {
            launchContext.launchOptions = {
                ...launchContext.launchOptions,
                headless: true, // Ensure headless mode
                defaultViewport: { width: 1024, height: 768 }, // Smaller viewport
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu',
                    '--disable-web-security',
                    '--disable-features=VizDisplayCompositor',
                    '--disable-extensions',
                    '--disable-plugins',
                    '--disable-images', // Don't load images for speed
                    '--disable-background-timer-throttling',
                    '--disable-backgrounding-occluded-windows',
                    '--disable-renderer-backgrounding',
                    '--memory-pressure-off',
                    '--max_old_space_size=512' // Limit memory usage
                ]
            };
        }],
    },
    navigationTimeoutSecs: 15, // Very short navigation timeout
    requestHandler: async (context) => {
        let { request: { url, loadedUrl } } = context;
        log.info(`Crawling page...`, { url });

        try {
            // Minimal sleep for rate limiting only
            await sleep(500);

            // Make sure both urls don't end with slash.
            url = removeLastSlash(url);
            loadedUrl = removeLastSlash(loadedUrl);

            // if the user enters with `http` and the page redirects to `https`
            if (url.replace('http://', 'https://') !== loadedUrl.replace('http://', 'https://')) {
                await context.page.waitForNavigation({ timeout: 20000, waitUntil: 'domcontentloaded' }).catch(() => {});
            }

            const record = await getPageRecord(context, crawlSubdomains);

            // If we're on the base website or we're allowed to crawl current subdomain, find links to new pages and enqueue them.
            const crawlCurrentSubdomain = crawlSubdomains && hasBaseDomain(baseUrl, url);
            if (record.isBaseWebsite || crawlCurrentSubdomain) {
                record.linkUrls = await getAndEnqueueLinkUrls(context);
            }

            await saveRecordToDataset(record, saveOnlyBrokenLinks);
            records.push(record);
        } catch (error) {
            log.warning(`Error processing page ${url}: ${error.message}`);
            
            // Create error record
            const errorRecord = {
                url,
                httpStatus: null,
                errorMessage: error.message,
                referrer: context.request.userData?.referrer,
            };

            await Actor.pushData(errorRecord);
            records.push(errorRecord);
        }
    },

    errorHandler: async ({ request, response }) => {
        if (response?.status() && isErrorHttpStatus(response.status())) {
            request.maxRetries = 0;
        }
    },

    // This function is called if the page processing failed more than maxRequestRetries+1 times.
    failedRequestHandler: async ({ request }) => {
        const url = normalizeUrl(request.url);
        log.warning(`Page failed ${request.retryCount + 1} times, giving up: ${url}`);

        const record = {
            url,
            httpStatus: null,
            errorMessage: _.last(request.errorMessages) || 'Unknown error',
            referrer: request.userData.referrer,
        };

        /**
         * Store record with failed request's errorMessage into the result as well.
         * There's a good chance it failed because the url is broken and the timeout
         * has exceeded while requesting this url.
         */
        await Actor.pushData(record);
        records.push(record);
    },

    // Add optimized session pool for better error handling and performance
    sessionPoolOptions: {
        maxPoolSize: 5, // Smaller pool for lightweight operation
        sessionOptions: {
            maxUsageCount: 3, // Reuse sessions more aggressively
            maxErrorScore: 0.3, // Lower error threshold
        },
    },
});

log.info(`Starting crawl of ${baseUrl}`);
await crawler.run();
log.info('Crawling finished, processing results...');

const results = await getResults(baseUrl, records);
await saveResults(results, baseUrl);

const brokenLinks = getBrokenLinks(results);
if (brokenLinks.length && notificationEmails && notificationEmails.length) {
    await sendEmailNotification(results, baseUrl, notificationEmails);
}

log.info('\nDone.');

await Actor.exit();
