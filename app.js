// =============================================================
// DX혁신실 회식 추첨 시스템 — 앱 로직
//
// 의존성: data.js (먼저 로드되어야 함)
// =============================================================

const STORAGE_KEY = 'dx_dinner_lottery_v2';

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
      teams.push({ teamLabel: `${i + 1}팀`, members: team });
    } else {
      teams.push({ teamLabel: `${i + 1}팀`, members: [] });
    }
  }
  return { mode: 'different', teams };
}

function drawDifferentTeam(usedNames, cooldown) {
  // 인원 적은 그룹부터 처리: 정보보호처럼 빠듯한 그룹이 자기 슬롯을 먼저 차지하도록.
  // 그러면 TF처럼 여유 많은 그룹은 마지막에 남은 티어로 채워져서, 보충은 정말 부족할 때만 발생.
  const groupsOrdered = [...GROUPS].sort((a, b) => {
    const ca = MEMBERS.filter(m => m.group === a && !cooldown.has(m.name) && !usedNames.has(m.name)).length;
    const cb = MEMBERS.filter(m => m.group === b && !cooldown.has(m.name) && !usedNames.has(m.name)).length;
    return ca - cb;
  });
  return backtrackDifferent(groupsOrdered, 0, [], new Set(), usedNames, cooldown);
}

// 백트래킹: 4그룹 × 4티어 조합을 안정적으로 찾기
function backtrackDifferent(groups, idx, team, usedTiers, usedNames, cooldown) {
  if (idx === groups.length) return [...team];

  const targetGroup = groups[idx];

  // 1차: 해당 그룹에서 후보
  const primary = MEMBERS.filter(m =>
    m.group === targetGroup &&
    !usedTiers.has(m.tier) &&
    !usedNames.has(m.name) &&
    !cooldown.has(m.name) &&
    !team.some(t => t.name === m.name)
  );

  const tried = [...shuffle(primary).map(c => ({ cand: c, sub: null }))];

  // 2차: 보충 (다른 그룹, 인원 많은 그룹 우선)
  if (primary.length === 0) {
    const others = GROUPS.filter(g => g !== targetGroup)
      .map(g => ({
        g,
        cs: MEMBERS.filter(m =>
          m.group === g &&
          !usedTiers.has(m.tier) &&
          !usedNames.has(m.name) &&
          !cooldown.has(m.name) &&
          !team.some(t => t.name === m.name)
        )
      }))
      .filter(p => p.cs.length > 0)
      .sort((a, b) => b.cs.length - a.cs.length);

    for (const p of others) shuffle(p.cs).forEach(c => tried.push({ cand: c, sub: targetGroup }));
  }

  for (const { cand, sub } of tried) {
    team.push({ ...cand, slotGroup: targetGroup, substituteFor: sub });
    usedTiers.add(cand.tier);
    const res = backtrackDifferent(groups, idx + 1, team, usedTiers, usedNames, cooldown);
    if (res) return res;
    team.pop();
    usedTiers.delete(cand.tier);
  }
  return null;
}

// ----- PEER 모드 (상/중/하 묶음에서 1팀씩) -----
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
  const team = [];
  for (const targetGroup of GROUPS) {
    const primary = MEMBERS.filter(m =>
      m.group === targetGroup &&
      pool.tiers.includes(m.tier) &&
      !usedNames.has(m.name) &&
      !cooldown.has(m.name) &&
      !team.some(t => t.name === m.name)
    );

    if (primary.length > 0) {
      const pick = randomChoice(primary);
      team.push({ ...pick, slotGroup: targetGroup, substituteFor: null });
    } else {
      // 보충: 다른 그룹, 같은 풀, 인원 많은 그룹 우선
      const others = GROUPS.filter(g => g !== targetGroup)
        .map(g => ({
          g,
          cs: MEMBERS.filter(m =>
            m.group === g &&
            pool.tiers.includes(m.tier) &&
            !usedNames.has(m.name) &&
            !cooldown.has(m.name) &&
            !team.some(t => t.name === m.name)
          )
        }))
        .filter(p => p.cs.length > 0)
        .sort((a, b) => b.cs.length - a.cs.length);

      if (others.length > 0) {
        const pick = randomChoice(others[0].cs);
        team.push({ ...pick, slotGroup: targetGroup, substituteFor: targetGroup });
      }
    }
  }
  return team;
}

