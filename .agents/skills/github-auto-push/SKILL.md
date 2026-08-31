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
   node -e "const dotenv = require('dotenv'); dotenv.config({ path: '.env.local' }); const { execSync } = require('child_process'); try { execSync('npx vercel --token ' + process.env.VERCEL_TOKEN + ' --prod --yes', { stdio: 'inherit' }); } catch(e) { fetch('https://api.vercel.com/v1/integrations/deploy/prj_4u156DrxjxOFavPEY7P0OuOqzi0V/Thx5eA8KNs', { method: 'POST' }).then(r => r.json()).then(console.log); }"
   ```
   This guarantees that Vercel compiles and deploys the latest commit to Production immediately in real time.
