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
 * Get human-readable status from HTTP status code
 * @param {number|null} httpStatus
 * @param {string|null} errorMessage
 * @returns {string}
 */
const getStatus = (httpStatus, errorMessage) => {
    if (errorMessage) {
        if (errorMessage.toLowerCase().includes('timeout')) return 'Timeout';
        if (errorMessage.includes('ENOTFOUND') || errorMessage.includes('ECONNREFUSED')) return 'Not Found';
        if (errorMessage.includes('ECONNRESET')) return 'Connection Reset';
        return 'Error';
    }
    if (!httpStatus) return 'Unknown';
    if (httpStatus >= 200 && httpStatus < 300) return 'OK';
    if (httpStatus >= 300 && httpStatus < 400) return 'Redirect';
    if (httpStatus === 404) return 'Not Found';
    if (httpStatus === 403) return 'Forbidden';
    if (httpStatus === 401) return 'Unauthorized';
    if (httpStatus >= 400 && httpStatus < 500) return 'Client Error';
    if (httpStatus >= 500) return 'Server Error';
    return 'Unknown';
};

/**
 * Get issue type from status
 * @param {number|null} httpStatus
 * @param {string|null} errorMessage
 * @returns {string}
 */
const getIssueType = (httpStatus, errorMessage) => {
    if (errorMessage) {
        if (errorMessage.toLowerCase().includes('timeout')) return 'timeout';
        if (errorMessage.includes('ENOTFOUND')) return 'dns_error';
        if (errorMessage.includes('ECONNREFUSED')) return 'connection_refused';
        if (errorMessage.includes('ECONNRESET')) return 'connection_reset';
        return 'network_error';
    }
    if (!httpStatus) return 'no_response';
    if (httpStatus >= 200 && httpStatus < 300) return 'none';
    if (httpStatus === 404) return '404_not_found';
    if (httpStatus === 403) return '403_forbidden';
    if (httpStatus === 401) return '401_unauthorized';
    if (httpStatus === 500) return '500_internal_error';
    if (httpStatus === 502) return '502_bad_gateway';
    if (httpStatus === 503) return '503_service_unavailable';
    if (httpStatus >= 300 && httpStatus < 400) return 'redirect';
    if (httpStatus >= 400 && httpStatus < 500) return '4xx_client_error';
    if (httpStatus >= 500) return '5xx_server_error';
    return 'unknown';
};

/**
 * Get severity level
 * @param {boolean} isBroken
 * @param {string} issueType
 * @returns {string}
 */
