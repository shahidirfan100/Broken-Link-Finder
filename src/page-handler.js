import { BASE_URL_LABEL } from './consts.js';
import { normalizeUrl } from './tools.js';

// CSS selector to exclude navigation, sidebar, footer elements
const CONTENT_LINK_SELECTOR = 'main a[href], article a[href], .content a[href], #content a[href], .post a[href], .entry a[href], .page-content a[href], section:not(nav):not(footer) a[href]';
const EXCLUDED_AREAS = ['nav', 'header', 'footer', '.sidebar', '#sidebar', '.menu', '#menu', '.navigation', '#navigation', '.nav', '#nav', '.footer', '#footer', '.header', '#header'];

/**
 * Analyses the current page and creates the corresponding info record.
 * @param {import('crawlee').CheerioCrawlingContext} context
 * @returns {Promise<object>} page record
 */
export const getPageRecord = async ({ request, $, response }) => {
    const { userData: { label, referrer } } = request;

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
    };

    return record;
};

/**
 * Check if an element is inside an excluded area (nav, sidebar, footer, etc.)
 */
const isInExcludedArea = ($elem, $) => {
    for (const selector of EXCLUDED_AREAS) {
        if ($elem.closest(selector).length > 0) {
            return true;
        }
    }
    return false;
};

/**
 * Enqueue all links from the main page content (excluding nav, sidebar, footer)
 * Checks both internal AND external links
 * @param {import('crawlee').CheerioCrawlingContext} context
 * @param {string} baseUrl - The base URL to determine internal/external links
 * @returns {Promise<object>} Object with linkUrls array and linkData map
 */
export const getAndEnqueueLinkUrls = async ({ request, enqueueLinks, $ }, baseUrl) => {
    const linkData = new Map();
    const contentLinks = new Set();

    // First try to find links in main content areas
    let $links = $(CONTENT_LINK_SELECTOR);

    // If no main content found, fall back to body but exclude nav/sidebar/footer
    if ($links.length === 0) {
        $links = $('body a[href]');
    }

    $links.each((_, elem) => {
        const $link = $(elem);

        // Skip if in excluded area
        if (isInExcludedArea($link, $)) {
            return;
        }

        const href = $link.attr('href');
        if (!href) return;

        // Skip anchor-only links, javascript, mailto, tel
        if (href.startsWith('#') || href.startsWith('javascript:') ||
            href.startsWith('mailto:') || href.startsWith('tel:')) {
            return;
        }

        // Get absolute URL
        let absoluteUrl;
        try {
            absoluteUrl = new URL(href, request.url).href;
        } catch {
            return; // Invalid URL, skip
        }

        // Extract link metadata
        const linkText = $link.text().trim().substring(0, 100) || $link.attr('title') || '';
        const isImage = $link.find('img').length > 0;
        const imgAlt = isImage ? $link.find('img').first().attr('alt') || '' : '';

        // Determine link type (internal, external, resource)
        let linkType = 'internal';
        try {
            const linkHost = new URL(absoluteUrl).hostname;
            const baseHost = new URL(baseUrl || request.url).hostname;
            if (linkHost !== baseHost) {
                linkType = 'external';
            }
        } catch {
            linkType = 'unknown';
        }

        // Check if it's a resource/file link
        const ext = absoluteUrl.split('.').pop()?.toLowerCase().split('?')[0] || '';
        const resourceExts = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'zip', 'rar', 'mp3', 'mp4', 'jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'];
        if (resourceExts.includes(ext)) {
            linkType = 'resource';
        }

        // Store link data
        linkData.set(absoluteUrl, {
            linkText: linkText || (isImage ? `[Image: ${imgAlt}]` : '[No text]'),
            linkType,
            isImage,
        });

        contentLinks.add(absoluteUrl);
    });

    // Enqueue only internal links for crawling (external will be checked but not crawled)
    const result = await enqueueLinks({
        selector: CONTENT_LINK_SELECTOR.split(', ').length > 0 ? CONTENT_LINK_SELECTOR : 'main a, article a, section a',
        transformRequestFunction: (req) => {
            // Skip external links for enqueueing (but we still check them)
            try {
                const linkHost = new URL(req.url).hostname;
                const baseHost = new URL(baseUrl || request.url).hostname;
                if (linkHost !== baseHost) {
                    return false; // Don't enqueue external links
                }
            } catch {
                return false;
            }

            // Skip if in excluded area
            req.userData.referrer = request.url;
            return req;
        },
    });

    // Return all content links (both internal and external) for checking
    const linkUrls = [...contentLinks];

    return { linkUrls, linkData };
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
