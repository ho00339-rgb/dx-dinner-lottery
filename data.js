// =============================================================
// 인사 데이터 — DX혁신실
// 실장 신대호 제외, 박현규(상병휴가) 제외
// 서울 근무자 제외: TF는 PMO 3명(이거성·정경화·부병식)만 남기고 전원 제외
// 인원 변경 시 이 파일만 수정하면 됩니다
// =============================================================

const MEMBERS = [
  // T1 그룹장 (3명) — 이선규(TF)는 서울 근무로 제외
  { name: '권재범', group: '기획', tier: 'T1', title: '부장', part: '' },
  { name: '황지영', group: '운영', tier: 'T1', title: '상무보', part: '' },
  { name: '남현태', group: '정보보호', tier: 'T1', title: '상무보', part: '' },

  // T2 팀장급
  { name: '이거성', group: 'PMO', tier: 'T2', title: '리더', part: 'PMO' },
  { name: '김동우', group: '기획', tier: 'T2', title: '부장', part: '전략기획' },
  { name: '최지훈', group: '기획', tier: 'T2', title: '리더', part: '과제발굴' },
  { name: '김중현', group: '운영', tier: 'T2', title: '리더', part: 'ERP' },
  { name: '정승교', group: '운영', tier: 'T2', title: '리더', part: '인프라' },
  { name: '김주연', group: '정보보호', tier: 'T2', title: '차장', part: '' },

  // T3 시니어급
  { name: '김기열', group: '기획', tier: 'T3', title: '리더', part: '전략기획' },
  { name: '박영선', group: '운영', tier: 'T3', title: '차장', part: '인프라' },
  { name: '강순옥', group: '정보보호', tier: 'T3', title: '과장', part: '' },

  // T4 차장급
  { name: '정경화', group: 'PMO', tier: 'T4', title: '차장', part: 'PMO' },
  { name: '윤재웅', group: '기획', tier: 'T4', title: '차장', part: '과제발굴' },
  { name: '이승목', group: '기획', tier: 'T4', title: '차장', part: '과제발굴' },
  { name: '김현명', group: '기획', tier: 'T4', title: '차장', part: '과제발굴' },
  { name: '한희정', group: '기획', tier: 'T4', title: '대리', part: '과제발굴' },
  { name: '권태근', group: '정보보호', tier: 'T4', title: '차장', part: '' },

  // T5 과장급
  { name: '부병식', group: 'PMO', tier: 'T5', title: '과장', part: 'PMO' },
  { name: '김혁중', group: '운영', tier: 'T5', title: '과장', part: 'ERP' },

  // T6 주니어급
  { name: '김호연', group: '기획', tier: 'T6', title: '대리', part: '과제발굴' },
  { name: '최민준', group: '운영', tier: 'T6', title: '대리', part: 'ERP' },
  { name: '김어진', group: '운영', tier: 'T6', title: '사원', part: 'ERP' },
  { name: '하성우', group: '운영', tier: 'T6', title: '사원', part: '인프라' },
  { name: '탁은민', group: '운영', tier: 'T6', title: '대리', part: '' },
];

// =============================================================
// 메타 정의
// =============================================================

const LEADERS = new Set(['권재범', '황지영', '남현태']); // 그룹장
const SELF = '김호연'; // 본인 (멤버 탭에서 하이라이트)

// 멤버의 실제 소속 그룹 (data 차원)
const GROUPS = ['기획', '운영', '정보보호', 'PMO'];

const GROUP_LABEL = {
  '기획': 'DX 기획',
  '운영': 'DX 운영',
  '정보보호': '정보보호',
  'PMO': 'PMO'
};

// =============================================================
// 컬럼(축) 정의 — 추첨 UI의 4개 세로 슬롯
//   기획 / 운영 / 정보보호+PMO / 잔여(통합)
// 앞의 3개 컬럼은 특정 그룹에서만 뽑고,
// 마지막 "잔여" 컬럼은 그 3개 컬럼에서 안 뽑힌 사람을 모두 합쳐 추첨.
// (MIX=다른 티어 / PEER=같은 묶음 규칙은 모든 컬럼에 동일 적용)
// =============================================================
const COLUMNS = [
  { key: '기획', label: 'DX 기획', groups: ['기획'] },
  { key: '운영', label: 'DX 운영', groups: ['운영'] },
  { key: '정보보호PMO', label: '정보보호 + PMO', groups: ['정보보호', 'PMO'] },
  { key: '잔여', label: '잔여 통합', leftover: true },
];

const TIERS = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6'];

const TIER_LABEL = {
  T1: '그룹장',
  T2: '팀장급',
  T3: '시니어급',
  T4: '차장급',
  T5: '과장급',
  T6: '주니어급'
};

// PEER 모드용 묶음 (상/중/하)
// 하위(T6)는 인원이 기획·운영에만 쏠려 있어(정보보호+PMO엔 T6 없음)
// 컬럼 구조를 포기하고 T6 전원에서 올랜덤으로 4명을 뽑음 (allRandom).
const POOLS = [
  { name: '상위', tiers: ['T1', 'T2', 'T3'] },
  { name: '중위', tiers: ['T4', 'T5'] },
  { name: '하위', tiers: ['T6'], allRandom: true }
];

// 한 팀 정원 (컬럼 수)
const TEAM_SIZE = 4;
