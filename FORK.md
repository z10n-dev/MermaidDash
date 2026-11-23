# Fork notes (z10n-dev/MermaidDash)

Changes against [langtind/MermaidDash](https://github.com/langtind/MermaidDash):

1. **Mermaid warning/error blocks are hidden.**
   - mermaid's own in-canvas error diagram (`suppressErrorRendering`)
   - the full-panel `Diagram Error` block in the editor canvas
   - the `Syntax error — showing last valid diagram` toast

   While typing (temporarily invalid) mermaid code, the last valid diagram just
   stays on screen. Re-enable the blocks with
   `--build-arg SHOW_MERMAID_WARNINGS=1` (or `VITE_SHOW_MERMAID_WARNINGS=1`
   for a local `npm run dev`).

3. **Fixed `/api` prefix stripping in the frontend nginx proxy.**
   `location /api/ { proxy_pass http://backend:8000/; }` removed the `/api`
   prefix, so the backend received `/auth/status` instead of `/api/auth/status`
   — every API call 404'd, and on a fresh deployment the auth-onboarding gate
   answered 409 ("Authentication onboarding is required before using the app"),
   which made it impossible to get past the setup/register screen.
   Dropping the trailing slash in `proxy_pass` keeps the prefix.

2. **CI builds and publishes Docker images to GHCR.**
   `.github/workflows/docker-publish.yml` builds `backend` and `frontend` on
   every push to `main`, on `v*` tags, and on manual dispatch:

   - `ghcr.io/z10n-dev/mermaiddash-frontend:latest` / `:<VERSION>` / `:sha-<sha>`
   - `ghcr.io/z10n-dev/mermaiddash-backend:latest` / `:<VERSION>` / `:sha-<sha>`

## Usage in your own compose

```yaml
services:
  backend:
    image: ghcr.io/z10n-dev/mermaiddash-backend:latest
    container_name: mermaiddash-backend
    environment:
      - DATABASE_URL=file:/app/prisma/dev.db
      - PORT=8000
      - NODE_ENV=production
      - AUTH_MODE=${AUTH_MODE:-local}
      - TRUST_PROXY=false
      - JWT_SECRET=${JWT_SECRET}
      - CSRF_SECRET=${CSRF_SECRET}
    volumes:
      - backend-data:/app/prisma
    networks:
      - mermaiddash-network
    restart: unless-stopped

  frontend:
    image: ghcr.io/z10n-dev/mermaiddash-frontend:latest
    container_name: mermaiddash-frontend
    ports:
      - "6767:80"
    environment:
      - BACKEND_URL=backend:8000
    depends_on:
      - backend
    networks:
      - mermaiddash-network
    restart: unless-stopped

networks:
  mermaiddash-network:
    driver: bridge

volumes:
  backend-data:
```

If the GHCR packages stay private, log in on the Docker host first:

```bash
echo "<PAT with read:packages>" | docker login ghcr.io -u z10n-dev --password-stdin
```

`docker-compose.ghcr.yml` in this repo is the same file, ready to copy.
