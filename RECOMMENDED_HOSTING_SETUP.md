# Recommended Hosting Approach: Multiple Sites on One VPS

## Current Setup

PlottedPlant is **fully containerized** — there is no global web server installed on the host. All 7 services (nginx, backend, collaboration, postgres, redis, plantuml renderer, certbot) run inside Docker containers orchestrated by a single `docker-compose.yml`.

The nginx container currently binds directly to ports **80** and **443** on the host, handling TLS termination, static file serving, and reverse proxying to the backend and collaboration services.

```
Internet → :80/:443 → nginx container → FastAPI backend (:8000)
                                       → Hocuspocus WebSocket (:1234)
                                       → static frontend files
                                       → PlantUML renderer (:8080, internal)
```

This works great for a single application, but it means **no other service can use ports 80/443**. To host multiple sites on this VPS, you need a shared entry point that routes traffic by domain name.

---

## Recommended Approach: Global Caddy Reverse Proxy

Install **Caddy** on the host as a global reverse proxy. Caddy sits in front of all your Docker projects and routes traffic to each one based on the domain name. It handles TLS automatically via Let's Encrypt with zero configuration.

### Why Caddy over Global Nginx

| | Caddy | Nginx |
|---|---|---|
| **TLS** | Automatic per-domain, zero config | Manual certbot setup per domain |
| **Config** | ~3 lines per site | ~20 lines per site |
| **Adding a site** | Add 3 lines, reload | Add server block, get cert, reload |
| **Maintenance** | Certs auto-renew silently | Certbot cron + occasional failures |

For a budget VPS where you want to add/remove sites with minimal friction, Caddy wins.

### Architecture After Migration

```
Internet → :80/:443 → Caddy (global, on host)
                         ├── plottedplant.com  → localhost:8080 (PlottedPlant nginx container)
                         ├── myothersite.com   → localhost:3000 (another Docker app)
                         ├── blog.example.com  → localhost:4000 (static site / ghost / etc.)
                         └── ...
```

Each Docker project exposes its services on a unique high port. Caddy handles TLS and domain routing for all of them.

---

## Migration Steps

### 1. Install Caddy

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy
```

### 2. Remap PlottedPlant's Ports

In `docker-compose.yml`, change the nginx service ports from binding to 80/443 to internal-only high ports:

```yaml
# Before
ports:
  - "80:80"
  - "443:443"

# After
ports:
  - "127.0.0.1:8080:80"
```

Binding to `127.0.0.1` ensures the container is only reachable from the host itself, not from the public internet. Caddy handles all public traffic.

You can also **remove the certbot container entirely** — Caddy handles TLS now. The PlottedPlant nginx container only needs to serve HTTP internally.

### 3. Simplify the PlottedPlant Nginx Config

Since Caddy handles TLS termination, the PlottedPlant nginx container no longer needs SSL configuration. You can strip the TLS blocks from `nginx/nginx.conf` and have it listen on port 80 only. Remove:

- The `listen 443 ssl` block
- All `ssl_*` directives
- The HTTP-to-HTTPS redirect server block
- The Let's Encrypt ACME challenge location
- The certbot volume mounts in `docker-compose.yml`

The nginx container becomes a simple internal reverse proxy and static file server.

### 4. Configure Caddy

Edit `/etc/caddy/Caddyfile`:

```caddyfile
plottedplant.com {
    reverse_proxy localhost:8080
}

# Add more sites as needed:
#
# myothersite.com {
#     reverse_proxy localhost:3000
# }
#
# blog.example.com {
#     root * /var/www/blog
#     file_server
# }
```

That's it. Caddy will automatically obtain and renew Let's Encrypt certificates for every domain listed.

### 5. Reload Caddy

```bash
sudo systemctl reload caddy
```

### 6. Remove the Certbot Container

Once Caddy is handling TLS, remove the certbot service from `docker-compose.yml` and clean up the related volumes:

```bash
docker compose down
# Remove certbot service and volume references from docker-compose.yml
docker compose up -d
docker volume rm plantuml_certbot_certs plantuml_certbot_webroot
```

---

## Adding a New Site

Once Caddy is set up, adding a new site is trivial:

1. Point the domain's DNS to your VPS IP.
2. Set up your app (Docker or bare metal) listening on a local port.
3. Add 3 lines to `/etc/caddy/Caddyfile`:
   ```caddyfile
   newsite.com {
       reverse_proxy localhost:PORTNUMBER
   }
   ```
4. `sudo systemctl reload caddy`

Caddy provisions the TLS certificate automatically. The whole process takes about 2 minutes.

---

## Resource Considerations

Current PlottedPlant resource usage is modest:

| Container | Memory |
|-----------|--------|
| Backend (FastAPI) | ~186 MiB |
| PlantUML Renderer | ~138 MiB |
| Collaboration (Hocuspocus) | ~32 MiB |
| PostgreSQL | ~27 MiB |
| Nginx | ~9 MiB |
| Certbot | ~6 MiB (removable) |
| Redis | ~3 MiB |
| **Total** | **~400 MiB** |

Caddy itself uses around **20-40 MiB**. On a 2 GB VPS you'd have roughly 1.5 GB free for additional sites. On a 4 GB VPS, plenty of room.

**Tips for staying within budget:**

- Use Alpine-based Docker images where possible (already done for PlottedPlant).
- Set memory limits in docker-compose to prevent any single app from starving others.
- For simple static sites, have Caddy serve them directly with `file_server` instead of spinning up a container.
- Share a single PostgreSQL instance across apps if they're small (use separate databases).
- Share a single Redis instance with separate key prefixes.

---

## Alternative Approaches

### Docker-native Proxy (Traefik)

[Traefik](https://traefik.io/) auto-discovers containers via Docker labels and handles routing + TLS. More powerful than Caddy for pure-Docker setups, but significantly more complex to configure. Better suited if you're running 10+ containerized services and want everything defined in docker-compose labels.

### Keep the Existing Nginx Container as Global Proxy

You could add server blocks to PlottedPlant's nginx container for other sites. This works but ties every site's uptime to PlottedPlant's docker-compose lifecycle — running `docker compose down` takes everything offline. Not recommended.

### Global Nginx on Host

Same concept as the Caddy approach but with nginx installed via `apt`. More manual work for TLS (certbot setup per domain, renewal cron). Reasonable if you're already deeply familiar with nginx and don't want to learn Caddy.
