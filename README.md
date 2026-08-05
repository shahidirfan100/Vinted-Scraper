## What does Vinted Listings Scraper do?

Vinted Listings Scraper is a Vinted scraper for collecting structured marketplace listings from Vinted catalog and search pages. Provide a public Vinted catalog URL, or search by keyword and category, then collect listing details such as titles, brands, prices, conditions, images, seller information, favorites, views, and direct listing URLs.

The results are saved to an Apify dataset that you can download as JSON, CSV, Excel, or XML. Use the dataset for resale sourcing, price monitoring, marketplace research, seller analysis, reporting, or automated workflows.

## Why use Vinted Listings Scraper?

- **Resale sourcing** - Find items by keyword, category, and price range so you can build an inventory shortlist.
- **Price monitoring** - Compare listing prices, total buyer prices, service fees, brands, conditions, and engagement signals.
- **Marketplace research** - Create datasets for analyzing popular products, categories, sizes, brands, and seller activity.
- **Seller analysis** - Review seller usernames, profiles, business status, and listing engagement in one dataset.
- **Repeatable collection** - Set result and page limits for small tests or larger scheduled data collection runs.
- **Automation-ready output** - Connect Apify datasets to APIs, webhooks, Google Sheets, Make, Zapier, databases, and reporting tools.

## What data can you extract from Vinted?

Each dataset item represents one Vinted listing.

| Field | Type | Description |
|-------|------|-------------|
| `product_id` | String | Unique Vinted listing identifier. |
| `title` | String | Listing title. |
| `brand` | String | Brand name when provided by the seller. |
| `size` | String | Size label, or `Not specified` when unavailable. |
| `condition` | String | Item condition. |
| `price` | String | Listing price amount. |
| `total_price` | String | Total buyer price amount when provided. |
| `currency` | String | Currency code for the listing price. |
| `service_fee` | String | Buyer service fee amount when provided. |
| `image_url` | String | Main listing image URL. |
| `image_full_url` | String | Full-size main image URL when available. |
| `image_dominant_color` | String | Dominant color value for the main image. |
| `image_dominant_color_opaque` | String | Opaque dominant color value for the main image. |
| `image_count` | Number | Number of photos available for the listing. |
| `url` | String | Direct URL to the Vinted listing. |
| `favorite_count` | Number | Number of favorites recorded for the listing. |
| `view_count` | Number | Number of views recorded for the listing. |
| `is_favourite` | Boolean | Whether the listing is marked as a favorite for the current session. |
| `is_visible` | Boolean | Listing visibility status. |
| `is_promoted` | Boolean | Whether the listing is promoted. |
| `content_source` | String | Marketplace source label when provided. |
| `seller_id` | String | Vinted seller identifier. |
| `seller_username` | String | Seller username. |
| `seller_profile_url` | String | Direct URL to the seller profile. |
| `seller_avatar_url` | String | Seller avatar URL when available. |
| `seller_is_business` | Boolean | Indicates whether the seller is marked as a business seller. |
| `show_1st_time_discount` | Boolean | Indicates whether a first-time seller discount is shown. |
| `search_score` | Number or null | Search ranking score when provided. |
| `matched_queries` | Array | Search terms matched by the listing when provided. |
| `page` | Number | Catalog page where the listing was collected. |

## How to scrape Vinted listings

1. Open Vinted Listings Scraper on Apify.
2. Add a public Vinted catalog or search URL in `startUrl`, or leave it empty and use `keyword` and `category`.
3. Set optional price filters and choose how many results and pages to collect.
4. Run the Actor.
5. Open the dataset preview, download the results, or connect the dataset to your workflow.

When `startUrl` is not provided, the Actor builds a Vinted category URL. The supported category shortcuts are `women`, `men`, `kids`, and `home`.

## Input Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `startUrl` | String | No | None | Public Vinted catalog or search URL to use as the starting point. |
| `keyword` | String | No | `""` | Product search term, such as `vintage dress`, `Nike shoes`, or `designer bag`. |
| `category` | String | No | `"women"` | Category shortcut used when building a URL: `women`, `men`, `kids`, or `home`. |
| `minPrice` | Integer | No | None | Minimum price filter. The input schema describes this value as USD. |
| `maxPrice` | Integer | No | None | Maximum price filter. The input schema describes this value as USD. |
| `results_wanted` | Integer | No | `20` | Maximum number of unique listing records to save. |
| `max_pages` | Integer | No | `50` | Maximum number of catalog pages to process. |
| `proxyConfiguration` | Object | No | None | Optional Apify proxy settings. Residential proxies are recommended for larger or repeated runs. |

`startUrl`, `keyword`, `minPrice`, and `maxPrice` can be combined. When a starting URL is supplied, the search and price values are applied to that collection request.

## Usage Examples

### Basic Category Collection

Collect up to 50 listings from the Vinted women's catalog:

```json
{
  "startUrl": "https://www.vinted.com/catalog/1904-women",
  "results_wanted": 50
}
```

### Keyword and Price Filtering

Search for women's vintage dresses priced between 15 and 90 USD:

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

### Larger Collection with Proxy Settings

Collect men's Nike listings across more pages using an Apify residential proxy configuration:

