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
uvicorn main:app --reload
```

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
identity parameters; it reads the two identity headers from the request.

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
