import { BASE_URL_LABEL } from './consts.js';
import { normalizeUrl } from './tools.js';
import utils from './apify-utils.js';

/**
 * Analyses the current page and creates the corresponding info record.
 * @param {import('crawlee').CheerioCrawlingContext} context
 * @returns {Promise<object>} page record
 */
export const getPageRecord = async ({ request, $, response }) => {
    const { userData: { label, referrer, depth = 0 } } = request;

    const url = normalizeUrl(request.url);

    const record = {
        url,
        isBaseWebsite: label === BASE_URL_LABEL,
        httpStatus: response?.statusCode,
        title: $('title').text().trim() || $('h1').first().text().trim() || 'No title',
        linkUrls: null,
        linkData: null,
        anchors: getAnchors($),
        referrer,
        depth,
    };

    return record;
};

/**
 * Extract and enqueue ALL links from the page
 * Uses URL normalization to prevent duplicate crawls
 * @param {import('crawlee').CheerioCrawlingContext} context
 * @param {string} baseUrl - The base URL to determine internal/external links
 * @param {number} nextDepth - Depth for enqueued requests
 * @param {number} maxDepth - Maximum crawl depth
 * @param {boolean} checkExternalLinks - Whether to check external links
 * @returns {Promise<object>} Object with linkUrls array and linkData map
 */
export const getAndEnqueueLinkUrls = async (
    { request, enqueueLinks, $ },
    baseUrl,
    nextDepth = 1,
    maxDepth = 10,
    checkExternalLinks = true
) => {
    const linkData = new Map();
    const allLinks = [];
    const internalLinksToEnqueue = [];
    const seenUrls = new Set();

    // Get the base hostname for comparison (without www)
    let baseHostname;
    try {
        baseHostname = new URL(baseUrl).hostname.replace(/^www\./, '').toLowerCase();
    } catch {
        baseHostname = '';
    }

    // Get ALL links from the page
    $('a[href]').each((_, elem) => {
        const $link = $(elem);
        const href = $link.attr('href');

        if (!href) return;

        // Skip non-http links
        if (href.startsWith('#') || href.startsWith('javascript:') ||
            href.startsWith('mailto:') || href.startsWith('tel:') ||
            href.startsWith('data:') || href.startsWith('blob:')) {
            return;
        }

        // Get absolute URL
        let absoluteUrl;
        try {
            absoluteUrl = new URL(href, request.url).href;
        } catch {
            return; // Invalid URL, skip
        }

        // Normalize for deduplication
        const normalizedUrl = utils.normalizeUrl(absoluteUrl, false);
        if (!normalizedUrl) return;

        // Skip already processed URLs (in this page's context)
        if (seenUrls.has(normalizedUrl)) {
            return;
        }
        seenUrls.add(normalizedUrl);

        // Extract link metadata
        const linkText = $link.text().trim().substring(0, 100) || $link.attr('title') || '';
        const isImage = $link.find('img').length > 0;
        const imgAlt = isImage ? $link.find('img').first().attr('alt') || '' : '';

        // Determine if internal or external
        let linkType = 'internal';
        let isInternal = true;
        try {
            const linkHostname = new URL(normalizedUrl).hostname.replace(/^www\./, '').toLowerCase();
            if (linkHostname !== baseHostname) {
                linkType = 'external';
                isInternal = false;
            }
        } catch {
            linkType = 'unknown';
            isInternal = false;
        }

        // Check if it's a resource/file link
        try {
            const pathname = new URL(normalizedUrl).pathname;
            const ext = pathname.split('.').pop()?.toLowerCase() || '';
            const resourceExts = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'zip', 'rar', 'mp3', 'mp4', 'jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'css', 'js', 'woff', 'woff2', 'ttf', 'eot', 'ico'];
            if (resourceExts.includes(ext)) {
                linkType = 'resource';
            }
        } catch {
            // Ignore
        }

        // Store link data using normalized URL
        linkData.set(normalizedUrl, {
            linkText: linkText || (isImage ? `[Image: ${imgAlt}]` : '[No text]'),
            linkType,
            isImage,
        });

        // Add internal links (non-resource) to crawl queue
        if (isInternal && linkType !== 'resource') {
            internalLinksToEnqueue.push({
                url: normalizedUrl,
                uniqueKey: normalizedUrl, // Use normalized URL as unique key
            });
        }

        // Add all links for checking
        if (isInternal || checkExternalLinks) {
            allLinks.push(normalizedUrl);
        }
    });

    // Enqueue internal links for further crawling (within depth limit)
    if (nextDepth <= maxDepth && internalLinksToEnqueue.length > 0) {
        // Use addRequests instead of enqueueLinks for better control
        const { addRequests } = await import('crawlee');
        const requestQueue = await (await import('apify')).Actor.openRequestQueue();

        for (const { url, uniqueKey } of internalLinksToEnqueue) {
            try {
                await requestQueue.addRequest({
                    url,
                    uniqueKey, // This ensures the same page isn't added twice
                    userData: {
                        referrer: request.url,
                        depth: nextDepth,
                    },
                }, { forefront: false });
            } catch {
                // Request already exists, ignore
            }
        }
    }

    return { linkUrls: allLinks, linkData };
};

/**
 * Find all HTML element IDs and <a name="xxx"> anchors
 * @param {import('cheerio').CheerioAPI} $ - Cheerio instance
 * @returns {string[]} unique anchors
 */
const getAnchors = ($) => {
    const anchors = new Set();

    $('body a[name]').each((_, elem) => {
        const name = $(elem).attr('name');
        if (name) anchors.add(name);
    });

    $('body [id]').each((_, elem) => {
        const id = $(elem).attr('id');
        if (id) anchors.add(id);
    });

    return [...anchors].sort();
};
