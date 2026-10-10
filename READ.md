### Backend
1. Go into backend folder
2. create a conda and activate it
3.  ```
   pip install -r requirements.txt
   ```
4. The backend uses SQLite by default. Its database file is created at
   `backend/users.db` the first time the app starts. To use another SQLAlchemy
   database URL, set the `DATABASE_URL` environment variable before starting
   the backend (and install that database's Python driver).

### How to Start le Backend [be in the backend folder]:
```
DEV_USER_ID=dev-1 DEV_USER_NAME="Dev Player" MAINTAINER_IDS=dev-1 uvicorn main:app --reload
```
`MAINTAINER_IDS` (comma-separated VISCON user IDs) unlocks the maintainer
tools at `/admin`: quest editor, idea reviews, completion reviews, reports.
Players are identified by the `X-User-Id` / `X-User-Name` headers that the
VISCON proxy adds. Locally there is no proxy, so `DEV_USER_ID` fakes one
player (only used when the header is missing). Never set it in deployment.
To act as a different player, send the headers yourself:
```
curl -H "X-User-Id: alice" -H "X-User-Name: Alice" localhost:8000/me
```

The app starts with no quests: maintainers add them in the quest editor
(`/admin`), and players can suggest some. Quests created in the app get IDs
from 1000 upwards; never change or reuse a quest `id`. The tests use sample
quests from `backend/tests/sample_quests.py`.

### Backend tests [be in the backend folder]:
```
pip install -r requirements-dev.txt
pytest
```

### How to access the backend in the browser:
http://127.0.0.1:8000/docs#/
(optionally change ip)

### API (browser paths start with `/api`)
Full, typed docs: http://127.0.0.1:8000/docs. Errors are always
`{"detail": "..."}`: `401` no VISCON identity, `403` maintainers only,
`404` not found, `409` not possible right now (e.g. already used code,
meetup not live), `410` expired/cancelled code.

| Area | Endpoints |
|---|---|
| Player | `GET /me`, `PUT /me/profile` (hobbies, opt-in), `GET /me/badges`, `GET /hobbies` |
| Quests | `GET /quests`, `GET /quests/{id}`, `POST /quests/{id}/complete` (solo, meetup check-in) |
| Quiz / steps | `POST /quests/{id}/quiz`, `POST /quests/{id}/steps/{step_id}/complete` |
| Meetups | `POST`/`DELETE /quests/{id}/rsvp` |
| Partner quests | `POST`/`GET`/`DELETE /quests/{id}/pair` (optional `invite_player_id`), `GET /pair/invites`, `GET /pair/{code}`, `POST /pair/{code}/join` |
| Ideas & reports | `POST /submissions`, `GET /submissions/mine`, `POST /quests/{id}/report` |
| Connections | `GET /suggestions`, `POST /suggestions/{player_id}/dismiss` |
| Ranking | `GET /leaderboard` |
| Maintainers | `/admin/quests` (CRUD + `/status`), `/admin/completions` (+ `/review`), `/admin/reports` (+ `/resolve`) |

### Game rules (defaults, change them in code)
- **Points** are granted once per player and quest; completions keep a
  snapshot, so editing points never changes past rewards.
- **Quest kinds**: `solo` (optionally maintainer-approved), `pair` (6-char
  code, valid 10 min, can't join your own; both players get the points),
  `quiz` (all answers right, unlimited retries), `multi_step` (steps in
  order, points with the last step), `meetup` (check-in from 15 min before
  start until the end; RSVP optional; shown in Zurich time).
- **Publishing**: new quests start as drafts; incomplete quests can't be
  published. Retiring hides a quest but keeps everyone's points. Once players
  have progress, a quest's type can't change and steps can only be reworded.
- **Player ideas** wait for maintainer review (max 5 pending per player).
  Reported quests show up under Admin → Reports.
- **Hobbies** are optional; suggestions only include players who opted in,
  only show the shared hobbies, and dismissed players never come back.
  "Invite" on a suggestion starts a partner quest whose code appears on the
  other player's home screen (only between opted-in players). Players who
  already completed a partner quest can host it again; only the partner
  earns points then.
- **Badges** are computed from approved completions (never stored twice).
- **Leaderboard**: only approved points; equal points share a rank.
- **Map**: real OpenStreetMap tiles via Leaflet
  (`frontend/src/components/campus-map.tsx`), no API key needed. Pins are
  latitude/longitude, set by tapping the map in the quest editor. Dark mode
  darkens the tiles with a CSS filter. OSM's tile policy is fine for event
  traffic; switch to a hosted tile provider for anything bigger.

### Design
The look follows the VIS website (vis.ethz.ch): yellow `#ffe210` primary
buttons with near-black text, ETH-blue links, flat surfaces with thin
outlines, small radii, Inter with optical sizing (≈ Inter Display), and
automatic light/dark mode. Colors are tokens in `frontend/app/globals.css`
(use classes like `bg-primary`, `text-on-surface`, `border-outline-variant`);
shared buttons, cards and chips live in `frontend/src/components/page.tsx`.
Icons come from one family (`lucide-react`, see
`frontend/src/components/icons.tsx`); don't mix in emoji. The recurring
campus element is the line drawing of the main building in
`frontend/src/components/campus-motif.tsx`.

Note: with `cacheComponents`, Next.js keeps visited pages alive (hidden)
instead of unmounting them. Effects re-run on return but `useState` values
survive, so don't treat "effect ran" as "fresh mount" (see the map
component for an example).

### Deployment / data
The deployed SQLite database lives in the Docker volume `backend-data`
(`/data/users.db`), so it survives `docker compose down` and rebuilds.
**Never run `docker compose down -v`**, which deletes all progress.
The backend port is bound to `127.0.0.1` only, so nobody can bypass the
VISCON proxy and fake identity headers.

# Frontend
1. install Node.js (v22.20.0)
    https://nodesource.com/products/distributions
2. npm install
3. check whether orval and prettier are installed

### After each backend change:
```
npx orval
```

### To Run frontend
```
npm run dev
```

Tailwind is for Styling (classname and so on)
See https://tailwindcss.com/docs/styling-with-utility-classes
