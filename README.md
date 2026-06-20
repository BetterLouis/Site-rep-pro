# Lighthouse Worker — Deployment Guide

This is the small standalone service that runs real Chrome + Lighthouse, since Supabase Edge Functions (Deno) can't launch a browser. Deploy this anywhere that can run Docker, get the URL it gives you, and paste that into Supabase as `LIGHTHOUSE_WORKER_URL`.

Two free options below — Render is the simpler one to start with.

---

## Option A: Render (recommended to start)

1. **Push this folder to a new GitHub repo.**
   Create a repo (e.g. `lighthouse-worker`), and push these three files: `server.js`, `package.json`, `Dockerfile`.

2. **Create a Render account** at render.com (free, no card required for the free tier).

3. **New → Web Service** → connect your GitHub account → select the `lighthouse-worker` repo.

4. Render will detect the `Dockerfile` automatically. Settings:
   - **Name:** `lighthouse-worker` (this becomes part of your URL)
   - **Instance Type:** Free
   - **Environment Variable:** add `WORKER_SECRET` = (generate any random string — this is your shared-secret auth so strangers can't hit your endpoint and burn your free compute)

5. Click **Create Web Service**. First deploy takes 3-5 minutes (it's building a Docker image with Chromium inside).

6. Once deployed, Render shows your live URL at the top of the service page — it looks like:
   ```
   https://lighthouse-worker-xxxx.onrender.com
   ```
   That entire URL is your `LIGHTHOUSE_WORKER_URL`.

7. **Test it** before wiring it into Supabase:
   ```bash
   curl -X POST https://lighthouse-worker-xxxx.onrender.com/audit \
     -H "Content-Type: application/json" \
     -H "x-worker-secret: your-random-string" \
     -d '{"url": "https://example.com"}'
   ```
   You should get back a JSON payload with `performanceScore`, `coreWebVitals`, etc.

**Render free tier note:** the service spins down after 15 minutes of inactivity and takes ~30-50 seconds to wake up on the next request. For a low-to-moderate traffic diagnostic tool this is fine — just know the first scan after idle time will be slower. If that becomes a problem once you have real volume, Render's $7/mo starter tier keeps it always-on.

---

## Option B: Fly.io (skip the cold-start delay)

1. Install the Fly CLI: `curl -L https://fly.io/install.sh | sh`
2. From inside this folder, run `fly launch` — it detects the Dockerfile automatically and asks a few setup questions (region, app name).
3. Set your secret: `fly secrets set WORKER_SECRET=your-random-string`
4. Deploy: `fly deploy`
5. Fly gives you a URL like:
   ```
   https://lighthouse-worker.fly.dev
   ```
   That's your `LIGHTHOUSE_WORKER_URL`.

Fly's free allowance covers a small always-on machine, which avoids Render's cold-start delay — slightly more setup, better always-on behavior.

---

## Wiring it into Supabase

Once you have the URL from either option:

1. Go to your Supabase project → **Project Settings → Edge Functions → Secrets**
2. Add two secrets:
   - `LIGHTHOUSE_WORKER_URL` = the full URL from above (e.g. `https://lighthouse-worker-xxxx.onrender.com/audit`)
   - `LIGHTHOUSE_WORKER_SECRET` = the same random string you set as `WORKER_SECRET` on the worker
3. In your `run-audit` Supabase edge function, call it like:
   ```ts
   const lighthouseResp = await fetch(Deno.env.get('LIGHTHOUSE_WORKER_URL'), {
     method: 'POST',
     headers: {
       'Content-Type': 'application/json',
       'x-worker-secret': Deno.env.get('LIGHTHOUSE_WORKER_SECRET'),
     },
     body: JSON.stringify({ url: targetUrl }),
   });
   const lighthouseData = await lighthouseResp.json();
   ```

That's the full loop — Lovable's edge function calls your worker, your worker runs real Chrome + Lighthouse, and the result flows back into the same `run-audit` response as everything else.

