// =============================================================
// DX혁신실 회식 추첨 시스템 — 앱 로직
//
// 의존성: data.js (먼저 로드되어야 함)
// =============================================================

const STORAGE_KEY = 'dx_dinner_lottery_v3';

let state = {
  history: [],
  pendingResult: null,
  deletedSeedKeys: [], // 공유 시드에서 로컬 삭제한 회차 키 (재병합 방지)
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      history: state.history,
      deletedSeedKeys: state.deletedSeedKeys || [],
    }));
  } catch (e) { console.error(e); }
}

// =============================================================
// 공유 이력 시드 병합 (history-seed.js)
//
// localStorage는 브라우저별 저장이라 URL을 공유해도 이력은 공유되지 않음.
// 확정 이력을 history-seed.js로 내보내 저장소에 push하면(이력 탭 버튼),
// 모든 접속자가 로드 시 시드를 자기 로컬 이력과 병합해서 같은 이력을 봄.
//   - 같은 회차 판별 키: 시즌 회차는 (시즌·월·모드), 그 외에는 확정 시 부여된 id
//   - 키가 겹치면 로컬 버전 우선 (관리자가 다시 뽑은 회차 보호)
//   - 로컬에서 삭제한 시드 회차는 deletedSeedKeys(묘비)로 복원 차단
// =============================================================
function seedRounds() {
  return (typeof HISTORY_SEED !== 'undefined' && Array.isArray(HISTORY_SEED)) ? HISTORY_SEED : [];
}

