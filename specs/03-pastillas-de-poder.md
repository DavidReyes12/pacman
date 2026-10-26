# SPEC 03 — Pastillas de poder: modo frightened y comer fantasmas

> **Estado:** Implementado
> **Depende de:** SPEC 01, SPEC 02
> **Fecha:** 2026-10-26
> **Objetivo:** Añadir 4 power pellets al laberinto que activan un modo frightened de ~7s durante el cual los fantasmas huyen azules y Pacman puede comerlos, mandándolos como ojos de regreso a la pen para renacer.

## Alcance

**In:**

- Nuevo valor `4` (power pellet) en `MAZE`, en las 4 esquinas clásicas `#o` en las filas 3 y 23, cols 1 y 26.
- Al comerla: +50 pts, los fantasmas **fuera de la pen** (no en `defer` ni `exiting`) pasan a modo `frightened` por 420 frames (~7s @60fps): azules, a `FRIGHTENED_SPEED = 0.05`, y en intersecciones eligen dirección válida **aleatoria** (sin inversión de 180°, salvo callejón).
- Cadena de puntuación arcade al comer fantasmas: 200/400/800/1600, con número flotante en la posición del fantasma.
- Fantasmas dentro de la pen (`defer > 0`) o en `exiting` **no** se vuelven frightened ni comibles; al llegar a (13,11) integran `frightened` si el timer sigue activo, o la fase global si no.
- Modo `eyes`: el fantasma comido viaja de vuelta a `PEN_EXIT` (13,11) con greedy Manhattan a velocidad normal; a la llegada entra en modo `entering` (script: baja por la puerta hasta (13,13) y avanza hasta su spawn original) y de ahí el modo pasa a `exiting`, que lo saca al instante. La puerta (celda 3) es transitable para ghost en `exiting` (vigente SPEC 02), `eyes` y `entering`.
- Congelación del ciclo scatter/chase de SPEC 01: `game.mode.timer` no se decrementa mientras `frighten.timer > 0`; al acabar retoma la fase en la que estaba. Blinky también se asusta (frightened pisa su "siempre persigue").
- Segunda pellet comida durante frightened: reinicia el timer a 420 frames y la cadena a 0.
- Las pellets cuentan para ganar (junto con los dots, `dotsRemaining`).
- Render (`render.js`): pellet más grande y pulsante; fantasma frightened azul que parpadea a blanco los últimos 2s; modo `eyes`/`entering` dibujado como ojos; números flotantes de popups.

**Out of scope (specs futuras):**

- Pausa de juego (~0.5s) al comer un fantasma como en el arcade: solo el número flotante, el loop no se congela.
- Niveles múltiples o dificultad progresiva (p.ej. frightened más corto por nivel).
- Sonidos.
- Elroy de Blinky.
- Re-entrada general de fantasmas a la pen: la puerta se abre **solo** para `exiting` (SPEC 02), `eyes` y `entering`; el resto de los modos sigue teniéndola como muro.

## Modelo de datos

```js
// maze.js — nuevo valor de grilla: 4 = power pellet ('o' en MAZE_STR)
//   (1,3), (26,3), (1,23), (26,23)

// game.js — constantes
const FRIGHTENED_FRAMES = 420; // 7s @60fps
const FRIGHTENED_SPEED  = 0.05; // celdas/frame, alinea cada 20
const POPUP_FRAMES      = 30;

// game.js — estado nuevo, vive en el objeto game de createGame()
frighten: { timer: 0, chain: 0 }, // timer en frames; chain = fantasma n comido
popups: [],                       // [{ x, y, text, timer }] para el render

// game.js — por ghost se añade la celda de renacimiento
spawn: { x: g.x, y: g.y },

// game.js — ghost.mode gana 3 valores además de SPEC 01/02:
//   'frightened' : huida aleatoria a FRIGHTENED_SPEED, comible
//   'eyes'       : greedy hacia PEN_EXIT a GHOST_SPEED, no comible, no mata
//   'entering'   : script corto de entrada a la pen
```

Convenciones: velocidades en celdas/frame (0.05 alinea; cumple el invariante de AGENTS.md); timers en frames dentro de `update`, no `Date.now()`; los 50 pts por pellet entran por el mismo camino que el dot (10) en `game.score`.

## Plan de implementación

