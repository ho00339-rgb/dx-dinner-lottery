// =============================================================
// DX혁신실 회식 추첨 시스템 — 앱 로직
//
// 의존성: data.js (먼저 로드되어야 함)
// =============================================================

const STORAGE_KEY = 'dx_dinner_lottery_v3';

let state = {
  history: [],
  pendingResult: null,
};

let currentMode = 'different'; // 'different' = MIX, 'similar' = PEER

// =============================================================
// 상태 저장/로드 (브라우저 localStorage)
// =============================================================
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      state = { ...state, ...parsed };
    }
  } catch (e) { console.error(e); }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ history: state.history }));
  } catch (e) { console.error(e); }
}

function getCurrentRoundNumber() { return state.history.length + 1; }

// 마지막 같은 모드 회차에서 뽑힌 사람들 (쿨다운)
function getCooldown(mode) {
  for (let i = state.history.length - 1; i >= 0; i--) {
    if (state.history[i].mode === mode) {
      const names = [];
      state.history[i].teams.forEach(t => t.members.forEach(m => { if (m) names.push(m.name); }));
      return new Set(names);
    }
  }
  return new Set();
}

function getSelectionCounts() {
  const counts = {};
  MEMBERS.forEach(m => counts[m.name] = 0);
  state.history.forEach(r => r.teams.forEach(t => t.members.forEach(m => {
    if (m && counts[m.name] !== undefined) counts[m.name]++;
  })));
  return counts;
}

