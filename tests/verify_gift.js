// 증여세 계산기 검증 스크립트
// 실행: node tests/verify_gift.js
// 1) 손계산 케이스  2) 조문 문언 그대로 구현한 독립 검산식과 무작위 10만 건 대조  3) 대납 고정점·최소성
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const engineSrc = html.slice(html.indexOf('const TAX = {'), html.indexOf('/* ===== 화면 ====='));
eval(engineSrc + ';global.computeGift=computeGift;global.solveGrossUp=solveGrossUp;global.computeBurden=computeBurden;');

// 조문 문언 그대로 구현한 독립 검산식 (계산기 코드와 공유 없음)
// §26 표: "1억 초과 5억 이하: 1천만원 + 1억 초과분 × 20%" 형식
function art26(b){ if(b<=0)return 0;
  if(b<=1e8) return b*0.1;
  if(b<=5e8) return 1e7+(b-1e8)*0.2;
  if(b<=10e8) return 9e7+(b-5e8)*0.3;
  if(b<=30e8) return 2.4e8+(b-10e8)*0.4;
  return 10.4e8+(b-30e8)*0.5; }
function indep(x){ // x: rel, minor, resident, skip, marriage(bool), report, N, prior
  const anc = x.rel==='ancestor';
  const lim = !x.resident?0 : anc?(x.minor?2e7:5e7) : x.rel==='spouse'?6e8 : x.rel==='descendant'?5e7 : x.rel==='relative'?1e7 : 0;
  const A = (x.prior>0 && x.N+x.prior>=1e7)? x.prior:0;               // §47②
  const gv = x.N + A;                                                  // 과세가액
  const oth = Math.min(x.other || 0, lim);                              // §53 후단: 같은 그룹 다른 가족이 먼저 쓴 공제
  let ded = Math.min(lim - oth, gv);                                   // §53
  if (anc && x.resident && x.marriage) ded += Math.min(1e8, gv-ded);   // §53의2
  let tb = gv - ded; if (tb < 5e5) tb = 0;                             // §55②
  const calc = Math.floor(art26(tb));                                  // 원 미만 절사
  // 종전분(같은 공제한도 가정)
  const plim = (anc && x.resident) ? (x.priorMinor?2e7:5e7) : lim;
  let ptb = A - Math.min(plim, lim - oth, A); if (ptb < 5e5) ptb = 0;
  const pcalc = Math.floor(art26(ptb));
  // §57 + 영§46의3 (동일 조부모 합산이므로 비율 1)
  let sur = 0;
  if (anc && x.skip && calc>0) {
    const r = (x.minor && gv > 20e8) ? 0.4 : 0.3;
    const pr = (anc && x.priorMinor && A > 20e8) ? 0.4 : 0.3;
    sur = Math.max(0, Math.floor(calc*r) - (A>0 ? Math.floor(pcalc*pr) : 0));
  }
  // §58 : MIN(종전 산출세액, 산출세액 × 종전과표/합산과표)
  const credit = A>0 && tb>0 ? Math.min(pcalc, Math.floor(calc*ptb/tb), calc+sur) : 0;
  const rep = x.report ? Math.floor((calc+sur-credit)*0.03) : 0;    // §69②
  return Math.floor((calc+sur-credit-rep)/10)*10;                      // 국고금 10원 미만 절사
}


