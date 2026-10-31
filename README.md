# CIRQL

CIRQL is a static website for a curated, in-person social and dating experience in Bangalore. The pages are plain HTML, CSS, and JavaScript, with Supabase providing live event, application, quiz response, and match data.

## Pages

- `index.html` is the landing page. It loads event cards from `events`, inserts applications into `applicants`, marks applicants verified after the demo OTP step, and loads the latest match from `matches` for the reveal.
- `cirql-mcq.html` is a 10-question compatibility quiz. Submitting the quiz writes its answers and applicant ID to `quiz_responses`; the completion CTA returns to the landing page.
- `cirql-landing-page (1).html.bak` and `cirql-mcq.html.bak` are retained backup files and are not part of the active site.

## Supabase

Both active pages use the same Supabase project and a browser-safe publishable key. Configure Row Level Security policies for the required operations on `events`, `applicants`, `quiz_responses`, and `matches`. Never put a service-role key in browser code.

The OTP is currently a demo: any six-digit value advances the flow. It does not send an SMS or validate a code through an OTP provider.

## Run and deploy

There is no build step or package installation. Serve the project root with any static web server; for example, run `python -m http.server 8000` and open `http://localhost:8000`. Deploy the active HTML pages and configure the Supabase table policies before enabling public use. Google Fonts are loaded remotely and require an internet connection.
