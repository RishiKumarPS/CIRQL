# CIRQL

CIRQL is a static website for a curated, in-person social and dating experience in Bangalore. The active site uses plain HTML, CSS, and JavaScript, with Supabase for event, applicant, quiz, RSVP, and match data.

## Project structure

- `index.html` — landing page, event listings, member signup/login, and match reveal.
- `cirql-mcq.html` — 10-question compatibility quiz; saves quiz responses and local drafts.
- `admin.html` — demo applicant and event management dashboard.
- `404.html` — branded not-found page.
- `styles.css` — shared visual styles for the site.
- `supabase-client.js` — shared ES module that creates and exports the Supabase client and shared formatting/normalization helpers.
- `ui-utils.js` — shared toast, member-session storage, and button-loading helpers.
- `landing.js` — landing page event, member, modal, and match behavior.
- `quiz.js` — quiz draft, answer, and submission behavior.
- `admin.js` — admin dashboard data and interaction behavior.

## Demo limitations and data safety

- The six-digit OTP is a demo placeholder. Any six digits are accepted; no SMS is sent and no code is verified by an OTP provider.
- The admin passcode is `cirql2026` and is a client-side demo gate, not authentication or authorization. It is visible in browser code and does not protect applicant data.
- The browser uses a publishable Supabase key. Before handling real applicant data, configure strict Row Level Security (RLS) policies for every table and use server-enforced Supabase Auth and admin authorization. Never put a service-role key in browser code.

Use demo data only until production access controls and policies have been verified.

## Pre-launch / post-approval checklist

- Integrate a real SMS OTP provider and verify codes server-side.
- Replace the client-side admin gate with Supabase Auth and server-enforced admin authorization; test strict RLS policies.
- Publish privacy, terms, and consent policy pages and link them from the site.
- Define production data retention, deletion, and backup procedures for applicant and quiz data.

## Run and deploy

There is no build step or package installation. Serve the project root with a static web server; for example, run `python -m http.server 8000` and open `http://localhost:8000`. Deploy the HTML pages, `styles.css`, `supabase-client.js`, `ui-utils.js`, `landing.js`, `quiz.js`, and `admin.js`. Google Fonts are loaded remotely and require an internet connection.
