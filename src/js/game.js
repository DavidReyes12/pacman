// game.js
// Estado y reglas. Depende de globals de maze.js: MAZE, TUNNEL_ROW,
// PACMAN_START, GHOST_STARTS.

const DIRS = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
};
const OPPOSITE = { left: 'right', right: 'left', up: 'down', down: 'up' };

const PACMAN_SPEED = 0.125; // 1/8 celda/frame -> alinea cada 8 frames
const GHOST_SPEED = 0.1;    // 1/10 celda/frame
const MODE_DURATION = 420;  // 7s @60fps por fase del ciclo

const FRIGHTENED_FRAMES = 420; // 7s @60fps
const FRIGHTENED_SPEED  = 0.05; // celdas/frame; alinea cada 20
const POPUP_FRAMES      = 30;   // 0.5s de vida del numero flotante

const POWER_PELLET  = 4;

// Crea una partida nueva. Copia MAZE (pristino) a game.grid para poder comer
// dots sin destruir el original, y reiniciar.
function createGame() {
  const grid = MAZE.map( ( row ) => row.slice() );
  // La celda de inicio de Pacman arranca sin dot.
  grid[ PACMAN_START.y ][ PACMAN_START.x ] = 0;

  let dots = 0;
  for ( const row of grid ) for ( const v of row ) if ( v === 2 || v === POWER_PELLET ) dots++;

  return {
    state: 'start',
    score: 0,
    lives: 3,
    dotsRemaining: dots,
    grid,
    pacman: {
      x: PACMAN_START.x,
      y: PACMAN_START.y,
      dir: 'left',
      nextDir: null,
      speed: PACMAN_SPEED,
    },
    ghosts: GHOST_STARTS.map( ( g ) => ( {
      x: g.x,
      y: g.y,
      dir: 'up',
      speed: GHOST_SPEED,
      kind: g.kind,
      defer: g.defer,    // frames restantes para salir de la pen (0 = ya fuera)
      mode: 'chase',     // 'chase' | 'scatter' | 'exiting' | 'frightened'
                         //                   | 'eyes' | 'entering'
      spawn: { x: g.x, y: g.y }, // celda de renacimiento tras ser comido
    } ) ),
    mode: { phase: 'scatter', timer: MODE_DURATION }, // ciclo global 7s/7s
    frighten: { timer: 0, chain: 0 }, // frames restantes; fantasma n comido
    popups: [], // [{ x, y, text, timer }] numeros flotantes
  };
}

// Come una pellet de poder ('o'). +50 pts y mete en frightened a los fantasmas
// que ya salieron (no en defer ni exiting). Reinicia timer y cadena si ya
// habia un frightened activo.
function startFrightened( game ) {
  game.score += 50;
  game.frighten.timer = FRIGHTENED_FRAMES;
  game.frighten.chain = 0;
  for ( const g of game.ghosts ) {
    if ( g.defer === 0 && g.mode !== 'exiting' && g.mode !== 'eyes' && g.mode !== 'entering' ) {
      g.mode = 'frightened';
    }
  }
}

// Alterna la fase global del ciclo scatter/chase cada 7s.
function switchMode( game ) {
  if ( game.mode.phase === 'scatter' ) {
    game.mode = { phase: 'chase', timer: MODE_DURATION };
  } else {
    game.mode = { phase: 'scatter', timer: MODE_DURATION };
  }
}

function aligned( v ) {
  return Math.abs( v - Math.round( v ) ) < 1e-3;
}

// Una celda es muro para la entidad que se mueve (pacman u objeto ghost)?
//   v === 1 (pared): muro para todos.
//   v === 3 (puerta): muro para pacman; transitable para cualquier ghost cuyo
//                     mode sea 'exiting' (SPEC 02), 'eyes' o 'entering'
//                     (SPEC 03). Los ghosts se reconocen por tener 'mode'
//                     (pacman no lo tiene; su kind puede ser 'blinky', etc).
function isWall( grid, x, y, entity ) {
  if ( y < 0 || y >= grid.length ) return true;
  if ( x < 0 || x >= grid[ 0 ].length ) return true;
  const v = grid[ y ][ x ];
  if ( v === 1 ) return true;
  if ( v === 3 && !( 'mode' in entity
    && ( entity.mode === 'exiting' || entity.mode === 'eyes' || entity.mode === 'entering' ) ) ) {
    return true;
  }
  return false;
}

