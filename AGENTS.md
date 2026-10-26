# AGENTS.md

Pac-Man MVP in vanilla JS/HTML/CSS running directly from `src/index.html`. No build step, no package manager, no tests, no linter. Verify by serving `src/` (e.g. `python3 -m http.server`) and playing in the browser; `file://` also works since scripts are plain globals, not modules.

## Architecture

- Single app, no modules: `index.html` loads scripts in fixed order — `maze.js` → `game.js` → `render.js` → `main.js`. Files communicate through globals (`window.MAZE`, etc.), so adding files or reordering loads breaks everything.
- Data flow: `maze.js` defines the pristine 28×31 `MAZE` (numbers: 0 empty, 1 wall, 2 dot, 3 ghost-pen door) → `game.js` copies it into a new game (`game.grid` is mutated as dots are eaten; never mutate `MAZE`) → `render.js` draws from `game.grid` → `main.js` runs the rAF loop and keyboard input.
- Movement is grid-aligned: speeds are fractions of a cell per frame (`PACMAN_SPEED = 0.125`, `GHOST_SPEED = 0.1`) so actors sit exactly on cell centers every 8/10 frames; decisions (`isWall`, turns, collisions) only happen when `aligned()` is true. If you change speeds, keep them alignable on a grid or movement logic breaks.
- Tunnel: row 14 (`TUNNEL_ROW`), screen wraps horizontally. Canvas is 28×31 tiles × `TILE = 20` px in `render.js` — if the maze dims change, canvas size must follow.
- Current scope is an MVP: 1 level, 2 ghosts (`hunter` chases, `random` moves randomly), lives restart via `createGame()`.

## Conventions

- Comments, UI text, and README are in Spanish.
- [Spec Driven Development](README.md): per README, this project exists to practice that workflow — don't bypass spec-first discussion on feature work.
