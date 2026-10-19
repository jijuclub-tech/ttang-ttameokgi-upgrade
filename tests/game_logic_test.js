// 땅따먹기 게임 로직 회귀 테스트: node tests/game_logic_test.js
// index.html의 <script>에서 DOM 이벤트 연결 전까지의 게임 로직만 잘라 vm에서 실행한다.
const fs = require('fs'), vm = require('vm'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));
const logic = script.slice(0, script.indexOf("const joyEl"));
const els = {};
const el = () => { const cls = new Set(); return { textContent: '', style: {}, classList: { add(c) { cls.add(c); }, remove(c) { cls.delete(c); }, contains(c) { return cls.has(c); } } }; };
const ctx = { document: { getElementById: id => (els[id] = els[id] || el()) }, console, Math };
vm.createContext(ctx);
vm.runInContext(logic + `
globalThis.G = {
  initBoard, claimArea, movePlayer, updateEnemies, gameLoop, checkPlayerHit,
  get stage() { return stage; }, set stage(v) { stage = v; },
  get babies() { return babies; }, set babies(v) { babies = v; },
  get playTime() { return playTime; }, set playTime(v) { playTime = v; },
  get effects() { return effects; }, BABY_COLORS,
  gameOver, startGame, nextStage, continueGame, cameraTarget, snapCamera, updateCamera,
  get feeTenths() { return feeTenths; }, chargeFee, formatFee, get continueRemaining() { return continueRemaining; },
  get cam() { return cam; }, setView(w, h) { viewW = w; viewH = h; },
  GAME_FEE, STAGE_FEE, CONTINUE_FEE, CONTINUE_SECONDS,
  PLAYER_HIT_RADIUS, BIG_CRAB_HIT_RADIUS, BABY_HIT_RADIUS, BIG_CRAB_HIT_DIST, BABY_HIT_DIST, CRAB_MEET_DIST,
  CRAB_DRAW_SCALE, PLAYER_DRAW_SCALE, BABY_SCALE, crabTouchesTrail,
  get powerups() { return powerups; }, set powerups(v) { powerups = v; },
  get tractorRemaining() { return tractorRemaining; }, get crabRespawns() { return crabRespawns; },
  get bidguardNextAt() { return bidguardNextAt; }, set bidguardNextAt(v) { bidguardNextAt = v; },
  updatePowerups, spawnPowerup, activateTractor, setTractor, bounceOff, furrowSegments, playerSpriteType, continueGameRef: continueGame,
  TRACTOR_SECONDS, TRACTOR_HIT_RADIUS, POWERUP_RADIUS, MAX_LIVES, FURROW_WIDTH, BIDGUARD_FIRST_DELAY, BIDGUARD_RESPAWN, CRAB_RESPAWN_SECONDS,
  get animTime() { return animTime; }, set animTime(v) { animTime = v; },
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

// --- 요금 / 이어서 하기 ---
const near = (a, b) => Math.abs(a - b) < 1e-9;
G.startGame();
check('fee 새 판 시작 요금 0.1p', G.feeTenths === 1 && els['fee'].textContent === '0.1p', els['fee'].textContent);
check('continue 진행 중에는 이어서 하기 버튼 없음', els['continue-btn'].style.display === 'none');
G.gameOver(true);
check('continue 클리어 시 이어서 하기 버튼 없음, 다음 단계 버튼 있음', els['continue-btn'].style.display === 'none' && els['next-stage-btn'].style.display === 'block');
G.nextStage();
check('fee 다음 단계는 추가 요금 없음', G.feeTenths === 1 && els['fee'].textContent === '0.1p' && G.stage === 2, els['fee'].textContent);
// 게임 오버 → 버튼 + 30초 카운트다운
G.nextStage(); // 3단계
G.enemies = [still(20, 25, 'red'), still(15, 30, 'blue')];
for (let y = 1; y < 8; y++) for (let x = 1; x < 8; x++) G.board[y][x] = 1;       // 점령한 땅
G.babies = [{ x: 14, y: 14, vx: 0, vy: 0, type: 'baby', color: '#facc15', scale: 0.7, legPhase: 0 }];
G.board[18][3] = 2; G.trail.push([3, 18]);
G.lives = 1;
const before = countClaimed();
G.checkPlayerHit; // noop reference
G.player.x = 15; G.player.y = 30;   // 청게와 닿음 → 마지막 목숨
G.gameLoop(10000); G.gameLoop(10016);
check('continue 목숨 0 → 게임 오버 + 이어서 하기 버튼', G.lives === 0 && els['continue-btn'].style.display === 'block' && els['next-stage-btn'].style.display === 'none', 'lives=' + G.lives);
check('continue 버튼에 +0.1p와 30초 표시', els['continue-btn'].textContent === '이어서 하기 (+0.1p) 30초', els['continue-btn'].textContent);
G.gameLoop(10016 + 10000);
check('continue 10초 뒤 20초 남음', Math.ceil(G.continueRemaining) === 20 && els['continue-btn'].textContent.endsWith('20초'), els['continue-btn'].textContent);
// 이어서 하기 누름
const babiesBefore = G.babies.length;
check('continue 이어서 하기 성공', G.continueGame() === true);
check('continue 요금 0.2p', G.feeTenths === 2 && els['fee'].textContent === '0.2p', els['fee'].textContent);
check('continue 같은 단계, 목숨 3, 점령한 땅 유지', G.stage === 3 && G.lives === 3 && countClaimed() === before, 'stage=' + G.stage + ' claimed=' + countClaimed() + '/' + before);
check('continue 고랑 삭제, 안전한 시작 위치, 새끼 게 유지', countTrail() === 0 && G.trail.length === 0 && G.player.x === 0 && G.player.y === 18 && G.babies.length === babiesBefore);
check('continue 버튼 숨김', els['continue-btn'].style.display === 'none');
check('continue 다시 누를 수 없음(중복 청구 방지)', G.continueGame() === false && G.feeTenths === 2);
// 30초 만료
G.lives = 1; G.player.x = 15; G.player.y = 30;
G.gameLoop(30000); G.gameLoop(30016);
check('continue 두 번째 게임 오버에도 버튼', els['continue-btn'].style.display === 'block');
G.gameLoop(30016 + 29000);
check('continue 29초 뒤 아직 있음', els['continue-btn'].style.display === 'block', els['continue-btn'].textContent);
G.gameLoop(30016 + 30100);
check('continue 30초 지나면 버튼 사라짐', els['continue-btn'].style.display === 'none' && G.continueRemaining === 0);
check('continue 만료 뒤에는 이어서 하기 불가, 요금 그대로', G.continueGame() === false && G.feeTenths === 2);
// 새 판은 요금 0.1p부터 다시
G.startGame();
check('fee 새 판 시작 시 0.1p로 초기화', G.feeTenths === 1 && els['fee'].textContent === '0.1p' && G.stage === 1);

// --- 카메라 ---
{
  const t1 = G.cameraTarget(0, 18, 10, 15);
  check('camera 왼쪽 끝에서 0으로 고정', t1.x === 0, JSON.stringify(t1));
  const t2 = G.cameraTarget(27, 35, 10, 15);
  check('camera 오른쪽 아래 끝에서 판 밖으로 안 나감', near(t2.x, 28 - 10) && near(t2.y, 36 - 15), JSON.stringify(t2));
  const t3 = G.cameraTarget(14, 18, 10, 15);
  check('camera 가운데에서는 농부가 화면 중앙', near(t3.x + 5, 14.5) && near(t3.y + 7.5, 18.5), JSON.stringify(t3));
  const t4 = G.cameraTarget(5, 5, 40, 50);
  check('camera 화면이 판보다 크면 가운데 정렬', near(t4.x, -6) && near(t4.y, -7), JSON.stringify(t4));
  fresh(); G.setView(10, 15); G.player.x = 14; G.player.y = 18; G.snapCamera();
  G.player.x = 20; G.updateCamera(0.05);
  const target = G.cameraTarget(20, 18, 10, 15);
  check('camera 부드럽게 따라감(한 번에 점프하지 않음)', G.cam.x > 9.5 && G.cam.x < target.x, 'cam.x=' + G.cam.x.toFixed(2) + ' target=' + target.x);
  for (let i = 0; i < 100; i++) G.updateCamera(0.05);
  check('camera 결국 목표에 도착', Math.abs(G.cam.x - target.x) < 0.01);
  G.setView(0, 0);
}

// --- 충돌 반지름 (그림 크기에서 계산) ---
console.log(`      hit: player=${G.PLAYER_HIT_RADIUS.toFixed(3)} bigCrab=${G.BIG_CRAB_HIT_RADIUS.toFixed(3)} baby=${G.BABY_HIT_RADIUS.toFixed(3)} bigDist=${G.BIG_CRAB_HIT_DIST.toFixed(3)} babyDist=${G.BABY_HIT_DIST.toFixed(3)} meet=${G.CRAB_MEET_DIST.toFixed(3)}`);
{
  // 그림 윤곽(칸 단위): 큰 게 몸통 ellipse 0.32x0.22 * 1.4, 농부 머리 0.18 * 1.6
  const bigVis = 0.32 * G.CRAB_DRAW_SCALE, bigVisMin = 0.22 * G.CRAB_DRAW_SCALE;
  check('hit 큰 게 반지름은 몸통 윤곽 안쪽(짧은 반지름~긴 반지름 사이)', G.BIG_CRAB_HIT_RADIUS > bigVisMin && G.BIG_CRAB_HIT_RADIUS < bigVis);
  check('hit 새끼 게 반지름 = 큰 게 x 새끼 크기', Math.abs(G.BABY_HIT_RADIUS - G.BIG_CRAB_HIT_RADIUS * G.BABY_SCALE) < 1e-9);
  check('hit 농부 반지름은 머리 윤곽보다 조금 작음', G.PLAYER_HIT_RADIUS < 0.18 * G.PLAYER_DRAW_SCALE && G.PLAYER_HIT_RADIUS > 0.18 * G.PLAYER_DRAW_SCALE * 0.9);
  check('hit 예전보다 판정이 커짐(큰 게 0.55, 새끼 0.4)', G.BIG_CRAB_HIT_DIST > 0.55 && G.BABY_HIT_DIST > 0.4);
}
// 큰 게: 예전 거리(0.55)와 새 거리(≈0.63) 사이에서 닿으면 이제 사망
const hitAt = (enemy, babyList) => {
  fresh(3); G.player.x = 10; G.player.y = 10; G.joystick.active = false;
  G.enemies = enemy ? [enemy, still(20, 30, 'blue')] : [still(5, 30, 'red'), still(20, 30, 'blue')];
  G.babies = babyList || [];
  G.gameLoop(70000); G.gameLoop(70016);
  return G.lives;
};
check('hit 큰 게 거리 0.6에서 사망(보이는 대로 닿음)', hitAt(still(10.6, 10, 'red')) === 2);
check('hit 큰 게 거리 0.7에서는 안 닿음', hitAt(still(10.7, 10, 'red')) === 3);
const baby = (x, y) => ({ x, y, vx: 0, vy: 0, type: 'baby', color: '#facc15', scale: G.BABY_SCALE, legPhase: 0 });
check('hit 새끼 게 거리 0.5에서 사망', hitAt(null, [baby(10.5, 10)]) === 2);
check('hit 새끼 게 거리 0.58에서는 안 닿음', hitAt(null, [baby(10.58, 10)]) === 3);
// 움직이는 중(movePlayer)에도 같은 거리
fresh(3); G.player.x = 10; G.player.y = 10;
G.enemies = [still(11.0, 10, 'red'), still(20, 30, 'blue')];
G.joystick.active = true; G.joystick.nx = 1; G.joystick.ny = 0; G.movePlayer(0.4 / 5.2);   // 0.4칸 이동(1단계) → 거리 0.6
check('hit 이동 중 큰 게와 0.6 이내면 사망', G.lives === 2, 'lives=' + G.lives);
// 큰 게 몸통이 옆 칸 고랑에 걸쳐도 사망
fresh(); G.board[10][5] = 2; G.trail.push([5, 10]);
G.enemies = [still(5, 10.5, 'red'), still(20, 30, 'blue')];      // 고랑 선(칸 중심)까지 0.5 < 0.359+0.175
check('trail 큰 게 몸통이 가는 고랑 선에 겹침 → 닿음', G.crabTouchesTrail(G.enemies[0]) === true);
G.updateEnemies(0.016);
check('trail 겹친 상태에서 목숨 감소', G.lives === 2, 'lives=' + G.lives);
fresh(); G.board[10][5] = 2; G.trail.push([5, 10]);
G.enemies = [still(5, 10.8, 'red'), still(20, 30, 'blue')];      // 고랑 칸 안쪽이지만 그려진 선에서 0.8 떨어짐
check('trail 고랑 칸에 걸쳐도 그려진 선에 안 닿으면 무사(가는 고랑 기준)', G.crabTouchesTrail(G.enemies[0]) === false);
fresh(); G.board[10][5] = 2; G.trail.push([5, 10]);
G.enemies = [still(5, 11, 'red'), still(20, 30, 'blue')];        // 가장자리까지 0.5 > 0.36
G.updateEnemies(0.016);
check('trail 한 칸 떨어지면 안 닿음', G.lives === 3 && countTrail() === 1, 'lives=' + G.lives);
fresh(); G.board[10][5] = 2; G.trail.push([5, 10]);
G.enemies = [still(5.85, 10.85, 'red'), still(20, 30, 'blue')];  // 대각선 모서리까지 √(0.35²+0.35²)=0.49
G.updateEnemies(0.016);
check('trail 대각선 모서리 근처(0.49)는 안 닿음', G.lives === 3);
// 새끼 게는 고랑에 걸쳐도 여전히 무해
fresh(3); G.board[10][5] = 2; G.trail.push([5, 10]); G.player.x = 9; G.player.y = 10;
G.enemies = [still(5, 30, 'red'), still(20, 30, 'blue')]; G.babies = [baby(5, 10.6)];
G.updateEnemies(0.016);
check('trail 새끼 게는 고랑에 걸쳐도 무해', G.lives === 3 && countTrail() === 1);
// 홍게·청게 만남 거리
fresh(3); G.enemies = [still(10, 10, 'red'), still(10.71, 10, 'blue')]; G.updateEnemies(0.016);
check('meet 몸통이 닿는 거리(0.71)에서 새끼 탄생', G.babies.length === 2, 'n=' + G.babies.length);
fresh(3); G.enemies = [still(10, 10, 'red'), still(10.75, 10, 'blue')]; G.updateEnemies(0.016);
check('meet 0.75에서는 안 낳음', G.babies.length === 0);

// --- 요금 단위 p, 소수 오차 없음 ---
G.startGame();
for (let i = 0; i < 2; i++) G.chargeFee(G.CONTINUE_FEE, 'continue');
check('fee 0.1p + 0.1p + 0.1p = 0.3p (소수 오차 없음)', els['fee'].textContent === '0.3p' && G.feeTenths === 3, els['fee'].textContent);
for (let i = 0; i < 7; i++) G.chargeFee(G.CONTINUE_FEE, 'continue');
check('fee 10번이면 1.0p', els['fee'].textContent === '1.0p', els['fee'].textContent);
check('fee 표시 형식', G.formatFee(1) === '0.1p' && G.formatFee(12) === '1.2p');
{
  const html2 = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').replace(/\uC77C\uC6D0 \uC624\uB77D\uC2E4/g, '');
  check('fee index.html에 옛 화폐 단위 글자(U+C6D0) 없음 (오락실 이름 제외)', !/\uC6D0/.test(html2), (html2.match(/.{10}\uC6D0.{5}/g) || []).join(' | '));
  check('fee 상수: 한 판 0.1p, 다음 단계 0, 이어서 하기 0.1p', G.GAME_FEE === 0.1 && G.STAGE_FEE === 0 && G.CONTINUE_FEE === 0.1);
}

// --- 가는 고랑 판정: 선분 경로 ---
fresh(); G.player.x = 4; G.player.y = 14;
[[1,10],[2,10],[3,10],[3,11],[3,12],[4,13]].forEach(([x,y]) => { G.board[y][x] = 2; G.trail.push([x,y]); });
G.enemies = [still(2.5, 11, 'red'), still(20, 30, 'blue')];
check('furrow 모서리 안쪽(선에서 0.5) → 닿음', G.crabTouchesTrail(G.enemies[0]) === true);
G.enemies = [still(1.6, 11.6, 'red'), still(20, 30, 'blue')];
check('furrow 고랑 칸 옆이지만 선에서 먼 곳(≈1.4) → 무사', G.crabTouchesTrail(G.enemies[0]) === false);
G.enemies = [still(3.5, 12.5, 'red'), still(20, 30, 'blue')];
check('furrow 대각선 이음 위 → 닿음', G.crabTouchesTrail(G.enemies[0]) === true);
G.enemies = [still(4, 13.9, 'red'), still(20, 30, 'blue')];
check('furrow 마지막 칸→농부 구간도 고랑', G.crabTouchesTrail(G.enemies[0]) === true);
check('furrow 시작은 내 땅 가장자리(0.5,10)', JSON.stringify(G.furrowSegments()[0][0]) === '[0.5,10]', JSON.stringify(G.furrowSegments()[0][0]));

// --- 목숨: 다음 단계 +1, 최대 5 ---
G.startGame(); G.gameOver(true); G.nextStage();
check('lives 다음 단계로 가면 목숨 +1 (3→4)', G.lives === 4, 'lives=' + G.lives);
G.nextStage();
check('lives 4→5', G.lives === 5);
G.nextStage();
check('lives 최대 5에서 더 안 늘어남', G.lives === G.MAX_LIVES && G.lives === 5, 'lives=' + G.lives);
check('lives 다음 단계 요금 없음(0.1p 유지)', G.feeTenths === 1);

// --- 굴러다니는 아이템 ---
const pu = (kind, x, y, vx, vy) => ({ kind, x, y, vx, vy, angle: 0 });
fresh(3); G.enemies = [still(5, 30, 'red'), still(22, 30, 'blue')];
G.playTime = 0; G.updatePowerups(0.016);
check('powerup 시작 직후에는 BidGuard 없음', !G.powerups.some(p => p.kind === 'bidguard'));
G.playTime = G.BIDGUARD_FIRST_DELAY + 0.1; G.updatePowerups(0.016);
check('powerup 5초 뒤 BidGuard 1개 등장', G.powerups.filter(p => p.kind === 'bidguard').length === 1);
const bg = G.powerups.find(p => p.kind === 'bidguard');
check('powerup 농부와 6칸 이상 떨어진 빈 칸에서 등장', Math.hypot(bg.x - G.player.x, bg.y - G.player.y) >= 6 && G.board[Math.round(bg.y)][Math.round(bg.x)] === 0);
G.playTime += 100; G.updatePowerups(0.016);
check('powerup BidGuard는 최대 1개', G.powerups.filter(p => p.kind === 'bidguard').length === 1);
// 굴러감(회전) + 움직임
G.powerups = [pu('bidguard', 14, 18, 1.3, 0)];
for (let i = 0; i < 20; i++) G.updatePowerups(0.016);
check('powerup 굴러가며 움직이고 회전함', G.powerups[0].x > 14.3 && Math.abs(G.powerups[0].angle) > 0.5, 'x=' + G.powerups[0].x.toFixed(2) + ' angle=' + G.powerups[0].angle.toFixed(2));
// 테두리에서 튕김
G.powerups = [pu('bidguard', 1.25, 18, -1.3, 0)];
G.updatePowerups(0.05);
check('powerup 테두리에서 튕김', G.powerups[0].vx > 0);
// 내 땅에서 튕김
G.board[18][16] = 1; G.powerups = [pu('bidguard', 15.6, 18, 1.3, 0)];
G.updatePowerups(0.05);
check('powerup 내 땅에서 튕김', G.powerups[0].vx < 0);
// 게와 부딪히면 반사
fresh(3); G.enemies = [still(15, 18, 'red'), still(22, 30, 'blue')];
G.powerups = [pu('bidguard', 14.3, 18, 1.3, 0)];
G.updatePowerups(0.016);
check('powerup 큰 게와 부딪히면 반사', G.powerups[0].vx < 0 && Math.hypot(G.powerups[0].x - 15, G.powerups[0].y - 18) >= G.POWERUP_RADIUS + G.BIG_CRAB_HIT_RADIUS - 1e-9, 'vx=' + G.powerups[0].vx);
check('powerup 게는 그대로(아이템만 튕김)', G.enemies[0].x === 15 && G.enemies.length === 2);
G.babies = [baby(10, 10)]; G.powerups = [pu('bidguard', 10, 10.6, 0, -1.3)];
G.updatePowerups(0.016);
check('powerup 새끼 게와 부딪혀도 반사', G.powerups[0].vy > 0);
// 먹으면 트랙터
fresh(3); G.enemies = [still(5, 30, 'red'), still(22, 30, 'blue')];
G.player.x = 10; G.player.y = 10;
G.powerups = [pu('bidguard', 10.5, 10, 0, 0)]; G.playTime = 7;
G.updatePowerups(0.016);
check('tractor BidGuard를 먹으면 트랙터', G.tractorRemaining === G.TRACTOR_SECONDS && G.player.type === 'tractor' && G.powerups.length === 0);
check('powerup 먹힌 BidGuard는 25초 뒤 다시', Math.abs(G.bidguardNextAt - (7 + G.BIDGUARD_RESPAWN)) < 1e-9);
// 30초 타이머
G.joystick.active = false;
let t = 100000; G.gameLoop(t);
for (let i = 0; i < 25 / 0.05; i++) { t += 50; G.gameLoop(t); }
check('tractor 25초 뒤 아직 트랙터, 남은 시간 약 5초', G.player.type === 'tractor' && Math.abs(G.tractorRemaining - 5) < 0.06, 'remain=' + G.tractorRemaining.toFixed(2));
// 마지막 5초: 농부/트랙터 번갈아, 끝에 갈수록 농부 비율 증가
const share = () => { let f = 0; for (let k = 0; k < 600; k++) { G.animTime = k / 600; if (G.playerSpriteType() === 'farmer') f++; } return f / 600; };
G.setTractor(4.5); const s1 = share(); G.setTractor(1); const s2 = share(); G.setTractor(20); const s0 = share();
check('tractor 마지막 5초에는 농부 모습이 섞이고 끝에 갈수록 늘어남', s0 === 0 && s1 > 0 && s2 > s1 && s2 < 1, `20초:${s0} 4.5초:${s1.toFixed(2)} 1초:${s2.toFixed(2)}`);
G.setTractor(5);
for (let i = 0; i < 5.2 / 0.05; i++) { t += 50; G.gameLoop(t); }
check('tractor 30초 지나면 농부로 돌아옴', G.tractorRemaining === 0 && G.player.type === 'farmer');
// 무적 + 몰살
fresh(3); G.player.x = 10; G.player.y = 10; G.activateTractor();
G.enemies = [still(10.4, 10, 'red'), still(22, 30, 'blue')];
G.babies = [baby(9.6, 10.2), baby(20, 20)];
G.gameLoop(200000); G.gameLoop(200016);
check('tractor 닿은 큰 게 몰살, 목숨 그대로', G.lives === 3 && G.enemies.length === 1 && G.enemies[0].type === 'blue', 'lives=' + G.lives + ' enemies=' + G.enemies.length);
check('tractor 닿은 새끼 게 몰살, 먼 새끼는 남음', G.babies.length === 1 && G.babies[0].x === 20);
check("tractor 몰살 효과 '펑!'", G.effects.filter(f => f.text === '펑!').length === 2);
check('tractor 큰 게는 5초 뒤 다시 나오도록 예약', G.crabRespawns.length === 1 && G.crabRespawns[0].type === 'red');
// 고랑에 큰 게가 닿아도 무사
fresh(3); G.activateTractor(); G.player.x = 7; G.player.y = 10;
G.board[10][5] = 2; G.board[10][6] = 2; G.trail.push([5, 10], [6, 10]);
G.enemies = [still(6, 10, 'red'), still(22, 30, 'blue')];
G.updateEnemies(0.016);
check('tractor 큰 게가 고랑에 닿아도 목숨 그대로, 고랑 유지', G.lives === 3 && countTrail() === 2);
// 점령 순간 큰 게가 고랑 위여도 점령 진행
fresh(3); G.activateTractor();
{
  const p = G.player; p.x = 0; p.y = 18;
  const step = (nx, ny) => { G.joystick.active = true; G.joystick.nx = nx; G.joystick.ny = ny; G.movePlayer(0.1 / 0.52); };
  for (let i = 0; i < 6; i++) step(1, 0);
  G.enemies = [still(3, 18, 'red'), still(20, 30, 'blue')];
  step(0, 1); for (let i = 0; i < 7; i++) step(-1, 0);
  check('tractor 점령 순간 큰 게가 고랑 위여도 죽지 않고 점령', G.lives === 3 && countTrail() === 0 && countClaimed() > borderCells, 'lives=' + G.lives);
}
// 모든 큰 게가 몰살되면 5초 뒤 멀리서 다시
fresh(3); G.player.x = 10; G.player.y = 10; G.activateTractor();
G.enemies = [still(10.3, 10, 'red'), still(9.7, 10, 'blue')];
G.checkPlayerHit();
check('tractor 큰 게 둘 다 몰살', G.enemies.length === 0 && G.crabRespawns.length === 2);
G.playTime += 4; G.updateEnemies(0.016);
check('respawn 4초 뒤에는 아직 없음', G.enemies.length === 0);
G.playTime += 1.1; G.updateEnemies(0.016);
check('respawn 5초 뒤 큰 게 2마리 다시(홍게·청게)', G.enemies.length === 2 && G.enemies.some(e => e.type === 'red') && G.enemies.some(e => e.type === 'blue'));
check('respawn 농부와 8칸 이상 떨어진 빈 칸', G.enemies.every(e => Math.hypot(e.x - 10, e.y - 10) >= 8 && G.board[Math.round(e.y)][Math.round(e.x)] === 0));
// 트랙터 판정 반지름은 그림 크기에 맞춤
check('tractor 판정 반지름 > 농부 반지름', G.TRACTOR_HIT_RADIUS > G.PLAYER_HIT_RADIUS && G.TRACTOR_HIT_RADIUS < 0.65, 'r=' + G.TRACTOR_HIT_RADIUS.toFixed(3));

// --- 지주 로고: 목숨 1개일 때만 ---
fresh(3); G.enemies = [still(5, 30, 'red'), still(22, 30, 'blue')];
G.lives = 3; G.updatePowerups(0.016);
check('jiju 목숨 3개일 때 없음', !G.powerups.some(p => p.kind === 'jiju'));
G.lives = 2; G.updatePowerups(0.016);
check('jiju 목숨 2개일 때 없음', !G.powerups.some(p => p.kind === 'jiju'));
G.lives = 1; G.updatePowerups(0.016);
check('jiju 목숨 1개가 되면 등장', G.powerups.filter(p => p.kind === 'jiju').length === 1);
G.updatePowerups(0.016);
check('jiju 최대 1개', G.powerups.filter(p => p.kind === 'jiju').length === 1);
{ const j = G.powerups.find(p => p.kind === 'jiju'); const x0 = j.x, y0 = j.y; for (let i = 0; i < 20; i++) G.updatePowerups(0.016);
  check('jiju BidGuard처럼 굴러다님', Math.hypot(j.x - x0, j.y - y0) > 0.2 && Math.abs(j.angle) > 0.3); }
G.lives = 2; G.updatePowerups(0.016);
check('jiju 목숨이 2개 이상이 되면 사라짐', !G.powerups.some(p => p.kind === 'jiju'));
// 이어서 하기로 목숨 3 복구 → 지주 로고 사라짐
fresh(3); G.enemies = [still(5, 30, 'red'), still(22, 30, 'blue')];
G.lives = 1; G.updatePowerups(0.016);
G.player.x = 22; G.player.y = 30; G.gameLoop(300000); G.gameLoop(300016);   // 마지막 목숨 잃음 → 게임 오버
check('jiju 게임 오버 상태', G.lives === 0 && els['continue-btn'].style.display === 'block');
G.continueGame();
check('jiju 이어서 하기로 목숨 3 → 지주 로고 사라짐', G.lives === 3 && !G.powerups.some(p => p.kind === 'jiju'));
// 지주 로고를 먹어도 트랙터
fresh(3); G.enemies = [still(5, 30, 'red'), still(22, 30, 'blue')];
G.lives = 1; G.player.x = 10; G.player.y = 10;
G.powerups = [pu('jiju', 10.4, 10, 0, 0)];
G.updatePowerups(0.016);
check('jiju 먹으면 트랙터 30초', G.tractorRemaining === G.TRACTOR_SECONDS && G.player.type === 'tractor');

console.log(fail ? `\n${fail} FAILED` : '\nALL PASSED');
process.exit(fail ? 1 : 0);
