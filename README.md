# Broken Link Finder

Automatically detect and report broken links across any website with fast, reliable crawling. Scan entire domains, check both internal and external links, and receive detailed reports on every dead link — including HTTP status codes, severity levels, and the exact pages where broken links were found. Perfect for SEO audits, site migrations, and ongoing website maintenance.

## Features

- **Full-site crawling** — Automatically follows links across your entire website to find every broken link
- **Internal & external link checking** — Verifies links both within your domain and to third-party websites
- **Configurable crawl depth** — Control how many levels deep the crawler explores (1–50 levels)
- **Parallel processing** — Scan up to 50 pages simultaneously for fast results
- **Subdomain support** — Optionally crawl subdomains as part of the same audit
- **Severity classification** — Each broken link is rated as high, medium, or low severity
- **Email notifications** — Receive the broken links report directly in your inbox when the run completes
- **Flexible output** — Save only broken links or all crawled links for further analysis
- **Proxy support** — Built-in proxy configuration to avoid rate limiting on larger sites

---

## Use Cases

### SEO Health Audits
Broken links are a known SEO negative signal. Regularly scan your website to identify all 404s, server errors, and dead links before search engines penalize your rankings. Keep your site healthy and fully indexed.

### Site Migrations & Redesigns
After moving to a new domain, platform, or CMS, use this tool to verify every URL redirects correctly and no pages were left behind. Catch all missing redirects before going live.

### E-commerce Store Maintenance
Dead product links, missing image links, and broken checkout paths directly cost you revenue. Detect and fix them proactively to ensure customers always reach the right destination.

### Blog & Content Site Management
Old articles often reference pages that no longer exist. Use periodic crawls to surface every outdated link in your content archive and update them before readers encounter dead ends.

### Documentation Site Quality Control
Ensure all cross-references, external API links, and code reference URLs in your documentation remain valid. Maintain developer trust with a fully functional docs site.

---

## Input Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `baseUrl` | String | Yes | — | The starting URL to crawl (homepage or specific page) |
| `maxPages` | Integer | No | `500` | Maximum number of pages to crawl |
| `maxCrawlDepth` | Integer | No | `10` | How many levels deep to follow links |
| `maxConcurrency` | Integer | No | `10` | Number of pages to check in parallel (max 50) |
| `checkExternalLinks` | Boolean | No | `true` | Also verify links pointing to external websites |
| `saveOnlyBrokenLinks` | Boolean | No | `true` | Save only broken links; disable to save all links |
| `crawlSubdomains` | Boolean | No | `false` | Include subdomains in the crawl |
| `notificationEmails` | Array | No | `[]` | Email addresses to receive the completed report |
| `proxyConfiguration` | Object | No | Apify Proxy | Proxy settings for large or rate-limited crawls |

---

## Output Data

Each record in the dataset contains:

| Field | Type | Description |
|-------|------|-------------|
| `sourceUrl` | String | URL of the page that contains the broken link |
| `sourceTitle` | String | Title of the page where the link was found |
| `targetUrl` | String | The broken link URL that was checked |
| `linkText` | String | The anchor text of the broken link |
| `linkType` | String | `internal` or `external` |
| `httpStatus` | Integer | HTTP response code (e.g., 404, 500) |
| `status` | String | Human-readable status (e.g., "Not Found") |
| `isBroken` | Boolean | Whether the link is broken |
| `severity` | String | Severity level: `high`, `medium`, or `low` |
| `issueType` | String | Type of issue (e.g., `404_not_found`, `timeout`) |
| `errorMessage` | String | Additional error details if available |
| `checkedAt` | String | ISO timestamp of when the link was checked |

---

## Usage Examples

### Basic Blog Audit

Check a blog for broken links with default settings:

```json
{
    "baseUrl": "https://example.com/blog",
    "maxPages": 200,
    "maxCrawlDepth": 3,
    "checkExternalLinks": true,
    "saveOnlyBrokenLinks": true
}
```

### Full E-commerce Site Crawl

Crawl an entire store including subdomains and receive an email report:

```json
{
    "baseUrl": "https://shop.example.com",
    "maxPages": 2000,
    "maxCrawlDepth": 5,
    "maxConcurrency": 20,
    "crawlSubdomains": true,
    "checkExternalLinks": true,
    "notificationEmails": ["webmaster@example.com", "seo@example.com"]
}
```

### Quick Surface Check

Rapidly scan just the top-level pages of a site:

```json
{
    "baseUrl": "https://example.com",
    "maxPages": 50,
    "maxCrawlDepth": 1,
    "checkExternalLinks": false,
    "saveOnlyBrokenLinks": true
}
```

### Large Site Audit with Proxy

Audit a high-traffic site with residential proxies to avoid rate limits:

