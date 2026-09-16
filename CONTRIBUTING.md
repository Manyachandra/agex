# Contributing to Agex

Thanks for your interest in Agex — Autonomous Agent Exchange Terminal.

## How to Contribute

1. **Fork** the repo and clone your fork.
2. **Create a branch** for your change: `git checkout -b feat/my-feature`.
3. **Make your changes** and test them locally.
4. **Lint** your code: `npm run lint`.
5. **Build** to confirm it compiles: `npm run build`.
6. **Submit a pull request** with a clear description of the change and why it's needed.

## Development Setup

See the [README](README.md#local-development) for the full local setup.

- API: `npm run dev:api` (Express + Socket.io on port 5000)
- Desk: `npm run dev` (Vite dev server on port 3000)
- Build: `npm run build` → `npm start`

## Reporting Issues

Open an issue with:
- What you expected to happen
- What actually happened
- Steps to reproduce
- Environment details (OS, Node version, browser)

## Code Style

- ESLint is configured; run `npm run lint` before pushing.
- Keep commits atomic and descriptive.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
