# Vinted Listings Scraper

Extract and collect Vinted marketplace listings in a fast, structured dataset. Gather product, pricing, seller, and engagement information for research, monitoring, and analysis. Built for repeatable runs with configurable filters, pagination, and result limits.

## Features

- **Comprehensive listing data** — Collect product details, seller profile info, pricing, fees, and engagement metrics.
- **Flexible search controls** — Filter with keyword, category, and min/max price inputs.
- **Automatic pagination** — Continue collecting across pages until target result count or page limit is reached.
- **Duplicate protection** — Keeps dataset clean by skipping repeated listing IDs.
- **Production-ready output** — Returns consistent structured records for analysis pipelines and automation.

## Use Cases

### Price Monitoring
Track asking prices and total buyer cost across categories or keywords. Use scheduled runs to monitor market changes over time.

### Resale Sourcing
Find inventory opportunities by filtering listings with keyword and price ranges. Compare brands, conditions, and seller signals before buying.

### Market Intelligence
Build datasets for trend analysis by category, brand, size, and condition. Measure listing performance using favorites and view counts.

### Competitive Research
Monitor seller profiles, pricing behavior, and promoted listings. Identify opportunities and pricing gaps in your target segment.

### Reporting and BI
Export structured datasets for dashboards and recurring reports. Combine outputs with spreadsheet tools, databases, and workflow platforms.

---

## Input Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `startUrl` | String | No | — | Vinted catalog or search URL to start from. |
| `keyword` | String | No | `""` | Search phrase to filter listings. |
| `category` | String | No | `"women"` | Category shortcut: `women`, `men`, `kids`, or `home`. |
| `minPrice` | Integer | No | — | Minimum price filter (USD). |
| `maxPrice` | Integer | No | — | Maximum price filter (USD). |
| `results_wanted` | Integer | No | `20` | Maximum number of listing records to collect. |
| `max_pages` | Integer | No | `50` | Safety cap for how many catalog pages to scan. |
| `proxyConfiguration` | Object | No | `{"useApifyProxy": true, "apifyProxyGroups": ["RESIDENTIAL"]}` | Proxy settings for reliable data collection. |

---

## Output Data

Each dataset item contains:

| Field | Type | Description |
|-------|------|-------------|
| `product_id` | String | Unique listing identifier. |
| `title` | String | Listing title. |
| `brand` | String | Brand name (if available). |
| `size` | String | Size label, or `Not specified` when unavailable. |
| `condition` | String | Item condition text. |
| `price` | String | Listing price amount. |
| `total_price` | String | Total buyer price amount. |
| `currency` | String | Currency code. |
| `service_fee` | String | Buyer service fee amount. |
| `image_url` | String | Main image URL. |
| `image_full_url` | String | Full-size image URL when available. |
| `url` | String | Direct link to listing page. |
| `favorite_count` | Number | Number of favorites. |
| `view_count` | Number | Number of views. |
| `is_favourite` | Boolean | Whether the listing is marked favorite for the current session. |
| `is_visible` | Boolean | Listing visibility status. |
| `is_promoted` | Boolean | Whether listing is promoted. |
| `content_source` | String | Source label returned by marketplace. |
| `seller_id` | String | Seller ID. |
| `seller_username` | String | Seller username/login. |
| `seller_profile_url` | String | Seller profile URL. |
| `seller_is_business` | Boolean | Business seller indicator. |
| `search_score` | Number or Null | Ranking score when provided. |
| `matched_queries` | Array | Matched query terms when available. |
| `page` | Number | Page number where listing was collected. |

---

## Usage Examples

### Basic Category Extraction

```json
{
  "startUrl": "https://www.vinted.com/catalog/1904-women",
  "results_wanted": 50
}
```

### Keyword + Price Filtering

```json
{
  "keyword": "vintage dress",
  "category": "women",
  "minPrice": 15,
  "maxPrice": 90,
  "results_wanted": 120,
  "max_pages": 20
}
```