// =============================================================
// 슬롯머신 UI
// =============================================================
const STRIP_LEN = 30;
const TARGET_INDEX = 20;

function getItemHeight() { return window.innerWidth <= 760 ? 32 : 40; }
function getFinalY() { const h = getItemHeight(); return -(TARGET_INDEX * h) + h; }

function renderTeamRows() {
  const container = document.getElementById('teamRows');
  const labels = currentMode === 'similar'
    ? POOLS.map((p, i) => ({ num: i + 1, label: p.name + '팀' }))
    : [1, 2, 3].map(i => ({ num: i, label: `${i}팀` }));

  container.innerHTML = labels.map((lbl, rowIdx) => `
    <div class="team-row">
      <div class="team-label">
        <div class="tl-num">${lbl.num}</div>
        <div class="tl-name">${lbl.label}</div>
      </div>
      <div class="team-reels">
        ${GROUPS.map((g, colIdx) => `
          <div class="reel-wrap" data-row="${rowIdx}" data-col="${colIdx}" data-slot-group="${g}">
            <div class="reel-label">${GROUP_LABEL[g]}</div>
            <div class="sub-arrow">↓ 보충</div>
            <div class="drum" data-row="${rowIdx}" data-col="${colIdx}">
              <div class="strip" data-row="${rowIdx}" data-col="${colIdx}"></div>
              <div class="indicator"></div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');

  document.querySelectorAll('.strip').forEach(strip => {
    const col = parseInt(strip.dataset.col);
    const group = GROUPS[col];
    const groupMembers = MEMBERS.filter(m => m.group === group);
    strip.innerHTML = '';
    for (let i = 0; i < STRIP_LEN; i++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.textContent = groupMembers[i % groupMembers.length].name;
      strip.appendChild(cell);
    }
  });
}

function buildStripWithChosen(stripEl, member) {
  const groupMembers = MEMBERS.filter(m => m.group === member.group);
  stripEl.innerHTML = '';
  for (let i = 0; i < STRIP_LEN; i++) {
    const cell = document.createElement('div');
    if (i === TARGET_INDEX) {
      cell.className = 'cell is-target';
      cell.textContent = member.name;
    } else {
      cell.className = 'cell';
      cell.textContent = groupMembers[Math.floor(Math.random() * groupMembers.length)].name;
    }
    stripEl.appendChild(cell);
  }
}

async function animateDraw(result) {
  const teams = result.teams;
  const baseDelay = 200;
  const rowDelay = 600;
  const spinDuration = 1800;
  const finalY = getFinalY();

  document.querySelectorAll('.drum').forEach(d => d.classList.remove('locked', 'substitute'));
  document.querySelectorAll('.reel-wrap').forEach(w => {
    w.classList.remove('is-substitute');
    const label = w.querySelector('.reel-label');
    const slotGroup = w.dataset.slotGroup;
    if (label && slotGroup) label.textContent = GROUP_LABEL[slotGroup];
  });

  const promises = [];

  for (let rowIdx = 0; rowIdx < teams.length; rowIdx++) {
    const team = teams[rowIdx];
    for (let colIdx = 0; colIdx < 4; colIdx++) {
      const member = team.members[colIdx];
      if (!member) continue;

      const strip = document.querySelector(`.strip[data-row="${rowIdx}"][data-col="${colIdx}"]`);
      const drum = document.querySelector(`.drum[data-row="${rowIdx}"][data-col="${colIdx}"]`);
      const reelWrap = document.querySelector(`.reel-wrap[data-row="${rowIdx}"][data-col="${colIdx}"]`);
      if (!strip || !drum) continue;

      buildStripWithChosen(strip, member);

      const totalDelay = rowIdx * rowDelay + colIdx * baseDelay;
      strip.style.transition = 'none';
      strip.style.transform = 'translateY(0)';

      promises.push(new Promise(resolve => {
        setTimeout(() => {
          void strip.offsetWidth;
          requestAnimationFrame(() => {
            strip.style.transition = `transform ${spinDuration}ms cubic-bezier(0.16, 0.65, 0.2, 1)`;
            strip.style.transform = `translateY(${finalY}px)`;
          });

          setTimeout(() => {
            if (member.substituteFor) {
              drum.classList.add('substitute');
              if (reelWrap) {
                reelWrap.classList.add('is-substitute');
                const label = reelWrap.querySelector('.reel-label');
                // "원래 슬롯그룹 → 실제 멤버그룹"으로 라벨 갱신해서 조직 바뀜이 한눈에 보이게
                if (label) label.textContent = `${GROUP_LABEL[member.substituteFor]} → ${GROUP_LABEL[member.group]}`;
              }
            } else {
              drum.classList.add('locked');
            }
            flashScreen(0.12);
            lockBurst(drum, member.substituteFor ? '#b026ff' : '#ffcb05');
            resolve();
          }, spinDuration);
        }, totalDelay);
      }));
    }
  }

  await Promise.all(promises);
}

function flashScreen(intensity = 0.15) {
  const flash = document.createElement('div');
  flash.style.cssText = `position:fixed;inset:0;background:rgba(255,255,255,${intensity});pointer-events:none;z-index:60;mix-blend-mode:screen;`;
  document.body.appendChild(flash);
  flash.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: 'ease-out' }).onfinish = () => flash.remove();
}

