import { log } from 'apify';
import { BASE_URL_LABEL } from './consts.js';
import { normalizeUrl } from './tools.js';

// Areas to exclude from link extraction
const EXCLUDED_SELECTORS = [
    'nav', 'header', 'footer',
    '.sidebar', '#sidebar',
    '.menu', '#menu', '.main-menu',
    '.navigation', '#navigation',
    '.nav', '#nav', '.navbar',
    '.footer', '#footer',
    '.header', '#header',
    '.widget', '.widgets',
    '.breadcrumb', '.breadcrumbs',
    '.pagination', '.pager',
    '.social', '.share', '.social-share',
    '.comments', '#comments', '.comment-form',
    '.related-posts', '.related',
    '.author-box', '.author-bio',
    '.advertisement', '.ad', '.ads',
];

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
 * Check if an element is inside an excluded area (nav, sidebar, footer, etc.)
 */
const isInExcludedArea = ($elem, $) => {
    for (const selector of EXCLUDED_SELECTORS) {
        if ($elem.closest(selector).length > 0) {
            return true;
        }
    }
    return false;
};

/**
 * Enqueue all links from the page
 * Uses broad selection and filters out navigation areas
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
    maxDepth = 3,
    checkExternalLinks = true
) => {
    const linkData = new Map();
    const allLinks = [];
    const internalLinks = [];

    // Get ALL links from body, then filter out excluded areas
    const $links = $('body a[href]');

    log.debug(`Found ${$links.length} total links on page`, { url: request.url, depth: nextDepth - 1 });

    $links.each((_, elem) => {
        const $link = $(elem);

        // Skip if in excluded area (nav, sidebar, footer, etc.)
        if (isInExcludedArea($link, $)) {
            return;
        }

        const href = $link.attr('href');
        if (!href) return;

        // Skip anchor-only links, javascript, mailto, tel
        if (href.startsWith('#') || href.startsWith('javascript:') ||
            href.startsWith('mailto:') || href.startsWith('tel:') ||
            href.startsWith('data:')) {
            return;
        }

        // Get absolute URL
        let absoluteUrl;
        try {
            absoluteUrl = new URL(href, request.url).href;
        } catch {
            return; // Invalid URL, skip
        }

        // Skip already processed URLs
        if (linkData.has(absoluteUrl)) {
            return;
        }

        // Extract link metadata
        const linkText = $link.text().trim().substring(0, 100) || $link.attr('title') || '';
        const isImage = $link.find('img').length > 0;
        const imgAlt = isImage ? $link.find('img').first().attr('alt') || '' : '';

        // Determine link type
        let linkType = 'internal';
        let isInternal = true;
        try {
            const linkHost = new URL(absoluteUrl).hostname;
            const baseHost = new URL(baseUrl || request.url).hostname;
            // Also check without www
            const linkHostClean = linkHost.replace(/^www\./, '');
            const baseHostClean = baseHost.replace(/^www\./, '');

            if (linkHostClean !== baseHostClean) {
                linkType = 'external';
                isInternal = false;
            }
        } catch {
            linkType = 'unknown';
            isInternal = false;
        }

        // Check if it's a resource/file link
        const pathname = new URL(absoluteUrl).pathname;
        const ext = pathname.split('.').pop()?.toLowerCase() || '';
        const resourceExts = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'zip', 'rar', 'mp3', 'mp4', 'jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'css', 'js'];
        if (resourceExts.includes(ext)) {
            linkType = 'resource';
        }

        // Store link data
        linkData.set(absoluteUrl, {
            linkText: linkText || (isImage ? `[Image: ${imgAlt}]` : '[No text]'),
            linkType,
            isImage,
        });

        // Add to appropriate list
        if (isInternal && linkType !== 'resource') {
            internalLinks.push(absoluteUrl);
        }

        // Add all links for checking (including external if enabled)
        if (isInternal || checkExternalLinks) {
            allLinks.push(absoluteUrl);
        }
    });

    log.debug(`Extracted ${allLinks.length} links (${internalLinks.length} internal)`, {
        url: request.url,
        depth: nextDepth - 1,
        willEnqueue: nextDepth <= maxDepth
    });

    // Enqueue internal links for further crawling (within depth limit)
    if (nextDepth <= maxDepth && internalLinks.length > 0) {
        log.info(`Enqueueing ${internalLinks.length} internal links at depth ${nextDepth}`, {
            url: request.url
        });

        await enqueueLinks({
            urls: internalLinks,
            transformRequestFunction: (req) => {
                req.userData = {
                    ...req.userData,
                    referrer: request.url,
                    depth: nextDepth,
                };
                return req;
            },
        });
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
