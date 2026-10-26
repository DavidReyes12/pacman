# SPEC 01 — Los 4 fantasmas con IA clásica de personalidades

> **Estado:** Approved
> **Depende de:** ninguno (primer spec)
> **Fecha:** 2026-10-26
> **Objetivo:** Reemplazar los 2 fantasmas actuales por los 4 clásicos (Blinky, Pinky, Inky, Clyde), cada uno con targeting propio, salida escalonada de la pen y ciclo chase/scatter, siendo Blinky el perseguidor agresivo permanente.

## Alcance

**In:**

- 4 fantasmas con personalidades clásicas: `blinky` (agresivo, persigue siempre), `pinky` (apunta 4 celdas delante de Pacman), `inky` (vector con Blinky como pivote), `clyde` (persigue de lejos, huye a su esquina de cerca).
- Actualización de `GHOST_STARTS` en `maze.js` a 4 spawns dentro de la pen.
- Salida escalonada de la pen por temporizador: Blinky inicia ya fuera, Pinky/Inky/Clyde salen a los 3/6/9 segundos aprox.
- Ciclo global chase/scatter (7s scatter → 7s chase, alternando indefinidamente); Blinky lo ignora y siempre persigue.
- Ciclo del juego: los estados `start/lost/won` y `resetPositions` reinician timers y fantasmas.

**Out of scope (specs futuras):**

- Pastillas de poder y modo frightened/fantasmas comestibles.
- Niveles múltiples o dificultad progresiva.
- Death animation de Pacman.
- Elroy acelerado de Blinky al final del nivel.

## Modelo de datos

```js
// maze.js — GHOST_STARTS pasa a 4 entradas
const GHOST_STARTS = [
  { x: 13, y: 11, kind: 'blinky', defer: 0   }, // fuera de la pen, ya activo
  { x: 12, y: 13, kind: 'pinky',  defer: 180 }, // frames @60fps -> 0/3/6/9 s
  { x: 15, y: 13, kind: 'inky',   defer: 360 },
  { x: 13, y: 13, kind: 'clyde',  defer: 540 },
];

// game.js — por fantasma
ghosts: GHOST_STARTS.map( ( g ) => ( {
  x: g.x,
  y: g.y,
  dir: 'up',
  speed: GHOST_SPEED,
  kind: g.kind,        // 'blinky' | 'pinky' | 'inky' | 'clyde'
  defer: g.defer,      // frames restantes para salir de la pen (0 = ya fuera)
  mode: 'chase',       // 'chase' | 'scatter' | 'exiting'
} ) ),

// game.js — ciclo global, vive en el objeto game
mode: { phase: 'scatter', timer: 420 }, // 420 frames = 7s @60fps
```

Convenciones: targets son celdas enteras, la distancia es Manhattan como en el `hunter` actual; las velocidades no cambian (`GHOST_SPEED = 0.1` para todos).

## Plan de implementación

1. En `maze.js`: ampliar `GHOST_STARTS` a los 4 spawns con kind y `defer` correspondiente. Verificar que la pen (filas 12-13, cols 11-16) aloja los 4.
2. En `game.js`: añadir el objeto `mode` a `createGame()` con un `switchMode(game)` que alterna scatter/chase cada 7s.
3. En `game.js`: targeting por personalidad en `decideGhost` (o refactor como `pickTarget(g, game)` que devuelve la celda objetivo por kind):
   - `blinky`: target = celda de Pacman siempre (ignora scatter).
   - `pinky`: target = 4 celdas delante de Pacman según su dir actual.
   - `inky`: target = doble del vector desde Blinky con pivote en 2 celdas delante de Pacman.
   - `clyde`: si Manhattan(ghost, pacman) >= 8 persigue a Pacman, si no esquina inferior izq.
4. En `game.js`: salida de la pen: mientras `g.defer > 0` el fantasma espera; al llegar a 0, modo `exiting` lo mueve hacia (13,11) atravesando la puerta (la puerta 3 ya es transitable para ghost).
5. En `game.js`: el modo `scatter` de pinky/inky/clyde cambia el target a su esquina fija (arriba der para Pinky, abajo der Inky, abajo izq Clyde; ajustadas a pasillos reales del `MAZE`).
6. En `game.js`: `resetPositions()` restaura `defer`, `mode` por ghost y reinicia `game.mode`.
7. Verificación manual: servir `src/` y jugar — Blinky te busca, Pinky te corta el paso, Clyde entra y sale.

## Criterios de aceptación

- [ ] Al iniciar hay 4 fantasmas visibles con colores rojo, rosa, cyan y naranja (`GHOST_COLORS` de `render.js` ya los cubre).
- [ ] Blinky persigue a Pacman sin pausas (jamás entra en scatter).
- [ ] Pinky, Inky y Clyde alternan scatter/chase en ciclos de ~7s y en scatter se dirigen a su esquina.
- [ ] Blinky sale de la pen al instante; Pinky, Inky y Clyde salen aproximadamente a 3/6/9 s del reinicio.
- [ ] Tras morir/ganar/perder y reiniciar (`createGame` o `resetPositions`), fantasmas y timers vuelven a sus valores de arranque.
- [ ] Ningún fantasma atraviesa paredes ni se sale del laberinto; el túnel (fila 14) sigue funcionando con wrap horizontal.
- [ ] `MAZE` sigue intacto tras una partida (solo se muta `game.grid`).

## Decisiones

- **Sí:** personalidades clásicas documentadas (Blinky/Pinky/Inky/Clyde). Verificables, reproducibles y ya esperadas por el jugador.
- **No:** personalidades inventadas libres. Sin fuente de verdad para verificar.
- **Sí:** Blinky con misma velocidad (`GHOST_SPEED`), agresividad = targeting directo permanente. Velocidad mayor rompe el invariante de alineación de celdas de AGENTS.md (0.125/0.1 alinean).
- **Sí:** versión "limpia" de Pinky y Inky (sin el overflow bug del arcade original): Pinky mira 4 celdas reales delante, Inky usa el doble del vector con Blinky.
- **Sí:** ciclo scatter/chase global simplificado de 7s/7s, en lugar del timing original (7/20/5/20...). Mismo efecto de juego, menos complejidad; se ajusta en otra spec si hace falta.
- **Sí:** ghost house door transitable para fantasmas (ya es así hoy: `isWall` solo bloquea a pacman por el 3).
- **No:** frightened mode / power pellets / niveles. Specs distintas si algún día aterrizan.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Las esquinas de scatter elegidas caen dentro de la pen o no son transitables | Se fijan en pasillos reales del `MAZE`; paso 5 del plan las valida a mano |
| Temporizador de 7s depende de fps fluctuantes | Los timers cuentan frames dentro de `update` (deterministas), no `Date.now()` |
| Inky produce targets sin sentido si Blinky está aún dentro de la pen | Usa la posición actual de Blinky aunque esté en la pen; degrada suave |

## Qué NO está en esta spec

- Power pellets, frightened mode y comer fantasmas (spec propia si aterrizan).
- Niveles múltiples, dificultad progresiva, Elroy.
- Animaciones o sonidos nuevos.

Cada uno de esos, si aterriza, va en su propia spec.