// Puede la entidad avanzar desde (x,y) en la direccion dir?
function canMove( grid, x, y, dir, entity ) {
  const d = DIRS[ dir ];
  if ( !d ) return false;
  const tx = x + d.x;
  const ty = y + d.y;
  // Tunel: salir por un borde en la fila del tunel siempre es valido.
  if ( ty === TUNNEL_ROW && ( tx < 0 || tx >= grid[ 0 ].length ) ) return true;
  return !isWall( grid, tx, ty, entity );
}

function wrapTunnel( a, width ) {
  if ( Math.round( a.y ) === TUNNEL_ROW ) {
    if ( a.x < 0 ) a.x += width;
    else if ( a.x >= width ) a.x -= width;
  }
}

function movePacman( game ) {
  const p = game.pacman;
  const grid = game.grid;
  const width = grid[ 0 ].length;

  if ( aligned( p.x ) && aligned( p.y ) ) {
    p.x = Math.round( p.x );
    p.y = Math.round( p.y );

    // Aplicar giro pendiente si es posible.
    if ( p.nextDir && canMove( grid, p.x, p.y, p.nextDir, p ) ) {
      p.dir = p.nextDir;
      p.nextDir = null;
    }
    // Comer dot.
    if ( grid[ p.y ][ p.x ] === 2 ) {
      grid[ p.y ][ p.x ] = 0;
      game.score += 10;
      game.dotsRemaining--;
    }
    // Comer power pellet.
    if ( grid[ p.y ][ p.x ] === POWER_PELLET ) {
      grid[ p.y ][ p.x ] = 0;
      game.dotsRemaining--;
      startFrightened( game );
    }
    // Si no puede seguir, se detiene en la celda.
    if ( !canMove( grid, p.x, p.y, p.dir, p ) ) return;
  }

  const d = DIRS[ p.dir ];
  p.x += d.x * p.speed;
  p.y += d.y * p.speed;
  wrapTunnel( p, width );
}

const PEN_EXIT = { x: 13, y: 11 }; // celda sobre la puerta de la pen

// Esquinas fijas de scatter (pasillos reales del MAZE).
const SCATTER_CORNERS = {
  pinky: { x: 26, y: 1 },  // arriba derecha
  inky:  { x: 26, y: 29 }, // abajo derecha
  clyde: { x: 1, y: 29 },  // abajo izquierda
};

// Celda objetivo por personalidad.
//   blinky: persigue a Pacman siempre (ignora el ciclo scatter/chase).
//   pinky:  4 celdas delante de Pacman segun su dir actual.
//   inky:   doble del vector desde Blinky con pivote en 2 celdas delante de Pacman.
//   clyde:  persigue a Pacman si esta lejos (Manhattan >= 8); si no, su esquina.
// Los demas phantomas respetan la fase global: en scatter van a su esquina.
function pickTarget( g, game ) {
  const p = game.pacman;
  const px = Math.round( p.x );
  const py = Math.round( p.y );

  // Saliendo de la pen: ir hacia la celda sobre la puerta.
  if ( g.mode === 'exiting' ) return PEN_EXIT;

  // Ojos comidos: volver greedy a la celda sobre la puerta de la pen.
  if ( g.mode === 'eyes' ) return PEN_EXIT;

  if ( g.kind === 'blinky' ) return { x: px, y: py };

  if ( game.mode.phase === 'scatter' ) return SCATTER_CORNERS[ g.kind ];

  if ( g.kind === 'pinky' ) {
    const d = DIRS[ p.dir ];
    return { x: px + d.x * 4, y: py + d.y * 4 };
  }

  if ( g.kind === 'inky' ) {
    const d = DIRS[ p.dir ];
    const ax = px + d.x * 2; // pivote: 2 celdas delante de Pacman
    const ay = py + d.y * 2;
    const b = game.ghosts[ 0 ]; // Blinky, aunque siga en la pen
    return {
      x: ax + ( ax - Math.round( b.x ) ),
      y: ay + ( ay - Math.round( b.y ) ),
    };
  }

  // clyde
  const dist = Math.abs( g.x - px ) + Math.abs( g.y - py );
  if ( dist >= 8 ) return { x: px, y: py };
  return SCATTER_CORNERS[ g.kind ];
}

