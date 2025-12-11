import { BASE_URL_LABEL } from './consts.js';
import { normalizeUrl } from './tools.js';
import utils from './apify-utils.js';

// URL patterns to skip (pagination, archives, etc.)
const SKIP_URL_PATTERNS = [
    /\/page\/\d+\/?$/i,           // Pagination: /page/2/, /page/3/
    /\/tag\/[^/]+\/page\/\d+/i,   // Tag pagination
    /\/category\/[^/]+\/page\/\d+/i, // Category pagination
    /\/author\/[^/]+\/page\/\d+/i,   // Author pagination
    /\?page=\d+/i,                // Query param pagination
    /\?p=\d+/i,                   // WordPress paging
    /\/feed\/?$/i,                // RSS feeds
    /\/rss\/?$/i,                 // RSS feeds
    /\/comments\/feed\/?$/i,      // Comment feeds
    /\/trackback\/?$/i,           // Trackbacks
    /\/wp-json\//i,               // WordPress API
    /\/wp-admin\//i,              // WordPress admin
    /\/wp-content\/uploads\//i,   // WordPress uploads
    /\/attachment\//i,            // Attachment pages
    /\/#respond$/i,               // Comment sections
    /\/replytocom=/i,             // Reply to comment
    /\/share[?/]/i,               // Share pages
    /\/print\/?$/i,               // Print versions
];

// Archive URL patterns (crawl but don't go deep)
const ARCHIVE_URL_PATTERNS = [
    /\/tag\/[^/]+\/?$/i,          // Tag archives
    /\/category\/[^/]+\/?$/i,     // Category archives
    /\/author\/[^/]+\/?$/i,       // Author archives
    /\/\d{4}\/\d{2}\/?$/i,        // Date archives: /2024/01/
    /\/\d{4}\/?$/i,               // Year archives: /2024/
    /\/archive\//i,               // Generic archives
];

/**
 * Check if URL should be skipped entirely
 */
const shouldSkipUrl = (url) => {
    return SKIP_URL_PATTERNS.some(pattern => pattern.test(url));
};

/**
 * Check if URL is an archive page (limit depth)
 */
const isArchivePage = (url) => {
    return ARCHIVE_URL_PATTERNS.some(pattern => pattern.test(url));
};

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
 * Extract and enqueue links from the page
 * Filters out pagination and archive pages to prevent crawl bloat
 * @param {import('crawlee').CheerioCrawlingContext} context
 * @param {string} baseUrl - The base URL to determine internal/external links
 * @param {number} nextDepth - Depth for enqueued requests
 * @param {number} maxDepth - Maximum crawl depth
 * @param {boolean} checkExternalLinks - Whether to check external links
 * @returns {Promise<object>} Object with linkUrls array and linkData map
 */
export const getAndEnqueueLinkUrls = async (
    { request, $, enqueueLinks },
    baseUrl,
    nextDepth = 1,
    maxDepth = 10,
    checkExternalLinks = true
) => {
    const linkData = new Map();
    const allLinks = [];
    const internalLinksToEnqueue = [];
    const seenUrls = new Set();

    // Check if current page is an archive (limit its depth contribution)
    const currentIsArchive = isArchivePage(request.url);
    const effectiveNextDepth = currentIsArchive ? maxDepth : nextDepth; // Archives don't contribute to depth

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

        // Skip pagination and problematic URLs
        if (shouldSkipUrl(normalizedUrl)) {
            return;
        }

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

        // Add internal links (non-resource, non-archive) to crawl queue
        if (isInternal && linkType !== 'resource' && !isArchivePage(normalizedUrl)) {
            internalLinksToEnqueue.push({
                url: normalizedUrl,
                uniqueKey: normalizedUrl,
            });
        }

        // Add all links for checking (to find broken links)
        if (isInternal || checkExternalLinks) {
            allLinks.push(normalizedUrl);
        }
    });

    // Enqueue internal links for further crawling (within depth limit)
    if (effectiveNextDepth <= maxDepth && internalLinksToEnqueue.length > 0) {
        const { Actor } = await import('apify');
        const requestQueue = await Actor.openRequestQueue();

        for (const { url, uniqueKey } of internalLinksToEnqueue) {
            try {
                await requestQueue.addRequest({
                    url,
                    uniqueKey,
                    userData: {
                        referrer: request.url,
                        depth: effectiveNextDepth,
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
