import { Actor, log } from 'apify';
import { CheerioCrawler, sleep } from 'crawlee';
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

const crawler = new CheerioCrawler({
    proxyConfiguration: proxyConfiguration ? await Actor.createProxyConfiguration(proxyConfiguration) : undefined,
    requestQueue,
    maxConcurrency: Math.min(maxConcurrency || 3, 5), // Higher concurrency for lightweight HTTP requests
    maxRequestsPerCrawl: maxPages,
    maxRequestRetries: 1,
    requestHandlerTimeoutSecs: 20,
    navigationTimeoutSecs: 15,
    requestHandler: async (context) => {
        let { request: { url } } = context;
        log.info(`Crawling page...`, { url });

        try {
            // Minimal sleep for rate limiting only
            await sleep(200);

            // Make sure url doesn't end with slash
            url = removeLastSlash(url);

            const record = await getPageRecord(context);

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
