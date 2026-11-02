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

## Connecting to Supabase

`.env.local` is not in Git. On a fresh checkout, copy `.env.example` to `.env.local` and fill in `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (Supabase: Project Settings → API Keys), then start with a clear cache (`npm start -- -c`). Without it, sign-in says the app isn't connected to a server. The secret key is only for `npm run db:seed`; don't share it.

## Styling (Tailwind)

Styles can be written as Tailwind classes through NativeWind v5 (`className="..."`), on the web, iOS and Android. Style objects (`style={{ ... }}`) still work and the two can be mixed; when both set the same property, `style` wins.

- `global.css`: the Tailwind theme. It mirrors `src/theme.ts`: `bg-primary`, `text-subtext`, `border-border`, `rounded-lg`, `font-semibold`, and so on. Keep the two in step: charts, icons and SVG drawings still read colours from `theme.ts`.
- Spacing is **1 unit = 1px**, so classes match the numbers in the old styles: `p-16` is `padding: 16`, `gap-10` is `gap: 10`, `h-40` is `height: 40`.
- Breakpoints match `useBreakpoint()`: `tablet:` from 720px, `desktop:` from 1100px.
- `src/components/ui.tsx` uses classes for the shared pieces (Card, Button, Badge, Chip, Notice, Divider, …) and they accept a `className` prop. The screens still use style objects and can be moved over one at a time.
- Restart with a clear cache (`npm start -- -c`) after changing `global.css` or `metro.config.js`.
- Tailwind and NativeWind need the 64-bit Node described above; the 32-bit runtime cannot load them.

## Project configuration

The app uses `expo-router/entry` and routes in `src/app`. The Expo display name `Agon Preview` and existing EAS/update project belong to the current preview configuration; the application itself is PropertyHub. Cloud project IDs and backend configuration have been preserved.
