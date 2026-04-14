# LegalBot - CommLegal FAQ Assistant

LegalBot is an AI-powered web app that helps GitHub employees get instant answers to common commercial legal questions. It uses the CommLegal FAQ as its knowledge base and the GitHub Models API for AI-powered answers.

Deployed on GitHub Pages. No backend required.

## How It Works

1. A GitHub employee visits the LegalBot page
2. They type a question (e.g., "Can we sign a customer's NDA?")
3. FAQ entries are filtered in real time by keyword matching
4. If a GitHub token is configured, LegalBot generates an AI-powered answer using GPT-4.1 via the GitHub Models API
5. Every AI response includes a disclaimer directing users to file a CommLegal issue for deal-specific or complex questions

LegalBot is designed to augment attorneys, not replace them. It handles FAQ-answerable questions so CommLegal attorneys can focus on complex deal work.

## Architecture

```
Browser (GitHub employee)
  |
  +--> Static site (GitHub Pages)  -->  faq.json (knowledge base)
  |
  +--> GitHub Models API (GPT-4.1)  -->  AI-powered answers
       (authenticated with user's own GitHub PAT)
```

No server, no secrets to manage, no infrastructure cost. The user's GitHub token stays in their browser (sessionStorage) and is only sent to the GitHub Models API.

## Live Site

After deploying to GitHub Pages, the app will be available at:

```
https://github.github.io/legalbot/
```

## Local Development

```bash
cd docs
python3 -m http.server 8080
# Open http://localhost:8080
```

## Deploy to GitHub Pages

1. Create an internal repo (e.g., `github/legalbot`)
2. Push this project to the repo
3. Go to **Settings > Pages**
4. Under "Source", select **Deploy from a branch**
5. Set branch to `main` and folder to `/docs`
6. Click **Save**

The site will deploy automatically on every push to `main`.

## Enabling AI Answers

Without a GitHub token, the app works as a searchable FAQ browser. To enable AI-powered answers:

1. Click **"AI Settings"** in the top-right corner
2. Paste a GitHub PAT with the `models:read` scope
3. Your token is stored in `sessionStorage` (cleared when the browser tab closes) and is only sent to the GitHub Models API

Create a token at [github.com/settings/tokens](https://github.com/settings/tokens).

## Updating the FAQ

The knowledge base lives in `docs/faq.json`. To update:

1. Edit `faq.md` (the human-readable source)
2. Re-parse it into `docs/faq.json` (or edit the JSON directly)
3. Push to `main` and GitHub Pages will redeploy automatically

## Project Structure

```
docs/
  index.html   - Main page
  style.css    - GitHub-themed dark mode styling
  app.js       - Client-side logic (search, AI, FAQ rendering)
  faq.json     - Structured FAQ data (36 entries, 5 categories)
faq.md         - Human-readable FAQ source
README.md      - This file
```

## Cost

- **GitHub Pages**: Free
- **GitHub Models API**: Free for GitHub employees
- **Total**: $0
