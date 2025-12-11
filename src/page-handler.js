import { BASE_URL_LABEL } from './consts.js';
import { normalizeUrl } from './tools.js';

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
        linkData: null, // Enhanced link data with text and attributes
        anchors: getAnchors($),
        referrer,
    };

    return record;
};

/**
 * Enqueue all links from the page and return their URLs with metadata
 * @param {import('crawlee').CheerioCrawlingContext} context
 * @param {string} baseUrl - The base URL to determine internal/external links
 * @returns {Promise<object>} Object with linkUrls array and linkData map
 */
export const getAndEnqueueLinkUrls = async ({ request, enqueueLinks, $ }, baseUrl) => {
    // Extract link data (text, attributes) before enqueueing
    const linkData = new Map();

    $('a[href]').each((_, elem) => {
        const $link = $(elem);
        const href = $link.attr('href');
        if (!href) return;

        // Get absolute URL
        let absoluteUrl = href;
        try {
            absoluteUrl = new URL(href, request.url).href;
        } catch {
            // Invalid URL, skip
            return;
        }

        // Extract link metadata
        const linkText = $link.text().trim().substring(0, 100) || $link.attr('title') || '';
        const isImage = $link.find('img').length > 0;
        const imgAlt = isImage ? $link.find('img').first().attr('alt') || '' : '';

        // Determine link type
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

        // Check if it's a resource link
        const ext = absoluteUrl.split('.').pop()?.toLowerCase() || '';
        const resourceExts = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'zip', 'rar', 'mp3', 'mp4', 'jpg', 'jpeg', 'png', 'gif'];
        if (resourceExts.includes(ext)) {
            linkType = 'resource';
        }

        linkData.set(absoluteUrl, {
            linkText: linkText || (isImage ? `[Image: ${imgAlt}]` : '[No text]'),
            linkType,
            isImage,
        });
    });

    // Enqueue links
    const result = await enqueueLinks({
        selector: 'a',
        transformRequestFunction: (req) => {
            req.userData.referrer = request.url;
            return req;
        },
    });

    const linkUrls = result.processedRequests.map((req) => req.uniqueKey);

    return { linkUrls, linkData };
};

/**
 * Find all HTML element IDs and <a name="xxx"> anchors,
 * basically anything that can be addressed by #fragment
 * @param {import('cheerio').CheerioAPI} $ - Cheerio instance
 * @returns {string[]} unique anchors
 */
const getAnchors = ($) => {
    const anchors = new Set();

    // Get anchors from <a name="xxx"> elements
    $('body a[name]').each((_, elem) => {
        const name = $(elem).attr('name');
        if (name) anchors.add(name);
    });

    // Get anchors from elements with id attributes
    $('body [id]').each((_, elem) => {
        const id = $(elem).attr('id');
        if (id) anchors.add(id);
    });

    return [...anchors].sort();
};
