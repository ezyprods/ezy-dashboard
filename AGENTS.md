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
