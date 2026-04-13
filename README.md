# seo-tools

Unified SEO dashboard for tracking Search Console + GA4 data across multiple sites from one place.

> **Blog post:** [seo-tools — how I keep analytics and SEO across multiple sites from becoming a second job](https://3h4x.github.io/tech/2026/04/13/seo-tools)

## Features

- **Audit** — robots.txt, sitemap, meta tags, OG images, TTFB, HTTPS, HSTS, favicon, image alt text, internal links, SC indexing
- **Report** — Search Console + GA4 metrics with 7-day comparison and trend arrows
- **Gaps** — cross-site gap analysis with prioritised recommendations
- **Decay** — detect declining pages across all sites (7d/30d toggle)
- **Trends** — historical SC + GA4 + audit score charts from SQLite snapshots
- **Config** — manage your Google Service Account key and sites via the UI

## Quick Start

```bash
pnpm install
pnpm dev    # http://localhost:3031
```

No credentials required to start. Paste your Google Service Account key in the **Config** tab after first boot.

## Docker

The pre-built image is published to GHCR on every push to `main`:

```bash
docker pull ghcr.io/3h4x/seo-tools:latest
```

### docker-compose (recommended)

```bash
docker compose up -d    # http://localhost:3031
```

SQLite data (snapshots, cache, config) is persisted in `./data/` on the host.

The Google SA key is **optional at startup** — paste it in the **Config** tab after the container is running. To pre-configure via env var instead:

```bash
echo 'GOOGLE_SA_KEY_JSON={"type":"service_account",...}' > .env
docker compose up -d
```

### docker-compose.yml

```yaml
services:
  seo-tools:
    image: ghcr.io/3h4x/seo-tools:latest
    container_name: seo-tools
    restart: unless-stopped
    ports:
      - "3031:3031"
    volumes:
      - ./data:/app/data
    environment:
      # Optional — paste key in Config tab instead
      - GOOGLE_SA_KEY_JSON=${GOOGLE_SA_KEY_JSON:-}
```

### Building locally

```bash
docker build -t seo-tools .
docker run -p 3031:3031 -v $(pwd)/data:/app/data seo-tools
```

## Google Service Account Setup

One service account handles Search Console + GA4 for all sites.

1. Create a service account in [Google Cloud Console](https://console.cloud.google.com) → IAM & Admin → Service Accounts
2. Grant it access per site:
   - Search Console: add the SA email as **Owner** under Settings → Users and permissions
   - GA4: add the SA email as **Viewer** in Property Access Management
3. Download the JSON key
4. Paste the JSON in the **Config** tab, click **Test Connection**, then **Save**

The key is stored in SQLite and takes priority over the `GOOGLE_SA_KEY_JSON` env var. To fall back to the env var, click **Remove** in the Config tab.

## Managed Sites

Sites are stored in SQLite and managed via the **Config** tab → Managed Sites. Use the **Discover sites** button to import from Google Search Console + GA4 automatically. No site config is hardcoded in source.

## Dev

```bash
pnpm test          # run tests
pnpm type-check    # TypeScript check
pnpm lint          # ESLint
pnpm seo snapshot  # take SC + GA4 snapshot for trend tracking
pnpm seo check     # reachability check for all sites
```

Pre-commit hooks (lint + type-check + test) run automatically via husky.
