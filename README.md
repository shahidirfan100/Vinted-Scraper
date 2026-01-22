# Vinted Scraper

Extract product listings from Vinted, the popular marketplace for secondhand fashion. Collect detailed information about clothing, accessories, and home items including prices, brands, sizes, conditions, and seller data.

---

## Features

- **Comprehensive product data** - Extract titles, prices, brands, sizes, conditions, and images
- **Flexible search** - Filter by keyword, category, and price range
- **Fast extraction** - Uses API interception for maximum speed when available
- **Reliable fallback** - DOM parsing ensures data is captured even if API changes
- **Anti-bot bypass** - Built-in stealth features and residential proxy support
- **Pagination support** - Automatically navigates through multiple catalog pages
- **Deduplication** - Ensures no duplicate products in your dataset

---

## Use Cases

- **Price comparison** - Compare prices across different sellers
- **Market research** - Analyze pricing trends for specific brands or categories
- **Inventory sourcing** - Find items for resale businesses
- **Fashion trend analysis** - Track popular brands, sizes, and styles
- **Competitor monitoring** - Monitor competitor pricing and inventory

---

## Input Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `startUrl` | String | Direct Vinted catalog or search URL to start scraping from |
| `keyword` | String | Search keyword(s) to filter products |
| `category` | String | Product category: women, men, kids, or home |
| `minPrice` | Number | Minimum price filter (USD) |
| `maxPrice` | Number | Maximum price filter (USD) |
| `results_wanted` | Number | Maximum number of products to collect (default: 20) |
| `max_pages` | Number | Maximum pages to scrape (default: 10) |
| `proxyConfiguration` | Object | Proxy settings (RESIDENTIAL recommended) |

---

## Output Data

Each product in the dataset includes:

| Field | Description |
|-------|-------------|
| `product_id` | Unique Vinted product identifier |
| `title` | Product title/name |
| `brand` | Brand name |
| `size` | Size (e.g., S, M, L, US 8) |
| `condition` | Product condition (New, Very good, Good, etc.) |
| `price` | Listed price |
| `currency` | Currency code (e.g., USD) |
| `total_price` | Total price including fees |
| `image_url` | Main product image URL |
| `url` | Direct link to the product page |
| `seller` | Seller username |
| `favorite_count` | Number of favorites/likes |
| `view_count` | Number of views |

---

## Usage Examples

### Scrape Women's Clothing

```json
{
  "startUrl": "https://www.vinted.com/catalog/1904-women",
  "results_wanted": 50
}
```

### Search for Specific Items

```json
{
  "keyword": "vintage levis jeans",
  "category": "women",
  "minPrice": 20,
  "maxPrice": 100,
  "results_wanted": 30
}
```

### Scrape Men's Shoes

```json
{
  "startUrl": "https://www.vinted.com/catalog/5-men",
  "keyword": "nike",
  "results_wanted": 100
}
```

---

## Sample Output

```json
{
  "product_id": "8000076569",
  "title": "Vintage Low Rise Jeans",
  "brand": "Levi's",
  "size": "S / US 4-6",
  "condition": "Very good",
  "price": "25.00",
  "currency": "USD",
  "total_price": "28.50",
  "image_url": "https://images1.vinted.net/...",
  "url": "https://www.vinted.com/items/8000076569",
  "seller": "fashionista123",
  "favorite_count": 12,
  "view_count": 145
}
```

---

## Tips

- **Use category URLs** - Starting with a category URL is faster than keyword search
- **Set realistic limits** - Start with 20-50 results to test, then scale up
- **Use residential proxies** - Vinted has anti-bot protection; residential proxies are recommended
- **Price filters** - Use minPrice/maxPrice to narrow results and reduce scraping time
- **Monitor runs** - Check the logs for any blocking issues or empty results

---

## Integrations

Export your data to:

- **Google Sheets** - For easy analysis and sharing
- **Airtable** - Build databases of products
- **Zapier** - Automate workflows with 3000+ apps
- **Webhooks** - Send data to your own systems in real-time
- **API** - Access data programmatically via Apify API

---

## FAQ

**Q: Why am I getting empty results?**
A: Vinted has anti-bot protection. Ensure you're using residential proxies and the default concurrency settings.

**Q: How often can I run this scraper?**
A: We recommend spacing runs at least 15-30 minutes apart to avoid rate limiting.

**Q: Does this scraper work for all Vinted regions?**
A: This scraper is optimized for Vinted US (vinted.com). For other regions, use the appropriate domain in startUrl.

**Q: Can I scrape product details pages?**
A: The current version extracts data from catalog listings. Detail page scraping can be added on request.

---

## Legal Notice

This scraper is provided for educational and research purposes. Users are responsible for ensuring their use complies with Vinted's Terms of Service and applicable laws. Only scrape publicly available data and respect rate limits. The developer assumes no liability for misuse.