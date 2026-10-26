# SPEC 02 — Salida fiable de los fantasmas de la pen (puerta de sentido único)

> **Estado:** Approved
> **Depende de:** SPEC 01
> **Fecha:** 2026-10-26
> **Objetivo:** Garantizar que los fantasmas salen de la pen por la puerta en fila vertical central y que, una vez fuera, jamás vuelven a entrar, eliminando el bloqueo permanente dentro de la jaula.

## Por qué existe esta spec

Verificación por simulación del código actual (lógica de `game.js` reproducida frame a frame):

1. Los fantasmas **sí salen** la primera vez (defers 0/3/6/9s del SPEC 01) — el problema no es el temporizador.
2. La puerta (celdas (13,12) y (14,12), valor 3) es transitable para fantasmas en **ambos sentidos**. Alrededor del frame 683 Pinky re-entra a la pen siguiendo su target de chase, y una vez dentro la combinación "greedy Manhattan + regla anti-180°" lo deja **rebotando para siempre** en el interior de la pen. Inky y Clyde terminan igual atrapados.
3. El modo `exiting` depende del mismo `decideGhost`, que no garantiza el camino de salida.

Causa raíz: dos defectos combinados — puertas de doble sentido y salida confiada al targeting greedy.

## Alcance

**In:**

- Salida *escrita* (script) del modo `exiting` en `moveGhost`: el fantasma ignora `decideGhost`, se alinea a la col 13 en su fila de espera y sube por la puerta hasta (13,11).
- Puerta de sentido único: la celda 3 es muro para pacman y para todo ghost cuyo `mode` no sea `exiting`. Un fantasma fuera de la pen jamás re-entra.
- Mantener el escalonado vigente: Blinky sale al instante, Pinky/Inky/Clyde a ~3/6/9s (`defer` de `GHOST_STARTS` sin cambios).
- Mantener la celda de salida `PEN_EXIT = { x: 13, y: 11 }` y la integración al ciclo scatter/chase al llegar ahí (check ya existente en `moveGhost`).

**Out of scope (specs futuras):**

- Rebote visual de espera dentro de la pen (bobbing tipo arcade) — es cosmético, spec propio si se quiere.
- Re-entrada de fantasmas a la pen para frightened/comer-fantasmas — si la spec de power-ups la necesita, relaja la regla ahí.
- Cambio de tiempos de `defer`, spawns o velocidad de salida.

## Modelo de datos

Esta spec no introduce estructuras nuevas. Reutiliza el modelo del SPEC 01 (`ghosts` con `defer` y `mode`). Cambia **reglas**, no datos:

```js
// game.js — firma: isWall/canMove pasan a recibir la entidad que se mueve
// (objeto pacman o objeto ghost), porque la puerta depende del modo del ghost.
// Regla de pared:
//   v === 1              -> muro para todos
//   v === 3 (puerta)     -> muro para pacman; para ghost SOLO transitable si
//                           entity.kind === 'ghost' && entity.mode === 'exiting'

// game.js — contrato del modo 'exiting' (pseudocódigo, no nueva estructura)
//   1. Sin decideGhost: si g.x !== 13, avanza horizontal hacia la col 13
//      (los 3 spawns interiores están en la fila 13).
//   2. Alineado en (13,13): dir = 'up', sube por la puerta (13,12).
//   3. Al llegar a (13,11): el check ya existente hace g.mode = game.mode.phase.
```

## Plan de implementación

1. En `game.js`: cambiar la firma de `isWall`/`canMove` para recibir la entidad (pacman o ghost con su `mode`) y aplicar la regla de puerta de sentido único (3 = muro salvo ghost en `exiting`). Actualizar las llamadas de `movePacman`, `decideGhost` y `moveGhost`. Verificación manual: servir `src/` y jugar — los fantasmas en chase/scatter ya no cruzan la puerta hacia dentro.
2. En `game.js`: en `moveGhost`, si `g.mode === 'exiting'`, saltar `decideGhost` y ejecutar el script: horizontal hacia col 13, luego `up` por (13,12) hasta (13,11). Al llegar, el check existente integra al ghost a la fase global. Verificación manual: Pinky/Inky/Clyde salen en fila por la puerta a ~3/6/9s.
3. Verificación manual final: partida larga (>5 min sin muertes) — ningún fantasma re-entra ni rebota dentro de la pen; luego provocar una muerte y confirmar que `resetPositions` relanza el ciclo completo de salida escalonada.

## Criterios de aceptación

- [ ] Blinky arranca en (13,11), fuera de la pen, y se mueve desde el primer frame.
- [ ] Pinky, Inky y Clyde salen a ~3/6/9s del arranque, alineados a la col 13, cruzando la puerta hasta (13,11).
- [ ] Un ghost en `chase` o `scatter` no puede atravesar las celdas (13,12)/(14,12) hacia la pen (la puerta le resulta muro).
- [ ] Tras 5 min de partida continua, ningún fantasma está dentro de la pen ni rebotando en pasillos internos de la pen.
- [ ] Tras una muerte y `resetPositions`, los fantasmas vuelven a la pen y relanzan la salida escalonada completa (todos terminan fuera).
- [ ] El túnel (fila 14), las colisiones y el resto del SPEC 01 se conservan; ningún actor atraviesa paredes ni sale del laberinto.
- [ ] `MAZE` sigue intacto tras una partida (solo se muta `game.grid`).

## Decisiones

- **Sí:** salida escrita (script) para `exiting` en lugar de targeting greedy. El greedy + anti-180° no garantiza la salida; fue exactamente el mecanismo del bloqueo verificado en simulación.
- **Sí:** puerta de sentido único (solo `exiting` cruza). Es la causa raíz de la re-entrada observada (~frame 683) y del atascamiento permanente.
- **Sí:** mantener `defer` 0/3/6/9s, spawns de `GHOST_STARTS` y `PEN_EXIT` (13,11): política ya aprobada en el SPEC 01.
- **No:** rebote de espera / bobbing visual dentro de la pen. Cosmético, spec propio si aterriza.
- **No:** permitir que fantasmas re-entren a la pen. Si el modo frightened futuro requiere re-entrada, esa spec relaja la regla de puerta explícitamente.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| El script de salida asume fila 13 como fila de espera | Hoy los 3 spawns interiores están en la fila 13 (`maze.js`); si algún día cambia un spawn, operar el script en la fila actual del ghost |
| El cambio de firma de `isWall`/`canMove` toca a pacman y a los 4 ghosts | Actualizar todas las llamadas en el paso 1 y verificar ambos actores a mano antes de continuar |

## Qué NO está en esta spec

- Rebote visual de espera (bobbing) dentro de la pen.
- Re-entrada a la pen para frightened/power-ups.
- Cambio de tiempos, spawns o velocidades.

Cada uno de esos, si aterriza, va en su propia spec.