// =============================================================
// 추첨 알고리즘
//
// 컬럼 구조: [기획] [운영] [정보보호+PMO] [잔여 통합]
//   - 앞 3개 컬럼은 COLUMNS[i].groups 에 속한 멤버만 후보
//   - 마지막 "잔여" 컬럼(leftover)은 앞 컬럼에서 안 뽑힌 사람 전원이 후보
//   - MIX: 한 팀 4명이 모두 다른 티어
//   - PEER: 한 팀 전체가 같은 묶음(상/중/하)
// =============================================================
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function randomChoice(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// 특정 컬럼의 후보 멤버 목록 (제약: cooldown / 이미 뽑힘 / 현재 팀 중복 / 추가 필터)
// leftover 컬럼이면 GROUPS 전체에서 뽑음.
function columnCandidates(col, usedNames, cooldown, team, extraFilter) {
  return MEMBERS.filter(m =>
    (col.leftover || col.groups.includes(m.group)) &&
    !usedNames.has(m.name) &&
    !cooldown.has(m.name) &&
    !team.some(t => t.name === m.name) &&
    (!extraFilter || extraFilter(m))
  );
}

// ----- MIX 모드 (각 팀 4명이 모두 다른 티어) -----
function drawDifferentMode() {
  const cooldown = getCooldown('different');
  const teams = [];
  const usedNames = new Set();

  for (let i = 0; i < 3; i++) {
    let team = null;
    for (let retry = 0; retry < 8 && !team; retry++) {
      team = drawDifferentTeam(usedNames, cooldown);
    }
    if (!team) team = drawDifferentTeam(usedNames, new Set());
    if (team) {
      team.forEach(m => { if (m) usedNames.add(m.name); });
      // 백트래킹 처리 순서가 아닌 COLUMNS 표시 순서로 재정렬
      const orderedTeam = COLUMNS.map(c => team.find(m => m.slotCol === c.key)).filter(Boolean);
      teams.push({ teamLabel: `${i + 1}팀`, members: orderedTeam });
    } else {
      teams.push({ teamLabel: `${i + 1}팀`, members: [] });
    }
  }
  return { mode: 'different', teams };
}

function drawDifferentTeam(usedNames, cooldown) {
  // 후보가 적은 컬럼부터 처리하되, leftover(잔여)는 가장 유연하므로 항상 마지막에.
  // 그래야 정보보호+PMO처럼 빠듯한 컬럼이 자기 슬롯을 먼저 차지하고,
  // 부족분은 잔여 컬럼이 흡수.
  const colsOrdered = [...COLUMNS].sort((a, b) => {
    if (a.leftover !== b.leftover) return a.leftover ? 1 : -1;
    const ca = columnCandidates(a, usedNames, cooldown, []).length;
    const cb = columnCandidates(b, usedNames, cooldown, []).length;
    return ca - cb;
  });
  return backtrackDifferent(colsOrdered, 0, [], new Set(), usedNames, cooldown);
}

// 백트래킹: 4컬럼 × 4티어 조합을 안정적으로 찾기
function backtrackDifferent(cols, idx, team, usedTiers, usedNames, cooldown) {
  if (idx === cols.length) return [...team];

  const col = cols[idx];
  const candidates = columnCandidates(col, usedNames, cooldown, team, m => !usedTiers.has(m.tier));

  for (const cand of shuffle(candidates)) {
    team.push({ ...cand, slotCol: col.key });
    usedTiers.add(cand.tier);
    const res = backtrackDifferent(cols, idx + 1, team, usedTiers, usedNames, cooldown);
    if (res) return res;
    team.pop();
    usedTiers.delete(cand.tier);
  }
  return null;
}

// ----- PEER 모드 (한 팀 전체가 같은 묶음: 상/중/하) -----
function drawSimilarMode() {
  const cooldown = getCooldown('similar');
  const teams = [];
  const usedNames = new Set();

  for (const pool of POOLS) {
    const team = drawSimilarTeam(pool, usedNames, cooldown);
    team.forEach(m => { if (m) usedNames.add(m.name); });
    teams.push({ teamLabel: pool.name, poolName: pool.name, members: team });
  }
  return { mode: 'similar', teams };
}

function drawSimilarTeam(pool, usedNames, cooldown) {
  // 하위(T6)는 컬럼 구조를 포기하고 묶음 전원에서 올랜덤으로 정원만큼 뽑음.
  if (pool.allRandom) {
    let candidates = MEMBERS.filter(m =>
      pool.tiers.includes(m.tier) && !usedNames.has(m.name) && !cooldown.has(m.name)
    );
    // 쿨다운으로 정원이 안 차면 쿨다운 완화
    if (candidates.length < TEAM_SIZE) {
      candidates = MEMBERS.filter(m => pool.tiers.includes(m.tier) && !usedNames.has(m.name));
    }
    return shuffle(candidates)
      .slice(0, TEAM_SIZE)
      .map(m => ({ ...m, slotCol: null, allRandom: true }));
  }

  const team = [];
  // 컬럼 순서 그대로(기획→운영→정보보호+PMO→잔여) 처리.
  // 잔여 컬럼은 앞 컬럼에서 안 뽑힌 같은 묶음 인원을 흡수.
  for (const col of COLUMNS) {
    const inPool = m => pool.tiers.includes(m.tier);
    const primary = columnCandidates(col, usedNames, cooldown, team, inPool);

    if (primary.length > 0) {
      const pick = randomChoice(primary);
      team.push({ ...pick, slotCol: col.key });
    }
    // 후보가 없으면 그 슬롯은 비움
  }
  return team;
}

// =============================================================
// 조장 선발 — 각 팀에서 랜덤 1명
// =============================================================
function pickLeaders(teams) {
  return teams.map(team => {
    const members = team.members.filter(Boolean);
    if (members.length === 0) return null;
    return randomChoice(members).name;
  });
}

// =============================================================
// 슬롯머신 UI
// =============================================================
// strip은 가상의 긴 띠. 회전 바퀴 수(SPIN_LAPS) × 한 바퀴 셀 수(CYCLE_LEN)만큼 셀을 채워야
// 어떤 위치로 끌어올려도 빈 공간이 안 보임.
const CYCLE_LEN = 30;                       // 한 바퀴의 셀 수
const SPIN_LAPS = 8;                        // 전체 회전 바퀴 수 (스트립이 이만큼 길어야 함)
const STRIP_LEN = CYCLE_LEN * SPIN_LAPS;    // 총 셀 수 (240)
const TARGET_INDEX = STRIP_LEN - 10;        // 타깃 셀 위치 — 끝쪽 근처

function getItemHeight() { return window.innerWidth <= 760 ? 32 : 40; }
function getFinalY() { const h = getItemHeight(); return -(TARGET_INDEX * h) + h; }

// Web Animations API 멀티-페이즈 스핀: 빠르게 → 천천히 감속.
// strip은 SPIN_LAPS 바퀴 분량의 셀이 빌드되어 있어서, 0 → finalY 까지 단조감소로 이동하면
// 자연스럽게 여러 바퀴가 흘러간 것처럼 보임.
//
// 시간 배분:
//   0~55% : 전체 이동거리의 85% 를 빠르게 (휘몰아침)
//   55~100%: 나머지 15% 를 천천히 (마지막 ~1바퀴 감속 → 타깃에서 멈춤)
function spinStrip(strip, finalY, totalDuration) {
  const fastEndY = finalY * 0.85;

  return strip.animate(
    [
      { transform: 'translateY(0)', offset: 0, easing: 'cubic-bezier(0.25, 0, 0.35, 1)' },
      { transform: `translateY(${fastEndY}px)`, offset: 0.55, easing: 'cubic-bezier(0.1, 0.4, 0.25, 1)' },
      { transform: `translateY(${finalY}px)`, offset: 1 },
    ],
    {
      duration: totalDuration,
      fill: 'forwards',
    }
  );
}

function renderTeamRows() {
  const container = document.getElementById('teamRows');
  const labels = currentMode === 'similar'
    ? POOLS.map((p, i) => ({ num: i + 1, label: p.name + '팀' }))
    : [1, 2, 3].map(i => ({ num: i, label: `${i}팀` }));

  container.innerHTML = labels.map((lbl, rowIdx) => `
    <div class="team-row" data-row="${rowIdx}">
      <div class="team-label">
        <div class="tl-num">${lbl.num}</div>
        <div class="tl-name">${lbl.label}</div>
      </div>
      <div class="team-reels">
        ${COLUMNS.map((c, colIdx) => `
          <div class="reel-wrap${c.leftover ? ' is-leftover' : ''}" data-row="${rowIdx}" data-col="${colIdx}" data-col-key="${c.key}">
            <div class="reel-label">${c.label}</div>
            <div class="drum" data-row="${rowIdx}" data-col="${colIdx}">
              <div class="strip" data-row="${rowIdx}" data-col="${colIdx}"></div>
              <div class="indicator"></div>
            </div>
          </div>
        `).join('')}
        <div class="leader-cursor" data-row="${rowIdx}"></div>
      </div>
    </div>
  `).join('');

  document.querySelectorAll('.strip').forEach(strip => {
    const colIdx = parseInt(strip.dataset.col);
    const stripNames = getStripNamesForColumn(COLUMNS[colIdx]);
    strip.innerHTML = '';
    for (let i = 0; i < STRIP_LEN; i++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.textContent = stripNames[i % stripNames.length];
      strip.appendChild(cell);
    }
  });
}

// 슬롯 스트립에 표시될 이름 목록. leftover 컬럼은 전원이 후보이므로 전체 이름.
function getStripNamesForColumn(col) {
  const names = MEMBERS
    .filter(m => col.leftover || col.groups.includes(m.group))
    .map(m => m.name);
  return shuffle(names);
}

// allRandom 팀(PEER 하위)용 스트립 이름 — 같은 묶음(T6) 전원
function getStripNamesForPool(pool) {
  return shuffle(MEMBERS.filter(m => pool.tiers.includes(m.tier)).map(m => m.name));
}

// 회전용 스트립: 타깃 인덱스에 member.name이 박힘
// stripNames 미지정 시 컬럼 기준으로 결정.
function buildStripWithChosen(stripEl, member, col, stripNames) {
  stripNames = stripNames || getStripNamesForColumn(col);
  stripEl.innerHTML = '';
  for (let i = 0; i < STRIP_LEN; i++) {
    const cell = document.createElement('div');
    if (i === TARGET_INDEX) {
      cell.className = 'cell is-target';
      cell.textContent = member.name;
    } else {
      cell.className = 'cell';
      cell.textContent = stripNames[Math.floor(Math.random() * stripNames.length)];
    }
    stripEl.appendChild(cell);
  }
}

async function animateDraw(result) {
  const teams = result.teams;
  const baseDelay = 320;       // 컬럼 간 시차 — 슬롯이 차례차례 멈추는 긴장감
  const rowDelay = 1100;       // 팀 간 시차 — 1팀 끝나고 2팀 시작까지 더 길게
  const spinDuration = 4000;   // 회전 시간 (2.2s → 4.0s)
  const finalY = getFinalY();

  document.querySelectorAll('.drum').forEach(d => d.classList.remove(
    'locked', 'locked-leftover', 'locked-random', 'spinning', 'leader-highlight', 'leader-sweep'
  ));
  document.querySelectorAll('.reel-wrap').forEach(w => {
    const label = w.querySelector('.reel-label');
    const colKey = w.dataset.colKey;
    const col = COLUMNS.find(c => c.key === colKey);
    if (label && col) label.textContent = col.label;
  });
  // 조장 커서/팀행 상태 즉시 리셋 — RESPIN 시 ♛ 잔존 방지
  document.querySelectorAll('.team-row').forEach(r => r.classList.remove('leader-active', 'leader-done'));
  document.querySelectorAll('.leader-cursor').forEach(c => {
    c.style.transition = 'none';
    c.style.transform = 'translateX(-9999px) translateX(-50%)';
    c.style.opacity = '';
  });

  const promises = [];

  for (let rowIdx = 0; rowIdx < teams.length; rowIdx++) {
    const team = teams[rowIdx];
    // PEER 하위처럼 올랜덤 팀이면 스트립을 묶음(T6) 전원에서 굴림
    const isAllRandom = team.members.some(m => m && m.allRandom);
    const poolForRow = result.mode === 'similar' ? POOLS[rowIdx] : null;
    const allRandomNames = isAllRandom && poolForRow ? getStripNamesForPool(poolForRow) : null;

    for (let colIdx = 0; colIdx < 4; colIdx++) {
      const member = team.members[colIdx];
      if (!member) continue;

      const strip = document.querySelector(`.strip[data-row="${rowIdx}"][data-col="${colIdx}"]`);
      const drum = document.querySelector(`.drum[data-row="${rowIdx}"][data-col="${colIdx}"]`);
      const reelWrap = document.querySelector(`.reel-wrap[data-row="${rowIdx}"][data-col="${colIdx}"]`);
      if (!strip || !drum) continue;

      const col = COLUMNS[colIdx];
      buildStripWithChosen(strip, member, col, allRandomNames);

      const totalDelay = rowIdx * rowDelay + colIdx * baseDelay;
      strip.style.transition = 'none';
      strip.style.transform = 'translateY(0)';

      promises.push(new Promise(resolve => {
        setTimeout(() => {
          drum.classList.add('spinning');
          void strip.offsetWidth;
          spinStrip(strip, finalY, spinDuration);

          // 중간 흔들림 — 감속 진입 지점과 거의 멈추기 직전
          setTimeout(() => { tickShake(drum, 0.25); }, spinDuration * 0.58);
          setTimeout(() => { tickShake(drum, 0.4); }, spinDuration * 0.85);

          setTimeout(() => {
            drum.classList.remove('spinning');

            if (member.allRandom) {
              // PEER 하위 올랜덤 — 시안으로 차별화 + 라벨에 OLL-RANDOM 표시
              drum.classList.add('locked-random');
              if (reelWrap) {
                const label = reelWrap.querySelector('.reel-label');
                if (label) label.textContent = `🎲 올랜덤 · ${GROUP_LABEL[member.group]}`;
              }
              flashScreen(0.16, '#00e8ff');
              lockBurst(drum, '#00e8ff', 18);
              tickShake(drum, 0.6);
              resolve();
            } else if (col.leftover) {
              // 잔여 통합 컬럼 — 네온 그린으로 차별화
              drum.classList.add('locked-leftover');
              if (reelWrap) {
                const label = reelWrap.querySelector('.reel-label');
                if (label) label.textContent = `${col.label} · ${GROUP_LABEL[member.group]}`;
              }
              flashScreen(0.16, '#00ff9d');
              lockBurst(drum, '#00ff9d', 18);
              tickShake(drum, 0.6);
              resolve();
            } else {
              drum.classList.add('locked');
              flashScreen(0.14);
              lockBurst(drum, '#ffcb05', 14);
              tickShake(drum, 0.5);
              resolve();
            }
          }, spinDuration);
        }, totalDelay);
      }));
    }
  }

  await Promise.all(promises);
}

function flashScreen(intensity = 0.15, color = null) {
  const flash = document.createElement('div');
  const bg = color
    ? `color-mix(in srgb, ${color} ${Math.round(intensity * 100)}%, transparent)`
    : `rgba(255,255,255,${intensity})`;
  flash.style.cssText = `position:fixed;inset:0;background:${bg};pointer-events:none;z-index:60;mix-blend-mode:screen;`;
  document.body.appendChild(flash);
  flash.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, easing: 'ease-out' }).onfinish = () => flash.remove();
}

