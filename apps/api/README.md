# @evergreen/api

The backend API Worker (`docs/API.md` §1, option B). Production Worker `evergreen-api`, preview `evergreen-api-preview`. The dashboard's `/api/*` Pages Function forwards to it over the service binding `API`; the Worker serves `/api/v1`.

Skeleton only: `GET /api/v1/health` and a JSON 404. No DB, no secrets.

Deploy (DevOps): `npx wrangler deploy --env preview` from `apps/api` (preview), `npx wrangler deploy` (production, needs Fatih's yes).
