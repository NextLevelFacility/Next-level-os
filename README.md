# Next Level OS

One app the whole team opens every day: Playbook (SOPs from the Obsidian vault), Checklists, Onboarding (the 5 C's + 30/60/90 plan), Reports, Team, and the CEO Dashboard. Every screen is scoped by role and by location, so a new location is a row in a table, not a rebuild.

Stack: React + Vite · Supabase (database, logins, roles) · Netlify (hosting) · the Obsidian vault as content.

## Setup (one time, ~15 minutes)

### 1. Database
1. Open the Supabase project → **SQL Editor** → **New query**.
2. Paste everything in `supabase/schema.sql` → **Run**.
3. In Supabase → **Authentication → Providers → Email**, turn **Confirm email** off for now (so the team can sign in right away).

### 2. Netlify
1. Netlify → **Add new site → Import an existing project → GitHub** → pick `NextLevelFacility/next-level-os`.
2. Build settings are read from `netlify.toml` (build `npm run build`, publish `dist`).
3. **Site configuration → Environment variables → Add**:
   - `VITE_SUPABASE_URL` = `https://wocwykeukuxobqfzalad.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = the publishable key from Supabase → Project Settings → API
4. Deploy. Every push to `main` redeploys automatically.

### 3. First login
1. Open the site → **Create an account**. **The first account created becomes the Owner.**
2. Everyone else who signs up starts as *New hire*. The Owner sets their role and location on the **Team** tab.
3. On a phone: open the site in Safari/Chrome → Share → **Add to Home Screen**. It installs like an app.

### 4. The vault (SOP content)
The app bundles the Obsidian vault from `content/vault/`. To update it:
- **Now:** copy the vault's `.md` files into `content/vault/` and push.
- **Next:** point the Obsidian Git plugin at a `next-level-vault` repo and a GitHub Action copies it in on every save (Phase 2).

## Roles
| Role | Sees |
|---|---|
| owner | Everything, every location, Dashboard |
| operator | Everything at their location, Dashboard |
| coach | Athletes, coaching SOPs, session reports, coach checklists |
| sales | Sales SOPs, daily sales report |
| frontdesk | Opening/closing checklists, shift reports |
| newhire | Their 30-day plan first; the rest unlocks as they go |

## Checklists
Edit or add them in Supabase → Table Editor → `checklist_templates`. `items` is a list like `[{"text":"Walk the turf","photo":true}]`. `role` limits who sees it; leave it empty for everyone. `location_id` empty = every location.

## Adding a location
Supabase → `locations` → insert a row (slug, name). Assign people to it on the Team tab. Done; every checklist, SOP, report and onboarding path applies there too.

## Local development
```
cp .env.example .env   # already filled with the public key
npm install
npm run dev
```

## Roadmap
- Phase 2: Square, Stripe, PushPress, GoHighLevel, Google Sheets and Google Calendar feeds into the Dashboard; 7am daily brief
- Phase 3: Robots (comment-to-lead, cross-posting), VSL page, Athletes (ADP) merged in
- Phase 4: multi-location rollout, Operator scorecards
