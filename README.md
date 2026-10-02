# Rummi

A touch-first, local-network Rummikub-style game for phones, tablets, laptops and shared displays. A permanent Debian server owns the game state; browsers are clients.

## What is implemented

- 106-tile standard set: 1–13 in four colors, two copies each, two Jokers
- 14-tile starting racks
- Groups and runs with Joker support
- 30-point opening meld
- Temporary invalid table states during a turn
- Server-authoritative End Turn validation
- Draw, Undo, Reset Turn and deterministic Organize Table
- Free-form rack slots plus Number / Color sorting
- Drag and tap-to-move interaction
- Long-press a table tile, then drag, to move the rest of that run/group as a tail
- Split After interaction
- Live shared working table across all connected devices
- Throttled public table drag presence (about every 75ms) with remote interpolation
- Rack-origin drags remain private until the tile is actually placed on the table
- Multiple players on one device with a privacy handoff screen
- One-player-per-device mode keeps that player's rack visible while waiting
- TV / display-only devices receive no private rack data
- Easy, Normal, Hard and Expert AI levels using progressively larger search budgets
- AI turns animate as a sequence of live table changes
- Four themes: Classic Tabletop, Soft Modern, Minimal Premium, Contemporary Playful
- Sound / haptic preferences and fullscreen control
- SQLite persistence using Node's built-in `node:sqlite`
- Persistent device tokens and reconnect
- QR join link generation
- PWA-ready manifest/service worker
- Debian `systemd` deployment files

## Architecture

```text
Debian server
├── Express HTTP server
├── Socket.IO
├── SQLite persistence
├── authoritative rooms / rules / AI
└── built React client
      ├── phones
      ├── tablets
      ├── laptops
      └── TV/display clients
```

The state model deliberately separates:

1. **Committed state** — official table/racks between turns.
2. **Working turn state** — public table arrangement while the active player is experimenting.
3. **Ephemeral drag presence** — temporary visual movement sent at a throttled rate and never treated as game truth.

Private rack contents are not broadcast to other devices. A display client never receives rack contents. The draw-pool order is never sent to clients.

## Requirements

- Debian Linux (other Linux distributions should also work)
- Node.js **22 or newer**
- npm

Node 24 LTS is a good choice. Node 22's built-in SQLite API may print an experimental-feature warning; the game still works. Newer Node releases may no longer print that warning.

## Development

```bash
npm install
npm run dev
```

Development starts:

- Vite on `http://localhost:5173`
- the game server on port `3001`
- Vite proxies `/api` and `/socket.io` to the server

Vite binds to `0.0.0.0`, so you can also test from another device on the LAN using the development machine's IP and port 5173.

## Tests

```bash
npm test
npm run typecheck
```

The rules tests cover runs, groups, Jokers, opening points, scoring and working-turn actions.

## Production build

```bash
npm install
npm run build
npm start
```

By default production listens on:

```text
0.0.0.0:3000
```

Environment variables:

```bash
HOST=0.0.0.0
PORT=3000
DATA_DIR=./data
```

Copy `.env.example` if you want a reference, but the current server reads environment variables directly rather than loading `.env` automatically.

## Debian installation

The included helper expects the app at `/opt/rummi` and a system user named `rummi`.

From the unpacked project directory:

```bash
sudo apt update
sudo apt install -y rsync
./deploy/install-debian.sh
```

The helper:

1. verifies Node 22+
2. creates the `rummi` system user when necessary
3. copies the project to `/opt/rummi`
4. runs `npm install`
5. builds the client/server
6. installs the `systemd` unit
7. starts the service

Then:

```bash
sudo systemctl status rummi
sudo journalctl -u rummi -f
```

Restart:

```bash
sudo systemctl restart rummi
```

Stop:

```bash
sudo systemctl stop rummi
```

Disable auto-start:

```bash
sudo systemctl disable rummi
```

## Updating the server

From a fresh copy of the project:

```bash
./deploy/install-debian.sh
```

The entire `/opt/rummi/data/` directory is intentionally excluded from the rsync deletion step so active-game persistence survives updates.

For a manual update:

```bash
cd /opt/rummi
sudo -u rummi npm install
sudo -u rummi npm run build
sudo systemctl restart rummi
```

## Firewall

If you use UFW:

```bash
sudo ufw allow 3000/tcp
```

Or restrict access to your LAN subnet, for example:

```bash
sudo ufw allow from 192.168.1.0/24 to any port 3000 proto tcp
```

Adjust the subnet for your network.

## Joining from phones / tablets

Open the server in a browser:

```text
http://SERVER-IP:3000
```

Example:

```text
http://192.168.1.50:3000
```

Create a room. The lobby shows the room code, detected LAN URL(s), and a QR code.

A joining device chooses either:

- **Playing Device** — adds a human player on that device.
- **TV / Display** — sees only the live public table.

A Playing Device may add more local players before the host starts the game.

## Live synchronization

The active player's own drag runs locally at full browser frame rate.

For tiles that were already public on the table:

- `drag:start` is sent immediately
- drag movement is throttled to roughly 75ms
- other devices interpolate between updates
- the final logical drop is applied and broadcast immediately

For tiles that are still in a private rack, drag presence is **not broadcast**. Other players only learn that tile after a successful rack-to-table placement.

A dropped/split/rearranged table is the room's live **working turn state**, so all devices see temporary table rearrangements. Reset Turn returns every screen to the committed state.

## Pass-and-play privacy

When multiple human players share one device, the server does not send the next player's rack immediately.

The device shows a handoff screen:

```text
Pass the device to David
[ I'm ready ]
```

Only after Ready does that player's private rack arrive.

When a device belongs to only one human, that player may keep viewing their own rack while another player is taking a turn.

## AI

AI levels differ primarily by search budget and how much table manipulation they attempt:

- **Easy** — shallow rack play and very limited extensions
- **Normal** — more extensions and larger rack searches
- **Hard** — stronger search plus simple borrowing/rearrangement of public table tiles
- **Expert** — largest search budget and faster multi-step play

The AI runs on the Debian server. It receives no hidden opponent rack data in its decision code and does not inspect future pool order.

The AI is intentionally modular; stronger search strategies can replace `src/server/ai.ts` later without changing the UI or networking model.

## Joker rule used by this build

A Joker may represent a missing legal value in a run or group. After a player has completed their initial meld, Jokers may be rearranged freely as long as every meld on the final table is legal.

This avoids encoding one tournament organization's more restrictive Joker-replacement rule. If a different house rule is desired, keep the change inside the shared rules engine.

## Browser notes

- Fullscreen requires a user gesture.
- Vibration/haptics depends on browser/device support.
- PWA service workers require a secure context. `localhost` qualifies, but a plain `http://192.168.x.x` LAN address generally does not. Core gameplay does **not** require PWA installation.
- For a fully installable PWA on phones, put the Debian server behind HTTPS later (for example Caddy or Nginx with a trusted certificate).

## Project layout

```text
src/
  client/
    components/
    App.tsx
    styles.css
  server/
    index.ts
    roomManager.ts
    storage.ts
    ai.ts
  shared/
    types.ts
    rules.ts
    actions.ts

tests/
deploy/
public/
```

## Production hardening / future work

The LAN build intentionally has no account/login system. If you later expose it to the public internet, add HTTPS and an authentication / room-access layer before forwarding the port externally.

Other natural follow-ups:

- Hebrew translation and RTL UI
- stronger Expert AI search
- optional house-rule profiles
- game history / replay
- admin page for old saved rooms
- Caddy/Nginx HTTPS deployment
- richer sound pack

