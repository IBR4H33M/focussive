# Focussive Web — Official Website

Official marketing and legal website for **Focussive** by **SOLASE Studio**.
Configured for free deployment on **Vercel** with custom subdomain `https://focussive.solase.studio`.

---

## 📁 Project Structure

```
├── index.html           # Main landing page (Hero, Demo, Screenshots, Science, FAQ)
├── privacy.html         # Official Privacy Policy (Google Play & Chrome Web Store compliant)
├── terms.html           # Terms of Service
├── vercel.json          # Clean URLs configuration and HTTP security headers
├── css/
│   ├── style.css        # Unified dark mode design system matching Focussive app palette
│   └── privacy.css      # Legal document typography & readability
├── js/
│   └── main.js          # Interactive screenshot tabs, FAQ accordions, promo code copy
└── assets/
    ├── icon.png         # Focussive logo
    ├── app-icon.png     # High-res app icon
    ├── favicon.png      # Favicon
    ├── solase.png       # SOLASE Studio branding
    └── screenshots/     # App UI screenshot decoys (ready to be replaced)
        ├── session-mockup.svg
        ├── driving-forces-mockup.svg
        ├── blocking-mockup.svg
        └── extension-mockup.svg
```

---

## 🎨 Theme Palette (Focussive Dark Mode)

- **Background:** `#151828` / `#1F243B`
- **Surfaces:** `#272D4A` / `#343B5F`
- **Accent (Sage / Cambridge Blue):** `#8BA794`
- **Accent Text / Highlights:** `#E9E4DC` (Alabaster)
- **Secondary Text:** `#BAC6B8` (Ash Gray)
- **Borders:** `#424A70`

---

## 🖼️ How to Replace the Decoy Screenshots

The website includes 4 SVG decoy mockups formatted inside `assets/screenshots/`.
When your real screenshots are ready:
1. Drop your PNG/JPEG screenshots into `assets/screenshots/`:
   - `session.png`
   - `driving-forces.png`
   - `block-screen.png`
   - `chrome-extension.png`
2. In `index.html`, find the `<div class="mockup-card">` tags and update the `src` attribute:
   ```html
   <img src="assets/screenshots/session.png" alt="Focus Session UI" class="mockup-img">
   ```

---

## 📹 How to Replace the YouTube Video

In `index.html` (under the `<!-- YouTube Video Walkthrough Section -->`), locate the `<iframe>`:
```html
<iframe 
  src="https://www.youtube.com/embed/YOUR_VIDEO_ID?rel=0" 
  title="Focussive App Walkthrough" 
  ...
</iframe>
```
Replace `YOUR_VIDEO_ID` with your YouTube video ID (e.g., `https://www.youtube.com/embed/a1b2c3d4e5f`).

---

## 🚀 How to Deploy on Vercel (100% Free)

### Option A: Using Vercel Dashboard
1. Push this directory to a new GitHub repository (e.g., `focussive-web`).
2. Go to [vercel.com](https://vercel.com) and click **"Add New Project"**.
3. Import your `focussive-web` repository.
4. Framework Preset: **Other** (Static). Root Directory: `./`. Click **Deploy**.
5. Go to **Settings** → **Domains**.
6. Add `focussive.solase.studio`.
7. Add the CNAME record in your domain registrar / DNS provider:
   - **Type:** `CNAME`
   - **Name:** `focussive`
   - **Value:** `cname.vercel-dns.com`

### Option B: Using Vercel CLI
```bash
npm i -g vercel
vercel
```
Follow the prompts, then link your custom domain in the project settings.
