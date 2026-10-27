# Cetus price calculator — standalone Vercel site

The complete calculator runs in `index.html`. It does not redirect to Apps Script, embed it in a frame, load `google.script.run`, or include the Apps Script URL or spreadsheet ID.

Data path:

```text
Your browser → cetus-price-cal.vercel.app/api/calc → private Apps Script API → Google Sheets
```

The API route is a Vercel Function. It keeps the Apps Script URL and connection key in server environment variables. Editing sessions are held in HttpOnly cookies; the browser receives no backend session token. Catalogue editing and saving quotes still require the editing password. Manual quote prices remain available to everyone without changing catalogue prices.

## Deploy to the existing Vercel project

1. Replace the repository's old redirect page with the files in this package. Include the `api` folder, `vercel.json` and `package.json`, not just `index.html`.
2. In the **cetus-price-cal** Vercel project, open **Settings → Environment Variables**.
3. Add these two server-only variables using the values supplied separately in the private `.env.local` file:
   - `APPS_SCRIPT_URL`
   - `APPS_SCRIPT_API_KEY`
4. Apply them to Production (and Preview if you use it). Mark them sensitive/secret if that option is available.
5. Deploy/redeploy the updated repository. Keep the framework preset **Other**, with no build command and no output-directory override. Node.js 22 is specified in `package.json`.
6. Open `https://cetus-price-cal.vercel.app/`. The address stays on Vercel. Data requests go to `/api/calc` on the same domain.

Do not upload `.env.local` to GitHub. It is gitignored and is not included in the public deployment ZIP. Do not put these values into `index.html` or use a `NEXT_PUBLIC_` prefix.

## Features retained

- Approved car selection and segment/material/component pricing from the sheet.
- Compact multi-component picker and quote-only manual prices.
- Editable catalogue after password unlock.
- Recliner features, dealer/client prices and Drive picture links.
- Reference-style estimate with pre-tax amount, IGST and final total.
- Named-tab quote saving, full internal breakdown, and duplicate-name protection.

The API-only Apps Script deployment has already been prepared separately. It contains the business logic and the existing segment-review automation, not the frontend HTML. The previous Apps Script UI deployment remains available during migration; it is not used by this standalone site.

## Local checks

No dependencies need to be installed.

```text
npm test
npm run dev
```

For local API testing, place the private settings in `.env.local`. The local server listens at `http://127.0.0.1:8767` and runs the same API handler as Vercel. Static-only hosting such as GitHub Pages cannot run this private server route.

The public files contain no real connection keys. Keep Apps Script backend sources and private settings outside this repository.
