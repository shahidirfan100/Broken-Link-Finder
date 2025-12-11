import { Actor, log } from 'apify';

import utils from './apify-utils.js';
import { BASE_URL_LABEL, OUTPUT_COLORS, STATUS_CODES, URL_PREFIX_REGEX } from './consts.js';

/**
 * Normalize URL and remove the #fragment
 * @param {string} url
 * @returns {string} normalized url
 */
export const normalizeUrl = (url) => {
    const nurl = utils.normalizeUrl(url);
    if (nurl) return nurl;

    const index = url.indexOf('#');
    if (index > 0) return url.substring(0, index);

    return url;
};

/**
 * Creates collection of results for the provided base url.
 * @param {string} baseUrl
 * @param {object[]} records
 * @returns {Promise<object[]>} built results
 */
export const getResults = async (baseUrl, records) => {
    const results = [];
    const doneUrls = new Set();
    const urlToRecord = createUrlToRecordLookupTable(records);
    const pendingUrls = [baseUrl];

    while (pendingUrls.length > 0) {
        const url = pendingUrls.shift();

        if (doneUrls.has(url)) continue;
        doneUrls.add(url);

        log.debug(`Processing result: ${url}`);

        const record = urlToRecord.get(url);

        const result = {
            url,
            title: record?.title ?? null,
            links: [],
        };
        results.push(result);

        if (record?.linkUrls) {
            for (const linkUrl of record.linkUrls) {
                const linkNurl = normalizeUrl(linkUrl);
                const link = createLink(linkUrl, linkNurl, urlToRecord);
                result.links.push(link);

                if (record.isBaseWebsite && !doneUrls.has(linkNurl)) {
                    pendingUrls.push(linkNurl);
                }
            }
        }
    }

    return results;
};

/**
 * Create a link object with status information
 */
const createLink = (linkUrl, linkNurl, urlToRecord) => {
    const index = linkUrl.indexOf('#');
    const fragment = index > 0 ? linkUrl.substring(index + 1) : '';

    const link = {
        url: linkUrl,
        normalizedUrl: linkNurl,
        httpStatus: null,
        errorMessage: null,
        fragment,
        fragmentValid: false,
        crawled: false,
    };

    const record = urlToRecord.get(linkNurl);
    if (record) {
        link.crawled = true;
        link.httpStatus = record.httpStatus;
        link.errorMessage = record.errorMessage;
        link.fragmentValid = !fragment || record.anchorsSet?.has(fragment);
    }

    return link;
};

/**
 * Creates a Map for normalized URL -> record lookup
 * Also creates a Set in record.anchorsSet for fast anchor lookups
 * @param {object[]} records
 * @returns {Map<string, object>} urlToRecord lookup Map
 */
const createUrlToRecordLookupTable = (records) => {
    const urlToRecord = new Map();

    for (const record of records) {
        urlToRecord.set(record.url, record);
        record.anchorsSet = new Set(record.anchors || []);
    }

    return urlToRecord;
};

/**
 * Saves results in JSON format into key value store.
 */
export const saveResults = async (results, baseUrl) => {
    log.info('Saving results...');
    await Actor.setValue('OUTPUT', results);

    const html = generateHtmlReport(results, baseUrl);
    await Actor.setValue('OUTPUT.html', html, { contentType: 'text/html' });

    const storeId = process.env.APIFY_DEFAULT_KEY_VALUE_STORE_ID;
    log.info(`HTML report saved: https://api.apify.com/v2/key-value-stores/${storeId}/records/OUTPUT.html?disableRedirect=1`);
};

/**
 * Get CSV friendly record (subset of fields)
 * @param {object} record
 * @returns {object} csv friendly record
 */
const getCsvFriendlyRecord = (record) => {
    const { url, isBaseWebsite, httpStatus, title, referrer } = record;
    return { url, isBaseWebsite, httpStatus, title, referrer };
};

/**
 * Save record to dataset based on configuration
 * @param {object} record
 * @param {boolean} saveOnlyBrokenLinks
 */
export const saveRecordToDataset = async (record, saveOnlyBrokenLinks) => {
    const filteredRecord = saveOnlyBrokenLinks ? getCsvFriendlyRecord(record) : record;
    const { httpStatus } = filteredRecord;

    if (!saveOnlyBrokenLinks || isErrorHttpStatus(httpStatus)) {
        await Actor.pushData(filteredRecord);
    }
};

