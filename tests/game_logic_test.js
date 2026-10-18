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
  initBoard, claimArea, movePlayer, updateEnemies, gameLoop, checkPlayerHit,
  get stage() { return stage; }, set stage(v) { stage = v; },
  get babies() { return babies; }, set babies(v) { babies = v; },
  get playTime() { return playTime; }, set playTime(v) { playTime = v; },
  get effects() { return effects; }, BABY_COLORS,
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
const fresh = (st = 1) => { G.lives = 3; G.running = true; G.paused = false; G.stage = st; G.initBoard(); };
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
// (claimArea를 직접 부를 때의 방어 코드. 실제 게임에서는 점령 전에 bigCrabOnTrail()로 죽음 처리 → 아래 ruleA 테스트)
fresh();
for (let x = 1; x < W - 1; x++) G.board[10][x] = 2;
G.enemies = [{ x: 14, y: 10, vx: 0, vy: 0 }, { x: 14, y: 25, vx: 0, vy: 0 }];
G.claimArea();
{ let up = 0; for (let y = 1; y < 10; y++) for (let x = 1; x < W - 1; x++) if (G.board[y][x] === 1) up++;
  check('bug4 claimArea 방어 코드: 선 위 적이 있으면 양쪽 모두 보호', up === 0 && G.board[30][3] === 0, 'upper claimed=' + up); }
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

// --- 규칙 A: 큰 게가 고랑(선)에 닿으면 죽음 ---
const still = (x, y, type) => ({ x, y, vx: 0, vy: 0, type, legPhase: 0 });
fresh();
G.board[10][5] = 2; G.board[10][6] = 2; G.trail.push([5, 10], [6, 10]);
G.enemies = [still(6, 10, 'red'), still(20, 25, 'blue')];
G.updateEnemies(0.016);
check('ruleA 큰 게가 고랑 위 → 목숨 감소', G.lives === 2, 'lives=' + G.lives);
check('ruleA 죽은 뒤 고랑 지워짐', countTrail() === 0 && G.trail.length === 0);
// 점령 순간 큰 게가 고랑 위에 있음: movePlayer → claimArea 순서라 updateEnemies 전에 점령되던 문제
fresh();
{
  const p = G.player; p.x = 0; p.y = 18;
  const step = (nx, ny) => { G.joystick.active = true; G.joystick.nx = nx; G.joystick.ny = ny; G.movePlayer(0.1 / 0.52); };
  for (let i = 0; i < 6; i++) step(1, 0);                 // (1..6, 18) 고랑
  G.enemies = [still(3, 18, 'red'), still(20, 30, 'blue')];  // 홍게가 고랑 (3,18) 위로 들어옴
  step(0, 1); for (let i = 0; i < 7; i++) step(-1, 0);    // 돌아와서 점령 시도
  check('ruleA 점령 순간 큰 게가 고랑 위 → 점령 대신 죽음', G.lives === 2, 'lives=' + G.lives + ', claimed=' + countClaimed());
  check('ruleA 이때 땅은 점령되지 않음(테두리만)', countClaimed() === borderCells && countTrail() === 0);
}

// --- 규칙 B: 새끼 게 ---
const isBigColor = c => c === '#e63946' || c === '#1d4ed8';
// 2단계까지는 안 나옴
fresh(2); G.enemies = [still(10, 10, 'red'), still(10.2, 10, 'blue')];
G.updateEnemies(0.016);
check('babies 2단계: 홍게·청게가 만나도 새끼 없음', G.babies.length === 0);
// 3단계: 만나면 2마리
fresh(3); G.enemies = [still(10, 10, 'red'), still(10.2, 10, 'blue')];
G.updateEnemies(0.016);
{ const b = G.babies;
  check('babies 3단계: 만나면 2마리 태어남', b.length === 2, 'n=' + b.length);
  check('babies 두 마리 색이 서로 다르고 큰 게 색이 아님', b.length === 2 && b[0].color !== b[1].color && !isBigColor(b[0].color) && !isBigColor(b[1].color) && G.BABY_COLORS.includes(b[0].color), b.map(x => x.color).join(','));
  check('babies 만난 자리에서 태어남', b.every(x => Math.abs(x.x - 10.1) < 0.2 && Math.abs(x.y - 10) < 0.2));
  check('babies 크기가 작음(scale<1)', b.every(x => x.scale < 1)); }