const getSeverity = (isBroken, issueType) => {
    if (!isBroken) return 'none';
    if (['404_not_found', '500_internal_error', 'timeout', 'dns_error'].includes(issueType)) return 'high';
    if (['403_forbidden', '502_bad_gateway', '503_service_unavailable'].includes(issueType)) return 'medium';
    if (issueType === 'redirect') return 'low';
    return 'medium';
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
 * Creates collection of results for the provided base url.
 * Also pushes clean link records to the dataset.
 * @param {string} baseUrl
 * @param {object[]} records
 * @param {boolean} saveOnlyBrokenLinks
 * @returns {Promise<object[]>} built results
 */
export const getResults = async (baseUrl, records, saveOnlyBrokenLinks = false) => {
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
            // Get link metadata from record
            const linkDataMap = record.linkData || new Map();

            for (const linkUrl of record.linkUrls) {
                const linkNurl = normalizeUrl(linkUrl);
                const link = createLink(linkUrl, linkNurl, urlToRecord);
                result.links.push(link);

                // Get enhanced link metadata
                const linkMeta = linkDataMap.get(linkUrl) || linkDataMap.get(linkNurl) || {};

                // Determine if broken
                const isBroken = isLinkBroken(link);
                const issueType = getIssueType(link.httpStatus, link.errorMessage);
                const severity = getSeverity(isBroken, issueType);

                // Push clean flat record to dataset
                if (!saveOnlyBrokenLinks || isBroken) {
                    await Actor.pushData({
                        // Source information
                        sourceUrl: url,
                        sourceTitle: record?.title ?? '',

                        // Target link details
                        targetUrl: linkUrl,
                        linkText: linkMeta.linkText || '',
                        linkType: linkMeta.linkType || 'unknown',

                        // Status information
                        httpStatus: link.httpStatus,
                        status: getStatus(link.httpStatus, link.errorMessage),
                        isBroken,

                        // Issue details
                        severity,
                        issueType,
                        errorMessage: link.errorMessage || '',

                        // Metadata
                        checkedAt: new Date().toISOString(),
                    });
                }

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
 * Saves results summary in JSON format into key value store.
 */
export const saveResults = async (results, baseUrl, brokenLinks, startTime) => {
    log.info('Saving results...');

    // Calculate summary stats
    let totalLinksChecked = 0;
    for (const result of results) {
        totalLinksChecked += result.links.length;
    }

    const duration = Date.now() - startTime;
    const durationStr = `${Math.floor(duration / 60000)}m ${Math.floor((duration % 60000) / 1000)}s`;

    // Group broken links by severity
    const highSeverity = brokenLinks.filter(bl => getSeverity(true, getIssueType(bl.link.httpStatus, bl.link.errorMessage)) === 'high');
    const mediumSeverity = brokenLinks.filter(bl => getSeverity(true, getIssueType(bl.link.httpStatus, bl.link.errorMessage)) === 'medium');
    const lowSeverity = brokenLinks.filter(bl => getSeverity(true, getIssueType(bl.link.httpStatus, bl.link.errorMessage)) === 'low');

    // Save structured output summary
    const output = {
        summary: {
            baseUrl,
            totalPagesChecked: results.length,
            totalLinksChecked,
            brokenLinksCount: brokenLinks.length,
            bySeverity: {
                high: highSeverity.length,
                medium: mediumSeverity.length,
                low: lowSeverity.length,
            },
            crawlDuration: durationStr,
            completedAt: new Date().toISOString(),
        },
        brokenLinks: brokenLinks.map(({ link, baseUrl: sourceUrl }) => ({
            sourceUrl,
            targetUrl: link.url,
            httpStatus: link.httpStatus,
            status: getStatus(link.httpStatus, link.errorMessage),
            severity: getSeverity(true, getIssueType(link.httpStatus, link.errorMessage)),
            issueType: getIssueType(link.httpStatus, link.errorMessage),
            errorMessage: link.errorMessage || '',
        })),
    };

    await Actor.setValue('OUTPUT', output);

    // Generate and save HTML report
    const html = generateHtmlReport(results, baseUrl, brokenLinks.length, totalLinksChecked);
    await Actor.setValue('OUTPUT.html', html, { contentType: 'text/html' });

    const storeId = process.env.APIFY_DEFAULT_KEY_VALUE_STORE_ID;
    log.info(`HTML report saved: https://api.apify.com/v2/key-value-stores/${storeId}/records/OUTPUT.html?disableRedirect=1`);
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

/**
 * Generate modern HTML report
 */
const generateHtmlReport = (results, baseUrl, brokenCount, totalLinks) => {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Broken Link Report - ${baseUrl}</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            min-height: 100vh;
            padding: 24px;
            color: #333;
        }
        .container { max-width: 1400px; margin: 0 auto; }
        .header {
            background: white;
            border-radius: 16px;
            padding: 32px;
            margin-bottom: 24px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.2);
        }
        h1 { font-size: 28px; color: #1a1a2e; margin-bottom: 8px; }
        .subtitle { color: #666; font-size: 14px; margin-bottom: 24px; }
        .subtitle a { color: #4f46e5; text-decoration: none; }
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
            gap: 16px;
        }
        .stat-card {
            background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
            border-radius: 12px;
            padding: 20px;
            text-align: center;
            border: 1px solid #e2e8f0;
        }
        .stat-value { font-size: 36px; font-weight: 700; }
        .stat-value.broken { color: #dc2626; }
        .stat-value.ok { color: #16a34a; }
        .stat-value.total { color: #4f46e5; }
        .stat-label { font-size: 12px; color: #64748b; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.5px; }
        .table-card {
            background: white;
            border-radius: 16px;
            overflow: hidden;
            box-shadow: 0 10px 40px rgba(0,0,0,0.2);
        }
        .table-header {
            background: #1a1a2e;
            color: white;
            padding: 20px 24px;
            font-weight: 600;
            font-size: 16px;
        }
        table { width: 100%; border-collapse: collapse; }
        th {
            background: #f8fafc;
            text-align: left;
            padding: 14px 16px;
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: #64748b;
            border-bottom: 2px solid #e2e8f0;
        }
        td {
            padding: 14px 16px;
            border-bottom: 1px solid #f1f5f9;
            font-size: 13px;
            vertical-align: top;
        }
        tr:hover { background: #fafafa; }
        .url-cell { max-width: 350px; word-break: break-all; }
        .url-cell a { color: #4f46e5; text-decoration: none; }
        .url-cell a:hover { text-decoration: underline; }
        .badge {
            display: inline-block;
            padding: 4px 10px;
            border-radius: 9999px;
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
        }
        .badge-ok { background: #dcfce7; color: #166534; }
        .badge-broken { background: #fee2e2; color: #991b1b; }
        .badge-warning { background: #fef3c7; color: #92400e; }
        .badge-redirect { background: #e0e7ff; color: #3730a3; }
        .severity-high { border-left: 4px solid #dc2626; }
        .severity-medium { border-left: 4px solid #f59e0b; }
        .severity-low { border-left: 4px solid #3b82f6; }
        .http-code { font-family: 'SF Mono', Monaco, monospace; font-weight: 600; }
        .empty-state { text-align: center; padding: 60px 20px; color: #64748b; }
        .empty-state .icon { font-size: 48px; margin-bottom: 16px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔗 Broken Link Report</h1>
            <p class="subtitle">Scanned: <a href="${baseUrl}" target="_blank">${baseUrl}</a></p>
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-value broken">${brokenCount}</div>
                    <div class="stat-label">Broken Links</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value ok">${totalLinks - brokenCount}</div>
                    <div class="stat-label">Working Links</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value total">${totalLinks}</div>
                    <div class="stat-label">Total Checked</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value total">${results.length}</div>
                    <div class="stat-label">Pages Crawled</div>
                </div>
            </div>
        </div>
        <div class="table-card">
            <div class="table-header">All Links Found</div>
            <table>
                <thead>
                    <tr>
                        <th>Source Page</th>
                        <th>Target URL</th>
                        <th>HTTP</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
${generateTableRows(results)}
                </tbody>
            </table>
        </div>
    </div>
</body>
</html>`;
};

const generateTableRows = (results) => {
    let rows = '';

    for (const result of results) {
        for (const link of result.links) {
            const isBroken = isLinkBroken(link);
            const status = getStatus(link.httpStatus, link.errorMessage);
            const issueType = getIssueType(link.httpStatus, link.errorMessage);
            const severity = getSeverity(isBroken, issueType);

            let badgeClass = 'badge-ok';
            if (isBroken) badgeClass = 'badge-broken';
            else if (status === 'Redirect') badgeClass = 'badge-redirect';
            else if (!link.crawled) badgeClass = 'badge-warning';

            const severityClass = isBroken ? `severity-${severity}` : '';

            rows += `
                    <tr class="${severityClass}">
                        <td class="url-cell"><a href="${result.url}" target="_blank">${result.url}</a></td>
                        <td class="url-cell"><a href="${link.url}" target="_blank">${link.url}</a></td>
                        <td class="http-code">${link.httpStatus || '—'}</td>
                        <td><span class="badge ${badgeClass}">${status}</span></td>
                    </tr>`;
        }
    }

    if (!rows) {
        rows = '<tr><td colspan="4" class="empty-state"><div class="icon">✨</div>No links found</td></tr>';
    }

    return rows;
};
