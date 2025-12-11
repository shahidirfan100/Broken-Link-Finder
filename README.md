# Broken Link Finder

Find and fix broken links on any website. This tool crawls your pages, checks every link, and reports which ones are broken — helping you maintain SEO rankings and provide a better user experience.

## What does Broken Link Finder do?

Broken Link Finder automatically scans your website to detect:

- **404 errors** — Pages that no longer exist
- **Server errors (5xx)** — Links to pages with server problems
- **Timeout issues** — Links that take too long to respond
- **Invalid anchors** — Fragment links (#section) that don't exist on the page
- **External broken links** — Dead links pointing to other websites

## Why check for broken links?

Broken links hurt your website in multiple ways:

1. **SEO Impact** — Search engines penalize sites with broken links
2. **User Experience** — Visitors leave when they hit dead ends
3. **Lost Revenue** — Broken product or checkout links cost sales
4. **Credibility** — Broken links make your site look unmaintained

## Features

- **Deep crawling** — Check links inside article pages, not just the homepage
- **Configurable depth** — Control how deep the crawler goes (1-10 levels)
- **Fast parallel checking** — Scan up to 50 pages simultaneously
- **External link checking** — Verify links to other websites work
- **Smart content detection** — Focuses on main content, skips navigation menus
- **Email notifications** — Get reports sent directly to your inbox
- **Detailed reports** — HTML and JSON reports with all findings

## How to use

1. Click **Try for free** to open the actor
2. Enter your **Website URL** (e.g., `https://example.com/blog`)
3. Set **Crawl depth** to control how deep to check (default: 3)
4. Set **Max pages** to limit the crawl size (default: 100)
5. Click **Start** and wait for results
6. Download the report or view online

## Input options

| Field | Description | Default |
|-------|-------------|---------|
| **Website URL** | The starting URL to crawl | Required |
| **Max pages** | Maximum pages to crawl | 100 |
| **Crawl depth** | How many levels deep to check links | 3 |
| **Max concurrency** | Pages to check in parallel | 10 |
| **Check external links** | Also verify links to other sites | Yes |
| **Save only broken links** | Only save broken links to dataset | Yes |
| **Crawl subdomains** | Include subdomains in the crawl | No |
| **Notification emails** | Email addresses for reports | None |

## Input example

Check a blog for broken links, going 3 levels deep:

```json
{
    "baseUrl": "https://example.com/blog",
    "maxPages": 500,
    "maxCrawlDepth": 3,
    "maxConcurrency": 10,
    "checkExternalLinks": true,
    "saveOnlyBrokenLinks": true
}
```

Check an entire e-commerce site including subdomains:

```json
{
    "baseUrl": "https://shop.example.com",
    "maxPages": 2000,
    "maxCrawlDepth": 4,
    "crawlSubdomains": true,
    "notificationEmails": ["webmaster@example.com"]
}
```

## Output

Results are saved in two formats:

### Dataset (structured data)

Each broken link is saved as a record:

```json
{
    "sourceUrl": "https://example.com/blog/old-post",
    "sourceTitle": "My Old Blog Post",
    "targetUrl": "https://example.com/deleted-page",
    "linkText": "Click here",
    "linkType": "internal",
    "httpStatus": 404,
    "status": "Not Found",
    "isBroken": true,
    "severity": "high",
    "issueType": "404_not_found",
    "checkedAt": "2024-01-15T10:30:00Z"
}
```

### Key-Value Store

- **OUTPUT** — JSON summary with statistics and all broken links
- **OUTPUT.html** — Visual HTML report for easy viewing

## Understanding the results

| Status | HTTP Code | Severity | Meaning |
|--------|-----------|----------|---------|
| OK | 200 | None | Link works correctly |
| Redirect | 301/302 | Low | Link redirects (usually fine) |
| Not Found | 404 | High | Page doesn't exist |
| Forbidden | 403 | Medium | Access denied |
| Server Error | 500+ | High | Server problem |
| Timeout | — | High | Page didn't respond |

## How crawl depth works

The **Crawl depth** setting controls how deep the crawler goes:

| Depth | What gets checked |
|-------|-------------------|
| 1 | Only links on the starting page |
| 2 | Starting page + one level of linked pages |
| 3 | Two levels deep (recommended for most sites) |
| 4+ | Deeper crawling for large content sites |

**Example with depth 3:**
1. Crawls category page `/blog/tutorials`
2. Finds 20 article links, crawls each article
3. Checks all links inside each article (images, downloads, related posts)

## Use cases

### Blog and content sites
Find broken links in old articles that reference deleted pages or outdated external resources.

### E-commerce stores
Detect broken product links, missing images, and dead checkout paths before customers do.

### Documentation sites
Ensure all internal links between docs work and external API references are valid.

### Site migrations
Verify all old URLs properly redirect after moving to a new domain or platform.

### Regular SEO audits
Schedule weekly or monthly checks to catch broken links before search engines do.

## Cost estimation

Costs depend on pages crawled and resources used:

| Site Size | Pages | Estimated Cost |
|-----------|-------|----------------|
| Small | 100 | ~$0.10-0.25 |
| Medium | 1,000 | ~$1.00-2.50 |
| Large | 10,000 | ~$10.00-25.00 |

## Tips for best results

1. **Start small** — Test with 50-100 pages first to verify settings
2. **Use appropriate depth** — Depth 3 works for most sites
3. **Lower concurrency** — Reduce to 5 if you get rate-limited
4. **Schedule regular checks** — Use Apify schedules for weekly monitoring
5. **Check external links** — Many broken links point to other sites

## Integrations

Export results to:
- Google Sheets
- Slack notifications
- Email reports
- Webhooks for custom integrations
- Any tool via Apify API

## FAQ

**How long does a crawl take?**

A 100-page site typically completes in 2-5 minutes. Larger sites take proportionally longer.

**Will this slow down my website?**

The crawler includes rate limiting and respects server responses. Reduce concurrency if needed.

**Can I check competitor websites?**

Yes, but respect their terms of service and use reasonable crawl limits.

**What's the difference between internal and external links?**

Internal links point to pages on your site. External links point to other websites.

**How do I fix broken links?**

Update the link to the correct URL, set up a redirect, or remove the link entirely.

## Support

- [Apify Documentation](https://docs.apify.com/)
- [Community Forum](https://discord.gg/apify)
- [Contact Support](https://apify.com/contact)