function decideGhost( game, g ) {
  const grid = game.grid;

  const options = Object.keys( DIRS ).filter(
    ( dir ) => dir !== OPPOSITE[ g.dir ] && canMove( grid, g.x, g.y, dir, g )
  );
  // Sin salida (callejon): permitir el giro de 180.
  const choices = options.length ? options : [ OPPOSITE[ g.dir ] ];

  // Frightened: huida aleatoria clasica — direccion valida al azar entre las
  // que no son 180; solo si esta en callejon invierte.
  if ( g.mode === 'frightened' ) {
    g.dir = choices[ Math.floor( Math.random() * choices.length ) ];
    return;
  }

  // eyes: mapa propio de distancias BFS desde PEN_EXIT, precalculado por
  // partida (lazy). Garantiza llegada sin orbitas — el greedy Manhattan con
  // el 180 prohibido puede orbitar (riesgo documentado en la spec). La
  // puerta y el tunel son transitables para este modo.
  if ( g.mode === 'eyes' ) {
    const distMap = getDistMap( game );
    let best = choices[ 0 ];
    let bestDist = Infinity;
    for ( const dir of choices ) {
      const d = DIRS[ dir ];
      const nx = ( ( g.x + d.x ) + 28 ) % 28;
      const ny = g.y + d.y;
      const dist = distMap[ ny ] ? distMap[ ny ][ nx ] : Infinity;
      if ( dist < bestDist ) {
        bestDist = dist;
        best = dir;
      }
    }
    g.dir = best;
    return;
  }

  const target = pickTarget( g, game );
  let best = choices[ 0 ];
  let bestDist = Infinity;
  for ( const dir of choices ) {
    const d = DIRS[ dir ];
    const nx = g.x + d.x;
    const ny = g.y + d.y;
    const dist = Math.abs( nx - target.x ) + Math.abs( ny - target.y );
    if ( dist < bestDist ) {
      bestDist = dist;
      best = dir;
    }
  }
  g.dir = best;
}

// BFS desde PEN_EXIT sobre las paredes del grid (muros = 1; puertas 3
// transitables para 'eyes'). Devuelve dist en celdas hasta (13,11) por cada
// celda navegable. Se calcula una vez por partida (lazy, cacheado).
function getDistMap( game ) {
  if ( game.distMap ) return game.distMap;
  const grid = game.grid;
  const height = grid.length;
  const width = grid[ 0 ].length;
  const distMap = Array.from( { length: height }, () => Array( width ).fill( Infinity ) );
  const start = PEN_EXIT;
  distMap[ start.y ][ start.x ] = 0;
  const queue = [ start ];
  while ( queue.length ) {
    const { x, y } = queue.shift();
    const dist = distMap[ y ][ x ] + 1;
    for ( const key of Object.keys( DIRS ) ) {
      const nx = ( ( x + DIRS[ key ].x ) + width ) % width;
      const ny = y + DIRS[ key ].y;
      if ( ny < 0 || ny >= height ) continue;
      if ( grid[ ny ][ nx ] === 1 ) continue;
      if ( distMap[ ny ][ nx ] !== Infinity ) continue;
      distMap[ ny ][ nx ] = dist;
      queue.push( { x: nx, y: ny } );
    }
  }
  game.distMap = distMap;
  return distMap;
}

