// 수학도서관 — 6단계: 풀이 기록 · 유사문항 · 학생별 추천 문제지 · 테스트지 → 결과 입력 → 분석지(카톡 카드 · A4)
// 재료: 단원이 붙은 기출 문항(분석된 시험) + 정리 대기열에서 ③문항 위치·④단원 연결까지 끝난 교재 + 원장님이 채택한 AI 변형(학원 제작).
// 다른 학교 기출은 쓰지 않는다. 교재 문제는 인쇄할 때 MYBOX에서 잘라 온다(오답노트와 같은 방식, AI 안 씀).
// 추천 문제지: 약점 70 · 복습 20 · 출제 습관 10, 기본 15문항(더하기 가능). 테스트지: 10~15문항, 하 20 · 중 50 · 상 30.
// 저장: sets(문제지·테스트지, 결과 포함) · attempts(문항 하나당 채점 한 줄). 선생님은 자기 학생 것만(Firestore 규칙). AI 변형은 원장님만.
window.SudoPractice = function (H) {
  const { D, ctx, byId, esc, toast, $, $$ } = H;
  const me = (ctx && ctx.me) || { role: 'owner' };
  const owner = me.role === 'owner' || me.role === 'co';
  const fdb = () => firebase.firestore();
  const mine = q => (me.role === 'teacher' ? q.where('owner', '==', ctx.user) : q);   // 선생님은 규칙상 자기 것만 읽을 수 있음
  const DN = ['', '하', '중', '상'];
  const CAUSES = ['개념', '계산 실수', '문제 이해', '시간 부족'];
  const DAY = 864e5;
  const DI3 = d => (d <= 1 ? 1 : d === 2 ? 2 : 3);           // 기본→하 · 응용→중 · 실력·심화→상
  const normNo = s => { const d = String(s ?? '').replace(/[^0-9]/g, ''); return d ? String(parseInt(d, 10)) : ''; };
  const unitOfCat = ci => { const c = (D.catalog || [])[ci]; return c ? `${c[1]}|${c[3]}.${c[4]}` : ''; };
  const unitName = u => String(u || '').split('|').pop().replace(/^\s*\d+\s*\.\s*/, '');
  const shortLab = s => String(s || '').replace(/\s*-\s*\d+\s*레벨/, '').replace(/^[^/]+\//, '');
  const semNow = () => { const m = new Date().getMonth() + 1; return m >= 8 || m <= 1 ? 2 : 1; };
  const md = t => { const d = new Date(t); return `${d.getMonth() + 1}/${d.getDate()}`; };
  const P = { st: null, draft: null, tab: 'rec', n: 15, test: { units: new Set(), n: 15, mix: [20, 50, 30] }, res: null, sets: null, hist: null };

  // ---------- 문제 모음 (pool) ----------
  let POOL = null, BOOKS = null;
  async function books() {
    if (BOOKS) return BOOKS;
    const src = H.src ? await H.src.load() : [];
    BOOKS = {}; src.filter(b => b.id.startsWith('ob_')).forEach(b => { BOOKS[b.id] = b; });
    return BOOKS;
  }
  async function pool() {
    if (POOL) return POOL;
    const out = [];
    (D.exams || []).forEach(e => ((e.an && e.an.items) || []).forEach(i => {
      const u = i[8] >= 0 ? unitOfCat(i[8]) : ''; if (!u) return;
      out.push({ key: `x|${e.id}|${i[0]}`, kind: 'exam', examId: e.id, school: e.s, no: i[0], code: i[8], type: i[7], unit: u, diff: DI3(i[2]), ik: i[13] || '', ans: i[10] || '', sol: i[11] || '', q: i[12] || '', label: `${e.s} ${e.y} ${e.g}-${e.t} ${e.x} ${i[0]}번` });
    }));
    const B = await books();
    Object.values(B).filter(b => b.outline && b.outline.v === 2 && b.unitsOk).forEach(b => {
      const lab = Object.fromEntries((b.outline.sections || []).map(s => [s.key, s.label]));
      Object.keys(b.outline.where || {}).forEach(k => {
        const j = k.lastIndexOf('|'); const sec = k.slice(0, j), no = k.slice(j + 1);
        const u = String((b.secUnits || {})[sec] || '').replace(/\?$/, ''); if (!u) return;
        const lv = +((String(lab[sec] || '').match(/(\d)\s*레벨/) || [])[1] || 0);
        out.push({ key: `b|${b.id}|${sec}|${no}`, kind: 'book', bookId: b.id.slice(3), title: b.title, sec, secLabel: lab[sec] || sec, no, unit: u, diff: lv ? Math.min(3, Math.max(1, lv - 1)) : 2, ans: (b.outline.ans || {})[k] || '', label: `${b.title} · ${shortLab(lab[sec])} ${no}번` });
      });
    });
    // 자료실(학원 교재 · 학교 프린트) 문항 — 자료실에서 분석한 것, 문항 그림은 img에
    try {
      const vis = new Map((H.src ? await H.src.load() : []).filter(x => x.id.startsWith('mt_')).map(x => [x.id, x]));
      const codeIdx = new Map((D.catalog || []).map((c, i) => [c[0], i]));
      const umap = {};
      const unitFor = (course, mid) => {
        const name = String(mid || '').replace(/^\s*\d+\s*\.\s*/, ''); const k0 = course + '|' + name; if (k0 in umap) return umap[k0];
        const ms = [...new Map((D.catalog || []).filter(c => c[1] === course).map(c => [c[3], c])).values()];
        const nn = s => String(s || '').replace(/[\s·.,()]/g, '');
        let hit = ms.find(c => nn(c[4]) === nn(name));
        if (!hit && window.SudoUnits) { const sl = window.SudoUnits.slotOf(course, name); if (sl) hit = ms.find(c => { const t = window.SudoUnits.slotOf(course, c[4]); return t && t.bi === sl.bi && t.mi === sl.mi; }); }
        return (umap[k0] = hit ? `${course}|${hit[3]}.${hit[4]}` : '');
      };
      const DT = d => (typeof d === 'number' ? DI3(d) : /기본|하/.test(d || '') ? 1 : /응용|중/.test(d || '') ? 2 : d ? 3 : 2);
      const ms = await fdb().collection('items').where('from', '==', '자료실').get();
      ms.docs.forEach(d => { const x = d.data(); const src = vis.get(x.source); if (!src) return; const u = unitFor(x.course, x.mid); if (!u) return;
        const print = src.kind === '학교 프린트' || src.src === 'school';
        out.push({ key: `m|${d.id}`, kind: print ? 'print' : 'mat', school: src.school || '', unit: u, code: codeIdx.has(x.code) ? codeIdx.get(x.code) : -1, type: x.type || '', diff: DT(x.diff), ik: x.ik || '', ans: x.ans || '', sol: x.sol || '', q: x.q || '', label: `${src.title} · ${x.no || ''}` }); });
    } catch (_) { /* 규칙 전 · 자료실 없음 */ }
    try {
      const s = await fdb().collection('items').where('from', '==', '학원 제작').get();
      s.docs.forEach(d => { const x = d.data(); if (!x.unit) return; out.push({ key: `a|${d.id}`, kind: 'ai', unit: x.unit, diff: x.diff || 2, q: x.stem, choices: x.choices || [], ans: x.answer || '', sol: x.solution || '', label: `학원 제작 · ${unitName(x.unit)}` }); });
    } catch (_) { /* 규칙 전 */ }
    POOL = out; return out;
  }
  const allowed = (st, c) => (c.kind !== 'exam' || c.school === st.school) && (c.kind !== 'print' || !c.school || c.school === st.school);   // 다른 학교 기출·프린트는 쓰지 않음
  const KORD = { book: 0, mat: 0, print: 1, exam: 2, ai: 3 };   // 학원 교재 → 학교 프린트 → 같은 학교 기출 → 학원 제작

  // ---------- 풀이 기록 (학생 한 명) ----------
  async function history(st) {
    const B = await books(); const out = [];
    const o = st.odap || {};
    (o.records || []).forEach(r => {
      const b = B['ob_' + r.bookId]; if (!b || !b.outline) return;
      const su = b.secUnits || {}, lab = Object.fromEntries((b.outline.sections || []).map(s => [s.key, s.label]));
      const lvOf = sec => { const lv = +((String(lab[sec] || '').match(/(\d)\s*레벨/) || [])[1] || 0); return lv ? Math.min(3, Math.max(1, lv - 1)) : 2; };
      const wrong = new Set((r.wrongs || []).map(w => w.sec + '|' + normNo(w.no)));
      (r.wrongs || []).forEach(w => out.push({ key: `b|ob_${r.bookId}|${w.sec}|${normNo(w.no)}`, unit: String(su[w.sec] || '').replace(/\?$/, ''), diff: lvOf(w.sec), ok: false, cause: w.cause || '', at: r.at, src: '교재' }));
      const solved = new Set(r.solved || []);
      Object.keys(b.outline.where || {}).forEach(k => { const j = k.lastIndexOf('|'), sec = k.slice(0, j); if (solved.has(sec) && !wrong.has(k)) out.push({ key: `b|ob_${r.bookId}|${k}`, unit: String(su[sec] || '').replace(/\?$/, ''), diff: lvOf(sec), ok: true, at: r.at, src: '교재' }); });
    });
    Object.values(D.results || {}).filter(r => r.student === st.id).forEach(r => {
      const e = byId[r.exam]; if (!e || !e.an) return;
      const at = r.at ? +new Date(r.at) : Date.now();
      e.an.items.forEach(i => {
        const u = i[8] >= 0 ? unitOfCat(i[8]) : '';
        const part = r.partial && r.partial[i[0]] !== undefined && r.partial[i[0]] !== '' ? +r.partial[i[0]] < i[1] : false;
        out.push({ key: `x|${e.id}|${i[0]}`, unit: u, diff: DI3(i[2]), code: i[8], ok: !(r.wrong || []).includes(i[0]) && !part, at, src: '시험' });
      });
    });
    try {
      const s = await mine(fdb().collection('attempts').where('sid', '==', st.id)).get();
      s.docs.forEach(d => { const x = d.data(); if (x.src === '교재') return; out.push(x); });
    } catch (_) { /* 규칙 전 */ }
    return out.sort((a, b) => a.at - b.at);
  }
  function weakMap(hist) {
    const U = new Map();
    hist.filter(h => h.unit).forEach(h => {
      if (!U.has(h.unit)) U.set(h.unit, { unit: h.unit, n: 0, w: 0, d: [[0, 0], [0, 0], [0, 0], [0, 0]], last: 0 });
      const u = U.get(h.unit); u.n++; if (!h.ok) { u.w++; u.last = Math.max(u.last, h.at); } u.d[h.diff || 2][0]++; if (!h.ok) u.d[h.diff || 2][1]++;
    });
    return [...U.values()].map(u => Object.assign(u, { rate: u.w / u.n, score: (u.w + 1) / (u.n + 2) * Math.log2(2 + u.w) })).sort((a, b) => b.score - a.score);
  }

  // ---------- 유사문항 (AI 없이: 같은 유형 → 같은 단원·비슷한 난이도, 학원 교재 → 같은 학교 기출 → 학원 제작) ----------
  function similar(base, st, seen, taken) {
    const pl = POOL || [];
    return pl.filter(c => c.key !== base.key && c.unit === base.unit && allowed(st, c) && !seen.has(c.key) && !(taken && taken.has(c.key)))
      .map(c => ({ c, s: (base.code >= 0 && c.code === base.code ? 3 : 0) + (2 - Math.min(2, Math.abs((c.diff || 2) - (base.diff || 2)))) + (2 - KORD[c.kind]) * 0.6 + Math.random() * 0.3 }))
      .sort((a, b) => b.s - a.s).map(x => x.c);
  }

  // ---------- 추천 문제지 ----------
  async function upcomingOf(st) { try { const U = H.sch ? await H.sch.upcoming() : null; return ((U && U.up) || []).filter(p => p.sc.name === st.school && (!p.grades.length || p.grades.includes(+st.grade))); } catch (_) { return []; } }
  async function recommend(st, n, R) {
    await pool(); const hist0 = P.hist = await history(st);
    const inR = u => !R || R.has(u);                       // 고른 범위(단원 묶음) 안만
    const hist = hist0.filter(h => inR(h.unit));
    const seen = new Set(hist0.map(h => h.key)); (P.sets || []).forEach(s => (s.items || []).forEach(x => seen.add(x.key)));
    const taken = new Set(), picks = [];
    const add = (c, tag, why) => { if (!c || taken.has(c.key)) return false; taken.add(c.key); picks.push(Object.assign({}, c, { tag, why })); return true; };
    const W = weakMap(hist).filter(u => u.w > 0);
    const nW = Math.round(n * 0.7), nR = Math.round(n * 0.2), nH = n - nW - nR;
    // 복습 20: 틀린 뒤 아직 맞히지 않은 문제, 3·7·14일이 지난 것부터 → 유사문항(없으면 같은 문제)
    const lastOk = {}; hist.forEach(h => { if (h.ok) lastOk[h.key] = h.at; });
    const due = []; const dueSeen = new Set();
    [...hist].reverse().forEach(h => { if (h.ok || dueSeen.has(h.key) || (lastOk[h.key] || 0) > h.at) return; dueSeen.add(h.key); const age = (Date.now() - h.at) / DAY; if (age >= 3) due.push(Object.assign({ age }, h)); });
    due.sort((a, b) => b.age - a.age);
    for (const h of due) { if (picks.filter(p => p.tag === '복습').length >= nR) break; const s = similar(h, st, seen, taken)[0]; const self = (POOL || []).find(c => c.key === h.key);
      if (s) add(s, '복습', `${md(h.at)} 틀린 문제의 유사문항`); else if (self) add(self, '복습', `${md(h.at)} 틀린 문제 다시`); }
    // 출제 습관 10: 다가오는 시험 학교의 같은 학년·학기 기출에 자주 나온 유형
    const up = (await upcomingOf(st))[0];
    if (up) {
      const t = /1학기/.test(up.label) ? 1 : 2, cnt = {};
      (D.exams || []).filter(e => e.s === st.school && +e.g === +st.grade && +e.t === t && e.an).forEach(e => e.an.items.forEach(i => { if (i[8] >= 0) cnt[i[8]] = (cnt[i[8]] || 0) + 1; }));
      const codes = Object.entries(cnt).sort((a, b) => b[1] - a[1]);
      for (const [code, c] of codes) { if (picks.filter(p => p.tag === '출제 습관').length >= nH) break;
        const u = unitOfCat(+code); if (!inR(u)) continue; const cand = (POOL || []).filter(x => x.unit === u && allowed(st, x) && !seen.has(x.key) && !taken.has(x.key)).sort((a, b) => (b.code === +code) - (a.code === +code) || KORD[a.kind] - KORD[b.kind])[0];
        add(cand, '출제 습관', `${st.school} ${t}학기 ${/중간/.test(up.label) ? '중간' : '기말'}에 ${c}번 나온 유형`); }
    }
    // 약점 70 (+ 모자란 칸 채우기): 오답률 높은 단원, 그 단원에서 많이 틀린 난이도 쪽으로
    const want = n - picks.length;
    // 범위를 골랐는데 그 안에 틀린 기록이 없으면: 범위 단원마다 고르게, 난이도는 중 → 상 → 하
    const even = R && !W.length;
    const units = even ? [...R].map(u => ({ unit: u, d: [[0, 0], [1, 0], [1, 1], [1, 0.5]], rate: 0, even: true })) : W.length ? W : weakMap(hist).slice(0, 3);
    const top = even ? units : units.slice(0, 3), wts = even ? top.map(() => 1) : [0.5, 0.3, 0.2].slice(0, top.length), sum = wts.reduce((a, b) => a + b, 0) || 1;
    const share = top.map((u, k) => ({ u, k: Math.max(1, Math.round(want * wts[k] / sum)) }));
    for (const { u, k } of share) {
      const dWrong = [1, 2, 3].sort((a, b) => (u.d[b][1] / (u.d[b][0] || 1)) - (u.d[a][1] / (u.d[a][0] || 1)));
      const cand = (POOL || []).filter(c => c.unit === u.unit && allowed(st, c) && !seen.has(c.key) && !taken.has(c.key))
        .sort((a, b) => dWrong.indexOf(a.diff) - dWrong.indexOf(b.diff) || KORD[a.kind] - KORD[b.kind] || Math.random() - 0.5);
      let got = 0; for (const c of cand) { if (got >= k || picks.length >= n) break; if (add(c, '약점', u.even ? `${unitName(u.unit)} (범위 안)` : `${unitName(u.unit)} 오답률 ${Math.round(u.rate * 100)}%`)) got++; }
    }
    // 그래도 모자라면 이번 학기 과정 단원에서
    if (picks.length < n) {
      const course = `중등${st.grade}-${semNow()}`;
      const cand = (POOL || []).filter(c => (R ? inR(c.unit) : c.unit.startsWith(course)) && allowed(st, c) && !seen.has(c.key) && !taken.has(c.key)).sort(() => Math.random() - 0.5);
      for (const c of cand) { if (picks.length >= n) break; add(c, '약점', R ? `${unitName(c.unit)} (범위 안)` : `${course.replace('중등', '중')} 범위`); }
    }
    const ord = { 약점: 0, '출제 습관': 1, 복습: 2 };
    return picks.sort((a, b) => ord[a.tag] - ord[b.tag] || a.unit.localeCompare(b.unit) || a.diff - b.diff);
  }
  function addOne(st) {
    const d = P.draft; const seen = new Set(P.hist.map(h => h.key)); const taken = new Set(d.items.map(x => x.key));
    const R = d.range; const inR = u => !R || R.has(u); const hh = P.hist.filter(h => inR(h.unit));
    const W = weakMap(hh).filter(u => u.w > 0);
    const us = W.length ? W : R ? [...R].map(u => ({ unit: u, rate: 0 })) : weakMap(hh);
    for (const u of us) { const c = (POOL || []).find(c => c.unit === u.unit && allowed(st, c) && !seen.has(c.key) && !taken.has(c.key)); if (c) { d.items.push(Object.assign({}, c, { tag: '약점', why: `${unitName(u.unit)} 오답률 ${Math.round(u.rate * 100)}%` })); return true; } }
    return false;
  }
  // ---------- 테스트지 ----------
  async function makeTest(st, opt) {
    await pool(); const hist = P.hist = await history(st);
    const seen = new Set(hist.map(h => h.key)); const taken = new Set(), picks = [];
    const inUnits = c => opt.units.has(c.unit) && allowed(st, c);
    const want = [0, ...opt.mix.map(m => Math.round(opt.n * m / 100))]; let fix = opt.n - want[1] - want[2] - want[3]; want[2] += fix;
    const order = [2, 3, 1];
    for (const d of order) {
      const cand = (POOL || []).filter(c => inUnits(c) && c.diff === d && !taken.has(c.key)).sort((a, b) => seen.has(a.key) - seen.has(b.key) || KORD[a.kind] - KORD[b.kind] || Math.random() - 0.5);
      let got = 0;
      for (const c0 of cand) { if (got >= want[d]) break; let c = c0, why = '';
        if (seen.has(c.key)) { const s = similar(c, st, seen, taken)[0]; if (s) { c = s; why = '푼 문제 대신 유사문항'; } }
        if (taken.has(c.key)) continue; taken.add(c.key); picks.push(Object.assign({}, c, { tag: DN[c.diff], why })); got++; }
      if (got < want[d]) { const nd = d === 3 ? 2 : d === 1 ? 2 : 3; want[nd] = (want[nd] || 0) + (want[d] - got); }
    }
    return picks.sort((a, b) => a.diff - b.diff || a.unit.localeCompare(b.unit));
  }

  // ---------- 저장 · 불러오기 ----------
  const slim = x => { const o = { key: x.key, kind: x.kind, unit: x.unit, diff: x.diff, label: x.label, tag: x.tag || '', why: x.why || '', tagShort: unitName(x.unit) + ' · ' + DN[x.diff] };
    if (x.kind === 'book') Object.assign(o, { bookId: x.bookId, title: x.title, sec: x.sec, secLabel: x.secLabel, no: x.no });
    if (x.kind === 'exam' || x.kind === 'mat' || x.kind === 'print') Object.assign(o, { examId: x.examId || '', no: x.no || '', ik: x.ik, ans: x.ans, sol: x.sol, code: x.code, q: x.kind === 'exam' ? '' : x.q });
    if (x.kind === 'ai') Object.assign(o, { q: x.q, choices: x.choices || [], ans: x.ans, sol: x.sol });
    return o; };
  async function loadSets(st) {
    try { const s = await mine(fdb().collection('sets').where('sid', '==', st.id)).get(); P.sets = s.docs.map(d => Object.assign({ id: d.id }, d.data())).sort((a, b) => (b.at || '').localeCompare(a.at || '')); }
    catch (e) { P.sets = []; P.setsErr = e.message; }
    return P.sets;
  }
  async function saveDraft(st) {
    const d = P.draft, at = new Date().toISOString();
    const doc = { owner: st.owner || ctx.user, sid: st.id, sname: st.name, kind: d.kind, title: d.title, at, by: ctx.user, per: 4, items: d.items.map(slim), result: null };
    const ref = await fdb().collection('sets').add(doc);
    P.draft = null; await loadSets(st); return Object.assign({ id: ref.id }, doc);
  }
  async function saveResult(st, set, wrong, cause) {
    const at = new Date().toISOString(), n = set.items.length;
    const result = { wrong: [...wrong].sort((a, b) => a - b), cause, at, by: ctx.user, score: n - wrong.size, total: n };
    await fdb().collection('sets').doc(set.id).update({ result });
    const b = fdb().batch();
    set.items.forEach((x, k) => { const no = k + 1; b.set(fdb().collection('attempts').doc(`${set.id}_${no}`), { owner: set.owner, sid: st.id, set: set.id, key: x.key, unit: x.unit, diff: x.diff, ok: !wrong.has(no), cause: cause[no] || '', at: Date.now(), src: set.kind === '테스트' ? '테스트' : '추천', by: ctx.user }); });
    await b.commit();
    set.result = result; P.hist = null;
  }

  // ---------- 화면 (학생 → 추천 · 테스트 탭) ----------
  async function panel(box, st) {
    P.st = st; box.innerHTML = '<p class="dl">풀이 기록과 문제 모음을 불러오는 중… (처음 한 번 몇 초)</p>';
    try { await pool(); if (!P.scopes) { try { const r = await fdb().collection('scopes').where('src', '==', 'range').get(); P.scopes = r.docs.map(d => Object.assign({ id: d.id }, d.data())); } catch (_) { P.scopes = []; } } if (!P.hist || P.histFor !== st.id) { P.hist = await history(st); P.histFor = st.id; } if (!P.sets || P.setsFor !== st.id) { await loadSets(st); P.setsFor = st.id; } }
    catch (e) { box.innerHTML = `<div class="callout">불러오지 못했습니다: ${esc(e.message)}</div>`; return; }
    draw(box, st);
  }
  function heatHtml(st) {
    const W = weakMap(P.hist).slice(0, 8);
    if (!W.length) return '<div class="empty">아직 단원이 붙은 풀이 기록이 없습니다. 교재 오답(정리된 교재)이나 시험 결과를 넣으면 약점 지도가 생깁니다.</div>';
    const cell = (a) => { if (!a[0]) return '<span class="hm">—</span>'; const r = a[1] / a[0]; return `<span class="hm h${r >= 0.6 ? 3 : r >= 0.4 ? 2 : r >= 0.2 ? 1 : 0}" title="${a[1]}/${a[0]} 틀림">${Math.round(r * 100)}%</span>`; };
    return `<div class="heat2"><span></span><span class="hh">하</span><span class="hh">중</span><span class="hh">상</span><span class="hh">전체</span>${W.map(u => `<span class="hu" title="${esc(u.unit)}">${esc(unitName(u.unit))}</span>${cell(u.d[1])}${cell(u.d[2])}${cell(u.d[3])}<span class="hm ht">${u.w}/${u.n}</span>`).join('')}</div>`;
  }
  function draftHtml() {
    const d = P.draft; if (!d) return '';
    const cnt = t => d.items.filter(x => x.tag === t).length;
    return `<div class="pdraft"><div class="between"><b>${esc(d.title)} · ${d.items.length}문항</b><span class="dl">${d.kind === '테스트' ? `하 ${d.items.filter(x => x.diff === 1).length} · 중 ${d.items.filter(x => x.diff === 2).length} · 상 ${d.items.filter(x => x.diff === 3).length}` : `약점 ${cnt('약점')} · 복습 ${cnt('복습')} · 출제 습관 ${cnt('출제 습관')}`}</span></div>
      ${d.items.length ? `<ol class="plist">${d.items.map((x, k) => `<li><span class="ptag t${esc(x.tag)}">${esc(x.tag)}</span><span class="pl"><b>${esc(unitName(x.unit))} · ${DN[x.diff]}</b><small>${esc(x.label)}${x.why ? ' · ' + esc(x.why) : ''}</small></span>
        <span class="pb"><button type="button" class="linkbtn" data-sw="${k}">유사문항으로 바꾸기</button>${owner ? `<button type="button" class="linkbtn" data-av="${k}">AI 변형</button>` : ''}<button type="button" class="linkbtn danger" data-rm="${k}">빼기</button></span></li>`).join('')}</ol>`
        : '<div class="empty">고를 문제가 없습니다. 정리 대기열에서 교재의 ③문항 위치·④단원 연결을 끝내면 문제가 생깁니다.</div>'}
      <div class="qbtns"><button type="button" class="btn ghost sm" id="pAdd">+ 1문항 더</button><button type="button" class="btn ghost sm" id="pAdd5">+ 5문항 더</button><button type="button" class="btn sm" id="pSave" ${d.items.length ? '' : 'disabled'}>저장하고 학생용 인쇄</button><button type="button" class="btn ghost sm" id="pCancel">취소</button></div>
      <p class="dl">교재 문제는 인쇄할 때 이 PC의 MYBOX에서 잘라 옵니다. 출처(교재·기출 이름)는 선생님용에만 나옵니다.</p></div>`;
  }
  const KN = k => (k === '테스트' ? '테스트지' : k === '숙제' ? '숙제' : '추천 문제지');
  const today = () => (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();  // 한국 날짜
  function hwHtml(s) {
    if (!s.hw) return '';
    const late = !s.hw.done && s.hw.due < today();
    return ` · <span class="hwtag ${s.hw.done ? 'ok' : late ? 'late' : ''}">숙제 ${esc(s.hw.due.slice(5).replace('-', '/'))}까지${s.hw.done ? ' · 완료' : late ? ' · 마감 지남' : ''}</span>`;
  }
  function setsHtml() {
    const ss = P.sets || [];
    if (P.setsErr) return `<div class="callout">문제지 목록을 못 읽었습니다 (Firebase 규칙에 sets·attempts 추가가 필요합니다): ${esc(P.setsErr)}</div>`;
    const form = `<details class="hwform"><summary>교재·범위로 숙제 내기</summary><div class="row2"><label class="sel" style="flex:2"><span>숙제 내용</span><input type="text" id="hwT" placeholder="예: 내신대비B 2회차 1~20번"></label><label class="sel"><span>마감일</span><input type="date" id="hwD" value="${new Date(Date.now() + 3 * DAY + 9 * 36e5).toISOString().slice(0, 10)}"></label><button type="button" class="btn sm" id="hwAdd">숙제 내기</button></div></details>`;
    if (!ss.length) return form;
    return `<h3 class="wnh3">문제지 · 숙제 ${ss.length}개</h3><div class="wnsheets">${ss.slice(0, 30).map(s => { const n = (s.items || []).length; return `<div class="wns"><span>${esc(md(s.at))} · ${esc(KN(s.kind))}${n ? ` · ${n}문항` : ''}${s.result ? ` · <b>${s.result.score}/${s.result.total}</b>` : ''}${hwHtml(s)}<br><small class="dl">${esc(s.title || '')}</small></span>
      <span class="wnsb">${n ? `<button type="button" class="linkbtn" data-pp="${s.id}" data-aud="student">학생용</button><button type="button" class="linkbtn" data-pp="${s.id}" data-aud="teacher">선생님용</button>` : ''}
      ${s.hw ? (s.hw.done ? `<button type="button" class="linkbtn" data-hu="${s.id}">완료 취소</button>` : `<button type="button" class="linkbtn" data-hd="${s.id}">숙제 완료</button>`) : `<button type="button" class="linkbtn" data-hw="${s.id}">숙제로</button>`}
      ${n ? `<button type="button" class="linkbtn" data-pr="${s.id}">${s.result ? '결과 고치기' : '결과 넣기'}</button>` : ''}${s.result ? `<button type="button" class="linkbtn" data-pc="${s.id}">카톡 카드</button><button type="button" class="linkbtn" data-pa="${s.id}">A4 분석지</button>` : ''}<button type="button" class="linkbtn danger" data-pd="${s.id}">지우기</button></span></div>`; }).join('')}</div>${form}`;
  }
  function resHtml() {
    const r = P.res; if (!r) return '';
    const s = r.set;
    return `<div class="pdraft"><b>${esc(KN(s.kind))} 결과 · ${esc(md(s.at))} · ${s.items.length}문항</b><p class="dl">틀린 번호만 누르세요. 누른 번호마다 틀린 이유를 고를 수 있습니다.</p>
      <div class="pnums">${s.items.map((x, k) => `<button type="button" class="pn ${r.wrong.has(k + 1) ? 'x' : ''}" data-pn="${k + 1}" title="${esc(x.label)}">${k + 1}</button>`).join('')}</div>
      ${[...r.wrong].sort((a, b) => a - b).map(no => `<div class="pcause"><b>${no}번</b> ${CAUSES.map(c => `<label><input type="radio" name="pc${no}" value="${c}" ${r.cause[no] === c ? 'checked' : ''}> ${c}</label>`).join('')}</div>`).join('')}
      <div class="qbtns"><button type="button" class="btn sm" id="pRSave">저장 · 분석지 만들기</button><button type="button" class="btn ghost sm" id="pRCancel">취소</button></div></div>`;
  }
  // ---------- 범위 고르기 (저장된 시험 범위 · 과정 → 단원) — 추천 문제지와 테스트지가 같이 씀 ----------
  const COURSE_ORDER = ['중등1-1', '중등1-2', '중등2-1', '중등2-2', '중등3-1', '중등3-2', '공통수학1', '공통수학2', '대수', '미적분Ⅰ', '확률과 통계', '기하'];
  const courseList = () => window.SudoUnits.sortCourses([...new Set((D.catalog || []).map(c => c[1]))]);
  const midGroups = course => { const m = new Map(); (D.catalog || []).forEach(c => { if (c[1] !== course) return; const k = `${c[1]}|${c[3]}.${c[4]}`; if (!m.has(k)) m.set(k, { k, name: c[4], midNo: c[3], big: c[2] }); }); return window.SudoUnits.group(course, [...m.values()]); };
  const midsOf = course => midGroups(course).flatMap(g => g.items);  // 교과서 목차 순서
  const cName = c => String(c || '').replace('중등', '중');
  function rgLoad(st) { let v = null; try { v = JSON.parse(localStorage.getItem('mathlib.prRange.' + st.id) || 'null'); } catch (_) {} P.rg = { m: (v && v.m) || 'none', scope: (v && v.scope) || '', course: (v && v.course) || `중등${st.grade}-${semNow()}`, units: new Set((v && v.units) || []) }; }
  function rgKeep(st) { try { localStorage.setItem('mathlib.prRange.' + st.id, JSON.stringify({ m: P.rg.m, scope: P.rg.scope, course: P.rg.course, units: [...P.rg.units] })); } catch (_) {} }
  function rgSet() {  // 지금 고른 범위 → 단원 묶음 (없으면 null)
    const g = P.rg; if (!g || g.m === 'none') return null;
    if (g.m === 'scope') { const sc = (P.scopes || []).find(x => x.id === g.scope); return sc ? new Set(sc.unitKeys || []) : null; }
    return new Set(g.units.size ? [...g.units] : midsOf(g.course).map(x => x.k));
  }
  function rgName() { const g = P.rg; if (!g || g.m === 'none') return ''; if (g.m === 'scope') { const sc = (P.scopes || []).find(x => x.id === g.scope); return sc ? sc.name + ' 범위' : ''; }
    const ms = midsOf(g.course); return `${cName(g.course)} ${g.units.size && g.units.size < ms.length ? [...g.units].map(unitName).join('·') : '전체'}`; }
  function rangeHtml(st) {
    const g = P.rg, R = rgSet();
    const sc = (P.scopes || []).slice().sort((a, b) => ((b.school === st.school && +b.grade === +st.grade) - (a.school === st.school && +a.grade === +st.grade)) || (b.at || 0) - (a.at || 0));
    const nIn = R ? (POOL || []).filter(c => R.has(c.unit) && allowed(st, c)).length : (POOL || []).filter(c => allowed(st, c)).length;
    const val = g.m === 'scope' ? 's:' + g.scope : g.m === 'course' ? 'c:' + g.course : 'none';
    return `<div class="prange"><div class="row2"><label class="sel" style="flex:2"><span>범위</span><select id="rgM"><option value="none" ${val === 'none' ? 'selected' : ''}>범위 없음 (모든 단원에서 약점)</option>
        ${sc.length ? `<optgroup label="저장된 시험 범위">${sc.map(x => `<option value="s:${esc(x.id)}" ${val === 's:' + x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</optgroup>` : ''}
        <optgroup label="과정 → 단원 직접 고르기">${courseList().map(c => `<option value="c:${esc(c)}" ${val === 'c:' + c ? 'selected' : ''}>${esc(cName(c))}</option>`).join('')}</optgroup></select></label>
        <span class="dl">범위 안 문제 <b>${nIn.toLocaleString()}</b>개</span></div>
      ${g.m === 'course' ? `<div class="pgroups">${midGroups(g.course).map(G => `<div class="pgrp"><div class="pgh"><b>${esc(G.label)}</b><button type="button" class="linkbtn" data-rgb="${esc(G.items.map(m => m.k).join('\n'))}">${G.items.every(m => g.units.has(m.k)) ? '대단원 빼기' : '대단원 전체'}</button></div><div class="punits">${G.items.map(m => `<button type="button" class="chip" data-rgu="${esc(m.k)}" aria-pressed="${g.units.has(m.k)}">${esc(m.name)}</button>`).join('')}</div></div>`).join('')}</div><small class="dl">단원을 안 고르면 ${esc(cName(g.course))} 전체입니다.</small>` : ''}
      ${g.m === 'scope' && R ? `<small class="dl">단원: ${[...R].map(unitName).map(esc).join(' · ')}</small>` : ''}</div>`;
  }
  function draw(box, st) {
    if (!P.rg || P.rgFor !== st.id) { rgLoad(st); P.rgFor = st.id; }
    const T = P.test;
    box.innerHTML = `<div class="wnhead"><h2>추천 · 테스트 <small>약점 지도 → 추천 문제지 · 테스트지 → 결과 → 분석지</small></h2></div>
      <h3 class="wnh3">약점 지도 <small class="dl">단원 × 난이도 오답률 · 교재 오답·시험·테스트 결과에서</small></h3>${heatHtml(st)}
      ${P.res ? resHtml() : P.draft ? draftHtml() : `${rangeHtml(st)}<div class="pmake">
        <div class="pcard"><b>추천 문제지</b><small class="dl">범위 안에서 약점 70 · 복습 20 · 출제 습관 10</small>
          <div class="row2"><label class="sel"><span>문항 수</span><input type="number" id="pN" min="5" max="40" value="${P.n}"></label><button type="button" class="btn" id="pRec">추천 문제지 만들기</button></div></div>
        <div class="pcard"><b>테스트지</b><small class="dl">범위 안에서 하 ${T.mix[0]} · 중 ${T.mix[1]} · 상 ${T.mix[2]} · 푼 문제는 유사문항으로${P.rg.m === 'none' ? ` · 범위 없음이면 ${esc(cName(`중등${st.grade}-${semNow()}`))} 전체` : ''}</small>
          <div class="row2"><label class="sel"><span>문항 수</span><select id="pTN">${[10, 11, 12, 13, 14, 15].map(v => `<option ${v === T.n ? 'selected' : ''}>${v}</option>`).join('')}</select></label><button type="button" class="btn" id="pTest">테스트지 만들기</button></div></div></div>`}
      ${setsHtml()}
      <p class="dl wnfoot">문제는 단원이 붙은 기출(같은 학교만)과 정리 대기열에서 ③④까지 끝난 교재, 원장님이 채택한 '학원 제작' 문제에서 고릅니다. 문제 모음 ${(POOL || []).length.toLocaleString()}문항.</p>`;
    bind(box, st);
  }
  function bind(box, st) {
    const q = s => box.querySelector(s), qa = s => [...box.querySelectorAll(s)];
    const re = () => draw(box, st);
    const busy = async (b, fn) => { if (b) b.disabled = true; try { await fn(); } catch (e) { toast(e.message); } if (b) b.disabled = false; };
    const rgm = q('#rgM'); if (rgm) rgm.onchange = () => { const v = rgm.value; if (v === 'none') P.rg.m = 'none'; else if (v.startsWith('s:')) { P.rg.m = 'scope'; P.rg.scope = v.slice(2); } else { const c = v.slice(2); if (c !== P.rg.course) P.rg.units = new Set(); P.rg.m = 'course'; P.rg.course = c; } rgKeep(st); re(); };
    qa('[data-rgb]').forEach(b => b.onclick = () => { const ks = b.dataset.rgb.split('\n'); const all = ks.every(k => P.rg.units.has(k)); ks.forEach(k => all ? P.rg.units.delete(k) : P.rg.units.add(k)); rgKeep(st); re(); });
    qa('[data-rgu]').forEach(b => b.onclick = () => { const u = b.dataset.rgu; if (P.rg.units.has(u)) P.rg.units.delete(u); else P.rg.units.add(u); rgKeep(st); re(); });
    const rec = q('#pRec'); if (rec) rec.onclick = () => busy(rec, async () => { P.n = Math.max(5, Math.min(40, +q('#pN').value || 15)); const R = rgSet(), nm = rgName(); const items = await recommend(st, P.n, R);
      if (R && items.length < P.n) toast(`범위 안에서 고를 수 있는 문제가 ${items.length}개뿐입니다`);
      P.draft = { kind: '추천', title: `${st.name} 추천 문제지${nm ? ' · ' + nm : ''}`, items, range: R }; re(); });
    const tst = q('#pTest'); if (tst) tst.onclick = () => busy(tst, async () => { P.test.n = +q('#pTN').value; const R = rgSet() || new Set(midsOf(`중등${st.grade}-${semNow()}`).map(x => x.k)); const nm = rgName() || cName(`중등${st.grade}-${semNow()}`);
      const items = await makeTest(st, Object.assign({}, P.test, { units: R })); if (items.length < P.test.n) toast(`범위 안에서 고를 수 있는 문제가 ${items.length}개뿐입니다`); P.draft = { kind: '테스트', title: `${st.name} 테스트지 · ${nm}`, items, range: R }; re(); });
    if (P.draft) {
      const d = P.draft; const seen = () => new Set(P.hist.map(h => h.key)); const taken = () => new Set(d.items.map(x => x.key));
      qa('[data-sw]').forEach(b => b.onclick = () => { const k = +b.dataset.sw; const s = similar(d.items[k], st, seen(), taken())[0]; if (!s) return toast('바꿀 유사문항이 없습니다' + (owner ? ' — AI 변형을 써 보세요' : '')); d.items[k] = Object.assign({}, s, { tag: d.items[k].tag, why: '유사문항으로 바꿈' }); re(); });
      qa('[data-rm]').forEach(b => b.onclick = () => { d.items.splice(+b.dataset.rm, 1); re(); });
      qa('[data-av]').forEach(b => b.onclick = () => busy(b, () => variant(st, +b.dataset.av, re)));
      q('#pAdd').onclick = () => { if (!addOne(st)) toast('더 고를 문제가 없습니다'); re(); };
      q('#pAdd5').onclick = () => { let k = 0; while (k < 5 && addOne(st)) k++; if (k < 5) toast(`${k}문항만 더했습니다 (고를 문제가 모자람)`); re(); };
      q('#pCancel').onclick = () => { P.draft = null; re(); };
      q('#pSave').onclick = () => busy(q('#pSave'), async () => { const s = await saveDraft(st); toast('저장했습니다'); re(); print(st, s, 'student'); });
    }
    if (P.res) {
      const r = P.res;
      qa('[data-pn]').forEach(b => b.onclick = () => { const no = +b.dataset.pn; if (r.wrong.has(no)) { r.wrong.delete(no); delete r.cause[no]; } else r.wrong.add(no); re(); });
      qa('.pcause input').forEach(i => i.onchange = () => { r.cause[+i.name.slice(2)] = i.value; });
      q('#pRCancel').onclick = () => { P.res = null; re(); };
      q('#pRSave').onclick = () => busy(q('#pRSave'), async () => { await saveResult(st, r.set, r.wrong, r.cause); const s = r.set; P.res = null; P.hist = await history(st); toast('결과를 저장했습니다'); re(); card(st, s); });
    }
    const find = id => (P.sets || []).find(s => s.id === id);
    const upd = async (id, d) => { await fdb().collection('sets').doc(id).update(d); await loadSets(st); re(); };
    qa('[data-hw]').forEach(b => b.onclick = () => busy(b, async () => { const due = prompt('숙제 마감일 (예: 2026-11-20)', new Date(Date.now() + 3 * DAY + 9 * 36e5).toISOString().slice(0, 10)); if (!due || !/^\d{4}-\d{2}-\d{2}$/.test(due)) return; await upd(b.dataset.hw, { hw: { due, by: ctx.user, at: new Date().toISOString(), done: false }, hwOpen: true }); toast('숙제로 냈습니다'); }));
    qa('[data-hd]').forEach(b => b.onclick = () => busy(b, async () => { const s = find(b.dataset.hd); await upd(s.id, { 'hw.done': true, 'hw.doneAt': new Date().toISOString(), 'hw.doneBy': ctx.user, hwOpen: false }); toast('숙제 완료로 표시했습니다' + ((s.items || []).length && !s.result ? ' — 틀린 번호도 넣으려면 [결과 넣기]' : '')); }));
    qa('[data-hu]').forEach(b => b.onclick = () => busy(b, () => upd(b.dataset.hu, { 'hw.done': false, hwOpen: true })));
    const ha = q('#hwAdd'); if (ha) ha.onclick = () => busy(ha, async () => { const t = q('#hwT').value.trim(), due = q('#hwD').value; if (!t || !due) return toast('숙제 내용과 마감일을 넣어 주세요');
      await fdb().collection('sets').add({ owner: st.owner || ctx.user, sid: st.id, sname: st.name, kind: '숙제', title: t, at: new Date().toISOString(), by: ctx.user, items: [], result: null, hw: { due, by: ctx.user, at: new Date().toISOString(), done: false }, hwOpen: true }); await loadSets(st); toast('숙제를 냈습니다'); re(); });
    qa('[data-pp]').forEach(b => b.onclick = () => print(st, find(b.dataset.pp), b.dataset.aud));
    qa('[data-pr]').forEach(b => b.onclick = () => { const s = find(b.dataset.pr); P.res = { set: s, wrong: new Set((s.result && s.result.wrong) || []), cause: Object.assign({}, (s.result && s.result.cause) || {}) }; P.draft = null; re(); });
    qa('[data-pc]').forEach(b => b.onclick = () => card(st, find(b.dataset.pc)));
    qa('[data-pa]').forEach(b => b.onclick = () => a4(st, find(b.dataset.pa)));
    qa('[data-pd]').forEach(b => b.onclick = () => busy(b, async () => { const s = find(b.dataset.pd); if (!confirm(`${md(s.at)} ${s.kind === '테스트' ? '테스트지' : '추천 문제지'}(${s.items.length}문항)를 지울까요?${s.result ? '\n넣은 결과(풀이 기록)도 같이 지워집니다.' : ''}`)) return;
      const bt = fdb().batch(); bt.delete(fdb().collection('sets').doc(s.id)); if (s.result) s.items.forEach((x, k) => bt.delete(fdb().collection('attempts').doc(`${s.id}_${k + 1}`))); await bt.commit(); await loadSets(st); P.hist = await history(st); re(); }));
  }
  function print(st, set, aud) {
    const W = H.WN && H.WN(); if (!W || !W.printSet) return toast('이 브라우저에서는 인쇄를 준비할 수 없습니다 (PC 크롬·엣지)');
    W.printSet(st, set, aud, ctx.getImgs);
  }
  // AI 변형 (원장님만, 버튼을 누를 때만)
  async function variant(st, k, re) {
    const d = P.draft, x = d.items[k];
    const S = H.reg && H.reg.aiSettings ? H.reg.aiSettings() : null;
    if (!S || !S.url) return toast('시험 등록 화면에서 AI 연결을 먼저 해 주세요');
    if (!confirm(`'${unitName(x.unit)} · ${DN[x.diff]}' 유사문항을 AI로 1개 만들까요?\n예상 비용 약 $0.03 (1문항). 마음에 들면 [채택]해야 문항 은행에 '학원 제작'으로 저장됩니다.`)) return;
    toast('AI가 문제를 만드는 중…');
    if (window.SudoCost) window.SudoCost('variant', S.model, null, 0.03);
    const v = await window.SudoAI.makeVariant({ settings: S, getToken: ctx.getToken, target: { unit: unitName(x.unit), type: x.type || '', diff: DN[x.diff], q: x.q || '' } });
    const html = `<div class="pvar"><b>AI 변형 — ${esc(unitName(x.unit))} · ${DN[x.diff]}</b><div class="pvq">${esc(v.stem)}${(v.choices || []).length ? `<br>${v.choices.map((c, i) => `${'①②③④⑤'[i] || ''} ${esc(c)}`).join('  ')}` : ''}</div><div class="dl">정답 ${esc(v.answer)} · ${esc(v.concept || '')}</div><details><summary>풀이</summary><div class="pvq">${esc(v.solution)}</div></details>
      <div class="qbtns"><button type="button" class="btn sm" id="pvOk">채택 (문항 은행에 저장)</button><button type="button" class="btn ghost sm" id="pvNo">버리기</button></div></div>`;
    const li = document.querySelectorAll('.plist li')[k]; if (!li) return;
    li.insertAdjacentHTML('afterend', `<li class="pvli">${html}</li>`);
    document.getElementById('pvNo').onclick = () => re();
    document.getElementById('pvOk').onclick = async () => {
      const id = 'ai_' + Date.now().toString(36);
      await fdb().collection('items').doc(id).set({ from: '학원 제작', source: 'ai', unit: x.unit, diff: x.diff, stem: v.stem, choices: v.choices || [], answer: v.answer, solution: v.solution, concept: v.concept || '', base: x.key, at: new Date().toISOString(), by: ctx.user, status: 'checked' });
      const c = { key: `a|${id}`, kind: 'ai', unit: x.unit, diff: x.diff, q: v.stem, choices: v.choices || [], ans: v.answer, sol: v.solution, label: `학원 제작 · ${unitName(x.unit)}` };
      (POOL || []).push(c); d.items[k] = Object.assign({}, c, { tag: x.tag, why: 'AI 변형 채택' }); toast('채택해서 문항 은행에 저장했습니다'); re();
    };
  }

  // ---------- 분석지: 단원별 정리 ----------
  function summary(st, set) {
    const r = set.result, U = new Map();
    set.items.forEach((x, k) => { const u = unitName(x.unit); if (!U.has(u)) U.set(u, { u, n: 0, ok: 0 }); const o = U.get(u); o.n++; if (!r.wrong.includes(k + 1)) o.ok++; });
    const units = [...U.values()].map(o => Object.assign(o, { rate: o.ok / o.n })).sort((a, b) => b.rate - a.rate);
    const causes = {}; Object.values(r.cause || {}).forEach(c => { causes[c] = (causes[c] || 0) + 1; });
    const W = weakMap(P.hist || []).filter(u => u.w > 0).slice(0, 2).map(u => unitName(u.unit));
    return { units, causes, next: W.length ? W : units.filter(u => u.rate < 1).slice(-2).map(u => u.u) };
  }
  function card(st, set) {
    if (!set || !set.result) return;
    const r = set.result, S = summary(st, set);
    const c = document.createElement('canvas'); c.width = 1080; c.height = 1350; const g = c.getContext('2d');
    const F = (w, s) => `${w} ${s}px "Pretendard","Noto Sans KR","Apple SD Gothic Neo","Malgun Gothic",sans-serif`;
    g.fillStyle = '#0A4844'; g.fillRect(0, 0, 1080, 1350);
    g.fillStyle = '#DEBC62'; g.fillRect(80, 120, 120, 8);
    g.fillStyle = '#CFE1DB'; g.font = F(500, 36); g.fillText(`수학도서관 · ${set.kind === '테스트' ? '테스트' : '추천 문제'} · ${md(r.at)}`, 80, 200);
    g.fillStyle = '#fff'; g.font = F(800, 64); g.fillText(`${st.name}`, 80, 290);
    g.fillStyle = '#DEBC62'; g.font = F(800, 200); g.fillText(`${r.score}`, 80, 520); const w = g.measureText(`${r.score}`).width;
    g.fillStyle = '#CFE1DB'; g.font = F(700, 80); g.fillText(` / ${r.total}`, 80 + w, 520);
    let y = 640; g.font = F(700, 40);
    const best = S.units[0], worst = S.units[S.units.length - 1];
    if (best) { g.fillStyle = '#CFE1DB'; g.fillText('잘한 단원', 80, y); g.fillStyle = '#fff'; g.fillText(`${best.u} ${Math.round(best.rate * 100)}%`, 330, y); y += 80; }
    if (worst && worst !== best && worst.rate < 1) { g.fillStyle = '#CFE1DB'; g.fillText('다시 볼 단원', 80, y); g.fillStyle = '#fff'; g.fillText(`${worst.u} ${Math.round(worst.rate * 100)}%`, 330, y); y += 80; }
    const cs = Object.entries(S.causes); if (cs.length) { g.fillStyle = '#CFE1DB'; g.font = F(500, 36); g.fillText('틀린 이유  ' + cs.map(([k, v]) => `${k} ${v}`).join(' · '), 80, y + 20); y += 90; }
    g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(80, y, 920, 4); y += 80;
    g.fillStyle = '#DEBC62'; g.font = F(700, 40); g.fillText('다음 공부', 80, y); g.fillStyle = '#fff'; g.font = F(500, 38); g.fillText(S.next.length ? `${S.next.join(', ')} 유사문항 연습` : '지금처럼 꾸준히!', 80, y + 64);
    g.fillStyle = '#CFE1DB'; g.font = F(500, 30); g.fillText('수학도서관 · 1:1 명품 맞춤 수학학원', 80, 1270);
    const url = c.toDataURL('image/png');
    const w2 = window.open('', '_blank'); if (!w2) return toast('팝업이 막혀 있습니다');
    w2.document.write(`<!doctype html><meta charset="utf-8"><title>${esc(st.name)} 카톡 카드</title><body style="margin:0;background:#222;display:flex;flex-direction:column;align-items:center;gap:12px;padding:16px;font-family:sans-serif"><a download="${esc(st.name)}_${md(r.at).replace('/', '-')}_결과.png" href="${url}" style="background:#DEBC62;color:#0A4844;padding:10px 18px;border-radius:10px;font-weight:700;text-decoration:none">이미지 저장 (카톡으로 보내기)</a><img src="${url}" style="max-width:min(540px,100%);border-radius:12px"></body>`);
  }
  function a4(st, set) {
    if (!set || !set.result) return;
    const r = set.result, S = summary(st, set);
    const rows = set.items.map((x, k) => ({ no: k + 1, x, ok: !r.wrong.includes(k + 1), cause: (r.cause || {})[k + 1] || '' }));
    const w = window.open('', '_blank'); if (!w) return toast('팝업이 막혀 있습니다');
    w.document.write(`<!doctype html><html lang="ko"><meta charset="utf-8"><title>${esc(st.name)} 분석지</title><style>
      @page{size:A4;margin:14mm}body{font-family:"Pretendard","Noto Sans KR","Malgun Gothic",sans-serif;color:#18211F;margin:0;padding:18px;font-size:13px}
      .top{display:flex;justify-content:space-between;align-items:end;border-bottom:3px solid #0A4844;padding-bottom:8px}.top h1{margin:0;font-size:22px;color:#0A4844}.k{color:#7A5C14;font-weight:700;font-size:12px;letter-spacing:.06em}
      .score{font-size:44px;font-weight:800;color:#0A4844}.score small{font-size:20px;color:#5C6A66}
      h2{font-size:15px;color:#0A4844;margin:18px 0 6px}table{width:100%;border-collapse:collapse}td,th{border-bottom:1px solid #DCE3E0;padding:5px 6px;text-align:left}th{background:#E8F0ED;font-size:12px}
      .bar{height:8px;background:#E6ECEA;border-radius:4px;overflow:hidden;width:160px}.bar i{display:block;height:100%;background:#2E7566}.x{color:#B3261E;font-weight:700}.o{color:#2E7566}
      .pr{position:fixed;top:10px;right:10px}@media print{.pr{display:none}}</style>
      <button class="pr" onclick="print()">인쇄 · PDF로 저장</button>
      <div class="top"><div><div class="k">수학도서관 · ${set.kind === '테스트' ? '테스트 분석지' : '추천 문제 분석지'}</div><h1>${esc(st.name)} <span style="font-size:14px;color:#5C6A66">${esc(st.school || '')} ${st.grade || ''}학년 · ${md(r.at)}</span></h1></div><div class="score">${r.score}<small> / ${r.total}</small></div></div>
      <h2>단원별 정답률</h2><table><tr><th>단원</th><th>맞힘</th><th></th></tr>${S.units.map(u => `<tr><td>${esc(u.u)}</td><td>${u.ok}/${u.n}</td><td><div class="bar"><i style="width:${Math.round(u.rate * 100)}%"></i></div></td></tr>`).join('')}</table>
      <h2>문항별 결과</h2><table><tr><th>번호</th><th>단원</th><th>난이도</th><th>결과</th><th>틀린 이유</th></tr>${rows.map(o => `<tr><td>${o.no}</td><td>${esc(unitName(o.x.unit))}</td><td>${DN[o.x.diff]}</td><td class="${o.ok ? 'o' : 'x'}">${o.ok ? '맞음' : '틀림'}</td><td>${esc(o.cause)}</td></tr>`).join('')}</table>
      ${Object.keys(S.causes).length ? `<h2>틀린 이유</h2><p>${Object.entries(S.causes).map(([k, v]) => `${esc(k)} ${v}문항`).join(' · ')}</p>` : ''}
      <h2>다음 공부</h2><p>${S.next.length ? `${S.next.map(esc).join(', ')} 단원의 유사문항으로 다시 연습합니다. 틀린 문제는 3일 · 7일 · 14일 뒤 다시 풀어 봅니다.` : '모든 단원을 잘 해냈습니다. 다음 범위로 넘어갑니다.'}</p>
      <p style="margin-top:28px;color:#5C6A66;font-size:11px">수학도서관 · 1:1 명품 맞춤 수학학원</p></html>`);
  }
  // 7단계(시험 대비)에서 쓰는 것
  async function testFor(st, units, n) { return makeTest(st, { units: new Set(units), n: n || 15, mix: [20, 50, 30] }); }
  async function saveSetFor(st, kind, title, items) { const doc = { owner: st.owner || ctx.user, sid: st.id, sname: st.name, kind, title, at: new Date().toISOString(), by: ctx.user, per: 4, items: items.map(slim), result: null }; const r = await fdb().collection('sets').add(doc); return Object.assign({ id: r.id }, doc); }
  return { resetScopes: () => { P.scopes = null; }, panel, pool, history, weakMap, similar, recommend, testFor, saveSetFor, slim, unitName, mine, print, reset: () => { POOL = null; BOOKS = null; } };
};