function lockBurst(drum, color) {
  const rect = drum.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  for (let i = 0; i < 10; i++) {
    confettiParts.push({
      x: cx, y: cy,
      vx: (Math.random() - 0.5) * 8,
      vy: (Math.random() - 0.5) * 8 - 3,
      g: 0.32, size: Math.random() * 3 + 2,
      color, rot: Math.random() * 360, vRot: (Math.random() - 0.5) * 12, life: 50
    });
  }
}

// =============================================================
// 결과 렌더링
// =============================================================
function renderResults(result) {
  const container = document.getElementById('resultsTeams');
  container.innerHTML = result.teams.map((team, idx) => `
    <div class="result-team">
      <div class="result-team-header">
        <div class="result-team-num">${idx + 1}팀</div>
        <div class="result-team-label">${team.teamLabel || ''}${team.poolName ? ' · ' + getPoolDescription(team.poolName) : ''}</div>
      </div>
      <div class="result-members">
        ${team.members.map(m => m ? `
          <div class="result-member ${m.substituteFor ? 'substitute' : ''}" data-name="${m.name}">
            ${m.substituteFor ? `<div class="rm-sub-badge">${m.substituteFor} 보충</div>` : ''}
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
    '하위': 'T6 · 사원+대리+주임'
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
  state.pendingResult = result;

  await animateDraw(result);

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
  const sorted = [...state.history].reverse();
  container.innerHTML = `
    <div class="history-list">
      ${sorted.map(round => `
        <div class="history-card">
          <div class="history-card-header">
            <div class="history-card-meta">
              <div class="hc-round">#${round.roundNum}</div>
              <div class="hc-mode ${round.mode}">${round.mode === 'different' ? 'MIX' : 'PEER'}</div>
            </div>
            <div class="hc-date">${round.date}</div>
          </div>
          <div class="history-card-summary">
            ${round.teams.map((team, idx) => `
              <div class="hcs-team">
                <div class="hcs-team-label">${idx + 1}팀${team.poolName ? ' · ' + team.poolName : ''}</div>
                <div class="hcs-names">
                  ${team.members.map(m => m
                    ? (m.substituteFor
                        ? `<span class="sub-name">${m.name}(${m.group})</span>`
                        : `${m.name}(${m.group})`)
                    : '—').join(' · ')}
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `).join('')}
    </div>
  `;
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
}

init();