```json
{
    "baseUrl": "https://large-site.com",
    "maxPages": 10000,
    "maxCrawlDepth": 10,
    "maxConcurrency": 30,
    "proxyConfiguration": {
        "useApifyProxy": true,
        "apifyProxyGroups": ["RESIDENTIAL"]
    }
}
```

---

## Sample Output

```json
{
    "sourceUrl": "https://example.com/blog/old-post",
    "sourceTitle": "My Old Blog Post",
    "targetUrl": "https://example.com/deleted-page",
    "linkText": "Click here to learn more",
    "linkType": "internal",
    "httpStatus": 404,
    "status": "Not Found",
    "isBroken": true,
    "severity": "high",
    "issueType": "404_not_found",
    "errorMessage": "",
    "checkedAt": "2025-06-10T10:30:00Z"
}
```

---

## Tips for Best Results

### Start with a Smaller Crawl
- Test with `maxPages: 50–100` first to verify your settings before scaling up
- Use `maxCrawlDepth: 2–3` for initial checks on large sites

### Control Crawl Speed
- Reduce `maxConcurrency` to `5` if your server throttles or blocks the crawler
- Use proxy configuration for sites with strict rate limiting

### Schedule Regular Audits
- Use Apify Schedules to run weekly or monthly link checks automatically
- Set up `notificationEmails` so reports land directly in your inbox without manually checking

### Understand Severity Levels
- **High** — 404s and server errors: fix immediately as they impact SEO and users
- **Medium** — 403 Forbidden links: review access settings or remove the links
- **Low** — Redirects (301/302): update to direct URLs to avoid redirect chains

---

## Understanding Results

| HTTP Status | Severity | Meaning |
|-------------|----------|---------|
| 404 | High | Page does not exist — update or remove the link |
| 500+ | High | Server error on the target page |
| Timeout | High | Target page did not respond in time |
| 403 | Medium | Access denied to the target page |
| 301 / 302 | Low | Redirect — works but may slow page load |

---

## Integrations

Connect your broken links data with:

- **Google Sheets** — Export the dataset for team review and tracking
- **Airtable** — Build a searchable link audit database
- **Slack** — Get run completion and error notifications
- **Make (formerly Integromat)** — Trigger automated fix workflows
- **Zapier** — Connect to hundreds of tools and automate follow-up tasks
- **Webhooks** — Send results directly to your custom systems

### Export Formats

Download your broken links report in multiple formats:

- **JSON** — For developers and API integrations
- **CSV** — For spreadsheet analysis and sharing
- **Excel** — For business reporting
- **XML** — For system-to-system integrations

---

## Frequently Asked Questions

### How many pages can I crawl?
You can crawl up to 50,000 pages per run. For most websites, the default setting of 500 pages covers the entire site.

### How long does a crawl take?
A 100-page site typically completes in 2–5 minutes. A 1,000-page site takes around 15–30 minutes depending on concurrency and server response times.

### Will this slow down my website?
The crawler respects server responses and includes built-in rate limiting. Reduce `maxConcurrency` to 3–5 if you notice any impact on site performance.

### Can I check external links too?
Yes. Enable `checkExternalLinks` to verify every outbound link to third-party websites. This is recommended for thorough SEO audits.

### What is "save only broken links"?
When enabled, only records where `isBroken: true` are saved to the dataset — keeping your results clean and focused. Disable it to save every crawled link for a complete audit log.

### Can I crawl subdomains?
Yes. Enable `crawlSubdomains` to include related subdomains (e.g., `blog.example.com` when crawling `example.com`).

### How often should I run link checks?
For active content sites, weekly checks are recommended. For stable sites, monthly audits are typically sufficient to stay ahead of link rot.

### What happens if a page redirects?
Redirects (301/302) are flagged as low-severity findings. They technically work but are worth updating to direct URLs to improve page speed and avoid redirect chains.

### Can I schedule automatic runs?
Yes. Use Apify Schedules to set up recurring crawls at any interval and pair them with email notifications to receive reports automatically.

### What output formats are available?
Results are available as JSON, CSV, Excel, and XML. An HTML summary report is also generated in the Key-Value Store for easy visual review.

---

## Support

For issues or feature requests, contact support through the Apify Console.

### Resources

- [Apify Documentation](https://docs.apify.com/)
- [API Reference](https://docs.apify.com/api/v2)
- [Scheduling Runs](https://docs.apify.com/schedules)
- [Community Forum](https://discord.gg/apify)

---

## Legal Notice

This actor is designed for legitimate website auditing and SEO maintenance purposes. Users are responsible for ensuring compliance with the target website's terms of service and applicable laws. Use reasonable crawl limits and respect server rate limits at all times.