### High-Volume Collection

```json
{
  "startUrl": "https://www.vinted.com/catalog/5-men",
  "keyword": "nike",
  "results_wanted": 500,
  "max_pages": 50,
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
  "product_id": "8158648463",
  "title": "Zara Ribbed Polo Dress in Black Size S",
  "brand": "Zara",
  "size": "S / US 4-6",
  "condition": "Very good",
  "price": "6.9",
  "total_price": "7.95",
  "currency": "USD",
  "service_fee": "1.05",
  "image_url": "https://images1.vinted.net/t/.../f800/1770901384.jpeg",
  "image_full_url": "https://images1.vinted.net/tc/.../1770901384.jpeg",
  "url": "https://www.vinted.com/items/8158648463-zara-ribbed-polo-dress-in-black-size-s",
  "favorite_count": 17,
  "view_count": 0,
  "is_favourite": false,
  "is_visible": true,
  "is_promoted": false,
  "content_source": "search",
  "seller_id": "83773268",
  "seller_username": "hungryhopper",
  "seller_profile_url": "https://www.vinted.com/member/83773268-hungryhopper",
  "seller_is_business": false,
  "search_score": null,
  "matched_queries": [],
  "page": 2
}
```

---

## Tips for Best Results

### Choose Good Start URLs
- Use valid Vinted catalog URLs for your target market.
- For broad collection, start from a category URL.
- For narrow collection, combine `keyword` with price filters.

### Tune Collection Limits
- Use smaller `results_wanted` values first for quick validation.
- Increase `max_pages` for larger runs.
- Match `results_wanted` to your analysis needs to control run cost.

### Use Proxies for Stability
- Residential proxies are recommended for keyword-heavy or high-volume runs.
- Keep default proxy settings for normal category runs.
- If results drop, retry with stronger proxy settings.

### Handle Missing Fields
- Some listings do not publish all attributes.
- Expect occasional `Not specified` sizes or empty optional fields.
- Use multiple fields (`title`, `brand`, `condition`) in downstream logic.

---

## Integrations

Connect your dataset with:

- **Google Sheets** — Share and analyze listing data quickly.
- **Airtable** — Build searchable listing databases.
- **Looker Studio / BI tools** — Create dashboards for trends and pricing.
- **Make** — Automate collection and post-processing flows.
- **Zapier** — Trigger actions in connected business apps.
- **Webhooks** — Push results to custom systems in real time.

### Export Formats

- **JSON** — Best for APIs and custom apps.
- **CSV** — Best for spreadsheet workflows.
- **Excel** — Best for business reporting.
- **XML** — Best for system interoperability.

---

## Frequently Asked Questions

### How many listings can I collect?
You can collect as many as available, constrained by `results_wanted`, `max_pages`, and marketplace availability.

### Does it handle pagination automatically?
Yes. It keeps collecting across pages until limits are reached or no more listings are available.

### Why do some records have `size: "Not specified"`?
Some listings do not provide a size value in the marketplace data. The actor keeps these records and labels missing size clearly.

### Can I run this on a schedule?
Yes. You can schedule runs in Apify and maintain fresh datasets continuously.

### What if my results are lower than expected?
Increase `max_pages`, widen filters, and use residential proxies for more stable access.

### Can I filter by price?
Yes. Use `minPrice` and `maxPrice` to limit results to your target range.

---

## Support

For issues, improvements, or feature requests, use the Actor’s Issues tab in Apify Console.

### Resources

- [Apify Documentation](https://docs.apify.com/)
- [Apify API Reference](https://docs.apify.com/api/v2)
- [Apify Schedules](https://docs.apify.com/platform/schedules)

---

## Legal Notice

This actor is intended for legitimate data collection and analysis. You are responsible for complying with website terms, local laws, and data usage regulations. Collect and use data responsibly.
