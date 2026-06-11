// =============================================================
// 공유 이력 시드 — 직접 수정하지 마세요 (자동 생성 파일)
//
// localStorage는 브라우저마다 따로 저장되므로, GitHub Pages URL로
// 접속하는 다른 사람에게는 추첨 이력이 보이지 않습니다.
// 이력 탭의 "📤 공유 파일 내보내기" 버튼으로 이 파일을 새로 받아
// 저장소에 덮어쓰고 push 하면, 모든 접속자가 같은 이력을 보게 됩니다.
//
// 2026-06-11: 1~6회차는 로컬(file://)에서 확정된 이력의 스크린샷 기준 복원본.
// #4 중위팀의 빈 운영 슬롯은 허성오(기획)를 교차 배치로 보충 (호연 결정 —
// 유일한 컬럼 일치 후보였던 김혁중은 #2·#6 PEER 연속 출석이라 제외).
// =============================================================
const HISTORY_SEED = [
  {
    id: 'rseed-2026-0611-1',
    roundNum: 1,
    mode: 'different',
    date: '2026-06-11',
    teams: [
      { teamLabel: '1팀', members: [
        { name: '김호연', group: '기획', tier: 'T6', title: '대리', part: '과제발굴', slotCol: '기획' },
        { name: '김혁중', group: '운영', tier: 'T5', title: '과장', part: 'ERP', slotCol: '운영' },
        { name: '정경화', group: 'PMO', tier: 'T4', title: '차장', part: 'PMO', slotCol: '정보보호PMO' },
        { name: '김기열', group: '기획', tier: 'T3', title: '리더', part: '전략기획', slotCol: '잔여' },
      ] },
      { teamLabel: '2팀', members: [
        { name: '권재범', group: '기획', tier: 'T1', title: '부장', part: '', slotCol: '기획' },
        { name: '김어진', group: '운영', tier: 'T6', title: '사원', part: 'ERP', slotCol: '운영' },
        { name: '권태근', group: '정보보호', tier: 'T4', title: '차장', part: '', slotCol: '정보보호PMO' },
        { name: '박영선', group: '운영', tier: 'T3', title: '차장', part: '인프라', slotCol: '잔여' },
      ] },
      { teamLabel: '3팀', members: [
        { name: '김현명', group: '기획', tier: 'T4', title: '차장', part: '과제발굴', slotCol: '기획' },
        { name: '김중현', group: '운영', tier: 'T2', title: '리더', part: 'ERP', slotCol: '운영' },
        { name: '강순옥', group: '정보보호', tier: 'T3', title: '과장', part: '', slotCol: '정보보호PMO' },
        { name: '황지영', group: '운영', tier: 'T1', title: '상무보', part: '', slotCol: '잔여' },
      ] },
    ],
    leaders: ['김기열', '박영선', '김현명'],
  },
  {
    id: 'rseed-2026-0611-2',
    roundNum: 2,
    mode: 'similar',
    date: '2026-06-11',
    teams: [
      { teamLabel: '상위', poolName: '상위', members: [
        { name: '김기열', group: '기획', tier: 'T3', title: '리더', part: '전략기획', slotCol: '기획' },
        { name: '정승교', group: '운영', tier: 'T2', title: '리더', part: '인프라', slotCol: '운영' },
        { name: '김주연', group: '정보보호', tier: 'T2', title: '차장', part: '', slotCol: '정보보호PMO' },
        { name: '강순옥', group: '정보보호', tier: 'T3', title: '과장', part: '', slotCol: '잔여' },
      ] },
      { teamLabel: '중위', poolName: '중위', members: [
        { name: '윤재웅', group: '기획', tier: 'T4', title: '차장', part: '과제발굴', slotCol: '기획' },
        { name: '김혁중', group: '운영', tier: 'T5', title: '과장', part: 'ERP', slotCol: '운영' },
        { name: '권태근', group: '정보보호', tier: 'T4', title: '차장', part: '', slotCol: '정보보호PMO' },
        { name: '김현명', group: '기획', tier: 'T4', title: '차장', part: '과제발굴', slotCol: '잔여' },
      ] },
      { teamLabel: '하위', poolName: '하위', members: [
        { name: '하성우', group: '운영', tier: 'T6', title: '사원', part: '인프라', slotCol: null, allRandom: true },
        { name: '김어진', group: '운영', tier: 'T6', title: '사원', part: 'ERP', slotCol: null, allRandom: true },
        { name: '김호연', group: '기획', tier: 'T6', title: '대리', part: '과제발굴', slotCol: null, allRandom: true },
        { name: '탁은민', group: '운영', tier: 'T6', title: '대리', part: '', slotCol: null, allRandom: true },
      ] },
    ],
    leaders: ['김주연', '권태근', '하성우'],
  },
  {
    id: 'rseed-2026-0611-3',
    roundNum: 3,
    mode: 'different',
    date: '2026-06-11',
    teams: [
      { teamLabel: '1팀', members: [
        { name: '김동우', group: '기획', tier: 'T2', title: '부장', part: '전략기획', slotCol: '기획' },
        { name: '하성우', group: '운영', tier: 'T6', title: '사원', part: '인프라', slotCol: '운영' },
        { name: '부병식', group: 'PMO', tier: 'T5', title: '과장', part: 'PMO', slotCol: '정보보호PMO' },
        { name: '윤재웅', group: '기획', tier: 'T4', title: '차장', part: '과제발굴', slotCol: '잔여' },
      ] },
      { teamLabel: '2팀', members: [
        { name: '이승목', group: '기획', tier: 'T4', title: '차장', part: '과제발굴', slotCol: '기획' },
        { name: '최민준', group: '운영', tier: 'T6', title: '대리', part: 'ERP', slotCol: '운영' },
        { name: '남현태', group: '정보보호', tier: 'T1', title: '상무보', part: '', slotCol: '정보보호PMO' },
        { name: '이거성', group: 'PMO', tier: 'T2', title: '리더', part: 'PMO', slotCol: '잔여' },
      ] },
      { teamLabel: '3팀', members: [
        { name: '한희정', group: '기획', tier: 'T4', title: '대리', part: '과제발굴', slotCol: '기획' },
        { name: '탁은민', group: '운영', tier: 'T6', title: '대리', part: '', slotCol: '운영' },
        { name: '김주연', group: '정보보호', tier: 'T2', title: '차장', part: '', slotCol: '정보보호PMO' },
        { name: '허성오', group: '기획', tier: 'T5', title: '과장', part: '', slotCol: '잔여' },
      ] },
    ],
    leaders: ['하성우', '이승목', '허성오'],
  },
  {
    id: 'rseed-2026-0611-4',
    roundNum: 4,
    mode: 'similar',
    date: '2026-06-11',
    teams: [
      { teamLabel: '상위', poolName: '상위', members: [
        { name: '최지훈', group: '기획', tier: 'T2', title: '리더', part: '과제발굴', slotCol: '기획' },
        { name: '황지영', group: '운영', tier: 'T1', title: '상무보', part: '', slotCol: '운영' },
        { name: '남현태', group: '정보보호', tier: 'T1', title: '상무보', part: '', slotCol: '정보보호PMO' },
        { name: '김중현', group: '운영', tier: 'T2', title: '리더', part: 'ERP', slotCol: '잔여' },
      ] },
      { teamLabel: '중위', poolName: '중위', members: [
        { name: '한희정', group: '기획', tier: 'T4', title: '대리', part: '과제발굴', slotCol: '기획' },
        { name: '허성오', group: '기획', tier: 'T5', title: '과장', part: '', slotCol: '운영', offColumn: true },
        { name: '부병식', group: 'PMO', tier: 'T5', title: '과장', part: 'PMO', slotCol: '정보보호PMO' },
        { name: '정경화', group: 'PMO', tier: 'T4', title: '차장', part: 'PMO', slotCol: '잔여' },
      ] },
      { teamLabel: '하위', poolName: '하위', members: [
        { name: '김호연', group: '기획', tier: 'T6', title: '대리', part: '과제발굴', slotCol: null, allRandom: true },
        { name: '김어진', group: '운영', tier: 'T6', title: '사원', part: 'ERP', slotCol: null, allRandom: true },
        { name: '하성우', group: '운영', tier: 'T6', title: '사원', part: '인프라', slotCol: null, allRandom: true },
        { name: '최민준', group: '운영', tier: 'T6', title: '대리', part: 'ERP', slotCol: null, allRandom: true },
      ] },
    ],
    leaders: ['김중현', '한희정', '최민준'],
  },
  {
    id: 'rseed-2026-0611-5',
    roundNum: 5,
    mode: 'different',
    date: '2026-06-11',
    teams: [
      { teamLabel: '1팀', members: [
        { name: '권재범', group: '기획', tier: 'T1', title: '부장', part: '', slotCol: '기획' },
        { name: '김혁중', group: '운영', tier: 'T5', title: '과장', part: 'ERP', slotCol: '운영' },
        { name: '권태근', group: '정보보호', tier: 'T4', title: '차장', part: '', slotCol: '정보보호PMO' },
        { name: '정승교', group: '운영', tier: 'T2', title: '리더', part: '인프라', slotCol: '잔여' },
      ] },
      { teamLabel: '2팀', members: [
        { name: '김기열', group: '기획', tier: 'T3', title: '리더', part: '전략기획', slotCol: '기획' },
        { name: '김중현', group: '운영', tier: 'T2', title: '리더', part: 'ERP', slotCol: '운영' },
        { name: '정경화', group: 'PMO', tier: 'T4', title: '차장', part: 'PMO', slotCol: '정보보호PMO' },
        { name: '김호연', group: '기획', tier: 'T6', title: '대리', part: '과제발굴', slotCol: '잔여' },
      ] },
      { teamLabel: '3팀', members: [
        { name: '김현명', group: '기획', tier: 'T4', title: '차장', part: '과제발굴', slotCol: '기획' },
        { name: '김어진', group: '운영', tier: 'T6', title: '사원', part: 'ERP', slotCol: '운영' },
        { name: '강순옥', group: '정보보호', tier: 'T3', title: '과장', part: '', slotCol: '정보보호PMO' },
        { name: '황지영', group: '운영', tier: 'T1', title: '상무보', part: '', slotCol: '잔여' },
      ] },
    ],
    leaders: ['정승교', '김중현', '황지영'],
  },
  {
    id: 'rseed-2026-0611-6',
    roundNum: 6,
    mode: 'similar',
    date: '2026-06-11',
    teams: [
      { teamLabel: '상위', poolName: '상위', members: [
        { name: '권재범', group: '기획', tier: 'T1', title: '부장', part: '', slotCol: '기획' },
        { name: '박영선', group: '운영', tier: 'T3', title: '차장', part: '인프라', slotCol: '운영' },
        { name: '김주연', group: '정보보호', tier: 'T2', title: '차장', part: '', slotCol: '정보보호PMO' },
        { name: '김기열', group: '기획', tier: 'T3', title: '리더', part: '전략기획', slotCol: '잔여' },
      ] },
      { teamLabel: '중위', poolName: '중위', members: [
        { name: '윤재웅', group: '기획', tier: 'T4', title: '차장', part: '과제발굴', slotCol: '기획' },
        { name: '김혁중', group: '운영', tier: 'T5', title: '과장', part: 'ERP', slotCol: '운영' },
        { name: '권태근', group: '정보보호', tier: 'T4', title: '차장', part: '', slotCol: '정보보호PMO' },
        { name: '이승목', group: '기획', tier: 'T4', title: '차장', part: '과제발굴', slotCol: '잔여' },
      ] },
      { teamLabel: '하위', poolName: '하위', members: [
        { name: '김호연', group: '기획', tier: 'T6', title: '대리', part: '과제발굴', slotCol: null, allRandom: true },
        { name: '김어진', group: '운영', tier: 'T6', title: '사원', part: 'ERP', slotCol: null, allRandom: true },
        { name: '최민준', group: '운영', tier: 'T6', title: '대리', part: 'ERP', slotCol: null, allRandom: true },
        { name: '탁은민', group: '운영', tier: 'T6', title: '대리', part: '', slotCol: null, allRandom: true },
      ] },
    ],
    leaders: ['박영선', '윤재웅', '김어진'],
  },
];

// 대체된 옛 변형의 내용 키 — 옛 로컬(file://) 이력에 남은 #4의
// "3명 버전"/"김혁중 보충 버전"이 시드와 중복 표시되지 않도록 병합 시 제거
const HISTORY_SEED_SUPERSEDED = [
  'similar|2026-06-11|김어진/김호연/최민준/하성우||김중현/남현태/최지훈/황지영||부병식/정경화/한희정',
  'similar|2026-06-11|김어진/김호연/최민준/하성우||김중현/남현태/최지훈/황지영||김혁중/부병식/정경화/한희정',
];