/**
 * Create initial request for base URL
 */
export const getBaseUrlRequest = (baseUrl) => ({
    url: baseUrl,
    userData: { label: BASE_URL_LABEL },
});

/**
 * Check if URL belongs to the same base domain
 */
export const hasBaseDomain = (baseUrl, url) => {
    const baseUrlStart = baseUrl.replace(URL_PREFIX_REGEX, '');
    const urlStart = url.replace(URL_PREFIX_REGEX, '');
    return urlStart.startsWith(baseUrlStart);
};

/**
 * Generate HTML header for report
 */
const generateHtmlHeader = (baseUrl) => `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Broken link report for ${baseUrl}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 20px;
            background: #f5f5f5;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            background: white;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        th, td {
            text-align: left;
            padding: 12px;
            border-bottom: 1px solid #eee;
        }
        th {
            background: #333;
            color: white;
        }
        a {
            color: #0066cc;
            text-decoration: none;
        }
        a:hover {
            text-decoration: underline;
        }
    </style>
</head>
<body>
    <h1>Broken Link Report</h1>
    <p>Base URL: <a href="${baseUrl}" target="_blank">${baseUrl}</a></p>
    <table>
        <tr>
            <th>From</th>
            <th>To</th>
            <th>HTTP&nbsp;Status</th>
            <th>Description</th>
        </tr>`;

const generateHtmlFooter = () => `
    </table>
</body>
</html>`;

/**
 * Generates HTML report from provided results.
 * @param {object[]} results
 * @param {string} baseUrl
 * @param {boolean} brokenLinksOnly
 * @returns {string} Built HTML
 */
export const generateHtmlReport = (results, baseUrl, brokenLinksOnly = false) => {
    let html = generateHtmlHeader(baseUrl);

    for (const result of results) {
        for (const link of result.links) {
            const { DEFAULT_LINK, BROKEN_LINK, INVALID_FRAGMENT, UNCRAWLED_LINK } = OUTPUT_COLORS;

            const isBrokenLink = isLinkBroken(link);
            if (brokenLinksOnly && !isBrokenLink) continue;

            let color = DEFAULT_LINK;
            let description = 'OK';

            if (!link.crawled) {
                color = UNCRAWLED_LINK;
                description = 'Page not crawled';
            } else if (isBrokenLink) {
                color = BROKEN_LINK;
                description = link.errorMessage ? `Error: ${link.errorMessage}` : 'Invalid HTTP status';
            } else if (!link.fragmentValid) {
                color = INVALID_FRAGMENT;
                description = 'URL fragment not found';
            }

            html += `
                <tr style="background-color: ${color}">
                    <td><a href="${result.url}" target="_blank">${result.url}</a></td>
                    <td><a href="${link.url}" target="_blank">${link.url}</a></td>
                    <td>${link.httpStatus || ''}</td>
                    <td>${description}</td>
                </tr>`;
        }
    }

    html += generateHtmlFooter();
    return html;
};

/**
 * Check if HTTP status indicates an error
 */
export const isErrorHttpStatus = (httpStatus) => {
    const { OK, REDIRECTION, NOT_MODIFIED } = STATUS_CODES;
    const isRedirection = httpStatus >= REDIRECTION && httpStatus !== NOT_MODIFIED;
    return !httpStatus || httpStatus < OK || isRedirection;
};

/**
 * Check if a link is broken
 */
const isLinkBroken = (link) => {
    const { crawled, errorMessage, httpStatus } = link;
    return crawled && (errorMessage || isErrorHttpStatus(httpStatus));
};

/**
 * Remove trailing slash from URL
 */
export const removeLastSlash = (url) => url.replace(/\/$/, '');

/**
 * Extracts broken links from results.
 * @param {object[]} results
 * @returns {object[]} broken links
 */
export const getBrokenLinks = (results) => {
    const brokenLinks = [];

    for (const result of results) {
        for (const link of result.links) {
            if (isLinkBroken(link)) {
                brokenLinks.push({
                    link,
                    baseUrl: result.url,
                });
            }
        }
    }

    return brokenLinks;
};
