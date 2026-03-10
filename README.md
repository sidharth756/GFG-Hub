<div align="center">

<img src="assets/icons/icon128.png" width="80" />

# GFGHub

**Auto-push your GeeksForGeeks solutions to GitHub — like LeetHub, but for GFG.**

![Version](https://img.shields.io/badge/version-1.0.0--beta-blue?style=flat-square)
![Platform](https://img.shields.io/badge/platform-Chrome%20%7C%20Edge-brightgreen?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-orange?style=flat-square)

> 📣 **Coming soon to Chrome Web Store & Microsoft Edge Add-ons!**

</div>

---

## ✨ What it does

- Detects when your GFG submission is **Accepted**
- **Auto-pushes** your code to a GitHub repo called `GFG-solution`
- Creates a folder named after the problem (e.g. `Java Hello World/`)
- Generates a `README.md` per problem with description, difficulty & metadata
- Shows a **Push button** right next to GFG's Submit button

---

## 🚀 Installation (Manual — Test Version)

> Chrome Web Store release coming soon. For now, load it manually.

1. **Download / clone this repo**
   ```bash
   git clone https://github.com/YOUR_USERNAME/gfghub.git
   ```

2. Open Chrome and go to `chrome://extensions/`

3. Enable **Developer mode** (top-right toggle)

4. Click **Load unpacked** and select the project folder

5. The GFGHub icon will appear in your toolbar ✅

---

## 🔧 Setup

1. Click the **GFGHub icon** in the toolbar
2. Click **Connect GitHub**
3. Enter your **GitHub Personal Access Token** ([create one here](https://github.com/settings/tokens/new?scopes=repo&description=GFGHub) — needs `repo` scope)
4. Enter your **GitHub username**
5. Click **Connect** — a repo named `GFG-solution` is auto-created for you

---

## 📝 Usage

1. Go to any problem on [GeeksForGeeks](https://www.geeksforgeeks.org/problems/)
2. Write your solution and click **Submit**
3. Once GFG shows **Accepted** — code is **automatically pushed** to GitHub
4. The Push button turns **green ✓** on success, **red ✕** on failure

---

## 📁 Repo Structure

Your `GFG-solution` repo will look like:
```
GFG-solution/
├── Java Hello World/
│   ├── Java Hello World.java
│   └── README.md
├── Two Sum/
│   ├── Two Sum.cpp
│   └── README.md
```

---

## 🛠️ Tech Stack

- Chrome Extension Manifest V3
- Vanilla JS (no frameworks)
- GitHub Contents REST API

---

## 💬 Feedback & Issues

This is a **v1.0.0 test release**. If something breaks, please [open an issue](../../issues).

---

<div align="center">
<sub>Made with ❤️ for the GFG community</sub>
</div>

        ↓
GFGHub detects "Accepted" verdict
        ↓
Extracts your code from the editor
        ↓
Pushes to GitHub:
  your-repo/
  └── reverse-a-linked-list/
        └── solution.cpp
```

---

## Features

| Feature | Details |
|---|---|
| Auto-detect submissions | Intercepts GFG's API calls **and** watches the DOM |
| Multi-language | C++, Java, Python, Python3, JavaScript, C |
| Multi-editor | CodeMirror, ACE, Monaco, textarea fallback |
| Smart commits | Creates the file on first push; updates (with SHA) on re-submissions |
| Auto-create repo | Creates the GitHub repo for you if it doesn't exist |
| Browser notification | Toast notification on every successful push |

---

## Installation (Developer Mode)

> The extension is not yet published to the Chrome Web Store.

1. **Clone / download** this repository.
2. Open **Chrome** → `chrome://extensions/`
3. Enable **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the `gfg-extension/` folder.
5. The GFGHub icon appears in the toolbar.

---

## First-Time Setup

### 1. Generate a GitHub Personal Access Token

Go to: **GitHub → Settings → Developer Settings → Personal Access Tokens → Tokens (classic)**

Or click **generate →** directly in the popup.

- **Scopes required:** `repo` (full control of private repositories)
- Copy the generated token — you only see it once.

### 2. Configure GFGHub

Click the GFGHub icon in your browser toolbar:

1. Click **Get Started**
2. Paste your **PAT**
3. Enter your **GitHub username**
4. Enter the **repository name** (e.g. `gfg-solutions`) — it will be created automatically if it doesn't exist
5. Click **Save & Verify**

---

## Repository Structure

```
gfg-solutions/               ← your chosen repo
├── two-sum/
│   └── solution.py
├── reverse-a-linked-list/
│   └── solution.cpp
├── binary-search/
│   └── solution.java
└── ...
```

---

## Supported GFG Domains

| Domain | Status |
|---|---|
| `practice.geeksforgeeks.org/problems/*` | ✅ Supported |
| `www.geeksforgeeks.org/problems/*` | ✅ Supported |

---

## File Structure

```
gfg-extension/
├── manifest.json
├── popup/
│   ├── popup.html
│   ├── popup.js
│   └── popup.css
├── scripts/
│   ├── content.js       ← injected into GFG pages
│   └── background.js    ← GitHub API + push logic
├── assets/
│   └── icons/
│       ├── icon16.png
│       ├── icon48.png
│       └── icon128.png
└── README.md
```

---

## Generating Icons

Run the helper script once to generate placeholder PNG icons:

```bash
node generate-icons.js
```

Or replace `assets/icons/icon*.png` with your own icons.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Extension not detecting submission | Make sure you're on a `practice.geeksforgeeks.org/problems/…` page and the verdict shows "Correct Answer" |
| "Invalid token" error | Re-generate a PAT with `repo` scope |
| Code extracted as empty | GFG may have updated their editor — open a GitHub issue |
| Push fails with 409 | The file SHA fetch failed — retry or check your PAT permissions |

---

## Contributing

Pull requests welcome! The most valuable contributions are:

- Updated CSS selectors for new GFG UI versions
- Support for additional languages
- A proper Chrome Web Store submission pipeline

---

## License

MIT
