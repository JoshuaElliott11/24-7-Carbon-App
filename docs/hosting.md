# Hosting (Lightweight)

This app can be hosted as a single web service (backend + UI together) with low footprint.

## Recommended resource target
- `1 vCPU`
- `512 MB RAM`
- `~1 GB disk`

This is typically enough for demos and moderate CSV sizes.

## RAM/storage guards already in app
- Max rows per uploaded series: `100,000`
- Single worker in production container
- No test dependencies in production image

## Deploy on Render (simplest)
1. Push this repo to GitHub.
2. In Render, create a **Blueprint** from repo.
3. It will pick up `render.yaml`.
4. Wait for build/deploy.
5. Open:
   - `https://<your-service>.onrender.com/ui`

## Deploy with Docker anywhere
Build:
```bash
docker build -f backend/Dockerfile -t carbon-sim .
```

Run:
```bash
docker run -p 8000:8000 carbon-sim
```

Open:
- `http://localhost:8000/ui`

## Notes
- Web hosting avoids Windows SmartScreen warnings from unsigned EXEs.
- For heavy production usage or very large datasets, increase RAM.
