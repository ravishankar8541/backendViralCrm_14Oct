# Service catalog

Contract Bill and Proforma Invoice share `/api/services`. Both endpoints require the existing `Authorization: Bearer <token>` login header and an active user account.

## List names

`GET /api/services`

Returns `200` with `{ "success": true, "data": ["Web Development", "Product Photography"] }`.
The list combines all previous built-in options with custom names stored in MongoDB. No seed or migration step is required.

## Create a name

`POST /api/services` with JSON `{ "name": "Product Photography" }`.

- New name: `201`, `{ "success": true, "created": true, "data": { "name": "Product Photography" } }`.
- Existing name: `200`, the same response with `created: false` and the existing spelling.
- Invalid input: `400`. Names must be strings of 1–120 characters after whitespace normalization.
- Database failure: `500` with a retryable message.

Names are trimmed and repeated whitespace is collapsed. Duplicate checking ignores case and uses a unique normalized-name index for custom services. The authenticated creator is recorded automatically.

In either form, type the new name and choose **Create service** (or press Enter). A successful save selects the name and makes it available to other rows and both forms. Existing free-text billing remains supported; use **Create service** to add a reusable catalog entry.

Restart the backend to register the new routes. The frontend uses its existing `VITE_API_URL` configuration.

## Checks

From the backend: `node --test --test-isolation=none tests/services.test.js`.

From the frontend: `node --test --test-isolation=none tests/serviceCatalog.test.js` and `node tests/serviceCatalog.browser.mjs`.

API tests stub database calls; browser checks use isolated API fixtures and the backend's existing Puppeteer dependency. They do not write to a live CRM database.
