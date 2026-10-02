# Build notes

## Verified in the build environment

The following checks were executed against this source tree:

- TypeScript syntax transpilation across all `src/**/*.ts` and `src/**/*.tsx` files
- strict TypeScript check of the dependency-free shared rules/actions modules
- direct runtime checks of the server state model by transpiling the server core and running it with Node
- standard 106-tile set creation
- 14-tile deals and correct pool counts
- private-rack isolation for a shared pass-and-play device before Ready
- rack reveal after Ready
- rack sorting
- deterministic 33-point opening meld and turn commit
- SQLite persistence across a RoomManager restart
- Easy/Normal/Hard/Expert AI planning code path, including an Expert AI 30+ opening play
- Organize Table server action
- Debian installer shell syntax (`bash -n`)

## Environment limitation

The execution environment used to create this project could not reach the npm registry, so `npm install`, the final Vite production bundle, and a browser session of the React application could not be executed here.

Run these on the Debian server before treating the deployment as verified:

```bash
npm install
npm run typecheck
npm test
npm run build
npm start
```

Then open the game from two separate devices on the LAN and check:

1. create/join/lobby
2. one player per phone
3. two players sharing one device and the Ready handoff
4. TV/display join
5. public table drag movement on the second device
6. private rack-origin drag does not appear remotely until drop
7. draw/end-turn/undo/reset
8. AI turn
9. phone portrait and landscape layouts

If any browser/build issue appears, it should be fixed before installing the `systemd` service permanently.
