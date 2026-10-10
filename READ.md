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
APP_ENV=development uvicorn main:app --reload
```
The local test identity is enabled only when `APP_ENV` is explicitly set to
`development` or `local`. In all other environments, including deployments
where `APP_ENV` is unset, both identity headers are required. For local Docker
testing, run `docker compose -f docker-compose.yml -f docker-compose.local.yml up`.
The local override enables the test identity; the standard Compose file remains
in production mode unless `APP_ENV` is explicitly changed.

### How to access the backend in the browser:
http://127.0.0.1:8000/docs#/
(optionally change ip)

### User API
The backend reads the logged-in identity from the `X-User-Id` and
`X-User-Name` request headers. `X-User-Id` is used as the user's `username`
and primary key. The `GET /me` endpoint creates the profile on first access,
then returns the saved profile and score:

```json
{
  "username": "alice",
  "name": "Alice Example",
  "score": 0
}
```

Profiles are created automatically on the first `GET /me` request and start
with a score of zero. The endpoint takes no body, query parameters, or explicit
identity parameters; it reads the two identity headers from the request. When
both headers are absent and `APP_ENV` is explicitly `development` or `local`,
the backend uses the local test identity `local-user` / `Local Tester`.

`GET /leaderboard` returns every saved user with their username, name, and score,
sorted from highest to lowest score. Users with equal scores are ordered by
username.

### Quest API
Create a quest with `POST /quests` and a JSON body containing `question`,
`answer`, and positive `points`. This endpoint currently has no authorization.
Delete a quest with `DELETE /quests/{quest_id}`; its UUID can be copied from
`GET /quests`. This endpoint also has no authorization.
`GET /quests` lists all quests, including answers, all assigned participant
usernames, and successful solver usernames, for verification. Quest play
endpoints use the same identity headers.
`GET /quests/next` returns the next unsolved quest with only its ID, question,
and points. Quest IDs are UUIDs. New quests are delivered before missed ones
repeat; unsolved quests cycle back until the user solves them.

Submit one answer with `POST /quests/{quest_id}/answer` and a JSON body such as
`{"answer": "42"}`. The response includes the submitted answer, whether it is
correct, points awarded, and the user's updated score. Answers are
case-insensitive and trimmed. A wrong answer can be retried; the correct answer
is revealed after a correct submission. Points are awarded only once, and
correct solvers are recorded on the quest and linked to their user profile.

# Frontend
1. install Node.js (v22.20.0)
    https://nodesource.com/products/distributions
2. npm install
3. check whether orval and prettier are installed

### After each backend change:
```
npm run generate:api
```
Start the backend on `localhost:8000` first. For another OpenAPI URL, set
`OPENAPI_URL` when running the command.

### To Run frontend
```
npm run dev
```

Tailwind is for Styling (classname and so on)
See https://tailwindcss.com/docs/styling-with-utility-classes
