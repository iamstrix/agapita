# Repository Guidelines

## Project Structure & Module Organization

Agapita is split into three areas. `server/` contains the FastAPI and Socket.IO backend, local AI/RAG logic, SQLite data (`agapita.db`), and Python tests named `test_*.py`. `desktop/` is the Vite + React + TypeScript web app; source lives in `desktop/src/`, UI in `desktop/src/components/`, pages in `desktop/src/pages/`, assets in `desktop/src/assets/` and `desktop/public/`, and gesture algorithms in `desktop/algorithm/`. `client/` is the React Native app, with the entry point in `client/App.tsx` and tests in `client/__tests__/`.

## Build, Test, and Development Commands

- `cd server && python main.py`: start the local backend; keep Ollama running and pull `gemma4:e4b` first.
- `cd desktop && npm install && npm run dev`: install web dependencies and start Vite.
- `cd desktop && npm run build`: type-check and build the desktop app.
- `cd desktop && npm run lint`: run ESLint for the desktop app.
- `cd client && npm install && npm start`: start Metro for React Native.
- `cd client && npm run ios` or `npm run android`: launch the mobile app.
- `cd client && npm test`: run Jest tests.
- `cd server && python -m pytest`: run backend tests when `pytest` is available.
- `./docker-dev.sh`: run the Docker development stack.

## Coding Style & Naming Conventions

Use TypeScript for React code and Python for backend modules. Follow existing naming: React components and page files use `PascalCase`, hooks/helpers use `camelCase`, and Python modules use `snake_case`. The React Native client uses Prettier with single quotes, no bracket spacing, trailing commas, and `arrowParens: 'avoid'`. Run lint commands before handing off UI changes.

## Testing Guidelines

Add focused tests near the code they exercise. Use `client/__tests__/*.test.tsx` for React Native Jest tests and `server/test_*.py` for backend behavior. Cover intent routing, sketch memory, auth, and API changes with regression tests when behavior changes. For desktop changes, at minimum run `npm run build` and `npm run lint`.

## Commit & Pull Request Guidelines

Recent history mixes short status commits (`pipeline complete`, `ui changes`) with Conventional Commit style (`feat(server): ...`). Prefer `type(scope): summary`, for example `fix(server): handle missing sketch anchor`. Pull requests should include a concise description, test results, linked issues when applicable, and screenshots or screen recordings for visible UI changes.

## Security & Configuration Tips

Keep clinical data and generated databases local. Do not commit secrets, private certificates, or patient records. Document any new environment variables in `SETUP.md` or the relevant README.
