---
name: github-auto-push
description: >-
  Auto-push changes to GitHub after completing tasks.
  Use this skill automatically whenever any code or configuration changes are made in the project to commit and push them to GitHub.
---

# GitHub Auto Push Skill

This skill ensures that whenever changes, fixes, or additions are made to the codebase, they are committed and pushed to GitHub automatically.

## Instructions for Agent

1. **Check Status**: Run `git status` to check modified and untracked files.
2. **Stage Files**: Stage changes using `git add .` (ensuring temporary test files or scratch scripts are excluded if appropriate).
3. **Commit**: Create a concise and descriptive commit message explaining what was done.
4. **Push**: Run `git push origin <current-branch>`.
5. **Verify**: Ensure git push succeeds.
6. **Deploy to Vercel Production**: Run:
   ```bash
   node -e "require('dotenv').config({ path: '.env.local' }); const hook = process.env.VERCEL_DEPLOY_HOOK_URL; if (!hook) { console.error('Falta VERCEL_DEPLOY_HOOK_URL en .env.local'); process.exit(1); } fetch(hook, { method: 'POST' }).then(r => r.json()).then(console.log);"
   ```
   The deploy hook URL is a secret: it lives only in `.env.local` (`VERCEL_DEPLOY_HOOK_URL`), never in the repository.
   This guarantees that Vercel compiles and deploys the latest commit to Production immediately in real time.
