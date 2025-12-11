import { Actor, log } from 'apify';

import { EMAIL_NOTIFICATION_ACTOR_ID } from './consts.js';
import { generateHtmlReport } from './tools.js';

/**
 * Send email notification with broken links report
 * @param {object[]} results - Crawl results
 * @param {string} baseUrl - Base URL that was crawled
 * @param {string[]} emails - Email addresses to notify
 */
export const sendEmailNotification = async (results, baseUrl, emails) => {
    const joinedEmails = emails.join(', ');

    const html = generateHtmlReport(results, baseUrl, true);

    const emailActorInput = {
        to: joinedEmails,
        subject: `Broken links notification for ${baseUrl}`,
        html,
    };

    log.info('Sending email notification...', { to: joinedEmails });
    await Actor.call(EMAIL_NOTIFICATION_ACTOR_ID, emailActorInput);
    log.info('Notification sent successfully');
};
