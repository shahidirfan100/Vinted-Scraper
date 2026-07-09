## Selected API

- **Endpoint**: `https://www.vinted.com/api/v2/catalog/items`
- **Method**: GET
- **Auth**: Bearer token (`access_token_web` cookie) + session cookies + CSRF token
- **Pagination**: `page` and `per_page` query parameters
- **Fields available**: 23 item-level fields including id, title, price, brand_title, user, photos, photo, favourite_count, view_count, service_fee, total_item_price, size_title, status, content_source, promoted, is_visible, is_favourite, url, path, item_box, search_tracking_params, conversion, show_1st_time_seller_discount
- **Fields currently missing in actor**: `show_1st_time_seller_discount`, `user.photo` (seller avatar), `photo.dominant_color`, `photo.width/height`, `photos[]` (all images), `item_box.exposures`, `item_box.accessibility_label`, `conversion`, `pagination.total_entries`
- **Field count**: 23 (vs existing 24 mapped output fields)

### Session Requirements

1. **Bootstrap request**: GET the catalog page HTML to obtain:
   - `access_token_web` (JWT Bearer token, ~1hr expiry)
   - `anon_id` (anonymous user ID)
   - `refresh_token_web` (for token refresh)
   - Cloudflare `__cf_bm` + `datadome` cookies
2. **API request headers**:
   - `authorization: Bearer <access_token_web>`
   - `x-anon-id: <anon_id>`
   - `x-csrf-token: <random-uuid>`
   - `cookie: <all session cookies>`
   - `referer: <original catalog URL>`
   - Standard browser user-agent + accept headers

### Why weaker candidates were rejected

| Candidate | Status | Reason |
|-----------|--------|--------|
| `api/v2/items` | 404 | Wrong endpoint |
| `api/v2/search` | 404 | Wrong endpoint |
| `api/v2/catalog/search` | 404 | Wrong endpoint |
| No-auth request to `/api/v2/catalog/items` | 401 | Auth required |
| iOS app header request (`Vinted/2026.* CFNetwork`) | 403 | Cloudflare blocks non-browser user-agents |

### Endpoint compatibility

- **gotScraping**: Works with full session headers (bootstrap + Bearer token)
- **Headers required**: Browser user-agent, cookies, authorization Bearer, x-anon-id, x-csrf-token, referer
- **Proxy**: Required only if IP gets rate-limited; RESIDENTIAL recommended
- **HTTP/2**: Works with default got-scraping settings
- **Session rotation**: Bootstrap every ~50 min or on 401/403

### Decision

The actor can stay fully HTTP-based without Playwright. The current implementation is already correct — only the Docker image and dependencies need cleanup to remove Playwright.
