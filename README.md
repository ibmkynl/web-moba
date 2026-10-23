# Ancient Clash

A browser Dota-2-style MOBA: 5v5 on three lanes, 23 heroes, 3D (three.js), single player against bots and LAN multiplayer.

## Run

```bash
npm install
npm run host        # builds the client and starts the game server on http://localhost:8080
```

The server prints a LAN link (for example `http://192.168.x.x:8080`) that others on the same network can open to join the lobby.

- `npm run server` starts the server without rebuilding.
- `npx vite build` rebuilds the client into `dist/`.
