// =============================================================
// 인사 데이터 — DX혁신실 38명
// 실장 신대호 제외, 박현규(상병휴가) 제외
// 인원 변경 시 이 파일만 수정하면 됩니다
// =============================================================

const MEMBERS = [
  // T1 그룹장 (4명)
  { name: '이선규', group: 'TF', tier: 'T1', title: '부장', part: '' },
  { name: '권재범', group: '기획', tier: 'T1', title: '부장', part: '' },
  { name: '황지영', group: '운영', tier: 'T1', title: '상무보', part: '' },
  { name: '남현태', group: '정보보호', tier: 'T1', title: '상무보', part: '' },

  // T2 팀장급 (11명)
  { name: '이거성', group: 'TF', tier: 'T2', title: '리더', part: 'PMO' },
  { name: '김주한', group: 'TF', tier: 'T2', title: '리더', part: 'MI' },
  { name: '김기태', group: 'TF', tier: 'T2', title: '리더', part: 'MI' },
  { name: '박용우', group: 'TF', tier: 'T2', title: '부장', part: '연결경영' },
  { name: '남시범', group: 'TF', tier: 'T2', title: '리더', part: '프로세스' },
  { name: '윤태환', group: 'TF', tier: 'T2', title: '리더', part: '데이터&AI' },
  { name: '김동우', group: '기획', tier: 'T2', title: '부장', part: '전략기획' },
  { name: '최지훈', group: '기획', tier: 'T2', title: '리더', part: '과제발굴' },
  { name: '김중현', group: '운영', tier: 'T2', title: '리더', part: 'ERP' },
  { name: '정승교', group: '운영', tier: 'T2', title: '리더', part: '인프라' },
  { name: '김주연', group: '정보보호', tier: 'T2', title: '차장', part: '' },

  // T3 시니어급 (3명)
  { name: '김기열', group: '기획', tier: 'T3', title: '리더', part: '전략기획' },
  { name: '박영선', group: '운영', tier: 'T3', title: '차장', part: '인프라' },
  { name: '강순옥', group: '정보보호', tier: 'T3', title: '과장', part: '' },

  // T4 차장급 (7명)
  { name: '정경화', group: 'TF', tier: 'T4', title: '차장', part: 'PMO' },
  { name: '문종경', group: 'TF', tier: 'T4', title: '차장', part: '프로세스' },
  { name: '윤재웅', group: '기획', tier: 'T4', title: '차장', part: '과제발굴' },
  { name: '이승목', group: '기획', tier: 'T4', title: '차장', part: '과제발굴' },
  { name: '김현명', group: '기획', tier: 'T4', title: '차장', part: '과제발굴' },
  { name: '한희정', group: '기획', tier: 'T4', title: '대리', part: '과제발굴' },
  { name: '권태근', group: '정보보호', tier: 'T4', title: '차장', part: '' },

  // T5 과장급 (4명)
  { name: '부병식', group: 'TF', tier: 'T5', title: '과장', part: 'PMO' },
  { name: '김아현', group: 'TF', tier: 'T5', title: '과장', part: 'MI' },
  { name: '정문섭', group: 'TF', tier: 'T5', title: '과장', part: '연결경영' },
  { name: '김혁중', group: '운영', tier: 'T5', title: '과장', part: 'ERP' },

  // T6 주니어급 (9명)
  { name: '김영은', group: 'TF', tier: 'T6', title: '대리', part: 'MI' },
  { name: '윤찬희', group: 'TF', tier: 'T6', title: '대리', part: '데이터&AI' },
  { name: '윤은경', group: 'TF', tier: 'T6', title: '대리', part: '데이터&AI' },
  { name: '김유나', group: 'TF', tier: 'T6', title: '주임', part: '프로세스' },
  { name: '김호연', group: '기획', tier: 'T6', title: '대리', part: '과제발굴' },
  { name: '최민준', group: '운영', tier: 'T6', title: '대리', part: 'ERP' },
  { name: '김어진', group: '운영', tier: 'T6', title: '사원', part: 'ERP' },
  { name: '하성우', group: '운영', tier: 'T6', title: '사원', part: '인프라' },
  { name: '탁은민', group: '운영', tier: 'T6', title: '대리', part: '' },
];

// =============================================================
// 메타 정의
// =============================================================

const LEADERS = new Set(['이선규', '권재범', '황지영', '남현태']); // 그룹장
const SELF = '김호연'; // 본인 (멤버 탭에서 하이라이트)

const GROUPS = ['TF', '기획', '운영', '정보보호'];

const GROUP_LABEL = {
  'TF': 'PROJECT TF',
  '기획': 'DX 기획',
  '운영': 'DX 운영',
  '정보보호': '정보보호'
};

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
const POOLS = [
  { name: '상위', tiers: ['T1', 'T2', 'T3'] },
  { name: '중위', tiers: ['T4', 'T5'] },
  { name: '하위', tiers: ['T6'] }
];
