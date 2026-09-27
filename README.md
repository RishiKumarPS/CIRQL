# CIRQL

CIRQL is a static website prototype for a curated, in-person social and dating experience in Bangalore. It introduces the events, explains the matching experience, and includes an interactive compatibility questionnaire.

## Pages

- `index.html` is the main landing page, with event information, an application modal, and links to the questionnaire.
- `cirql-mcq.html` is a 10-question vibe check. Answer every question to view the completion screen.
- `cirql-landing-page (1).html` is an earlier landing page retained from the original GitHub upload.

## Run locally

No dependencies, build step, or server are required. Open `index.html` in a browser. Use the waitlist link to open the questionnaire; its completion screen links back to the home page.

## Prototype notes

The pages are implemented with HTML, CSS, and JavaScript in the HTML files. The application and OTP interactions are visual demonstrations only: they do not send or store applications, send a verification code, or connect to a backend. The pages also load fonts from Google Fonts, so those fonts require an internet connection.