const base = { relation: 'ancestor', minor: false, resident: true, skip: false, marriage: 'none', report: true, prior: 0, priorMinor: false, ov: {} };
const HAND = [
  ['부모→성년자녀 1억', { N: 1e8 }, 4850000],
  ['부모→미성년 5천', { minor: true, N: 5e7 }, 2910000],
  ['배우자 10억', { relation: 'spouse', N: 10e8 }, 67900000],
  ['사위(기타친족) 3천', { relation: 'relative', N: 3e7 }, 1940000],
  ['타인 45만(과세최저한)', { relation: 'other', N: 45e4 }, 0],
  ['타인 50만', { relation: 'other', N: 50e4 }, 48500],
  ['조부모→성년손주 2억', { skip: true, N: 2e8 }, 25220000],
  ['조부모→미성년 25억(40%)', { minor: true, skip: true, N: 25e8 }, 1129856000],
  ['조부모→미성년 20억(30%)', { minor: true, skip: true, N: 20e8 }, 796952000],
  ['혼인 1.5억', { marriage: 'marriage', N: 1.5e8 }, 0],
  ['혼인 3억', { marriage: 'marriage', N: 3e8 }, 19400000],
  ['재차 종전1억+이번2억', { N: 2e8, prior: 1e8 }, 33950000],
  ['재차 미성년때5천+성년1억', { N: 1e8, prior: 5e7, priorMinor: true }, 6790000],
  ['비거주자 1억', { resident: false, N: 1e8 }, 9700000],
  ['기한후신고 1억', { report: false, N: 1e8 }, 5000000],
  ['조부모 재차 1억+1억', { skip: true, N: 1e8, prior: 1e8 }, 18915000],
  ['배우자 7억(구간경계)', { relation: 'spouse', N: 7e8 }, 9700000],
  ['타인 600만+종전500만', { relation: 'other', N: 6e6, prior: 5e6 }, 582000],
  ['조부모→손주 5천·부모에게 받은 5천', { skip: true, N: 5e7, otherGroup: 5e7 }, 6305000],
  ['부모→자녀 1억·조부모에게 받은 3천', { N: 1e8, otherGroup: 3e7 }, 7760000],
];
let fail = 0;
for (const [name, o, exp] of HAND) {
  const got = computeGift({ ...base, ...o }).paid;
  if (got !== exp) { fail++; console.log('FAIL', name, exp, got); }
}
// 부담부증여 (증여일 2026-09-23): [이름, 입력, 기대 증여세, 기대 양도세(지방세 포함)]
const D = new Date('2026-09-23');
const BURDEN = [
  ['1주택 10억·채무4억 비과세', { value: 10e8, debt: 4e8, acq: 4e8, exp: 0, acqDate: new Date('2012-01-01'), houses: 1, resYears: 10 }, 101850000, 0],
  ['2주택 10억·채무4억·10년 표1', { value: 10e8, debt: 4e8, acq: 4e8, exp: 2e7, acqDate: new Date('2016-03-01'), houses: 2, resYears: 0 }, 101850000, 54601800],
  ['1주택 고가 20억·거주1년 표1', { value: 20e8, debt: 8e8, acq: 5e8, exp: 0, acqDate: new Date('2014-05-10'), houses: 1, resYears: 1 }, 291000000, 53264200],
  ['1주택 고가 20억·거주10년 표2', { value: 20e8, debt: 8e8, acq: 5e8, exp: 0, acqDate: new Date('2014-05-10'), houses: 1, resYears: 10 }, 291000000, 6121500],
  ['2주택 단기 1년 60%', { value: 5e8, debt: 3e8, acq: 4e8, exp: 0, acqDate: new Date('2025-03-01'), houses: 2, resYears: 0 }, 19400000, 37950000],
];
for (const [name, b, expGift, expTr] of BURDEN) {
  const gift = computeGift({ ...base, N: b.value, debt: b.debt }).paid;
  const tr = computeBurden({ ...b, giftDate: D }).total;
  if (gift !== expGift || tr !== expTr) { fail++; console.log('FAIL', name, gift, tr); }
}
const g = solveGrossUp({ ...base, N: 1e8 });
if (g.P !== 5370980) { fail++; console.log('FAIL 대납 1억', g.P); }

let seed = 12345;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const pick = a => a[Math.floor(rnd() * a.length)];
const amt = () => { const r = rnd(); return Math.round((r < .3 ? rnd() * 1e8 : r < .7 ? rnd() * 10e8 : rnd() * 80e8) / 1e4) * 1e4; };
let rand = 0;
for (let i = 0; i < 100000; i++) {
  const rel = pick(['ancestor', 'ancestor', 'ancestor', 'spouse', 'descendant', 'relative', 'other']);
  const x = { rel, minor: rnd() < .3, resident: rnd() < .9, skip: rnd() < .4, marriage: rnd() < .2, report: rnd() < .8, N: amt() || 10000, prior: rnd() < .4 ? amt() : 0, priorMinor: rnd() < .3, other: rnd() < .3 ? amt() : 0 };
  const inp = { relation: rel, minor: x.minor, resident: x.resident, skip: x.skip, marriage: x.marriage ? 'marriage' : 'none', report: x.report, N: x.N, prior: x.prior, priorMinor: x.priorMinor, otherGroup: x.other, ov: {} };
  if (computeGift(inp).paid !== indep(x)) rand++;
  if (i % 5 === 0 && x.resident) {
    const s = solveGrossUp(inp);
    const lower = s.P > 0 ? computeGift({ ...inp, N: inp.N + s.P - 10 }).paid : 0;
    if (computeGift({ ...inp, N: inp.N + s.P }).paid !== s.P || (s.P > 0 && lower <= s.P - 10)) rand++;
  }
}
console.log(`손계산 ${HAND.length + BURDEN.length + 1}건 실패 ${fail} / 무작위 대조 실패 ${rand}`);
process.exit(fail || rand ? 1 : 0);
