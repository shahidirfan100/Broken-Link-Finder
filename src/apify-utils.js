/**
 * Modern URL normalization utilities
 * Ensures each unique page is only crawled once
 */

/**
 * Normalize URL to ensure deduplication
 * Removes: trailing slashes, query params (except important ones), fragments, www prefix
 * @param {string} url - URL to normalize
 * @param {boolean} keepFragment - Whether to keep the URL fragment
 * @returns {string|null} Normalized URL or null if invalid
 */
export const normalizeUrl = (url, keepFragment = false) => {
    if (typeof url !== 'string' || !url.length) {
        return null;
    }

    try {
        const urlObj = new URL(url.trim());

        // Normalize protocol
        const protocol = urlObj.protocol.replace(':', '').toLowerCase();
        if (!['http', 'https'].includes(protocol)) {
            return null;
        }

        // Normalize hostname - remove www prefix for consistency
        let hostname = urlObj.hostname.toLowerCase();
        hostname = hostname.replace(/^www\./, '');

        // Normalize path - remove trailing slash, decode special chars
        let path = urlObj.pathname;
        path = path.replace(/\/+$/, ''); // Remove trailing slashes
        path = path.replace(/\/+/g, '/'); // Remove duplicate slashes
        if (!path) path = ''; // Empty path for homepage

        // Filter query params - remove tracking params
        const ignoredParams = [
            'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
            'fbclid', 'gclid', 'msclkid', 'ref', 'source', 'mc_cid', 'mc_eid',
            '_ga', '_gl', 'share', 'replytocom'
        ];

        const params = [];
        urlObj.searchParams.forEach((value, key) => {
            if (!ignoredParams.includes(key.toLowerCase())) {
                params.push(`${key}=${value}`);
            }
        });
        params.sort(); // Sort for consistency

        const queryString = params.length ? `?${params.join('&')}` : '';
        const fragmentString = keepFragment && urlObj.hash ? urlObj.hash : '';

        return `${protocol}://${hostname}${path}${queryString}${fragmentString}`;
    } catch {
        // Return null for invalid URLs
        return null;
    }
};

/**
 * Get unique key for URL - used for request deduplication
 * This is more aggressive normalization for crawling purposes
 * @param {string} url - URL to get key for
 * @returns {string} Unique key for the URL
 */
export const getUrlKey = (url) => {
    const normalized = normalizeUrl(url, false);
    if (!normalized) return url;
    return normalized;
};

export default {
    normalizeUrl,
    getUrlKey,
};