# Laptop setup (do this on all 3 laptops)

Time needed: about 20 minutes.

## 1. Install the tools

| Tool | Version | Windows | macOS | Linux |
| --- | --- | --- | --- | --- |
| Git | latest | `winget install Git.Git` | `xcode-select --install` | `sudo apt install git` |
| Node.js | 22 LTS | `winget install OpenJS.NodeJS.LTS` | `brew install node@22` | via nvm: `nvm install 22` |
| GitHub CLI | latest | `winget install GitHub.cli` | `brew install gh` | `sudo apt install gh` |
| VS Code | latest | `winget install Microsoft.VisualStudioCode` | `brew install --cask visual-studio-code` | from code.visualstudio.com |
| Claude Code | latest | `npm install -g @anthropic-ai/claude-code` | same | same |

Check: `git --version`, `node -v` (should print v22.x), `gh --version`, `claude --version`.

Only Dev 3 also needs: **Tiled** (mapeditor.org) and **Aseprite** or the free **LibreSprite** / **Piskel**.
Only Dev 1 also needs: **NASA GMAT** (download from the challenge Resources tab).

## 2. Configure Git and GitHub

```bash
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
gh auth login          # choose GitHub.com > HTTPS > login with browser
```

## 3. Get the code

```bash
gh repo clone <owner>/lactomeda
cd lactomeda
npm install
npm run dev            # open the printed localhost URL
npm test               # should pass
```

## 4. Start Claude Code

```bash
cd lactomeda
claude
```

Claude Code reads `CLAUDE.md` automatically, so all three sessions follow the same rules.
A good first prompt: "Read CLAUDE.md and the Jira issue LAC-XX, then implement it in my folders only."

## 5. VS Code extensions (recommended)
ESLint/oxlint, Prettier, Tailwind CSS IntelliSense, GitLens, Jira (Atlassian) for VS Code.
