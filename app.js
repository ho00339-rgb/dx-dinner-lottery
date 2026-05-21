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

// =============================================================
// "인원 조정" 가상 슬롯
// 정보보호(4명)는 풀이 너무 작아서, 가상 슬롯 2개를 추가해
// 33% 확률로 조정 이벤트가 터지면 TF에서 재추첨함
// =============================================================
const REBALANCE_SLOT_COUNT = 2;
const REBALANCE_TARGET_GROUP = 'TF';
const REBALANCE_SLOT_MARK = '__REBALANCE__';

function isRebalanceSlot(m) { return m && m.name === REBALANCE_SLOT_MARK; }

// 정보보호 슬롯용 후보 풀: 실제 멤버 + 가상 조정 슬롯
function getBalancedCandidates(realMembers) {
  const rebalanceSlots = Array.from({ length: REBALANCE_SLOT_COUNT }, () => ({
    name: REBALANCE_SLOT_MARK,
    group: '정보보호',
    tier: '__REBALANCE__',
    title: '',
    part: '',
    isRebalance: true,
  }));
  return [...realMembers, ...rebalanceSlots];
}

// "인원 조정" 슬롯이 뽑힌 경우, TF에서 사용 가능한 멤버 한 명을 골라 대체
function resolveRebalanceSlot(usedNames, cooldown, usedTiers) {
  const tfCandidates = MEMBERS.filter(m =>
    m.group === REBALANCE_TARGET_GROUP &&
    !usedNames.has(m.name) &&
    !cooldown.has(m.name) &&
    (!usedTiers || !usedTiers.has(m.tier))
  );
  if (tfCandidates.length === 0) {
    // TF에도 없으면 쿨다운 무시하고 시도
    const relaxed = MEMBERS.filter(m =>
      m.group === REBALANCE_TARGET_GROUP &&
      !usedNames.has(m.name) &&
      (!usedTiers || !usedTiers.has(m.tier))
    );
    return relaxed.length > 0 ? randomChoice(relaxed) : null;
  }
  return randomChoice(tfCandidates);
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
      // 백트래킹 처리 순서가 아닌 GROUPS 표시 순서(TF→기획→운영→정보보호)로 재정렬
      const orderedTeam = GROUPS.map(g => team.find(m => m.slotGroup === g)).filter(Boolean);
      teams.push({ teamLabel: `${i + 1}팀`, members: orderedTeam });
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
  const realPrimary = MEMBERS.filter(m =>
    m.group === targetGroup &&
    !usedTiers.has(m.tier) &&
    !usedNames.has(m.name) &&
    !cooldown.has(m.name) &&
    !team.some(t => t.name === m.name)
  );

  // 정보보호 슬롯이면 "인원 조정" 가상 슬롯도 후보에 추가 (가중치로 33% 확률)
  const primary = targetGroup === '정보보호'
    ? getBalancedCandidates(realPrimary)
    : realPrimary;

  const tried = [...shuffle(primary).map(c => ({ cand: c, sub: null }))];

  // 2차: 보충 (다른 그룹, 인원 많은 그룹 우선) — 실제 멤버가 0명일 때만
  if (realPrimary.length === 0 && targetGroup !== '정보보호') {
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
    // 조정 슬롯이 뽑힌 경우: TF에서 재추첨
    if (cand.isRebalance) {
      const tfPick = resolveRebalanceSlot(usedNames, cooldown, usedTiers);
      if (!tfPick) continue;
      team.push({
        ...tfPick,
        slotGroup: targetGroup,
        substituteFor: targetGroup,
        rebalanced: true,
      });
      usedTiers.add(tfPick.tier);
      const res = backtrackDifferent(groups, idx + 1, team, usedTiers, usedNames, cooldown);
      if (res) return res;
      team.pop();
      usedTiers.delete(tfPick.tier);
      continue;
    }

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

// Web Animations API로 멀티-페이즈 스핀.
// translateY는 항상 ↑(음수 방향)로만 단조감소. 시각 위치는 stripCycle 단위로 반복되므로
// finalY 대신 finalY - N*stripCycle 로 끝내도 같은 셀이 보임.
//
// 시퀀스 (총 totalDuration):
//   0%   : translateY 0
//   55%  : 거의 끝 지점(N-1바퀴 더 위) — 여기까지 빠르게 휘몰아침
//   100% : 진짜 끝 지점(시각적으로 타깃)            — 마지막 1바퀴를 천천히 감속
function spinStrip(strip, finalY, totalDuration) {
  const stripCycle = STRIP_LEN * getItemHeight();
  const totalLaps = 7;  // 전체 회전 바퀴 수

  // 끝 위치를 finalY에서 (totalLaps-1)바퀴 더 위로 잡음 — 시각 위치는 동일
  const endY = finalY - (totalLaps - 1) * stripCycle;
  // 빠른 구간 끝: 마지막 1바퀴만 남긴 지점
  const fastEndY = endY + stripCycle;

  return strip.animate(
    [
      { transform: 'translateY(0)', offset: 0, easing: 'cubic-bezier(0.25, 0, 0.35, 1)' },
      { transform: `translateY(${fastEndY}px)`, offset: 0.55, easing: 'cubic-bezier(0.1, 0.4, 0.25, 1)' },
      { transform: `translateY(${endY}px)`, offset: 1 },
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
        <div class="leader-cursor" data-row="${rowIdx}"></div>
      </div>
    </div>
  `).join('');

  document.querySelectorAll('.strip').forEach(strip => {
    const col = parseInt(strip.dataset.col);
    const group = GROUPS[col];
    const stripNames = getStripNamesForGroup(group);
    strip.innerHTML = '';
    for (let i = 0; i < STRIP_LEN; i++) {
      const cell = document.createElement('div');
      const name = stripNames[i % stripNames.length];
      cell.className = name === REBALANCE_SLOT_MARK ? 'cell is-rebalance' : 'cell';
      cell.textContent = name === REBALANCE_SLOT_MARK ? '⚡인원조정' : name;
      strip.appendChild(cell);
    }
  });
}

// 슬롯 스트립에 표시될 이름 목록 (정보보호는 인원조정 슬롯도 섞음)
function getStripNamesForGroup(group) {
  const realNames = MEMBERS.filter(m => m.group === group).map(m => m.name);
  if (group !== '정보보호') return realNames;
  const names = [...realNames];
  for (let i = 0; i < REBALANCE_SLOT_COUNT; i++) names.push(REBALANCE_SLOT_MARK);
  return shuffle(names);
}

// 일반 회전용 스트립: 타깃 인덱스에 member.name이 박힘
function buildStripWithChosen(stripEl, member) {
  const stripNames = getStripNamesForGroup(member.group);
  stripEl.innerHTML = '';
  for (let i = 0; i < STRIP_LEN; i++) {
    const cell = document.createElement('div');
    if (i === TARGET_INDEX) {
      cell.className = 'cell is-target';
      cell.textContent = member.name;
    } else {
      const name = stripNames[Math.floor(Math.random() * stripNames.length)];
      cell.className = name === REBALANCE_SLOT_MARK ? 'cell is-rebalance' : 'cell';
      cell.textContent = name === REBALANCE_SLOT_MARK ? '⚡인원조정' : name;
    }
    stripEl.appendChild(cell);
  }
}

// 1차 회전용: 정보보호 풀에서 "인원조정" 셀에 멈춤
function buildStripStoppingAtRebalance(stripEl) {
  const stripNames = getStripNamesForGroup('정보보호');
  stripEl.innerHTML = '';
  for (let i = 0; i < STRIP_LEN; i++) {
    const cell = document.createElement('div');
    if (i === TARGET_INDEX) {
      cell.className = 'cell is-target is-rebalance';
      cell.textContent = '⚡인원조정';
    } else {
      const name = stripNames[Math.floor(Math.random() * stripNames.length)];
      cell.className = name === REBALANCE_SLOT_MARK ? 'cell is-rebalance' : 'cell';
      cell.textContent = name === REBALANCE_SLOT_MARK ? '⚡인원조정' : name;
    }
    stripEl.appendChild(cell);
  }
}

// 2차 회전용: TF 풀에서 최종 멤버에 멈춤
function buildStripWithTfTarget(stripEl, member) {
  const stripNames = MEMBERS.filter(m => m.group === 'TF').map(m => m.name);
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
    'locked', 'substitute', 'rebalanced', 'spinning', 'spinning-tf',
    'rebalance-pending', 'leader-highlight', 'leader-sweep'
  ));
  document.querySelectorAll('.reel-wrap').forEach(w => {
    w.classList.remove('is-substitute', 'is-rebalanced');
    const label = w.querySelector('.reel-label');
    const slotGroup = w.dataset.slotGroup;
    if (label && slotGroup) label.textContent = GROUP_LABEL[slotGroup];
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
    for (let colIdx = 0; colIdx < 4; colIdx++) {
      const member = team.members[colIdx];
      if (!member) continue;

      const strip = document.querySelector(`.strip[data-row="${rowIdx}"][data-col="${colIdx}"]`);
      const drum = document.querySelector(`.drum[data-row="${rowIdx}"][data-col="${colIdx}"]`);
      const reelWrap = document.querySelector(`.reel-wrap[data-row="${rowIdx}"][data-col="${colIdx}"]`);
      if (!strip || !drum) continue;

      // 1차 스트립: rebalanced면 정보보호 풀에서 "인원조정"으로 멈춤. 그 외엔 일반.
      if (member.rebalanced) buildStripStoppingAtRebalance(strip);
      else buildStripWithChosen(strip, member);

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

            if (member.rebalanced) {
              // === 1차 정지: 인원조정 셀에서 멈춤 → 폭발 → 2차 회전 ===
              drum.classList.add('rebalance-pending');
              if (reelWrap) {
                reelWrap.classList.add('is-rebalanced');
                const label = reelWrap.querySelector('.reel-label');
                if (label) label.textContent = `⚡ 인원조정 발동!`;
              }
              flashScreen(0.32, '#b026ff');
              rebalanceBurst(drum);
              spawnRebalanceText(drum);
              tickShake(drum, 1.2);

              // 약간 뜸을 들였다가 2차 회전 시작 (TF 풀에서 멈춤)
              setTimeout(() => {
                drum.classList.remove('rebalance-pending');
                drum.classList.add('spinning', 'spinning-tf');

                // 2차 스트립 구성 + 시작 위치로 리셋
                buildStripWithTfTarget(strip, member);
                strip.style.transition = 'none';
                strip.style.transform = 'translateY(0)';
                void strip.offsetWidth;

                spinStrip(strip, finalY, spinDuration);

                setTimeout(() => { tickShake(drum, 0.25); }, spinDuration * 0.58);
                setTimeout(() => { tickShake(drum, 0.4); }, spinDuration * 0.85);

                // 2차 정지
                setTimeout(() => {
                  drum.classList.remove('spinning', 'spinning-tf');
                  drum.classList.add('rebalanced');
                  if (reelWrap) {
                    const label = reelWrap.querySelector('.reel-label');
                    if (label) label.textContent = `⚡ 인원조정 → ${GROUP_LABEL[member.group]}`;
                  }
                  flashScreen(0.22, '#ff2e88');
                  lockBurst(drum, '#b026ff', 22);
                  lockBurst(drum, '#ff2e88', 14);
                  tickShake(drum, 0.9);
                  resolve();
                }, spinDuration);
              }, 850);
            } else if (member.substituteFor) {
              drum.classList.add('substitute');
              if (reelWrap) {
                reelWrap.classList.add('is-substitute');
                const label = reelWrap.querySelector('.reel-label');
                if (label) label.textContent = `${GROUP_LABEL[member.substituteFor]} → ${GROUP_LABEL[member.group]}`;
              }
              flashScreen(0.18, '#b026ff');
              lockBurst(drum, '#b026ff', 20);
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

// 인원조정 이벤트용 — 큰 보라색 폭발 (링 + 파티클)
function rebalanceBurst(drum) {
  const rect = drum.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  // 메인 파티클
  for (let i = 0; i < 40; i++) {
    const angle = (Math.PI * 2 * i) / 40;
    const speed = 6 + Math.random() * 8;
    confettiParts.push({
      x: cx, y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      g: 0.18, size: Math.random() * 5 + 3,
      color: ['#b026ff', '#ff2e88', '#ffcb05', '#00e8ff'][Math.floor(Math.random() * 4)],
      rot: Math.random() * 360, vRot: (Math.random() - 0.5) * 20, life: 100,
    });
  }
  // 확장 링 (DOM 엘리먼트)
  const ring = document.createElement('div');
  ring.style.cssText = `position:fixed;left:${cx}px;top:${cy}px;width:20px;height:20px;border-radius:50%;border:3px solid #b026ff;box-shadow:0 0 30px #b026ff,inset 0 0 20px #b026ff;transform:translate(-50%,-50%);pointer-events:none;z-index:55;`;
  document.body.appendChild(ring);
  ring.animate(
    [
      { width: '20px', height: '20px', opacity: 1, borderWidth: '3px' },
      { width: '400px', height: '400px', opacity: 0, borderWidth: '1px' },
    ],
    { duration: 700, easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)' }
  ).onfinish = () => ring.remove();
}

// "REROLL!" 텍스트가 드럼 위로 튀어오르며 페이드
function spawnRebalanceText(drum) {
  const rect = drum.getBoundingClientRect();
  const txt = document.createElement('div');
  txt.textContent = '⚡ REROLL!';
  txt.style.cssText = `
    position:fixed;left:${rect.left + rect.width / 2}px;top:${rect.top + rect.height / 2}px;
    transform:translate(-50%,-50%);pointer-events:none;z-index:70;
    font-family:'Black Han Sans',sans-serif;font-size:32px;color:#fff;
    text-shadow:0 0 16px #b026ff,0 0 32px #b026ff,0 0 48px #ff2e88;
    letter-spacing:0.05em;white-space:nowrap;
  `;
  document.body.appendChild(txt);
  txt.animate(
    [
      { transform: 'translate(-50%,-50%) scale(0.4)', opacity: 0 },
      { transform: 'translate(-50%,-180%) scale(1.4)', opacity: 1, offset: 0.3 },
      { transform: 'translate(-50%,-260%) scale(1.1)', opacity: 0 },
    ],
    { duration: 1100, easing: 'cubic-bezier(0.18, 0.89, 0.32, 1.05)' }
  ).onfinish = () => txt.remove();
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
  container.innerHTML = result.teams.map((team, idx) => `
    <div class="result-team">
      <div class="result-team-header">
        <div class="result-team-num">${idx + 1}팀</div>
        <div class="result-team-label">${team.teamLabel || ''}${team.poolName ? ' · ' + getPoolDescription(team.poolName) : ''}</div>
        ${leaders[idx] ? `<div class="result-team-leader">♛ 조장 · ${leaders[idx]}</div>` : ''}
      </div>
      <div class="result-members">
        ${team.members.map(m => m ? `
          <div class="result-member ${m.rebalanced ? 'rebalanced' : (m.substituteFor ? 'substitute' : '')} ${leaders[idx] === m.name ? 'is-leader' : ''}" data-name="${m.name}">
            ${leaders[idx] === m.name ? `<div class="rm-leader-crown">♛</div>` : ''}
            ${m.rebalanced
              ? `<div class="rm-sub-badge rebalance">⚡ 인원조정</div>`
              : (m.substituteFor ? `<div class="rm-sub-badge">${m.substituteFor} 보충</div>` : '')}
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
            ${round.teams.map((team, idx) => {
              const leaderName = (round.leaders || [])[idx];
              return `
              <div class="hcs-team">
                <div class="hcs-team-label">${idx + 1}팀${team.poolName ? ' · ' + team.poolName : ''}${leaderName ? ` · ♛ ${leaderName}` : ''}</div>
                <div class="hcs-names">
                  ${team.members.map(m => m
                    ? (m.name === leaderName
                        ? `<span class="leader-name">♛${m.name}(${m.group})</span>`
                        : (m.substituteFor
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