```json
{
  "startUrl": "https://www.vinted.com/catalog/5-men",
  "keyword": "Nike",
  "results_wanted": 500,
  "max_pages": 50,
  "proxyConfiguration": {
    "useApifyProxy": true,
    "apifyProxyGroups": ["RESIDENTIAL"]
  }
}
```

## Sample Output

```json
{
  "product_id": "9359134702",
  "title": "Authentic Nike Dunk Highs",
  "brand": "Nike",
  "size": "5",
  "condition": "Very good",
  "price": "20.0",
  "total_price": "21.7",
  "currency": "USD",
  "service_fee": "1.7",
  "image_url": "https://images1.vinted.net/t/01_00f8a_zEtsWMXTtwNVDEiUu9SGPqWB/f800/1783601625.jpeg",
  "image_full_url": "https://images1.vinted.net/tc/01_00f8a_zEtsWMXTtwNVDEiUu9SGPqWB/1783601625.jpeg",
  "image_dominant_color": "#A5827E",
  "image_dominant_color_opaque": "#E4DAD8",
  "image_count": 9,
  "url": "https://www.vinted.com/items/9359134702-authentic-nike-dunk-highs",
  "favorite_count": 1,
  "view_count": 0,
  "is_favourite": false,
  "is_visible": true,
  "is_promoted": true,
  "content_source": "catalog_promoted_items",
  "seller_id": "3167703720",
  "seller_username": "elenat7758",
  "seller_profile_url": "https://www.vinted.com/member/3167703720-elenat7758",
  "seller_avatar_url": "",
  "seller_is_business": false,
  "show_1st_time_discount": false,
  "search_score": 1,
  "matched_queries": [],
  "page": 1
}
```

## Tips for best results

- **Start with a small run** - Test `results_wanted` with 20 to 50 records before requesting a larger dataset.
- **Use a focused search** - Combine a category or public search URL with `keyword` and price filters to reduce unrelated listings.
- **Allow enough pages** - Increase `max_pages` when a category has fewer matching records on each page.
- **Use proxy settings for repeated runs** - Residential proxies can help with larger collections and scheduled monitoring.
- **Expect optional fields to be empty** - Sellers do not always provide a brand, size, condition detail, avatar, or every image attribute.
- **Review the dataset preview** - Confirm the target market, filters, prices, and listing fields before scheduling recurring runs.

## Integrations and export formats

Apify datasets can be used directly in the Console or connected to other tools:

- **JSON** - Use results in APIs, scripts, applications, and AI data workflows.
- **CSV or Excel** - Review listings in spreadsheet and reporting workflows.
- **Google Sheets** - Share listing data with a sourcing or research team.
- **Webhooks** - Trigger downstream actions after an Actor run finishes.
- **Make or Zapier** - Send new listings to business applications and notifications.
- **API access** - Read the dataset programmatically from your own systems.

## Frequently Asked Questions

### Can I scrape Vinted listings by keyword?

Yes. Set `keyword` to a product search term and optionally set `category`, `minPrice`, and `maxPrice` to narrow the results.

### Can I use a Vinted catalog or search URL?

Yes. Set `startUrl` to a public Vinted catalog or search URL. You can also combine it with the optional keyword and price filters.

### How many Vinted listings can I collect?

The Actor saves up to the `results_wanted` limit, subject to the available matching listings and the `max_pages` page limit.

### Does the Actor collect seller and engagement data?

Yes. Output can include the seller ID, username, profile URL, business status, favorite count, view count, visibility, and promotion status.

### Why is a field empty or set to `Not specified`?

Some Vinted listings do not publish every attribute. Missing sizes are labeled `Not specified`, while other optional values can be empty or null.

### Can I run Vinted collection on a schedule?

Yes. Create an Apify schedule to run the Actor hourly, daily, weekly, or at another interval, then send each dataset to your chosen integration.

### Can I export Vinted data to CSV or Excel?

Yes. Apify datasets support CSV, Excel, JSON, XML, and other export options available in Apify Console.

### Is collecting Vinted data legal?

You are responsible for complying with Vinted's terms, applicable laws, privacy requirements, and any restrictions on how collected data may be used. Collect only data you are permitted to access and use it responsibly.

## Related Actors

- [DBA.dk Marketplace Scraper](https://apify.com/shahidirfan/dba-dk-marketplace-scraper) - Collect marketplace listings, prices, locations, and seller details from Denmark's DBA marketplace for resale analytics and price monitoring.
- [Noon.com Product Scraper](https://apify.com/shahidirfan/noon-com-scraper) - Extract product prices, brands, seller details, ratings, discounts, and product links from Noon.com category and listing pages.
- [Tokopedia Search Scraper](https://apify.com/shahidirfan/tokopedia-search-scraper) - Collect Tokopedia search results with product names, prices, ratings, reviews, seller details, and category information.

## Support

For bugs, feature requests, or questions about a run, use the Issues tab on the Actor page in Apify Console. Include the input settings and a short description of the observed result when reporting a problem.

## Legal Notice

This Actor is intended for legitimate collection and analysis of publicly available marketplace data. Users are responsible for complying with Vinted's terms of use, applicable laws, privacy rules, and data usage requirements.