function lockBurst(drum, color, count = 14) {
  const rect = drum.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  for (let i = 0; i < count; i++) {
    confettiParts.push({
      x: cx, y: cy,
      vx: (Math.random() - 0.5) * 11,
      vy: (Math.random() - 0.5) * 11 - 4,
      g: 0.34, size: Math.random() * 4 + 2,
      color, rot: Math.random() * 360, vRot: (Math.random() - 0.5) * 14, life: 60
    });
  }
}

// =============================================================
// 조장 선발 애니메이션 — 이미 뽑힌 드럼 위로 커서가 부드럽게 슬라이딩
// =============================================================
async function animateLeaderPicks(teams, leaders) {
  document.querySelectorAll('.team-row').forEach(r => {
    r.classList.remove('leader-active', 'leader-done');
  });
  document.querySelectorAll('.drum.leader-highlight').forEach(d => d.classList.remove('leader-highlight'));

  for (let rowIdx = 0; rowIdx < teams.length; rowIdx++) {
    const team = teams[rowIdx];
    const leaderName = leaders[rowIdx];
    if (!leaderName) continue;

    const teamRow = document.querySelector(`.team-row[data-row="${rowIdx}"]`);
    const cursor = teamRow.querySelector('.leader-cursor');
    const reels = teamRow.querySelector('.team-reels');
    const reelsRect = reels.getBoundingClientRect();

    // 각 드럼의 중앙 X 좌표 (team-reels 기준 상대)
    const drums = teamRow.querySelectorAll('.drum');
    const drumCenters = Array.from(drums).map(d => {
      const r = d.getBoundingClientRect();
      return r.left - reelsRect.left + r.width / 2;
    });

    const targetIdx = team.members.findIndex(m => m && m.name === leaderName);
    if (targetIdx < 0) continue;

    teamRow.classList.add('leader-active');

    // 시작 위치: 첫 드럼 왼쪽
    cursor.style.transition = 'none';
    cursor.style.transform = `translateX(${drumCenters[0]}px) translateX(-50%)`;
    void cursor.offsetWidth;

    // 부드러운 슬라이딩: 좌→우→좌→우→타깃 (감속)
    const stops = [
      { idx: drums.length - 1, dur: 600 },
      { idx: 0, dur: 550 },
      { idx: drums.length - 1, dur: 500 },
      { idx: targetIdx, dur: 850 },
    ];

    for (let s = 0; s < stops.length; s++) {
      const stop = stops[s];
      const isFinal = s === stops.length - 1;
      const ease = isFinal ? 'cubic-bezier(0.16, 0.7, 0.2, 1)' : 'cubic-bezier(0.45, 0.05, 0.55, 0.95)';
      cursor.style.transition = `transform ${stop.dur}ms ${ease}`;
      cursor.style.transform = `translateX(${drumCenters[stop.idx]}px) translateX(-50%)`;

      // 통과하는 동안 가까이 있는 드럼이 살짝 시안 펄스
      const sweepStart = performance.now();
      const sweepDur = stop.dur;
      const fromX = drumCenters[s === 0 ? 0 : stops[s - 1].idx];
      const toX = drumCenters[stop.idx];
      let lastHovered = -1;
      const sweepTick = () => {
        const t = Math.min(1, (performance.now() - sweepStart) / sweepDur);
        const x = fromX + (toX - fromX) * t;
        let nearest = 0; let minDist = Infinity;
        drumCenters.forEach((dx, i) => { const d = Math.abs(dx - x); if (d < minDist) { minDist = d; nearest = i; } });
        if (nearest !== lastHovered) {
          drums[nearest].classList.add('leader-sweep');
          setTimeout(() => drums[nearest].classList.remove('leader-sweep'), 280);
          lastHovered = nearest;
        }
        if (t < 1) requestAnimationFrame(sweepTick);
      };
      requestAnimationFrame(sweepTick);

      await new Promise(r => setTimeout(r, stop.dur));
    }

    // 락 — 타깃 드럼에 leader-highlight + 폭발
    teamRow.classList.add('leader-done');
    drums[targetIdx].classList.add('leader-highlight');
    leaderBurst(drums[targetIdx]);
    flashScreen(0.18, '#ffcb05');
    tickShake(drums[targetIdx], 0.7);

    await new Promise(r => setTimeout(r, 450));
  }
}

