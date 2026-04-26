# Changelog

## [2026-04-26]

### Fixed
- **Server:** Resolved `ModuleNotFoundError: No module named 'ollama'` by adding `ollama` to `requirements.txt` and root `requirements.txt`.
- **Client:** Fixed canvas drawing issue where paths were not appearing. Used `currentPath.copy()` in `onActive` and `onEnd` to trigger React state updates and properly render Skia paths.

### Added
- Created `.ai/ERRORS.md` to track system errors and resolutions.
- Created `CHANGELOG.md` to track project changes.
