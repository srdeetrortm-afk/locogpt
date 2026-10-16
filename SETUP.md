# Loco-GPT — free AI setup (one time, about 15 minutes)

## 1. Get the free AI key (Groq)
1. Open https://console.groq.com and sign in with Google.
2. Left menu → **API Keys** → **Create API Key** → name it `locogpt` → copy the key (starts with `gsk_`).

(Optional backup brain: https://aistudio.google.com → **Get API key** → copy.)

## 2. Put the code on GitHub (no software needed)
1. Open https://github.com → sign in → **New repository** → name `locogpt` → **Create**.
2. Click **uploading an existing file** → drag ALL files and folders from this zip
   (index.html, netlify.toml, manifest.webmanifest, icons, and the `netlify` folder) → **Commit changes**.

## 3. Connect to Netlify
1. https://app.netlify.com → **Add new site** → **Import an existing project** → **GitHub** → choose `locogpt`.
2. Leave build settings as they are → **Deploy**.
3. **Site configuration → Environment variables → Add a variable**:
   - `GROQ_API_KEY` = your gsk_… key  (required)
   - `GEMINI_API_KEY` = your Google AI Studio key  (optional backup)
4. **Deploys → Trigger deploy → Deploy site** (so it picks up the key).
5. **Site configuration → Change site name** → `locogpt` → your link is https://locogpt.netlify.app

Open the link → it says **AI ready** → ask anything.

## 4. (Optional) One-click Gmail login — skip this for the PCEE demo so he can just open the link
1. https://console.cloud.google.com → create project `locogpt` → **APIs & Services → OAuth consent screen** → External → app name Loco-GPT → save.
2. **Credentials → Create credentials → OAuth client ID** → Web application →
   Authorized JavaScript origins: `https://locogpt.netlify.app` → Create → copy the **Client ID**.
3. In Netlify add variable `GOOGLE_CLIENT_ID` = that Client ID → redeploy.
4. Optional: `ALLOWED_EMAILS` = comma-separated Gmail IDs allowed to use Loco-GPT (leave empty for any Gmail).

## Want the Claude brain later? (one switch, paid per question)
Create a key at https://console.anthropic.com (add a small prepaid credit, set a spend limit) →
in Netlify add `ANTHROPIC_API_KEY` → redeploy. The same link now answers with Claude; Groq stays as automatic backup.

## Limits (free)
Groq free tier ≈ 1,000 questions/day per model (3 models are tried in turn). When busy, Loco-GPT shows the nearest TSD pages offline and asks to retry in a minute.
