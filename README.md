# Broken Link Finder

## Overview

**Broken Link Finder** is a comprehensive SEO tool designed to help you identify, track, and fix broken links on your website. By crawling your web pages systematically, it detects non-functional links, anchor fragment issues, and redirect problems—all crucial for maintaining excellent user experience and search engine rankings.

With Broken Link Finder, you can:
- Identify all broken links across your website automatically
- Detect invalid anchor fragments and broken redirects
- Receive detailed reports with actionable insights
- Schedule regular checks to monitor link health continuously
- Maintain your website's SEO performance and user satisfaction

---

## Key Features

### Comprehensive Link Analysis
- Crawl entire websites or specific sections
- Check both internal and external links
- Identify HTTP errors (404, 500, etc.) and timeout issues
- Detect broken anchor fragments (#section links)

### Flexible Crawling Options
- Scan single or multiple domains
- Crawl subdomains independently
- Set custom crawl limits to manage costs
- Control crawl concurrency to minimize server load

### Email Notifications
- Receive automated reports via email
- Focus on broken links only or get complete reports
- Schedule periodic checks automatically

### Detailed Reporting
- View comprehensive link status summaries
- Track link status codes and error messages
- Analyze link referrers for quick fixes
- Export results for further analysis

---

## How It Works

Broken Link Finder uses an intelligent crawling approach to thoroughly analyze your website:

1. **Initialization**: The crawler starts at your specified base URL
2. **Page Crawling**: It systematically crawls all linked pages within your domain
3. **Link Analysis**: On each page, it checks every link and validates anchor fragments
4. **Status Tracking**: It records HTTP status codes, error messages, and response times
5. **Report Generation**: Results are compiled into organized, actionable reports

### Example Crawl Pattern

When you start crawling from `https://www.example.com/products/`:

```
https://www.example.com/products/
https://www.example.com/products/item-1
https://www.example.com/products/item-1/reviews
https://www.example.com/products/item-2
https://www.example.com/pricing
https://www.example.com/contact
```

For each page with a link like `https://www.example.com/docs/guide#installation`, the crawler will:
- Load the target page (`https://www.example.com/docs/guide`)
- Verify the page loads successfully
- Check if the page contains the anchor section (`#installation`)
- Report any issues found

---

## Getting Started

### Quick Start

1. **Click** "Try for free" to launch the actor
2. **Enter** your website URL (e.g., `https://www.example.com`)
3. **Configure** your preferences:
   - Maximum pages to check
   - Email recipients for notifications
   - Whether to save only broken links
4. **Run** and monitor the progress
5. **Review** results and export for action

### Input Configuration

#### Website URL (Required)
The starting URL for your broken link audit. The crawler will follow links from this page to other pages on your domain.

**Example:** `https://www.example.com/blog`

#### Max Pages (Optional)
The maximum number of pages to crawl. Leave empty for unlimited crawling.

**Default:** Unlimited  
**Use case:** Control costs by limiting crawls on large websites

#### Crawl Subdomains (Optional)
When enabled, the crawler will follow links to subdomains of your base domain.

**Default:** `false`

**Example:** For `example.com`, it would also crawl `blog.example.com` and `api.example.com`

#### Notification Emails (Optional)
Email addresses to receive the broken links report after crawling completes.

**Format:** Comma-separated list  
**Example:** `admin@example.com, seo@example.com`

#### Save Only Broken Links (Optional)
When enabled, the report contains only broken links. When disabled, includes all links found.

**Default:** `false`  
**Note:** Reports with all links are not CSV-friendly but provide complete data

#### Max Concurrency (Optional)
The maximum number of pages to crawl simultaneously. Reduce to minimize server load on target websites.

**Default:** Automatic  
**Range:** 1-50

#### Proxy Configuration (Optional)
Configure proxy settings for crawling behind firewalls or for IP rotation.

---

## Output Data

### Dataset Record Example

```json
{
  "url": "https://www.example.com/products/item-1",
  "httpStatus": 404,
  "errorMessage": "Not Found",
  "title": "Product Not Found",
  "referrer": "https://www.example.com/",
  "anchors": ["section1", "section2"],
  "isBaseWebsite": false
}
```

### Report Interpretation

- **HTTP Status 200**: Link is working correctly
- **HTTP Status 301/302**: Link redirects (usually acceptable)
- **HTTP Status 404**: Page not found (broken link)
- **HTTP Status 500+**: Server error (broken link)
- **Timeout**: Page didn't respond (broken link)
- **Invalid Anchors**: Fragment exists but anchor not found on page

---

## Use Cases

### E-commerce Sites
Monitor product links and prevent customers from encountering broken pages that hurt sales and conversion rates.

### Content-Heavy Websites
Maintain integrity across hundreds of blog posts and pages with regular automated checks.

### Multi-domain Properties
Check internal links across multiple domains and subdomains to ensure consistent user experience.

### SEO Management
Identify and fix broken links before search engines crawl them, protecting your rankings and authority.

### Migration Projects
Verify all old URLs redirect properly to new locations after website redesigns or platform migrations.

---

## Pricing & Cost Estimation

Broken Link Finder is available as an Apify actor. Costs depend on the number of pages crawled and resources used.

**Typical costs:**
- Small site (100 pages): ~$0.10-0.25
- Medium site (1,000 pages): ~$1.00-2.50
- Large site (10,000 pages): ~$10.00-25.00

For detailed pricing information and current rates, visit the [Apify pricing page](https://apify.com/pricing/actors).

---

## Advanced Configuration

### Subdomain Crawling Strategy
Enable subdomain crawling when you want to audit all properties under your main domain. This is useful for multi-tenant applications or when you own multiple branded subdomains.

### Concurrency Optimization
If you receive rate-limit errors, reduce the concurrency setting. This allows the crawler to respect target server load limits and avoid temporary IP blocks.

### Email Scheduling
Use Apify's scheduling feature to run Broken Link Finder periodically (daily, weekly, or monthly) and automatically receive reports in your inbox.

---

## FAQ

**Q: Will crawling my site cause performance issues?**  
A: The crawler respects server response times and includes built-in delays. You can also adjust concurrency settings to further reduce load.

**Q: How long does a typical crawl take?**  
A: Depends on site size and concurrency. A 100-page site typically completes in 5-15 minutes.

**Q: Can I crawl external websites?**  
A: You can audit external websites to find links to your site, but monitor their terms of service regarding automated access.

**Q: What file formats do results support?**  
A: Results are available as JSON, CSV, and can be emailed as HTML reports.

**Q: Can I export results?**  
A: Yes, Apify provides export options for JSON, CSV, and other formats through the platform interface.

---

## Support & Documentation

- [Apify Platform Documentation](https://docs.apify.com/)
- [Community Support](https://apify.com/community)
- [Report Issues](https://apify.com/support)

For more information about web scraping best practices and SEO optimization, visit the [Apify Blog](https://blog.apify.com/).
 
**Crawl subdomains**
If set to `true`, the crawler will search broken links not only on the main page but also in deeper subdomains.

### Input example
Here's an input example for checking the Apify Blog for bad links. We've enabled the crawler to check subdomains as well but limited the inspection to 1,000 pages. 
```json
    {
      "baseUrl": "https://blog.apify.com",
      "maxPages": 1000,
      "notificationEmails": [
        "admin@example.com"
      ],
      "saveOnlyBrokenLinks": true,
      "crawlSubdomains": true
    }
```
 
## Output
Once the links checker finishes the crawl, it will save a report of the broken links into your **key-value store**. You will find reports in two formats there:

-   `OUTPUT`  contains a machine-readable JSON report
-   `OUTPUT.html` contains an easy-to-read HTML report 

### Output example as JSON
Here's an example of dataset of a successful Broken Links Checker run. The error message is included in the report and can be found at the bottom of the example.
```json
[
  {
    "url": "https://blog.apify.com",
    "title": "Apify Blog: Web scraping and automation stories",
    "links": [
      {
        "url": "https://apify.com/",
        "normalizedUrl": "https://apify.com",
        "httpStatus": 200,
        "fragment": "",
        "fragmentValid": true,
        "crawled": true
      },
      {
        "url": "https://apify.com/about",
        "normalizedUrl": "https://apify.com/about",
        "httpStatus": 200,
        "fragment": "",
        "fragmentValid": true,
        "crawled": true
      },
      {
        "url": "https://apify.com/jobs",
        "normalizedUrl": "https://apify.com/jobs",
        "httpStatus": 200,
        "fragment": "",
        "fragmentValid": true,
        "crawled": true
      },
      {
        "url": "https://apify.com/web-scraping",
        "normalizedUrl": "https://apify.com/web-scraping",
        "httpStatus": null,
        "errorMessage": "Error: Navigation timed out after 120 seconds.\n    at handleRequestTimeout (/home/myuser/node_modules/apify/build/crawlers/crawler_utils.js:19:11)\n    at PuppeteerCrawler._handleNavigationTimeout (/home/myuser/node_modules/apify/build/crawlers/browser_crawler.js:418:54)\n    at PuppeteerCrawler._handleNavigation (/home/myuser/node_modules/apify/build/crawlers/browser_crawler.js:401:18)\n    at async PuppeteerCrawler._handleRequestFunction (/home/myuser/node_modules/apify/build/crawlers/browser_crawler.js:343:13)\n    at async wrap (/home/myuser/node_modules/@apify/timeout/index.js:73:27)",
        "fragment": "",
        "fragmentValid": true,
        "crawled": true
      },
...
```
