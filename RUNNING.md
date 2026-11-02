# Running PropertyHub

From this folder, run:

```powershell
npm start
```

This starts Expo and opens the web app. Use `npm run android` or `npm run ios` for mobile, `npm run build:web` for a web production build, and `npm run typecheck` / `npm run lint` for checks.

## Windows Node.js runtime

The original build failed because Windows was using **32-bit Node.js** from `C:\Program Files (x86)\nodejs`. Lightning CSS 1.33.0, used by Expo SDK 57, does not ship a Windows ia32 binary.

The npm commands use `scripts/run-tool.cjs`, which selects a compatible runtime: the current 64-bit Node, the project-local `.tools/node.exe`, or the standard 64-bit Windows Node installation. This computer has a local copy of Node 24 in `.tools`, so the commands also work from terminals that still select the old 32-bit Node. The local runtime is ignored by Git.

For a fresh checkout, install 64-bit Node.js 22 LTS or newer from https://nodejs.org, reopen the terminal, then run:

```powershell
node -p "process.arch"
# Expected on a typical Windows PC: x64
npm install --include=optional
npm start
```

Keep optional dependencies enabled: Expo's CSS processor and ESLint's import resolver need their matching native packages. Do not copy `node_modules` between computers or CPU architectures.

## Project configuration

The app uses `expo-router/entry` and routes in `src/app`. The Expo display name `Agon Preview` and existing EAS/update project belong to the current preview configuration; the application itself is PropertyHub. Cloud project IDs and backend configuration have been preserved.
