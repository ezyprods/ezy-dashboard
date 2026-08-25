<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# UI Component Imports
Do not blindly import UI components (especially from `@/components/ui/` like Slider, Tooltip, Select) assuming they are installed. Always use `list_dir` to verify the component exists before importing it. If a component is missing, either implement a native HTML fallback (e.g., `<input type="range">` instead of `Slider`) or ask the user if they want to install it.


# Demucs AI Engine Dependencies
When working with Demucs audio separation in Python:
1. On Windows, installing `torchcodec` often causes `[end of libtorchcodec loading traceback]` errors due to DLL issues. Instead, uninstall `torchcodec`, install `soundfile`, and modify `demucs/audio.py` to pass `backend="soundfile"` to `torchaudio.save()`.
2. To check if Demucs is installed, run `python -m demucs --help`. Do not use `--version` as it will trigger an error.

# Automatic GitHub Sync
After finishing any user request that introduces, modifies, or deletes code/files in the repository:
1. Automatically activate the `github-auto-push` skill.
2. Stage modified files (`git add .`), make a descriptive commit message, and push to GitHub (`git push`).
3. Never end a request with unpushed workspace changes unless explicitly requested by the user.