1. `maze.js`: cambiar el `.` de las esquinas (1,3), (26,3), (1,23), (26,23) por `o` y parsear `o → 4`. Verificación: se pintan 4 pellets, el resto intacto.
2. `game.js`: estado (`frighten`, `popups`, `spawn`), comer pellet en `movePacman` (+50, activar frightened solo a fantasmas con `defer === 0` y modo distinto de `exiting`), congelar el ciclo global y apagar el frightened al llegar a 0. Verificación: pellet — fantasmas azules lentos huyendo ~7s.
3. `game.js`: rama `frightened` en `decideGhost` (dirección aleatoria válida sin 180°) y velocidad derivada del modo en `moveGhost`.
4. `game.js`: colisión en `update` — fantasma `frightened` se come (+cadena, popup, modo `eyes`); resto de modos conservan la muerte.
5. `game.js`: modos `eyes` (target `PEN_EXIT`) y `entering` (script de entrada) en `moveGhost`/`pickTarget`; regla de puerta en `isWall` con `exiting`/`eyes`/`entering`; integración configurable al llegar a `PEN_EXIT`.
6. `game.js`: `resetPositions` limpia `frighten` y `popups`.
7. `render.js`: pellet pulsante (incluye `frame` en `drawDots`), fantasma azul con flash blanco últimos 2s, ojos para `eyes`/`entering`, popups flotantes.
8. Verificación manual integral (criterios de aceptación).

## Criterios de aceptación

- [ ] `MAZE` tiene valor `4` en las 4 esquinas y solo se muta `game.grid`.
- [ ] Al comer pellet: +50 al score, la celda desaparece, fantasmas fuera de la pen azules a `0.05`.
- [ ] Fantasmas frightened eligen direcciones válidas aleatorias y solo invierten 180° en callejón.
- [ ] Fantasmas en pen o `exiting` no se asustan al comerse la pellet; integrarán frightened al llegar a (13,11) si el timer sigue vivo.
- [ ] Cruzar pacman con fantasma frightened lo come: 200/400/800/1600 según cadena y popup flotante.
- [ ] El fantasma comido viaja como ojos hasta (13,11), entra por la puerta, renace en su spawn original y sale por el script `exiting`.
- [ ] El frightened dura ~7s; últimos 2s parpadea azul/blanco; al terminar vuelve a la fase scatter/chase congelada (el timer global no corrió).
- [ ] Segunda pellet durante frightened reinicia timer y cadena.
- [ ] Tras una muerte, `resetPositions` deja fantasmas normales, `frighten.timer = 0` y sin popups; las pellets comidas siguen comidas.
- [ ] Las pellets cuentan en `dotsRemaining` (la victoria exige comerlas).
- [ ] Túnel, salida escalonada y reglas de SPEC 01/02 intactas; ningún actor atraviesa paredes ni sale del laberinto.

## Decisiones

- **Sí:** ojos que regresan físicamente a la pen (clásico), en vez de respawn teleportado. Anticipado por SPEC 02 y enseñan el mapa completo.
- **Sí:** puerta transitable también para `eyes`/`entering`. Es la relajación que la decisión de SPEC 02 ("si la spec de power-ups la necesita, la relaja esa spec") esperaba.
- **Sí:** frightened congela el ciclo scatter/chase de SPEC 01 (el `game.mode.timer` no corre). Evita saltos de fase raros al salir del frightened.
- **Sí:** frightened aplica también a Blinky, pisando su regla "siempre persigue" solo durante el modo frightened.
- **Sí:** huida por dirección aleatoria válida (sin 180). Clásico-arcade, mínimo cálculo; la determinista es predecible y se atasca en esquinas.
- **Sí:** velocidad frightened `0.05` (mitad de `GHOST_SPEED`) — alineable con la grilla, cumple el invariante de AGENTS.md.
- **Sí:** cadena 200/400/800/1600 con reset por pellet (segunda pellet ⇒ cadena 0). Comportamiento arcade.
- **Sí:** número flotante como `popups` en `game` con timer en frames (30), sin pausar el loop.
- **Sí:** las pellets cuentan en `dotsRemaining` (la partida se gana comiéndolas también, como el arcade).
- **No:** pausa de ~0.5s al comer fantasma. Tocaría el rAF loop por un detalle cosmético; otra spec si molesta.
- **No:** re-entrada general de fantasmas a la pen. La apertura de puerta queda acotada a `exiting`, `eyes` y `entering`.
- **No:** bonus por nivel ni variar puntos por pellet (50 fijo).

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| El greedy con anti-180° puede orbitar y no llegar a (13,11) para `eyes` (target fijo, a diferencia del chase) | Se valida a mano en el paso 5; si hay órbitas, el fallback documentado es permitir revertir solo a los `eyes` |
| Fantasmas frightened aleatorios pueden deambular sin rumbo en zonas anchas | Es el comportamiento clásico; la mitad de velocidad da ventana sobrada a Pacman |
| El flash azul/blanco depende de frames residuales | Se calcula contra `frighten.timer` (frames deterministas), igual que los demás timers |

## Qué NO está en esta spec

- Pausa de juego al comer fantasma.
- Sonidos, niveles múltiples o dificultad progresiva.
- Re-entrada general a la pen fuera del ciclo eyes→entering→exiting.

Cada uno de esos, si aterriza, va en su propia spec.