function leaderBurst(slotEl) {
  const rect = slotEl.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  for (let i = 0; i < 24; i++) {
    const angle = (Math.PI * 2 * i) / 24;
    const speed = 5 + Math.random() * 5;
    confettiParts.push({
      x: cx, y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 2,
      g: 0.28, size: Math.random() * 4 + 3,
      color: ['#ffcb05', '#ff2e88', '#ffffff'][Math.floor(Math.random() * 3)],
      rot: Math.random() * 360, vRot: (Math.random() - 0.5) * 16, life: 80,
    });
  }
  // 황금 링 확장
  const ring = document.createElement('div');
  ring.style.cssText = `position:fixed;left:${cx}px;top:${cy}px;width:14px;height:14px;border-radius:50%;border:3px solid #ffcb05;box-shadow:0 0 24px #ffcb05;transform:translate(-50%,-50%);pointer-events:none;z-index:55;`;
  document.body.appendChild(ring);
  ring.animate(
    [
      { width: '14px', height: '14px', opacity: 1 },
      { width: '260px', height: '260px', opacity: 0 },
    ],
    { duration: 550, easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)' }
  ).onfinish = () => ring.remove();
}

// 드럼 흔들기 — 정지 임팩트용
function tickShake(drum, intensity = 0.5) {
  const dx = 6 * intensity;
  drum.animate(
    [
      { transform: 'translateX(0)' },
      { transform: `translateX(${-dx}px)` },
      { transform: `translateX(${dx * 0.7}px)` },
      { transform: `translateX(${-dx * 0.4}px)` },
      { transform: 'translateX(0)' },
    ],
    { duration: 280, easing: 'ease-out' }
  );
}

