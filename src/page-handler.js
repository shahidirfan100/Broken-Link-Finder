import _ from 'underscore';

import { BASE_URL_LABEL } from './consts.js';
import { normalizeUrl } from './tools.js';

/**
 * Analyses the current page and creates the corresponding info record.
 * @param {any} context 
 * @returns {Promise<{
 *  url: string,
 *  isBaseWebsite: boolean,
 *  httpStatus: any,
 *  title: any,
 *  linkUrls: any,
 *  anchors: any[],
 * }>} page record
 */
export const getPageRecord = async ({ request, $, response }) => {
    const { userData: { label, referrer } } = request;

    const url = normalizeUrl(request.url);

    const record = {
        url,
        isBaseWebsite: false,
        httpStatus: response?.statusCode,
        title: $('title').text() || $('h1').first().text() || 'No title',
        linkUrls: null,
        anchors: await getAnchors($),
        referrer,
    };

    /* if (response.status() !== 200) {
        log.info('ALERT');
        console.dir(request);
        console.dir(record);
        console.dir(response);
    } */

    if (label === BASE_URL_LABEL) {
        record.isBaseWebsite = true;
    }

    return record;
};

export const getAndEnqueueLinkUrls = async ({ crawler: { requestQueue }, request, enqueueLinks }) => {
    const requests = (await enqueueLinks({
        selector: 'a',
        transformRequestFunction: (req) => {
            req.userData.referrer = request.url;
            return req;
        }
    })).processedRequests;

    return requests.map((req) => req.uniqueKey);
};

/**
 * Find all HTML element IDs and <a name="xxx"> anchors,
 * basically anything that can be addressed by #fragment
 * @param {CheerioAPI} $ - Cheerio instance
 * @returns {Promise<any[]>} unique anchors
 */
const getAnchors = async ($) => {
    const anchors = [];

    // Get anchors from <a name="xxx"> elements
    $('body a[name]').each((i, elem) => {
        const name = $(elem).attr('name');
        if (name) anchors.push(name);
    });

    // Get anchors from elements with id attributes
    $('body [id]').each((i, elem) => {
        const id = $(elem).attr('id');
        if (id) anchors.push(id);
    });

    const sortedAnchors = anchors.sort();
    const uniqueAnchors = _.uniq(sortedAnchors, true);

    return uniqueAnchors;
};
