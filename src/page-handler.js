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
        anchors: getAnchors($),
        referrer,
    };

    return record;
};

/**
 * Enqueue all links from the page and return their URLs
 * @param {import('crawlee').CheerioCrawlingContext} context
 * @returns {Promise<string[]>} Array of link URLs
 */
export const getAndEnqueueLinkUrls = async ({ request, enqueueLinks }) => {
    const result = await enqueueLinks({
        selector: 'a',
        transformRequestFunction: (req) => {
            req.userData.referrer = request.url;
            return req;
        },
    });

    return result.processedRequests.map((req) => req.uniqueKey);
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