// =============================================================
// 결과 렌더링
// =============================================================
function renderResults(result) {
  const container = document.getElementById('resultsTeams');
  const leaders = result.leaders || [];

  const headcount = result.teams.reduce((n, t) => n + t.members.filter(Boolean).length, 0);
  const titleEl = document.getElementById('resultsTitle');
  if (titleEl) titleEl.textContent = `오늘의 회식 멤버 ${headcount}명이 결정되었습니다`;

  container.innerHTML = result.teams.map((team, idx) => `
    <div class="result-team">
      <div class="result-team-header">
        <div class="result-team-num">${idx + 1}팀</div>
        <div class="result-team-label">${team.teamLabel || ''}${team.poolName ? ' · ' + getPoolDescription(team.poolName) : ''}</div>
        ${team.members.some(m => m && m.allRandom) ? `<div class="result-team-tag random">🎲 올랜덤</div>` : ''}
        ${leaders[idx] ? `<div class="result-team-leader">♛ 조장 · ${leaders[idx]}</div>` : ''}
      </div>
      <div class="result-members">
        ${team.members.map(m => m ? `
          <div class="result-member ${m.allRandom ? 'random' : (m.slotCol === '잔여' ? 'leftover' : '')} ${leaders[idx] === m.name ? 'is-leader' : ''}" data-name="${m.name}">
            ${leaders[idx] === m.name ? `<div class="rm-leader-crown">♛</div>` : ''}
            ${m.allRandom ? `<div class="rm-sub-badge random">🎲 올랜덤</div>` : (m.slotCol === '잔여' ? `<div class="rm-sub-badge leftover">잔여 통합</div>` : '')}
            <div class="rm-group">${GROUP_LABEL[m.group]}</div>
            <div class="rm-name">${m.name}</div>
            <div class="rm-title">${m.title} · ${TIER_LABEL[m.tier]}</div>
            ${m.part ? `<div class="rm-part">${m.part}</div>` : '<div class="rm-part">&nbsp;</div>'}
          </div>
        ` : '<div class="result-member" style="opacity:0.3;">— 슬롯 비움 —</div>').join('')}
      </div>
    </div>
  `).join('');
}

