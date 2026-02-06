# Wikipedia Explorer (React)

A modern, light-themed Wikipedia Explorer that lets you search, read, and browse categories using the public Wikipedia API (no keys required).

## Features

- Search with suggestions and results
- Read articles (title, description/summary, lead image when available)
- Render full article HTML safely (sanitized)
- Browse categories from an article and view category members
- Related articles panel
- Client-side routing (React Router)

## Routes

- `/` Home
- `/search?q=...` Search results
- `/article/:title` Article view
- `/category/:category` Category view

## Running locally

```bash
npm install
npm start
```

App runs at http://localhost:3000

## Environment variables

- `REACT_APP_API_BASE` (optional): Base URL for Wikipedia API.
  - If not set, defaults to `https://en.wikipedia.org`.
  - Note: In some KAVIA templates, this may be set to a backend URL. If so, and it is not a Wikipedia-compatible base, you should unset it or set it to `https://en.wikipedia.org` for this app.

No backend is required.
