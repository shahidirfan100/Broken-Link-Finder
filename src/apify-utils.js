/**
 * Modern URL normalization utilities
 * Replaces apify-shared dependency with native implementation
 */

/**
 * Parse URL string into components
 * @param {string} str - URL string to parse
 * @returns {object} Parsed URL components
 */
const parseUrl = (str) => {
    if (typeof str !== 'string') {
        return {};
    }

    try {
        const url = new URL(str.trim());
        return {
            protocol: url.protocol.replace(':', ''),
            host: url.host,
            path: url.pathname,
            query: url.search.replace('?', ''),
            fragment: url.hash.replace('#', ''),
        };
    } catch {
        // Fallback to regex-based parsing for malformed URLs
        const o = {
            key: ['source', 'protocol', 'authority', 'userInfo', 'user', 'password', 'host', 'port', 'relative', 'path', 'directory', 'file', 'query', 'fragment'],
            parser: /^(?:(?![^:@]+:[^:@/]*@)([^:/?#.]+):)?(?:\/\/)?((?:(([^:@]*)(?::([^:@]*))?)?@)?([^:/?#]*)(?::(\d*))?)(((\/(?:[^?#](?![^?#/]*\.[^?#/.]+(?:[?#]|$)))*\/?)?([^?#/]*))(?:\?([^#]*))?(?:#(.*))?)/,
        };

        const m = o.parser.exec(str);
        if (!m) return {};

        const uri = {};
        let i = o.key.length;
        while (i--) uri[o.key[i]] = m[i] || '';

        return uri;
    }
};

/**
 * Normalize URL by removing trailing slashes, sorting query params, and removing UTM params
 * @param {string} url - URL to normalize
 * @param {boolean} keepFragment - Whether to keep the URL fragment
 * @returns {string|null} Normalized URL or null if invalid
 */
export const normalizeUrl = (url, keepFragment = false) => {
    if (typeof url !== 'string' || !url.length) {
        return null;
    }

    const urlObj = parseUrl(url.trim());

    if (!urlObj.protocol || !urlObj.host) {
        return null;
    }

    const path = urlObj.path.replace(/\/$/, '');
    const params = urlObj.query
        ? urlObj.query
            .split('&')
            .filter((param) => !/^utm_/.test(param))
            .sort()
        : [];

    const queryString = params.length ? `?${params.join('&').trim()}` : '';
    const fragmentString = keepFragment && urlObj.fragment ? `#${urlObj.fragment.trim()}` : '';

    return `${urlObj.protocol.trim().toLowerCase()}://${urlObj.host.trim().toLowerCase()}${path.trim()}${queryString}${fragmentString}`;
};

export default {
    normalizeUrl,
};