function getPoolDescription(name) {
  const map = {
    '상위': 'T1-T3 · 그룹장+팀장+시니어',
    '중위': 'T4-T5 · 차장+과장',
    '하위': 'T6 · 사원+대리+주임 (올랜덤)'
  };
  return map[name] || '';
}

function showResults() {
  document.getElementById('resultsSection').classList.add('shown');
  runConfetti();
}

function hideResults() {
  document.getElementById('resultsSection').classList.remove('shown');
}

// =============================================================
// SPIN / CONFIRM / REROLL
// =============================================================
let spinning = false;

async function handleSpin() {
  if (spinning) return;
  spinning = true;
  hideResults();
  const spinBtn = document.getElementById('spinBtn');
  spinBtn.disabled = true;

  const result = currentMode === 'different' ? drawDifferentMode() : drawSimilarMode();
  result.leaders = pickLeaders(result.teams);
  state.pendingResult = result;

  await animateDraw(result);

  // 인원 추첨 끝나면 살짝 뜸 → 조장 선발 가로 슬라이더
  updateStatus('조장 선발 중', '각 팀의 리더가 결정됩니다');
  await new Promise(r => setTimeout(r, 500));
  await animateLeaderPicks(result.teams, result.leaders);

  renderResults(result);
  setTimeout(() => {
    showResults();
    updateStatus('대기 중', '확정 또는 다시 추첨');
    spinning = false;
    spinBtn.disabled = false;
    spinBtn.textContent = 'RESPIN ↻';
  }, 200);
}

function handleConfirm() {
  if (!state.pendingResult) return;

  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  state.history.push({
    roundNum: getCurrentRoundNumber(),
    mode: state.pendingResult.mode,
    date: dateStr,
    teams: state.pendingResult.teams,
    leaders: state.pendingResult.leaders || [],
  });

  state.pendingResult = null;
  saveState();

  document.querySelectorAll('.result-member').forEach(el => el.classList.add('confirmed'));
  showToast('회차 확정됨 · 이력에 저장되었습니다');

  setTimeout(() => {
    hideResults();
    document.getElementById('spinBtn').textContent = 'SPIN ↻';
    updateRoundInfo();
    renderTeamRows();
    updateStatus('대기', 'SPIN을 눌러주세요');
    renderHistory();
    renderMembers();
  }, 1800);
}

