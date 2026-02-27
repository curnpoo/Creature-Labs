# OpenClaw Runbook for Creature Labs

## Where this lives
- The repository is mounted at `/root/openclaw/workspace/repos/Creature-Labs` within the assistant workspace.
- Syncthing shares the entire `/root/openclaw/workspace` (including this repo) with the paired devices, so edits here sync automatically whenever the service is running.
- The portal service (http://100.79.186.77:8080) can host release zips, simulation snapshots, or notes related to Creature Labs without leaving the OpenClaw cluster.

## Environment & scripts
- Use Node 22 (`node --version`) when running `npm run dev`, `npm run build:win`, or the Electron runner (`npm run app`).
- The project already has known build commands, so keep them documented in this repo; I’ve surfaced them here so we remember to run them inside the workspace.
- When you need to capture metrics or headless screenshot exports, drop them into `/root/openclaw/workspace/tools` or `/root/openclaw/workspace/memory` so the daily memory cron job logs them.

## Automation notes
- `memory:daily-save` (Gateway cron) snapshots important notes to `memory/YYYY-MM-DD.md`; add entries highlighting new simulations or parameter sweeps.
- `morning-routine` and `healthcheck:self-heal` are managed via the Gateway cron API—no manual `crontab` entries are required anymore.
- Syncthing ignores the workspace’s `node_modules/` and `.git/` directories thanks to the `.stignore` next to `/root/openclaw/workspace`, so the sync stays fast.

## Collaboration guidance
- Share new builds through the portal’s Files tab if you need quick distribution.
- For any CLI automation, drop scripts into `/root/openclaw/workspace/tools` so I can link them with memory and Cron retriggers.
- When you’re ready for a PR, just tell me which repo (this one), the branch name, and the summary. I’ll commit, push, and open PRs from here.
