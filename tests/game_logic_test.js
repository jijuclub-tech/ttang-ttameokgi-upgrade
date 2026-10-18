// 땅따먹기 게임 로직 회귀 테스트: node tests/game_logic_test.js
// index.html의 <script>에서 DOM 이벤트 연결 전까지의 게임 로직만 잘라 vm에서 실행한다.
const fs = require('fs'), vm = require('vm'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));
const logic = script.slice(0, script.indexOf("const joyEl"));
const el = () => ({ textContent: '', style: {}, classList: { add() {}, remove() {} } });
const ctx = { document: { getElementById: el }, console, Math };
vm.createContext(ctx);
vm.runInContext(logic + `
globalThis.G = {
  initBoard, claimArea, movePlayer, updateEnemies, gameLoop,
  get board() { return board; }, get trail() { return trail; }, get lives() { return lives; },
  set lives(v) { lives = v; }, get player() { return player; }, get enemies() { return enemies; },
  set enemies(v) { enemies = v; }, joystick, set running(v) { gameRunning = v; }, set paused(v) { paused = v; },
  draw: null,
};
draw = function () {};          // 캔버스 없이 gameLoop 실행
requestAnimationFrame = function () {};
`, ctx);
const G = ctx.G;
let fail = 0;
const check = (name, ok, info) => { console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (info ? '  (' + info + ')' : '')); if (!ok) fail++; };
const fresh = () => { G.lives = 3; G.running = true; G.paused = false; G.initBoard(); };
const W = 28, H = 36;

// --- 버그 1: 대각선 선으로 둘러싼 땅 점령 ---
function cornerCount() { let c = 0; for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) if (G.board[y][x] === 1 && x + y < 10) c++; return c; }
fresh(); G.enemies = [{ x: 20, y: 25, vx: 0, vy: 0 }, { x: 15, y: 30, vx: 0, vy: 0 }];
for (let i = 1; i < 10; i++) G.board[10 - i][i] = 2;
G.claimArea();
check('bug1 대각선 선 안쪽 36칸 점령', cornerCount() === 36, cornerCount() + '/36');
check('bug1 적이 있는 쪽은 점령 안 됨', G.board[25][20] === 0 && G.board[30][15] === 0);
fresh(); G.enemies = [{ x: 20, y: 25, vx: 0, vy: 0 }, { x: 15, y: 30, vx: 0, vy: 0 }];
{ let x = 1, y = 9; G.board[y][x] = 2; while (y > 1) { y--; G.board[y][x] = 2; x++; G.board[y][x] = 2; } }
G.claimArea();
check('bug1 계단식 선(기존 동작 유지) 36칸 점령', cornerCount() === 36, cornerCount() + '/36');

// --- 버그 2: 짧은 왕복(4칸 이하) 후 노란 선이 남지 않아야 함 ---
function countTrail() { let c = 0; for (const r of G.board) for (const v of r) if (v === 2) c++; return c; }
for (const len of [1, 2, 3, 4, 5]) {
  fresh(); G.enemies = [{ x: 20, y: 25, vx: 0, vy: 0 }, { x: 15, y: 30, vx: 0, vy: 0 }];
  const p = G.player; p.x = 0; p.y = 18;
  const step = (nx, ny) => { G.joystick.active = true; G.joystick.nx = nx; G.joystick.ny = ny; G.movePlayer(0.1 / 0.52); }; // 1칸씩
  for (let i = 0; i < len; i++) step(1, 0);        // 오른쪽으로 len칸
  step(0, 1);                                      // 한 칸 아래
  for (let i = 0; i < len + 1; i++) step(-1, 0);   // 왼쪽으로 돌아와 테두리 도착
  check(`bug2 ${len}칸 왕복 후 판에 남은 선 0`, countTrail() === 0 && G.trail.length === 0, 'board=2 칸: ' + countTrail() + ', lives=' + G.lives);
  check(`bug2 ${len}칸 왕복 중 목숨 유지`, G.lives === 3);
}