function handleReroll() {
  state.pendingResult = null;
  hideResults();
  updateStatus('대기', 'SPIN을 눌러주세요');
  document.getElementById('spinBtn').textContent = 'SPIN ↻';
}

// =============================================================
// 모드 토글
// =============================================================
function setMode(mode) {
  if (spinning) return;
  if (mode === currentMode) return;

  currentMode = mode;
  document.body.classList.toggle('theme-peer', mode === 'similar');

  document.querySelectorAll('.mode-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === mode);
  });

  hideResults();
  state.pendingResult = null;
  document.getElementById('spinBtn').textContent = 'SPIN ↻';

  updateRoundInfo();
  renderTeamRows();
  updateStatus('대기', 'SPIN을 눌러주세요');
}

// =============================================================
// 회차 정보 / 상태
// =============================================================
function updateRoundInfo() {
  document.getElementById('roundNum').textContent = `#${getCurrentRoundNumber()}`;
  const now = new Date();
  const dateStr = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')}`;
  document.getElementById('roundDate').textContent = dateStr;
  document.getElementById('confirmedCount').textContent = state.history.length;
}

function updateStatus(label, sub) {
  document.getElementById('statusText').textContent = label;
  document.getElementById('statusSub').textContent = sub;
}

// =============================================================
// 이력 탭
// =============================================================
function renderHistory() {
  const container = document.getElementById('historyContent');
  if (state.history.length === 0) {
    container.innerHTML = '<div class="history-empty">아직 확정된 회차가 없습니다.<br>추첨 후 결과를 확정하면 여기에 기록됩니다.</div>';
    return;
  }
  // 원본 인덱스를 함께 보관해 reverse 표시 후에도 정확히 삭제
  const sorted = state.history.map((round, idx) => ({ round, idx })).reverse();
  container.innerHTML = `
    <div class="history-list">
      ${sorted.map(({ round, idx }) => `
        <div class="history-card">
          <div class="history-card-header">
            <div class="history-card-meta">
              <div class="hc-round">#${round.roundNum}</div>
              <div class="hc-mode ${round.mode}">${round.mode === 'different' ? 'MIX' : 'PEER'}</div>
            </div>
            <div class="hc-date">${round.date}</div>
            <button class="hc-delete" data-idx="${idx}" title="이 회차 삭제" aria-label="이 회차 삭제">🗑 삭제</button>
          </div>
          <div class="history-card-summary">
            ${round.teams.map((team, idx) => {
              const leaderName = (round.leaders || [])[idx];
              return `
              <div class="hcs-team">
                <div class="hcs-team-label">${idx + 1}팀${team.poolName ? ' · ' + team.poolName : ''}${leaderName ? ` · ♛ ${leaderName}` : ''}</div>
                <div class="hcs-names">
                  ${team.members.map(m => m
                    ? (m.name === leaderName
                        ? `<span class="leader-name">♛${m.name}(${m.group})</span>`
                        : (m.slotCol === '잔여'
                            ? `<span class="sub-name">${m.name}(${m.group})</span>`
                            : `${m.name}(${m.group})`))
                    : '—').join(' · ')}
                </div>
              </div>
            `;}).join('')}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

// 한 회차 삭제 — 삭제 후 남은 회차의 roundNum을 1부터 재정렬
function deleteRound(idx) {
  const round = state.history[idx];
  if (!round) return;

  const modeLabel = round.mode === 'different' ? 'MIX' : 'PEER';
  if (!confirm(`#${round.roundNum} (${modeLabel} · ${round.date}) 회차를 삭제할까요?\n삭제하면 되돌릴 수 없습니다.`)) return;

  state.history.splice(idx, 1);
  // 번호 재정렬
  state.history.forEach((r, i) => { r.roundNum = i + 1; });
  saveState();

  showToast('회차가 삭제되었습니다');
  renderHistory();
  renderMembers();
  updateRoundInfo();
}

// =============================================================
// 멤버 탭
// =============================================================
function renderMembers() {
  const counts = getSelectionCounts();
  const total = state.history.length;
  const all = Object.values(counts);
  const max = Math.max(0, ...all);
  const min = total > 0 ? Math.min(...all) : 0;
  const most = Object.entries(counts).filter(([n, c]) => c === max && c > 0).map(([n]) => n).join(', ') || '—';
  const least = total > 0 ? Object.entries(counts).filter(([n, c]) => c === min).map(([n]) => n).slice(0, 3).join(', ') : '—';

  document.getElementById('statsBar').innerHTML = `
    <div class="stat-cell">
      <div class="stat-label">TOTAL ROUNDS</div>
      <div class="stat-value">${total}</div>
      <div class="stat-sub">확정된 회차</div>
    </div>
    <div class="stat-cell">
      <div class="stat-label">MAX PICKS</div>
      <div class="stat-value">${max}</div>
      <div class="stat-sub">${most.length > 30 ? most.slice(0, 30) + '...' : most}</div>
    </div>
    <div class="stat-cell">
      <div class="stat-label">MIN PICKS</div>
      <div class="stat-value">${min}</div>
      <div class="stat-sub">${least.length > 30 ? least.slice(0, 30) + '...' : least}</div>
    </div>
    <div class="stat-cell">
      <div class="stat-label">TOTAL MEMBERS</div>
      <div class="stat-value">${MEMBERS.length}</div>
      <div class="stat-sub">실장·휴가자 제외</div>
    </div>
  `;

  const grid = document.getElementById('membersGrid');
  grid.innerHTML = GROUPS.map(g => `
    <div class="member-col">
      <h3>${GROUP_LABEL[g]}</h3>
      ${TIERS.map(t => {
        const tm = MEMBERS.filter(m => m.group === g && m.tier === t);
        if (tm.length === 0) return '';
        return `
          <div class="tier-section">
            <div class="tier-label">${t} · ${TIER_LABEL[t]}</div>
            ${tm.map(m => `
              <div class="member-chip ${LEADERS.has(m.name) ? 'is-leader' : ''} ${m.name === SELF ? 'is-self' : ''} ${counts[m.name] > 0 ? 'has-count' : ''}">
                <span class="mc-name">${m.name}</span>
                <span class="mc-count">${counts[m.name]}회</span>
              </div>
            `).join('')}
          </div>
        `;
      }).join('')}
    </div>
  `).join('');
}

// =============================================================
// 컨페티
// =============================================================
const canvas = document.getElementById('confetti');
const ctx = canvas.getContext('2d');
let confettiParts = [];

function resizeCanvas() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

const COLORS_MIX = ['#ff2e88', '#00e8ff', '#ffcb05', '#b026ff', '#00ff9d', '#ffffff'];
const COLORS_PEER = ['#ff5fa8', '#5eecc4', '#ffd84a', '#c084fc', '#6ed68e', '#ffffff'];

function runConfetti() {
  const palette = currentMode === 'similar' ? COLORS_PEER : COLORS_MIX;
  for (let i = 0; i < 130; i++) {
    confettiParts.push({
      x: window.innerWidth / 2 + (Math.random() - 0.5) * 280,
      y: window.innerHeight / 2 - 50,
      vx: (Math.random() - 0.5) * 16,
      vy: -Math.random() * 20 - 7,
      g: 0.42, size: Math.random() * 7 + 4,
      color: palette[Math.floor(Math.random() * palette.length)],
      rot: Math.random() * 360, vRot: (Math.random() - 0.5) * 14, life: 220
    });
  }
}

function tick() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  confettiParts = confettiParts.filter(p => p.life > 0 && p.y < canvas.height + 40);
  confettiParts.forEach(p => {
    p.vy += p.g; p.x += p.vx; p.y += p.vy; p.rot += p.vRot; p.life--;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot * Math.PI / 180);
    ctx.fillStyle = p.color;
    ctx.globalAlpha = Math.min(1, p.life / 80);
    ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.45);
    ctx.restore();
  });
  requestAnimationFrame(tick);
}
tick();

// =============================================================
// 토스트
// =============================================================
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('shown');
  setTimeout(() => t.classList.remove('shown'), 2400);
}

// =============================================================
// 탭 전환
// =============================================================
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tabName = btn.dataset.tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${tabName}`).classList.add('active');
    if (tabName === 'history') renderHistory();
    if (tabName === 'members') renderMembers();
  });
});

// =============================================================
// 초기화
// =============================================================
function init() {
  loadState();
  updateRoundInfo();
  renderTeamRows();
  renderHistory();
  renderMembers();

  document.getElementById('spinBtn').addEventListener('click', handleSpin);
  document.getElementById('confirmBtn').addEventListener('click', handleConfirm);
  document.getElementById('rerollBtn').addEventListener('click', handleReroll);

  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => setMode(btn.dataset.mode));
  });

  // 이력 회차 삭제 (동적 렌더되므로 컨테이너에 이벤트 위임)
  document.getElementById('historyContent').addEventListener('click', (e) => {
    const btn = e.target.closest('.hc-delete');
    if (btn) deleteRound(parseInt(btn.dataset.idx, 10));
  });
}

init();
