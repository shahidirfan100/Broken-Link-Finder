import { Actor, log } from 'apify';

import { EMAIL_NOTIFICATION_ACTOR_ID, STATUS_CODES } from './consts.js';

/**
 * Check if HTTP status indicates an error
 */
const isErrorHttpStatus = (httpStatus) => {
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
 * Generate simple HTML report for email notification
 */
const generateEmailReport = (results, baseUrl) => {
    let brokenCount = 0;
    let rows = '';

    for (const result of results) {
        for (const link of result.links) {
            if (isLinkBroken(link)) {
                brokenCount++;
                rows += `
                    <tr>
                        <td style="padding:8px;border:1px solid #ddd;">${result.url}</td>
                        <td style="padding:8px;border:1px solid #ddd;color:#dc2626;">${link.url}</td>
                        <td style="padding:8px;border:1px solid #ddd;">${link.httpStatus || 'N/A'}</td>
                        <td style="padding:8px;border:1px solid #ddd;">${link.errorMessage || 'Broken link'}</td>
                    </tr>`;
            }
        }
    }

    return `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; padding: 20px; }
        h1 { color: #1a1a2e; }
        table { border-collapse: collapse; width: 100%; margin-top: 20px; }
        th { background: #1a1a2e; color: white; padding: 12px 8px; text-align: left; }
        .summary { background: #fee2e2; padding: 15px; border-radius: 8px; margin: 20px 0; }
    </style>
</head>
<body>
    <h1>🔗 Broken Link Report</h1>
    <p>Website: <a href="${baseUrl}">${baseUrl}</a></p>
    <div class="summary">
        <strong>Found ${brokenCount} broken link${brokenCount !== 1 ? 's' : ''}</strong>
    </div>
    <table>
        <tr>
            <th>Source Page</th>
            <th>Broken Link</th>
            <th>HTTP Status</th>
            <th>Error</th>
        </tr>
        ${rows}
    </table>
</body>
</html>`;
};

/**
 * Send email notification with broken links report
 * @param {object[]} results - Crawl results
 * @param {string} baseUrl - Base URL that was crawled
 * @param {string[]} emails - Email addresses to notify
 */
export const sendEmailNotification = async (results, baseUrl, emails) => {
    const joinedEmails = emails.join(', ');

    const html = generateEmailReport(results, baseUrl);

    const emailActorInput = {
        to: joinedEmails,
        subject: `Broken links notification for ${baseUrl}`,
        html,
    };

    log.info('Sending email notification...', { to: joinedEmails });
    await Actor.call(EMAIL_NOTIFICATION_ACTOR_ID, emailActorInput);
    log.info('Notification sent successfully');
};