// --- 버그 3: 조이스틱을 놓고 서 있을 때 적과 닿으면 목숨 감소 ---
fresh();
G.player.x = 10; G.player.y = 10;
G.joystick.active = false; G.joystick.nx = 0; G.joystick.ny = 0;
G.enemies = [{ x: 10.2, y: 10.1, vx: 0, vy: 0, legPhase: 0 }, { x: 20, y: 25, vx: 0, vy: 0, legPhase: 0 }];
G.gameLoop(1000); G.gameLoop(1016);
check('bug3 정지 상태에서 적 접촉 시 목숨 감소', G.lives === 2, 'lives=' + G.lives);
check('bug3 접촉 후 시작 위치로 복귀', G.player.x === 0 && G.player.y === 18);
fresh();
G.player.x = 10; G.player.y = 10; G.joystick.active = false;
G.enemies = [{ x: 14, y: 14, vx: 0, vy: 0, legPhase: 0 }, { x: 20, y: 25, vx: 0, vy: 0, legPhase: 0 }];
G.gameLoop(2000); G.gameLoop(2016);
check('bug3 떨어져 있으면 목숨 유지', G.lives === 3, 'lives=' + G.lives);
G.paused = true; G.enemies[0].x = 10; G.enemies[0].y = 10;
G.gameLoop(3000); G.gameLoop(3016);
check('bug3 일시정지 중에는 충돌 처리 안 함', G.lives === 3, 'lives=' + G.lives);

// --- 버그 4: 적이 빈칸이 아닌 칸 위에 있을 때 판 전체가 점령되면 안 됨 ---
function countClaimed() { let c = 0; for (const r of G.board) for (const v of r) if (v === 1) c++; return c; }
const borderCells = 2 * W + 2 * H - 4;
// 4-1: 적 2마리가 모두 선(2) 위에 있음. 선 아래쪽 열린 영역은 적 쪽이므로 점령 안 됨
fresh();
for (let x = 1; x < W - 1; x++) G.board[10][x] = 2;            // 가로 선 (위쪽 9줄을 막음)
G.enemies = [{ x: 5, y: 10, vx: 0, vy: 0 }, { x: 20, y: 10, vx: 0, vy: 0 }];
G.claimArea();
check('bug4 적이 선 위에 있어도 판 전체 점령 안 됨', G.board[25][14] === 0 && G.board[30][3] === 0 && G.board[3][3] === 0,
  'claimed=' + countClaimed() + '/' + (W * H));
check('bug4 선 자체는 내 땅으로 바뀜', G.board[10][5] === 1 && G.board[10][20] === 1 && G.trail.length === 0);
// 4-2: 적 1마리는 위쪽 영역, 1마리는 내 땅(1) 위 → 두 영역 모두 보호
fresh();
for (let x = 1; x < W - 1; x++) G.board[10][x] = 2;
G.board[25][14] = 1;                                           // 적이 서 있는 내 땅 칸
G.enemies = [{ x: 3, y: 3, vx: 0, vy: 0 }, { x: 14, y: 25, vx: 0, vy: 0 }];
G.claimArea();
check('bug4 내 땅 칸 위의 적 쪽 영역도 보호', G.board[30][3] === 0 && G.board[3][3] === 0, 'claimed=' + countClaimed());
// 4-3: 적은 아래쪽에만 → 위쪽(9줄 x 26칸)만 점령, 적 칸이 선 위여도 동일
fresh();
for (let x = 1; x < W - 1; x++) G.board[10][x] = 2;
G.enemies = [{ x: 14, y: 10, vx: 0, vy: 0 }, { x: 14, y: 25, vx: 0, vy: 0 }];
G.claimArea();
{ let up = 0; for (let y = 1; y < 10; y++) for (let x = 1; x < W - 1; x++) if (G.board[y][x] === 1) up++;
  check('bug4 선 위 적이 있어도 양쪽이 열려 있으면 둘 다 보호(보수적)', up === 0 && G.board[30][3] === 0, 'upper claimed=' + up); }
fresh();
for (let x = 1; x < W - 1; x++) G.board[10][x] = 2;
G.enemies = [{ x: 14, y: 20, vx: 0, vy: 0 }, { x: 14, y: 25, vx: 0, vy: 0 }];
G.claimArea();
{ let up = 0; for (let y = 1; y < 10; y++) for (let x = 1; x < W - 1; x++) if (G.board[y][x] === 1) up++;
  check('bug4 정상 경우: 적 없는 위쪽 234칸 점령, 아래쪽 유지', up === 234 && G.board[30][3] === 0, 'upper claimed=' + up); }
// 4-4: 유효한 시작점이 전혀 없음(적 0마리 / 판 밖) → 선만 점령, 대량 점령 없음
for (const [label, ens] of [['적 0마리', []], ['적이 판 밖', [{ x: -5, y: -5, vx: 0, vy: 0 }]]]) {
  fresh();
  for (let x = 1; x < W - 1; x++) G.board[10][x] = 2;
  G.enemies = ens;
  G.claimArea();
  check(`bug4 시작점 없음(${label}) → 선만 점령`, countClaimed() === borderCells + (W - 2), 'claimed=' + countClaimed() + ', expected=' + (borderCells + W - 2));
}

console.log(fail ? `\n${fail} FAILED` : '\nALL PASSED');
process.exit(fail ? 1 : 0);