function genRoundId() {
  return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function roundKey(r) {
  if (r.season && r.seasonMonth) return `S|${r.season}|${r.seasonMonth}|${r.mode}`;
  if (r.id) return `I|${r.id}`;
  const names = [];
  (r.teams || []).forEach(t => t.members.forEach(m => { if (m) names.push(m.name); }));
  return `C|${r.mode}|${r.date}|${names.sort().join(',')}`;
}

// 내용 기반 동일성 키 — id가 다르게 부여된 같은 회차(예: id 도입 전 로컬 이력 vs
// 스크린샷 복원 시드)를 병합 시 중복으로 잡기 위한 보조 키
function roundContentKey(r) {
  const teams = (r.teams || [])
    .map(t => t.members.filter(Boolean).map(m => m.name).sort().join('/'))
    .sort()
    .join('||');
  return `${r.mode}|${r.date}|${teams}`;
}

// id 없는 기존 레코드에 id 부여 (시드 병합의 안정적 동일성 판별용)
function ensureRoundIds() {
  let changed = false;
  state.history.forEach(r => {
    if (!r.id) { r.id = genRoundId(); changed = true; }
  });
  return changed;
}

function mergeSeedHistory() {
  const seed = seedRounds();
  if (!seed.length) return false;

  const tombstones = new Set(state.deletedSeedKeys || []);
  const localByKey = new Map();
  state.history.forEach(r => localByKey.set(roundKey(r), r));

  const merged = [];
  const taken = new Set();
  for (const sr of seed) {
    const k = roundKey(sr);
    const local = localByKey.get(k);
    if (tombstones.has(k)) {
      // 로컬에서 삭제했던 회차 — 다시 뽑은 로컬 버전이 있으면 그것만 유지
      if (local) { merged.push(local); taken.add(k); }
      continue;
    }
    merged.push(local || JSON.parse(JSON.stringify(sr)));
    taken.add(k);
  }
  // 아직 시드에 없는 로컬 회차(미공유 최신분)는 뒤에 그대로 유지.
  // 단, 시드와 내용이 같은 회차(id만 다른 동일 회차)와
  // 시드가 대체했다고 선언한 옛 변형(HISTORY_SEED_SUPERSEDED)은 중복이므로 제외.
  const seedContents = new Set(
    seed.filter(sr => !tombstones.has(roundKey(sr))).map(roundContentKey)
  );
  const superseded = (typeof HISTORY_SEED_SUPERSEDED !== 'undefined' && Array.isArray(HISTORY_SEED_SUPERSEDED))
    ? new Set(HISTORY_SEED_SUPERSEDED) : new Set();
  for (const r of state.history) {
    const ck = roundContentKey(r);
    if (!taken.has(roundKey(r)) && !seedContents.has(ck) && !superseded.has(ck)) merged.push(r);
  }
  merged.forEach((r, i) => { r.roundNum = i + 1; });

  const changed = JSON.stringify(merged) !== JSON.stringify(state.history);
  state.history = merged;
  return changed;
}

// 현재 이력을 history-seed.js 파일로 다운로드 — 저장소에 덮어쓰고 push하면 공유 완료
function exportSeedFile() {
  if (state.history.length === 0) {
    showToast('내보낼 이력이 없습니다');
    return;
  }
  const content =
    '// =============================================================\n' +
    '// 공유 이력 시드 — 직접 수정하지 마세요 (자동 생성 파일)\n' +
    '// 이력 탭의 "공유 파일 내보내기"로 생성됨.\n' +
    '// 저장소의 history-seed.js를 이 파일로 덮어쓰고 push 하면\n' +
    '// 모든 접속자가 같은 이력을 봅니다.\n' +
    '// =============================================================\n' +
    'const HISTORY_SEED = ' + JSON.stringify(state.history, null, 2) + ';\n' +
    '\n// 대체된 옛 변형의 내용 키 — 옛 로컬 이력과의 중복 병합 방지\n' +
    'const HISTORY_SEED_SUPERSEDED = ' + JSON.stringify(
      (typeof HISTORY_SEED_SUPERSEDED !== 'undefined' && Array.isArray(HISTORY_SEED_SUPERSEDED))
        ? HISTORY_SEED_SUPERSEDED : [],
      null, 2
    ) + ';\n';
  const blob = new Blob([content], { type: 'text/javascript' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'history-seed.js';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast('history-seed.js 다운로드됨 — 저장소에 덮어쓰고 push 하세요');
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
// 연간 플랜(시즌) 엔진 — 2026 하반기 균등화
//
// 수학적 구조 (시뮬레이션·전수조사로 검증됨):
//   - 월 24자리 / 25명 + 월간 중복 금지 → 매월 정확히 1명 휴식
//   - 비T2는 쿼터 6 = 만근 강제 → 휴식자는 항상 "아직 휴식 안 한 T2"
//   - PEER 팀이 밴드별 정확히 4명 → MIX = 상위 7 / 중위 4 / T6 1로 유일 강제
//   - PEER 멤버십 = 그 달 MIX의 여집합 (컬럼은 표시용 배정만)
//   - 시즌 중 하드 쿨다운은 수학적으로 모순 → 소프트 가중치(회피 선호)만 적용
// 회차 페어링은 roundNum이 아닌 저장된 seasonMonth 필드 기준 (삭제에 안전).
// =============================================================

function quotaOf(m) { return m.tier === SEASON.restTier ? SEASON.months - 1 : SEASON.months; }
function bandOf(m) { return POOLS.findIndex(p => p.tiers.includes(m.tier)); }

function seasonRounds() { return state.history.filter(r => r.season === SEASON.id); }

// 시즌 성립 전제 검증 — 로스터 변경 등으로 깨지면 레거시 추첨으로 폴백
function seasonPlanValid() {
  const restCount = MEMBERS.filter(m => m.tier === SEASON.restTier).length;
  if (restCount !== SEASON.months) return false;

  const quotaSum = MEMBERS.reduce((s, m) => s + quotaOf(m), 0);
  if (quotaSum !== SEASON.months * TEAM_SIZE * 6) return false; // 월 2회차 × 3팀 × 4명

  const bandSizes = POOLS.map(() => 0);
  for (const m of MEMBERS) {
    const b = bandOf(m);
    if (b < 0) return false;
    bandSizes[b]++;
  }
  const restBand = POOLS.findIndex(p => p.tiers.includes(SEASON.restTier));
  // 밴드별 월간 MIX 선발 수 = 출석 − 4 ≥ 0, 합계 12
  let mixTotal = 0;
  for (let b = 0; b < bandSizes.length; b++) {
    const take = bandSizes[b] - (b === restBand ? 1 : 0) - TEAM_SIZE;
    if (take < 0) return false;
    mixTotal += take;
  }
  if (mixTotal !== TEAM_SIZE * 3) return false;

  // 시즌 이력의 이름·티어가 현재 로스터와 일치해야 함 (시즌 중 인사 변경 감지)
  const byName = {};
  MEMBERS.forEach(m => byName[m.name] = m);
  for (const r of seasonRounds()) {
    if (r.restedName && !byName[r.restedName]) return false;
    for (const t of r.teams) {
      for (const mm of t.members) {
        if (mm && (!byName[mm.name] || byName[mm.name].tier !== mm.tier)) return false;
      }
    }
  }
  return true;
}

// 해당 모드의 다음(가장 낮은 미완성) 시즌 월 — 1~months, 전부 완료면 null
function nextSeasonMonth(mode) {
  const rounds = seasonRounds();
  for (let k = 1; k <= SEASON.months; k++) {
    if (!rounds.some(r => r.mode === mode && r.seasonMonth === k)) return k;
  }
  return null;
}

function seasonActive() {
  return seasonPlanValid() &&
    (nextSeasonMonth('different') !== null || nextSeasonMonth('similar') !== null);
}

// 같은 시즌 월의 반대 모드 회차
function seasonPairRound(month, mode) {
  const other = mode === 'different' ? 'similar' : 'different';
  return seasonRounds().find(r => r.mode === other && r.seasonMonth === month) || null;
}

function seasonCountsMap() {
  const counts = {};
  MEMBERS.forEach(m => counts[m.name] = 0);
  seasonRounds().forEach(r => r.teams.forEach(t => t.members.forEach(mm => {
    if (mm && counts[mm.name] !== undefined) counts[mm.name]++;
  })));
  return counts;
}

function seasonModeCountsMap(mode) {
  const counts = {};
  MEMBERS.forEach(m => counts[m.name] = 0);
  seasonRounds().filter(r => r.mode === mode).forEach(r =>
    r.teams.forEach(t => t.members.forEach(mm => {
      if (mm && counts[mm.name] !== undefined) counts[mm.name]++;
    }))
  );
  return counts;
}

function seasonRestedSet() {
  return new Set(seasonRounds().map(r => r.restedName).filter(Boolean));
}

// 휴식자 선정: 오직 "아직 휴식 안 한 T2" 기준 (쿼터 필터를 쓰면 6월차에 데드락)
function pickSeasonRester() {
  const rested = seasonRestedSet();
  const cands = MEMBERS.filter(m => m.tier === SEASON.restTier && !rested.has(m.name));
  return cands.length ? randomChoice(cands).name : null;
}

// 이번 시즌 월 출석 가능자: 쿼터 미달 + 휴식자 아님 + 같은 달 기출석 아님
function seasonMonthAttendees(month, restedName) {
  const counts = seasonCountsMap();
  const attended = new Set();
  seasonRounds().filter(r => r.seasonMonth === month).forEach(r =>
    r.teams.forEach(t => t.members.forEach(mm => { if (mm) attended.add(mm.name); }))
  );
  return MEMBERS.filter(m =>
    counts[m.name] < quotaOf(m) &&
    m.name !== restedName &&
    !attended.has(m.name)
  );
}

// 직전(가장 높은 월) 같은 모드 시즌 회차 멤버 — 소프트 쿨다운용
function lastSeasonRoundMembers(mode) {
  const rounds = seasonRounds().filter(r => r.mode === mode)
    .sort((a, b) => a.seasonMonth - b.seasonMonth);
  if (rounds.length === 0) return new Set();
  const names = new Set();
  rounds[rounds.length - 1].teams.forEach(t => t.members.forEach(mm => { if (mm) names.add(mm.name); }));
  return names;
}

// 소프트 가중치: 낮을수록 우선. 같은 모드 노출 횟수 + 직전 회차 출석 페널티
function seasonSoftWeights(pool, mode) {
  const mc = seasonModeCountsMap(mode);
  const cd = lastSeasonRoundMembers(mode);
  const w = {};
  pool.forEach(m => { w[m.name] = mc[m.name] + (cd.has(m.name) ? 0.6 : 0); });
  return w;
}

// MIX 배치 백트래킹: 3팀 × 4컬럼, 팀 내 티어 전부 다름 + 컬럼 그룹 매칭.
// bandQuota 지정 시 선택과 배치를 결합 (밴드별 정확히 quota명 선발 —
// "선뽑고 후배치"는 61~63% 실패하므로 반드시 결합 백트래킹이어야 함).
// 주의: 이 탐색은 완전(complete)하므로 한 번 false면 재시작해도 false —
// maxRestarts는 사실상 1이면 충분하고, 노드 예산은 손상된 이력으로 인한
// 비정상 상태에서 브라우저가 멈추는 것을 막는 안전장치.
function arrangeMixSeason(pool, bandQuota, weights, maxRestarts) {
  // 슬롯 순서: 팀별로 빡빡한 컬럼부터 (정보보호PMO → 기획 → 운영 → 잔여)
  const colOrder = [COLUMNS[2], COLUMNS[0], COLUMNS[1], COLUMNS[3]];
  const slots = [];
  for (let t = 0; t < 3; t++) for (const col of colOrder) slots.push({ team: t, col });
  const NODE_BUDGET = 300000;

  for (let attempt = 0; attempt < (maxRestarts || 1); attempt++) {
    const used = new Set();
    const teamTiers = [new Set(), new Set(), new Set()];
    const bandLeft = bandQuota ? [...bandQuota] : null;
    const picked = [];
    let nodes = 0;

    // 가중치 + 지터로 후보 순서 결정 (시도마다 새 지터)
    const jitter = {};
    pool.forEach(m => {
      jitter[m.name] = (weights ? (weights[m.name] || 0) : 0) + Math.random() * 1.2;
    });

    const bt = (idx) => {
      if (++nodes > NODE_BUDGET) return false;
      if (idx === slots.length) return true;
      const { team, col } = slots[idx];
      const cands = pool.filter(m =>
        !used.has(m.name) &&
        !teamTiers[team].has(m.tier) &&
        (col.leftover || col.groups.includes(m.group)) &&
        (!bandLeft || bandLeft[bandOf(m)] > 0)
      ).sort((a, b) => jitter[a.name] - jitter[b.name]);

      for (const c of cands) {
        used.add(c.name);
        teamTiers[team].add(c.tier);
        if (bandLeft) bandLeft[bandOf(c)]--;
        picked.push({ ...c, team, slotCol: col.key });
        if (bt(idx + 1)) return true;
        picked.pop();
        if (bandLeft) bandLeft[bandOf(c)]++;
        teamTiers[team].delete(c.tier);
        used.delete(c.name);
      }
      return false;
    };

    if (bt(0)) {
      const teams = [[], [], []];
      picked.forEach(p => teams[p.team].push(p));
      return teams;
    }
    if (nodes > NODE_BUDGET) return null; // 예산 초과 — 재시작해도 동일하므로 즉시 중단
  }
  return null;
}

// 시즌 MIX 추첨
function drawMixSeason() {
  const month = nextSeasonMonth('different');
  if (!month) return { error: '연간 플랜의 MIX 6회차가 모두 완료되었습니다. PEER로 진행해주세요.' };

  const pair = seasonPairRound(month, 'different');
  const restedName = pair ? pair.restedName : pickSeasonRester();
  const attendees = seasonMonthAttendees(month, restedName);

  let bandQuota = null;
  if (pair) {
    // 같은 달 PEER가 이미 확정 → MIX 멤버십은 여집합 12명으로 강제
    if (attendees.length !== TEAM_SIZE * 3) {
      return { error: '시즌 이력이 일관되지 않습니다 (여집합 인원 오류). 이력 탭에서 해당 월을 확인해주세요.' };
    }
  } else {
    const bandAttending = POOLS.map(() => 0);
    attendees.forEach(m => bandAttending[bandOf(m)]++);
    bandQuota = bandAttending.map(n => n - TEAM_SIZE); // PEER 여집합이 정확히 4명씩 남도록
    if (bandQuota.some(q => q < 0)) {
      return { error: '시즌 이력이 일관되지 않습니다 (밴드 인원 부족). 이력 탭을 확인해주세요.' };
    }
  }

  const weights = seasonSoftWeights(attendees, 'different');
  const arranged = arrangeMixSeason(attendees, bandQuota, weights, 2);
  if (!arranged) return { error: '팀 배치에 실패했습니다. 다시 SPIN 해주세요.' };

  const teams = arranged.map((t, i) => ({
    teamLabel: `${i + 1}팀`,
    members: COLUMNS.map(c => t.find(mm => mm.slotCol === c.key)).filter(Boolean),
  }));
  return { mode: 'different', teams, season: SEASON.id, seasonMonth: month, restedName };
}

// PEER 표시용 컬럼 배정: 4명 ↔ 4컬럼, 그룹 불일치 최소 순열 (동률 시 랜덤)
function assignPeerColumns(members) {
  const perms = [];
  const build = (rest, acc) => {
    if (rest.length === 0) { perms.push(acc); return; }
    rest.forEach((v, i) => build(rest.slice(0, i).concat(rest.slice(i + 1)), [...acc, v]));
  };
  build([0, 1, 2, 3], []);

  let best = null, bestMis = Infinity;
  for (const p of shuffle(perms)) {
    let mis = 0;
    p.forEach((mi, ci) => {
      const col = COLUMNS[ci];
      if (!col.leftover && !col.groups.includes(members[mi].group)) mis++;
    });
    if (mis < bestMis) { bestMis = mis; best = p; }
  }
  return COLUMNS.map((col, ci) => {
    const m = members[best[ci]];
    const off = !col.leftover && !col.groups.includes(m.group);
    return off ? { ...m, slotCol: col.key, offColumn: true } : { ...m, slotCol: col.key };
  });
}

// PEER 먼저 뽑는 경우의 밴드 선발: 여집합 MIX가 배치 가능해야 함.
// 티어 카운트 제약(여집합 티어 ≤3)만으로는 72~77%에 그치므로
// 여집합 실배치 검사를 통과할 때까지 재선발 (전수조사 기준 해는 항상 존재).
function selectPeerBands(byBand, attendees) {
  const pcs = seasonModeCountsMap('similar');
  const cd = lastSeasonRoundMembers('similar');

  for (let attempt = 0; attempt < 150; attempt++) {
    const selected = [];
    let ok = true;
    for (let b = 0; b < POOLS.length; b++) {
      const band = byBand[b];
      const keys = {};
      band.forEach(m => {
        keys[m.name] = pcs[m.name] + (cd.has(m.name) ? 0.6 : 0) + Math.random() * 1.2;
      });
      const order = [...band].sort((a, b2) => keys[a.name] - keys[b2.name]);

      // 여집합 MIX의 티어별 ≤3 보장: 티어별 (출석수 − 3)명 최소 선발
      const tierCnt = {};
      band.forEach(m => { tierCnt[m.tier] = (tierCnt[m.tier] || 0) + 1; });
      const take = [];
      Object.keys(tierCnt).forEach(t => {
        const need = Math.max(0, tierCnt[t] - 3);
        order.filter(m => m.tier === t).slice(0, need).forEach(m => take.push(m));
      });
      for (const m of order) {
        if (take.length >= TEAM_SIZE) break;
        if (!take.includes(m)) take.push(m);
      }
      if (take.length !== TEAM_SIZE) { ok = false; break; }
      selected.push(take);
    }
    if (!ok) continue;

    const selNames = new Set(selected.flat().map(m => m.name));
    const complement = attendees.filter(m => !selNames.has(m.name));
    // 완전 탐색이므로 1회 검사로 충분 (재시작은 동일 결과만 재탐색)
    if (arrangeMixSeason(complement, null, null, 1)) return selected;
  }
  return null;
}

// 시즌 PEER 추첨
function drawPeerSeason() {
  const month = nextSeasonMonth('similar');
  if (!month) return { error: '연간 플랜의 PEER 6회차가 모두 완료되었습니다. MIX로 진행해주세요.' };

  const pair = seasonPairRound(month, 'similar');
  const restedName = pair ? pair.restedName : pickSeasonRester();
  const attendees = seasonMonthAttendees(month, restedName);

  const byBand = POOLS.map(() => []);
  attendees.forEach(m => byBand[bandOf(m)].push(m));

  let bands;
  if (pair) {
    // 같은 달 MIX가 이미 확정 → PEER 멤버십은 여집합으로 강제 (밴드별 정확히 4명)
    if (byBand.some(b => b.length !== TEAM_SIZE)) {
      return { error: '시즌 이력이 일관되지 않습니다 (여집합 인원 오류). 이력 탭에서 해당 월을 확인해주세요.' };
    }
    bands = byBand;
  } else {
    bands = selectPeerBands(byBand, attendees);
    if (!bands) {
      // 폴백: 가상의 MIX를 먼저 배치하고 그 여집합을 PEER로 사용 — 구조상 항상 성립
      const bandAttending = POOLS.map(() => 0);
      attendees.forEach(m => bandAttending[bandOf(m)]++);
      const mixQuota = bandAttending.map(n => n - TEAM_SIZE);
      const virtualMix = mixQuota.every(q => q >= 0)
        ? arrangeMixSeason(attendees, mixQuota, null, 2) : null;
      if (virtualMix) {
        const mixNames = new Set(virtualMix.flat().map(m => m.name));
        bands = byBand.map(b => b.filter(m => !mixNames.has(m.name)));
      }
    }
    if (!bands) return { error: '팀 선발에 실패했습니다. 다시 SPIN 해주세요.' };
  }

  const teams = POOLS.map((pool, b) => {
    if (pool.allRandom) {
      return {
        teamLabel: pool.name, poolName: pool.name,
        members: shuffle(bands[b]).map(m => ({ ...m, slotCol: null, allRandom: true })),
      };
    }
    return { teamLabel: pool.name, poolName: pool.name, members: assignPeerColumns(bands[b]) };
  });
  return { mode: 'similar', teams, season: SEASON.id, seasonMonth: month, restedName };
}

// 다음 예정 회차 라벨 (더 낮은 월의 빠진 모드, 같으면 MIX 우선)
function nextSeasonLabel() {
  const nm = nextSeasonMonth('different');
  const np = nextSeasonMonth('similar');
  if (nm === null && np === null) return null;
  if (np === null || (nm !== null && nm <= np)) return `${SEASON.monthLabels[nm - 1]} MIX`;
  return `${SEASON.monthLabels[np - 1]} PEER`;
}

// =============================================================
// 이력 자동 복구 — 정원(4명) 미달로 저장된 팀에 규칙에 맞는 인원을 랜덤 보충
//
// 과거 버전의 쿨다운/후보 부족으로 슬롯이 빈 채 확정된 회차 패치용.
// 보충 후보 규칙:
//   - 그 회차에 이미 없는 사람 (회차 내 중복 금지)
//   - 시즌 회차면: 그 달 휴식자 제외 + 같은 달 반대 모드 출석자 제외 (월간 중복 금지)
//   - MIX: 팀 내 티어 전부 다름 + (시즌이면) 밴드 쿼터(상7/중4/하1) 유지
//   - PEER: 같은 묶음(상/중/하) 티어만, 하위팀은 올랜덤 형식 유지
//   - 빈 컬럼의 그룹 매칭 우선 (PEER는 불일치 시 교차 배치로 허용)
//   - 앞뒤 같은 모드 회차 출석자는 가능하면 회피 (쿨다운 존중, 소프트)
// =============================================================
function repairHistory() {
  const fixes = [];
  state.history.forEach((round, idx) => {
    round.teams.forEach(team => {
      let guard = 0;
      while (team.members.filter(Boolean).length < TEAM_SIZE && guard++ < TEAM_SIZE) {
        const member = repairPickFor(round, idx, team);
        if (!member) break;
        team.members.push(member);
        if (!member.allRandom) {
          // 표시 순서를 컬럼 순서로 재정렬
          team.members = COLUMNS
            .map(c => team.members.find(m => m && m.slotCol === c.key))
            .filter(Boolean);
        }
        fixes.push(`#${round.roundNum} ${team.teamLabel}에 ${member.name} 보충`);
      }
    });
  });
  return fixes;
}

function repairPickFor(round, idx, team) {
  const usedInRound = new Set();
  round.teams.forEach(t => t.members.forEach(m => { if (m) usedInRound.add(m.name); }));
  let pool = MEMBERS.filter(m => !usedInRound.has(m.name));

  if (round.season) {
    if (round.restedName) pool = pool.filter(m => m.name !== round.restedName);
    const sameMonth = new Set();
    state.history.forEach(r => {
      if (r !== round && r.season === round.season && r.seasonMonth === round.seasonMonth) {
        r.teams.forEach(t => t.members.forEach(mm => { if (mm) sameMonth.add(mm.name); }));
      }
    });
    pool = pool.filter(m => !sameMonth.has(m.name));
  }

  if (round.mode === 'similar') {
    const poolDef = POOLS.find(p => p.name === team.poolName) ||
      POOLS.find(p => team.members.some(mm => mm && p.tiers.includes(mm.tier)));
    if (!poolDef) return null;
    pool = pool.filter(m => poolDef.tiers.includes(m.tier));
    if (poolDef.allRandom) {
      if (!pool.length) return null;
      const pick = randomChoice(repairCooldownPrefer(pool, idx, round.mode));
      return { ...pick, slotCol: null, allRandom: true };
    }
  } else {
    const usedTiers = new Set(team.members.filter(Boolean).map(m => m.tier));
    pool = pool.filter(m => !usedTiers.has(m.tier));
    if (round.season) {
      // 시즌 MIX는 밴드 쿼터를 지켜야 같은 달 PEER 여집합이 깨지지 않음
      const byName = {};
      MEMBERS.forEach(m => { byName[m.name] = m; });
      const restBand = round.restedName && byName[round.restedName]
        ? bandOf(byName[round.restedName]) : -1;
      const bandCount = POOLS.map(() => 0);
      round.teams.forEach(t => t.members.forEach(mm => { if (mm) bandCount[bandOf(mm)]++; }));
      pool = pool.filter(m => {
        const b = bandOf(m);
        const bandSize = MEMBERS.filter(x => bandOf(x) === b).length;
        const quota = bandSize - (b === restBand ? 1 : 0) - TEAM_SIZE;
        return bandCount[b] < quota;
      });
    }
  }

  // 빈 컬럼 산출 — 빠듯한 그룹 컬럼 먼저, 잔여(전원 후보)는 마지막
  const presentCols = new Set(team.members.filter(Boolean).map(m => m.slotCol));
  const missingCols = COLUMNS.filter(c => !presentCols.has(c.key))
    .sort((a, b) => (a.leftover ? 1 : 0) - (b.leftover ? 1 : 0));

  for (const col of missingCols) {
    const fit = pool.filter(m => col.leftover || col.groups.includes(m.group));
    // MIX는 컬럼 그룹 엄수, PEER는 불일치 시 교차 배치(offColumn) 허용
    const cands = fit.length ? fit : (round.mode === 'similar' ? pool : []);
    if (!cands.length) continue;
    const pick = randomChoice(repairCooldownPrefer(cands, idx, round.mode));
    const member = { ...pick, slotCol: col.key };
    if (!col.leftover && !col.groups.includes(pick.group)) member.offColumn = true;
    return member;
  }
  return null;
}

// 앞뒤 같은 모드 회차 출석자는 가능하면 피함 (후보가 그것뿐이면 허용)
function repairCooldownPrefer(cands, idx, mode) {
  const adjacent = new Set();
  const collect = r => r.teams.forEach(t => t.members.forEach(m => { if (m) adjacent.add(m.name); }));
  for (let j = idx - 1; j >= 0; j--) {
    if (state.history[j].mode === mode) { collect(state.history[j]); break; }
  }
  for (let j = idx + 1; j < state.history.length; j++) {
    if (state.history[j].mode === mode) { collect(state.history[j]); break; }
  }
  const preferred = cands.filter(m => !adjacent.has(m.name));
  return preferred.length ? preferred : cands;
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
            } else if (member.offColumn) {
              // 시즌 PEER 교차 배치 — 컬럼 그룹과 다른 멤버 (그린으로 표시)
              drum.classList.add('locked-leftover');
              if (reelWrap) {
                const label = reelWrap.querySelector('.reel-label');
                if (label) label.textContent = `${col.label} · ${GROUP_LABEL[member.group]}`;
              }
              flashScreen(0.16, '#00ff9d');
              lockBurst(drum, '#00ff9d', 18);
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

  // 시즌 회차면 월·휴식자 표시
  const subTitleEl = document.querySelector('.results-sub');
  if (subTitleEl) {
    subTitleEl.textContent = result.season
      ? `${SEASON.monthLabels[result.seasonMonth - 1]} ${result.mode === 'different' ? 'MIX' : 'PEER'} · 이번 달 휴식 😴 ${result.restedName || '—'}`
      : 'FATE HAS SPOKEN';
  }

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
          <div class="result-member ${m.allRandom ? 'random' : (m.slotCol === '잔여' || m.offColumn ? 'leftover' : '')} ${leaders[idx] === m.name ? 'is-leader' : ''}" data-name="${m.name}">
            ${leaders[idx] === m.name ? `<div class="rm-leader-crown">♛</div>` : ''}
            ${m.allRandom ? `<div class="rm-sub-badge random">🎲 올랜덤</div>` : (m.slotCol === '잔여' ? `<div class="rm-sub-badge leftover">잔여 통합</div>` : (m.offColumn ? `<div class="rm-sub-badge leftover">교차 배치</div>` : ''))}
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

  let result;
  if (seasonActive()) {
    result = currentMode === 'different' ? drawMixSeason() : drawPeerSeason();
    if (result.error) {
      showToast(result.error);
      updateStatus('대기', 'SPIN을 눌러주세요');
      spinning = false;
      spinBtn.disabled = false;
      return;
    }
  } else {
    result = currentMode === 'different' ? drawDifferentMode() : drawSimilarMode();
  }
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
  const record = {
    id: genRoundId(), // 공유 시드 병합 시 동일 회차 판별용
    roundNum: getCurrentRoundNumber(),
    mode: state.pendingResult.mode,
    date: dateStr,
    teams: state.pendingResult.teams,
    leaders: state.pendingResult.leaders || [],
  };
  // 시즌 회차는 페어링·쿼터 계산용 메타를 함께 저장 (휴식자는 양쪽 회차에 모두 기록)
  if (state.pendingResult.season) {
    record.season = state.pendingResult.season;
    record.seasonMonth = state.pendingResult.seasonMonth;
    record.restedName = state.pendingResult.restedName;
  }
  state.history.push(record);

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

  // 연간 플랜 진행도
  const subEl = document.getElementById('confirmedSub');
  if (subEl) {
    if (seasonPlanValid()) {
      const done = seasonRounds().length;
      const total = SEASON.months * 2;
      const next = nextSeasonLabel();
      subEl.textContent = next
        ? `연간 플랜 ${done}/${total} · 다음 ${next}`
        : `연간 플랜 ${SEASON.label} 완료 ✓`;
    } else {
      subEl.textContent = '지금까지 확정된 회차';
    }
  }
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
            <div class="hc-date">${round.season ? `${SEASON.monthLabels[round.seasonMonth - 1]} · ` : ''}${round.date}${round.restedName ? ` · 휴식 ${round.restedName}` : ''}</div>
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
  let msg = `#${round.roundNum} (${modeLabel} · ${round.date}) 회차를 삭제할까요?\n삭제하면 되돌릴 수 없습니다.`;
  if (round.season && seasonPairRound(round.seasonMonth, round.mode)) {
    msg += `\n\n※ 같은 달(${SEASON.monthLabels[round.seasonMonth - 1]}) 반대 모드 회차가 남아 있으면,\n다시 뽑아도 멤버 구성은 동일하게 강제됩니다 (팀 배치만 변경).\n멤버를 바꾸려면 그 달 두 회차를 모두 삭제하세요.`;
  }
  if (!confirm(msg)) return;

  // 공유 시드에 있는 회차면 묘비 기록 — 다음 로드 때 시드에서 되살아나지 않도록
  const key = roundKey(round);
  if (seedRounds().some(sr => roundKey(sr) === key)) {
    state.deletedSeedKeys = Array.from(new Set([...(state.deletedSeedKeys || []), key]));
  }

  state.history.splice(idx, 1);
  // 번호 재정렬
  state.history.forEach((r, i) => { r.roundNum = i + 1; });
  // 삭제 전 컨텍스트(시즌 월/휴식자)로 계산된 대기 결과가 확정되는 것 방지
  state.pendingResult = null;
  hideResults();
  document.getElementById('spinBtn').textContent = 'SPIN ↻';
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
  const seasonOn = seasonPlanValid();
  // 시즌 중에는 연간 쿼터 기준(시즌 회차만 집계)으로 표시 — 기존 이력은 보존하되 계산에서 제외
  const viewCounts = seasonOn ? seasonCountsMap() : counts;
  const total = state.history.length;
  const all = Object.values(viewCounts);
  const max = Math.max(0, ...all);
  const min = total > 0 ? Math.min(...all) : 0;
  const most = Object.entries(viewCounts).filter(([n, c]) => c === max && c > 0).map(([n]) => n).join(', ') || '—';
  const least = total > 0 ? Object.entries(viewCounts).filter(([n, c]) => c === min).map(([n]) => n).slice(0, 3).join(', ') : '—';
  const seasonDone = seasonRounds().length;

  document.getElementById('statsBar').innerHTML = `
    <div class="stat-cell">
      <div class="stat-label">${seasonOn ? 'PLAN ROUNDS' : 'TOTAL ROUNDS'}</div>
      <div class="stat-value">${seasonOn ? `${seasonDone}/${SEASON.months * 2}` : total}</div>
      <div class="stat-sub">${seasonOn ? `연간 플랜 ${SEASON.label} · 전체 확정 ${total}회차` : '확정된 회차'}</div>
    </div>
    <div class="stat-cell">
      <div class="stat-label">${seasonOn ? 'PLAN MAX' : 'MAX PICKS'}</div>
      <div class="stat-value">${max}</div>
      <div class="stat-sub">${most.length > 30 ? most.slice(0, 30) + '...' : most}</div>
    </div>
    <div class="stat-cell">
      <div class="stat-label">${seasonOn ? 'PLAN MIN' : 'MIN PICKS'}</div>
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
              <div class="member-chip ${LEADERS.has(m.name) ? 'is-leader' : ''} ${m.name === SELF ? 'is-self' : ''} ${viewCounts[m.name] > 0 ? 'has-count' : ''}" title="${seasonOn ? `누적 ${counts[m.name]}회` : ''}">
                <span class="mc-name">${m.name}</span>
                <span class="mc-count">${seasonOn ? `${viewCounts[m.name]}/${quotaOf(m)}` : `${counts[m.name]}회`}</span>
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
  const idsAdded = ensureRoundIds();
  // 병합 전에 한 번 보충 — 미달 팀이 채워져야 시드와 내용 일치로 중복 제거됨
  const fixes = repairHistory();
  const seedMerged = mergeSeedHistory();
  // 병합으로 새로 들어온 시드 회차에 미달 팀이 있으면 마저 보충
  fixes.push(...repairHistory());
  if (idsAdded || seedMerged || fixes.length) saveState();
  if (fixes.length) {
    setTimeout(() => showToast(`🔧 미달 팀 자동 보충: ${fixes.join(' · ')}`), 900);
  }
  // 로스터가 연간 플랜 전제와 다르면 (인사 변경 등) 레거시 추첨으로 폴백됨을 알림
  if (!seasonPlanValid()) {
    setTimeout(() => showToast('⚠ 연간 플랜 비활성: 로스터가 플랜 전제와 다릅니다 — 일반 추첨으로 동작합니다'), 600);
  }
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

  // 공유 이력 파일 내보내기
  const exportBtn = document.getElementById('exportSeedBtn');
  if (exportBtn) exportBtn.addEventListener('click', exportSeedFile);
}

init();