// 같은 색끼리는 안 낳음
fresh(3); G.enemies = [still(10, 10, 'red'), still(10.2, 10, 'red')];
G.updateEnemies(0.016);
check('babies 홍게-홍게는 안 낳음', G.babies.length === 0);
// 쿨다운
fresh(3); G.enemies = [still(10, 10, 'red'), still(10.2, 10, 'blue')];
G.updateEnemies(0.016);
G.babies.forEach(b => { b.vx = 0; b.vy = 0; b.x = 20; b.y = 30; });
G.playTime += 5; G.updateEnemies(0.016);
check('babies 쿨다운: 5초 뒤 계속 붙어 있어도 추가 없음', G.babies.length === 2, 'n=' + G.babies.length);
G.playTime += 5.1; G.updateEnemies(0.016);
check('babies 쿨다운: 10초 지나면 다시 2마리', G.babies.length === 4, 'n=' + G.babies.length);
// 최대 8마리
fresh(3); G.enemies = [still(10, 10, 'red'), still(10.2, 10, 'blue')];
G.babies = Array.from({ length: 7 }, (_, i) => ({ x: 5 + i, y: 30, vx: 0, vy: 0, type: 'baby', color: '#facc15', scale: 0.55, legPhase: 0 }));
G.updateEnemies(0.016);
check('babies 7마리에서 만나면 1마리만 추가(최대 8)', G.babies.length === 8, 'n=' + G.babies.length);
G.playTime += 11; G.updateEnemies(0.016);
check('babies 8마리면 더 안 태어남', G.babies.length === 8, 'n=' + G.babies.length);
// 새끼끼리는 번식 안 함
fresh(3); G.enemies = [still(5, 5, 'red'), still(20, 30, 'blue')];
G.babies = [{ x: 12, y: 12, vx: 0, vy: 0, type: 'baby', color: '#facc15', scale: 0.55, legPhase: 0 },
            { x: 12.1, y: 12, vx: 0, vy: 0, type: 'baby', color: '#22c55e', scale: 0.55, legPhase: 0 }];
G.updateEnemies(0.016);
check('babies 새끼끼리 만나도 번식 안 함', G.babies.length === 2);
// 새끼 게가 움직임
fresh(3); G.enemies = [still(5, 5, 'red'), still(20, 30, 'blue')];
G.babies = [{ x: 14, y: 18, vx: 1.5, vy: 0.5, type: 'baby', color: '#facc15', scale: 0.55, legPhase: 0 }];
for (let i = 0; i < 30; i++) G.updateEnemies(0.016);
check('babies 새끼 게가 움직임', Math.hypot(G.babies[0].x - 14, G.babies[0].y - 18) > 0.5);
// 새끼 게가 고랑에 닿아도 아무 일 없음
fresh(3); G.enemies = [still(5, 30, 'red'), still(20, 30, 'blue')];
G.board[10][5] = 2; G.board[10][6] = 2; G.trail.push([5, 10], [6, 10]);
G.player.x = 6; G.player.y = 10;
G.babies = [{ x: 5, y: 10, vx: 0, vy: 0, type: 'baby', color: '#facc15', scale: 0.55, legPhase: 0 }];
G.updateEnemies(0.016);
check('babies 새끼가 고랑 위 → 목숨 유지, 고랑 유지', G.lives === 3 && countTrail() === 2, 'lives=' + G.lives);
// 새끼 게가 농부 몸에 닿으면 죽음 (정지 상태)
fresh(3); G.enemies = [still(5, 30, 'red'), still(20, 30, 'blue')];
G.player.x = 10; G.player.y = 10; G.joystick.active = false;
G.babies = [{ x: 10.2, y: 10.1, vx: 0, vy: 0, type: 'baby', color: '#facc15', scale: 0.55, legPhase: 0 }];
G.gameLoop(5000); G.gameLoop(5016);
check('babies 새끼가 농부 몸에 닿으면 목숨 감소', G.lives === 2, 'lives=' + G.lives);
// 둘러싼 땅 안의 새끼 게는 사라지고 '+' 효과, 새끼는 영역 보호 안 함
fresh(3); G.enemies = [still(20, 25, 'red'), still(15, 30, 'blue')];
G.babies = [{ x: 3, y: 3, vx: 0, vy: 0, type: 'baby', color: '#a855f7', scale: 0.55, legPhase: 0 },
            { x: 20, y: 20, vx: 0, vy: 0, type: 'baby', color: '#f97316', scale: 0.55, legPhase: 0 }];
for (let i = 1; i < 10; i++) G.board[10 - i][i] = 2;
G.claimArea();
check('babies 새끼는 영역을 보호하지 않음(모서리 36칸 점령)', cornerCount() === 36, cornerCount() + '/36');
check('babies 둘러싼 땅 안의 새끼 사라짐, 밖의 새끼는 남음', G.babies.length === 1 && G.babies[0].x === 20);
check("babies 사라질 때 '+' 효과", G.effects.length === 1 && G.effects[0].text === '+');
// 점령 순간 새끼가 고랑 위에 있어도 점령은 정상 (새끼는 고랑 무시)
fresh(3); G.enemies = [still(20, 25, 'red'), still(15, 30, 'blue')];
{
  const p = G.player; p.x = 0; p.y = 18;
  const step = (nx, ny) => { G.joystick.active = true; G.joystick.nx = nx; G.joystick.ny = ny; G.movePlayer(0.1 / 0.52); };
  for (let i = 0; i < 6; i++) step(1, 0);
  G.babies = [{ x: 3, y: 18, vx: 0, vy: 0, type: 'baby', color: '#facc15', scale: 0.55, legPhase: 0 }];
  step(0, 1); for (let i = 0; i < 7; i++) step(-1, 0);
  check('babies 점령 순간 새끼가 고랑 위 → 죽지 않고 점령, 새끼는 사라짐', G.lives === 3 && countTrail() === 0 && G.babies.length === 0 && countClaimed() > borderCells, 'lives=' + G.lives + ', babies=' + G.babies.length);
}

console.log(fail ? `\n${fail} FAILED` : '\nALL PASSED');
process.exit(fail ? 1 : 0);
