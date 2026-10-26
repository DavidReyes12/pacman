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

// Crea una partida nueva. Copia MAZE (pristino) a game.grid para poder comer
// dots sin destruir el original, y reiniciar.
function createGame() {
  const grid = MAZE.map( ( row ) => row.slice() );
  // La celda de inicio de Pacman arranca sin dot.
  grid[ PACMAN_START.y ][ PACMAN_START.x ] = 0;

  let dots = 0;
  for ( const row of grid ) for ( const v of row ) if ( v === 2 ) dots++;

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
      mode: 'chase',     // 'chase' | 'scatter' | 'exiting'
    } ) ),
    mode: { phase: 'scatter', timer: MODE_DURATION }, // ciclo global 7s/7s
  };
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

// Una celda es muro para el actor dado?
//   pacman: bloqueado por pared (1) y puerta (3)
//   ghost:  bloqueado solo por pared (1)
function isWall( grid, x, y, actor ) {
  if ( y < 0 || y >= grid.length ) return true;
  if ( x < 0 || x >= grid[ 0 ].length ) return true;
  const v = grid[ y ][ x ];
  if ( v === 1 ) return true;
  if ( v === 3 && actor === 'pacman' ) return true;
  return false;
}

// Puede el actor avanzar desde (x,y) en la direccion dir?
function canMove( grid, x, y, dir, actor ) {
  const d = DIRS[ dir ];
  if ( !d ) return false;
  const tx = x + d.x;
  const ty = y + d.y;
  // Tunel: salir por un borde en la fila del tunel siempre es valido.
  if ( ty === TUNNEL_ROW && ( tx < 0 || tx >= grid[ 0 ].length ) ) return true;
  return !isWall( grid, tx, ty, actor );
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
    if ( p.nextDir && canMove( grid, p.x, p.y, p.nextDir, 'pacman' ) ) {
      p.dir = p.nextDir;
      p.nextDir = null;
    }
    // Comer dot.
    if ( grid[ p.y ][ p.x ] === 2 ) {
      grid[ p.y ][ p.x ] = 0;
      game.score += 10;
      game.dotsRemaining--;
    }
    // Si no puede seguir, se detiene en la celda.
    if ( !canMove( grid, p.x, p.y, p.dir, 'pacman' ) ) return;
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
    ( dir ) => dir !== OPPOSITE[ g.dir ] && canMove( grid, g.x, g.y, dir, 'ghost' )
  );
  // Sin salida (callejon): permitir el giro de 180.
  const choices = options.length ? options : [ OPPOSITE[ g.dir ] ];

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

function moveGhost( game, g ) {
  const grid = game.grid;
  const width = grid[ 0 ].length;

  // Esperando su turno para salir de la pen: se queda quieto.
  if ( g.defer > 0 ) return;

  // Llega a la salida: pasa a la fase global actual y se integra al juego.
  if ( g.mode === 'exiting' && aligned( g.x ) && aligned( g.y )
    && Math.round( g.x ) === PEN_EXIT.x && Math.round( g.y ) === PEN_EXIT.y ) {
    g.mode = game.mode.phase;
  }

  if ( aligned( g.x ) && aligned( g.y ) ) {
    g.x = Math.round( g.x );
    g.y = Math.round( g.y );
    decideGhost( game, g );
    if ( !canMove( grid, g.x, g.y, g.dir, 'ghost' ) ) return;
  }

  const d = DIRS[ g.dir ];
  g.x += d.x * g.speed;
  g.y += d.y * g.speed;
  wrapTunnel( g, width );
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

  game.mode.timer--;
  if ( game.mode.timer <= 0 ) switchMode( game );
  game.ghosts.forEach( ( g ) => {
    if ( g.defer > 0 ) {
      g.defer--;
      if ( g.defer === 0 ) g.mode = 'exiting';
    }
    moveGhost( game, g );
  } );

  for ( const g of game.ghosts ) {
    if ( collides( game.pacman, g ) ) {
      game.lives--;
      if ( game.lives <= 0 ) {
        game.state = 'lost';
        return;
      }
      resetPositions( game );
      break;
    }
  }

  if ( game.dotsRemaining <= 0 ) game.state = 'won';
}

window.createGame = createGame;
window.update = update;
window.DIRS = DIRS;