function moveGhost( game, g ) {
  const grid = game.grid;
  const width = grid[ 0 ].length;
  // Velocidad derivada del modo: frightened va a la mitad.
  const speed = g.mode === 'frightened' ? FRIGHTENED_SPEED : GHOST_SPEED;

  // Esperando su turno para salir de la pen: se queda quieto.
  if ( g.defer > 0 ) return;

  // Llega a la celda sobre la puerta:
  //   exiting  -> integra a la fase ACTIVA: frightened si el timer sigue vivo,
  //               o la fase global scatter/chase si no. (SPEC 03)
  //   eyes     -> pasa a 'entering' (baja a la pen por la puerta).
  if ( aligned( g.x ) && aligned( g.y ) && Math.round( g.x ) === PEN_EXIT.x
    && Math.round( g.y ) === PEN_EXIT.y ) {
    if ( g.mode === 'exiting' ) {
      g.mode = game.frighten.timer > 0 ? 'frightened' : game.mode.phase;
      return;
    }
    if ( g.mode === 'eyes' ) {
      g.mode = 'entering';
      return;
    }
  }

  // Modo 'entering': script de renacimiento escrito, sin decideGhost.
  //   1. Desde (13,11): baja por la puerta (13,12) hasta (13,13).
  //   2. Alineado en fila 13: horizontal hacia la col de su spawn.
  //   3. Llega al spawn: pasa a 'exiting', que lo saca al instante.
  if ( g.mode === 'entering' ) {
    if ( aligned( g.x ) && aligned( g.y ) ) {
      const rx = Math.round( g.x );
      const ry = Math.round( g.y );
      if ( ry < 13 ) g.dir = 'down';
      else if ( ry === 13 && rx !== g.spawn.x ) {
        g.dir = rx < g.spawn.x ? 'right' : 'left';
      } else {
        g.mode = 'exiting';
        return;
      }
    }
    const d = DIRS[ g.dir ];
    g.x += d.x * speed;
    g.y += d.y * speed;
    wrapTunnel( g, width );
    return;
  }

  // Modo 'exiting': script de salida escrito, sin decideGhost (greedy no
  // garantiza el camino). Opera sobre la fila actual del ghost.
  //   1. Horizontal hacia la col 13 en su fila de espera.
  //   2. Alineado en col 13: 'up' por la puerta (13,12) hasta (13,11),
  //      donde el check de arriba integra al ghost a la fase global.
  if ( g.mode === 'exiting' ) {
    if ( aligned( g.x ) && aligned( g.y ) ) {
      const rx = Math.round( g.x );
      g.dir = rx < PEN_EXIT.x ? 'right' : rx > PEN_EXIT.x ? 'left' : 'up';
    }
    const d = DIRS[ g.dir ];
    g.x += d.x * speed;
    g.y += d.y * speed;
    wrapTunnel( g, width );
    return;
  }

  if ( aligned( g.x ) && aligned( g.y ) ) {
    g.x = Math.round( g.x );
    g.y = Math.round( g.y );
    decideGhost( game, g );
    if ( !canMove( grid, g.x, g.y, g.dir, g ) ) return;
  }

  const d = DIRS[ g.dir ];
  g.x += d.x * speed;
  g.y += d.y * speed;
  wrapTunnel( g, width );
}

// Come un fantasma frightened: cadena arcade 200/400/800/1600, numero
// flotante en su posicion y se convierte en ojos rumbo a la pen.
function eatGhost( game, g ) {
  game.frighten.chain++;
  const points = 200 * Math.pow( 2, game.frighten.chain - 1 );
  game.score += points;
  game.popups.push( { x: g.x, y: g.y, text: String( points ), timer: POPUP_FRAMES } );
  g.mode = 'eyes';
}

function resetPositions( game ) {
  const p = game.pacman;
  p.x = PACMAN_START.x;
  p.y = PACMAN_START.y;
  p.dir = 'left';
  p.nextDir = null;
  game.ghosts.forEach( ( g, i ) => {
    g.x = GHOST_STARTS[ i ].x;
    g.y = GHOST_STARTS[ i ].y;
    g.dir = 'up';
    g.defer = GHOST_STARTS[ i ].defer;
    g.mode = 'chase';
  } );
  game.mode = { phase: 'scatter', timer: MODE_DURATION };
}

function collides( a, b ) {
  return Math.abs( a.x - b.x ) < 0.5 && Math.abs( a.y - b.y ) < 0.5;
}

function update( game ) {
  movePacman( game );

  // Congelacion del ciclo scatter/chase: el timer global no corre mientras
  // haya frightened. Al acabar, retoma la fase en la que estaba.
  if ( game.frighten.timer > 0 ) {
    game.frighten.timer--;
    if ( game.frighten.timer === 0 ) {
      game.frighten.chain = 0;
      for ( const g of game.ghosts ) {
        if ( g.mode === 'frightened' ) g.mode = game.mode.phase;
      }
    }
  } else {
    game.mode.timer--;
    if ( game.mode.timer <= 0 ) switchMode( game );
  }
  // Popups flotantes: numeros de puntos que caducan por frames.
  for ( const popup of game.popups ) popup.timer--;
  game.popups = game.popups.filter( ( popup ) => popup.timer > 0 );

  for ( const g of game.ghosts ) {
    if ( g.defer > 0 ) {
      g.defer--;
      if ( g.defer === 0 ) g.mode = 'exiting';
    }
    moveGhost( game, g );
  }

  for ( const g of game.ghosts ) {
    if ( !collides( game.pacman, g ) ) continue;
    if ( g.mode === 'frightened' ) {
      eatGhost( game, g );
      continue;
    }
    // 'eyes' y 'entering' no son comibles ni matan (fantasmas ya desactivados).
    if ( g.mode === 'eyes' || g.mode === 'entering' ) continue;
    game.lives--;
    if ( game.lives <= 0 ) {
      game.state = 'lost';
      return;
    }
    resetPositions( game );
    break;
  }

  if ( game.dotsRemaining <= 0 ) game.state = 'won';
}

window.createGame = createGame;
window.update = update;
window.DIRS = DIRS;
