// 수학도서관 — 문제 제작소: 학교별 누적 분석으로 모의고사 3회분
// · 한 학교 · 학년 · 이번 시험(연도 · 학기 · 중간/기말)에 한 번만 만든다. 만들어진 것은 모든 선생님이 함께 쓴다.
// · 다시 만들기는 원장님만(이전 것은 지우지 않고 '~시각'으로 보관). 문항 바꾸기는 만든 사람과 원장님만.
// · 틀: 같은 학교 · 같은 학년 · 같은 학기 · 같은 시험의 가장 최근 시험(없으면 그 학교 최근 시험) — 번호별 배점 · 난이도 · 서답형.
//   단원 비중: 지난 시험에서 이번 범위 단원이 나온 비율. 1 · 2회는 틀 그대로, 3회는 응용 일부를 실력으로(약 10%).
// · 채우기: 학원 교재 → 학교 프린트 → 학원 제작(이미 만든 AI 문항) → 없으면 AI 변형(같은 학교 기출을 기준으로, 따로 한 번 더 풀어 정답 확인).
//   다른 학교 기출 · 같은 학교 기출 원문은 그대로 쓰지 않는다. 회차끼리 같은 문항 없음.
// · AI 한도: 한 번 만들기에 $2. 넘으면 비슷한 난이도의 문항으로, 그것도 없으면 '빈자리'.
// · 저장: mocks/{mk_학교_학년_연도_학기_시험} — state making(잠금) → done. AI 비용은 문서에(usd, mo) → 홈 AI 비용 카드 '모의고사'.
window.SudoFactory = function (H) {
  const { D, ctx, esc, toast, $, $$ } = H;
  const me = (ctx && ctx.me) || { role: 'owner', name: '원장' };
  const owner = me.role === 'owner' || me.role === 'co';
  const fdb = () => firebase.firestore();
  const CAP = 2, USD_MAKE = 0.03, USD_CHECK = 0.02, USD_ONE = USD_MAKE + USD_CHECK, STALE = 30 * 60e3;
  const DN4 = ['', '기본', '응용', '실력', '심화'], DN3 = ['', '하', '중', '상'];
  const DI3 = d => (d <= 1 ? 1 : d === 2 ? 2 : 3);
  const KORD = { book: 0, mat: 0, print: 1, ai: 2 };
  const KLAB = { book: '학원 교재', mat: '학원 교재', print: '학교 프린트', ai: 'AI 변형', empty: '빈자리' };
  const unitOfCat = ci => { const c = (D.catalog || [])[ci]; return c ? `${c[1]}|${c[3]}.${c[4]}` : ''; };
  const unitName = u => String(u || '').split('|').pop().replace(/^\s*\d+\s*\.\s*/, '');
  const evInfo = p => ({ t: /1학기/.test(p.label) ? 1 : 2, x: /중간/.test(p.label) ? '중간' : /기말/.test(p.label) ? '기말' : '시험', y: +p.start.slice(0, 4) });
  const idOf = k => `mk_${k.school}_${k.grade}_${k.year}_${k.sem}_${k.exam}`;
  const scopeId = k => `rng_${k.school}_${k.grade}_${k.year}_${k.sem}_${k.exam}`;
  const labelOf = k => `${k.school} ${k.grade}학년 · ${k.year} ${k.sem}학기 ${k.exam}`;
  const monthKST = () => new Date(Date.now() + 9 * 36e5).toISOString().slice(0, 7);
  const md = t => { const d = new Date(t); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  const clean = o => JSON.parse(JSON.stringify(o));
  const F = { sel: null, round: 1, docs: null, busy: null, units: null, unitsFor: null, give: false };
  let PL = null; const poolP = async () => (PL = await H.PR.pool());

  // ---------- 저장된 모의고사 ----------
  async function loadDocs() {
    const s = await fdb().collection('mocks').get();
    F.docs = {}; s.docs.forEach(d => { const x = d.data(); if (!x.archived) F.docs[d.id] = Object.assign({ id: d.id }, x); });
    return F.docs;
  }
  const stale = x => x && x.state === 'making' && Date.now() - (x.lockAt || 0) > STALE;
  const canEdit = x => owner || (x && x.by === ctx.user);

  // ---------- 시험의 틀 ----------
  function examsOf(k) {
    const has = e => e.an && (e.an.items || []).length;
    const same = (D.exams || []).filter(e => e.s === k.school && +e.g === +k.grade && +e.t === +k.sem && e.x === k.exam && has(e)).sort((a, b) => b.y - a.y);
    const sch = (D.exams || []).filter(e => e.s === k.school && has(e)).sort((a, b) => b.y - a.y || +b.g - +a.g);
    return { same, sch };
  }
  function orderUnits(keys) {
    const slot = u => { const [course, m] = u.split('|'); const name = unitName(u); const sl = window.SudoUnits && window.SudoUnits.slotOf ? window.SudoUnits.slotOf(course, name) : null; return [course, sl ? sl.bi * 100 + sl.mi : 9000 + (parseInt(m, 10) || 0)]; };
    return keys.slice().sort((a, b) => { const A = slot(a), B = slot(b); return A[0].localeCompare(B[0]) || A[1] - B[1]; });
  }
  function blueprint(k, R) {
    const { same, sch } = examsOf(k);
    const base = same[0] || sch[0] || null;
    const its = base ? base.an.items.slice().sort((a, b) => a[0] - b[0])
      : Array.from({ length: 20 }, (_, i) => [i + 1, i < 17 ? 4 : 8, i < 4 ? 1 : i < 13 ? 2 : 3, '', '', '', '', '', -1, i >= 17 ? 1 : 0]);
    const pos = its.map((i, j) => ({ p: j + 1, pts: +i[1] || 0, d4: i[2] || 2, essay: !!i[9], code0: i[8], unit0: i[8] >= 0 ? unitOfCat(i[8]) : '' }));
    const units = orderUnits([...R]);
    const n = pos.length;
    const src = (same.length ? same : sch);
    const hist = src.flatMap(e => e.an.items).map(i => (i[8] >= 0 ? unitOfCat(i[8]) : '')).filter(u => R.has(u));
    const w = units.map(u => 1 + hist.filter(x => x === u).length), sw = w.reduce((a, b) => a + b, 0) || 1;
    const minOne = n >= units.length;
    let counts = w.map(x => (minOne ? 1 : 0) + Math.floor((n - (minOne ? units.length : 0)) * x / sw));
    const rest = n - counts.reduce((a, b) => a + b, 0);
    w.map((x, i) => ({ i, r: ((n - (minOne ? units.length : 0)) * x / sw) % 1 })).sort((a, b) => b.r - a.r).slice(0, Math.max(0, rest)).forEach(o => counts[o.i]++);
    const seq = []; units.forEach((u, i) => { for (let j = 0; j < counts[i]; j++) seq.push(u); });
    const ess = pos.filter(x => x.essay);
    ess.forEach((x, j) => { const idx = Math.min(seq.length - 1, Math.floor((j + 0.5) * seq.length / ess.length)); x.unit = seq.splice(idx, 1)[0]; });
    pos.filter(x => !x.essay).forEach((x, j) => { x.unit = seq[j] || units[units.length - 1]; });
    const freq = {};
    sch.forEach(e => e.an.items.forEach(i => { if (i[8] >= 0) { const u = unitOfCat(i[8]); freq[u] = freq[u] || {}; freq[u][i[8]] = (freq[u][i[8]] || 0) + 1; } }));
    pos.forEach(x => {
      x.code = x.unit0 === x.unit ? x.code0 : freq[x.unit] ? +Object.entries(freq[x.unit]).sort((a, b) => b[1] - a[1])[0][0] : -1;
      const c = (D.catalog || [])[x.code]; x.type = c ? c[6] : '';
    });
    const dcount = [0, 0, 0, 0, 0]; pos.forEach(x => { dcount[x.d4]++; });
    return { base, same, sch, pos, units, counts, dcount, total: pos.reduce((s, x) => s + x.pts, 0), essays: ess.length, thin: !same.length };
  }
  function roundPos(bp, r) {
    const pos = bp.pos.map(x => Object.assign({}, x));
    if (r === 3) { const k = Math.max(1, Math.round(pos.length * 0.1)); pos.filter(x => !x.essay && x.d4 === 2).slice(-k).forEach(x => { x.d4 = 3; x.up = 1; }); }
    return pos;
  }

  // ---------- 문항 고르기 ----------
  const okSrc = (k, c) => {
    if (!(c.kind in KORD)) return false;   // 기출 원문은 쓰지 않음(AI 변형의 기준으로만)
    if (c.kind === 'print' && c.school && c.school !== k.school) return false;
    if ((c.kind === 'mat' || c.kind === 'print') && !c.ik && !c.q) return false;
    if (c.kind === 'ai' && !c.q) return false;
    return true;
  };
  function pick(pool, k, x, taken, loose, skip) {
    const d3 = DI3(x.d4); let best = null, bs = -1e9;
    for (const c of pool) {
      if (c.unit !== x.unit || taken.has(c.key) || (skip && skip.has(c.key)) || !okSrc(k, c)) continue;
      const dd = Math.abs((c.diff || 2) - d3); if (dd > (loose ? 1 : 0)) continue;
      const s = (x.code >= 0 && c.code === x.code ? 3 : 0) - dd * 1.5 + (2 - KORD[c.kind]) * 0.6 + Math.random() * 0.3;
      if (s > bs) { bs = s; best = c; }
    }
    return best;
  }
  async function plan(k, bp) {
    const pool = await poolP(); const taken = new Set(); const cnt = { book: 0, print: 0, ai: 0, need: 0 };
    for (let r = 1; r <= 3; r++) roundPos(bp, r).forEach(x => { const c = pick(pool, k, x, taken, false); if (c) { taken.add(c.key); cnt[c.kind === 'mat' ? 'book' : c.kind]++; } else cnt.need++; });
    return cnt;
  }
  function aiBase(k, x) {
    const d3 = DI3(x.d4);
    const ex = (D.exams || []).filter(e => e.s === k.school && e.an).flatMap(e => e.an.items.map(i => ({ e, i })))
      .filter(o => o.i[8] >= 0 && unitOfCat(o.i[8]) === x.unit && o.i[12]);
    ex.sort((a, b) => ((b.i[8] === x.code) - (a.i[8] === x.code)) || (Math.abs(DI3(a.i[2]) - d3) - Math.abs(DI3(b.i[2]) - d3)) || (b.e.y - a.e.y));
    if (ex[0]) return { q: ex[0].i[12], type: ex[0].i[7] || x.type, key: `x|${ex[0].e.id}|${ex[0].i[0]}` };
    const p = (PL || []).find(c => c.unit === x.unit && c.q);
    return p ? { q: p.q, type: p.type || x.type, key: p.key } : { q: '', type: x.type, key: '' };
  }
  const nrm = s => String(s ?? '').replace(/\$/g, '').replace(/\\(dfrac|tfrac)/g, '\\frac').replace(/\s|[{}]|\\left|\\right/g, '').replace(/[①②③④⑤]/g, c => String('①②③④⑤'.indexOf(c) + 1)).replace(/번$/, '');
  function sameAns(v, a) {
    const ch = v.choices || [];
    const idx = s => { if (/^[1-5]$/.test(s)) return s; const i = ch.findIndex(c => nrm(c) === s); return i >= 0 ? String(i + 1) : s; };
    let A = nrm(v.answer), B = nrm(a); if (ch.length) { A = idx(A); B = idx(B); }
    return !!A && A === B;
  }
  async function makeAI(k, x, cost) {
    const S = H.reg && H.reg.aiSettings ? H.reg.aiSettings() : null;
    if (!S || !S.url) throw new Error('AI 연결 전 — 원장님이 시험 등록 화면에서 AI 연결을 먼저 해 주세요');
    const b = aiBase(k, x);
    const form = x.essay ? '서술형 (보기 없이 풀이 과정을 쓰는 문제)' : '객관식 5지선다';
    let v = null, chk = false;
    for (let t = 0; t < 2 && !chk; t++) {
      if (cost.usd + USD_ONE > CAP + 1e-9) { if (v) break; throw new Error('cap'); }
      v = await window.SudoAI.makeVariant({ settings: S, getToken: ctx.getToken, target: { unit: unitName(x.unit), type: x.type || b.type || '', diff: DN4[x.d4], q: b.q, form } });
      cost.usd += USD_MAKE; cost.n++;
      try { const c = await window.SudoAI.solveCheck({ settings: S, getToken: ctx.getToken, stem: v.stem, choices: v.choices || [] }); if (c && c.ok !== false && sameAns(v, c.answer)) chk = true; } catch (_) { /* 확인 실패는 '확인 필요'로 */ }
      cost.usd += USD_CHECK;
    }
    const id = 'ai_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    await fdb().collection('items').doc(id).set(clean({ from: '학원 제작', source: 'ai', unit: x.unit, diff: DI3(x.d4), stem: v.stem, choices: v.choices || [], answer: v.answer || '', solution: v.solution || '', concept: v.concept || '', base: b.key, at: new Date().toISOString(), by: ctx.user, status: chk ? 'checked' : 'review', mock: idOf(k) }));
    const c = { key: `a|${id}`, kind: 'ai', unit: x.unit, diff: DI3(x.d4), q: v.stem, choices: v.choices || [], ans: v.answer || '', sol: v.solution || '', label: `학원 제작 · ${unitName(x.unit)}`, chk };
    (await poolP()).push(c);
    return c;
  }
  const slimM = (x, slot) => clean(Object.assign(H.PR.slim(Object.assign({}, x, { pts: slot.pts, essay: slot.essay ? 1 : 0 })), { d4: slot.d4, up: slot.up || 0, code: x.code ?? -1, type: slot.type || '' }));

  // 한 자리 채우기 (교재 문제는 인쇄할 수 있는지 확인 — 안 되면 다음 후보)
  async function fill(k, x, taken, ctl) {
    const pool = await poolP(); const W = H.WN && H.WN();
    const tryPick = async loose => {
      for (let t = 0; t < 8; t++) {
        const c = pick(pool, k, x, taken, loose, ctl.skip); if (!c) return null;
        if (c.kind !== 'book') return c;
        if (!W) { ctl.skip.add(c.key); continue; }
        const r = await W.prepBook(c, ctl.roots); if (r.ok) { if (!c.ans && r.ans) c.ans = r.ans; return c; }
        ctl.skip.add(c.key);
      }
      return null;
    };
    let c = await tryPick(false), why = '';
    if (!c && !ctl.noAI) {
      try { c = await makeAI(k, x, ctl.cost); why = c.chk ? 'AI 변형 · 정답 확인' : 'AI 변형 · 확인 필요'; ctl.aiFail = 0; }
      catch (e) { if (e.message === 'cap') ctl.noAI = '한도'; else { ctl.aiFail++; ctl.lastErr = e.message; if (ctl.aiFail >= 3 || /AI 연결 전/.test(e.message)) ctl.noAI = e.message; } }
    }
    if (!c) { c = await tryPick(true); if (c) why = '비슷한 난이도로 대신'; }
    if (!c) { c = { key: `e|${idOf(k)}|${ctl.r}|${x.p}`, kind: 'empty', unit: x.unit, diff: DI3(x.d4), label: '빈자리', q: '' }; why = '맞는 문항 없음'; }
    taken.add(c.key);
    return Object.assign({}, c, { why });
  }

  // ---------- 만들기 ----------
  async function create(k, bp, regen) {
    const id = idOf(k), ref = fdb().collection('mocks').doc(id);
    if (regen && owner) {
      const old = await ref.get();
      if (old.exists) await fdb().collection('mocks').doc(`${id}~${Date.now()}`).set(Object.assign({}, old.data(), { archived: true, archivedAt: new Date().toISOString(), archivedBy: ctx.user }));
    }
    const now = Date.now();
    try {
      await fdb().runTransaction(async tx => {
        const d = await tx.get(ref);
        if (d.exists && !(regen && owner)) { const x = d.data(); if (!stale(x) && x.lockAt !== 0) throw new Error(x.state === 'done' ? `${x.byName || x.by} 선생님이 이미 만들었습니다` : `${x.byName || x.by} 선생님이 만드는 중입니다`); }
        tx.set(ref, { school: k.school, grade: +k.grade, year: +k.year, sem: +k.sem, exam: k.exam, label: labelOf(k), state: 'making', by: ctx.user, byName: me.name || '', lockAt: now, at: new Date().toISOString(), prog: '시작', mo: monthKST(), usd: 0 });
      });
    } catch (e) { F.busy = null; toast('만들 수 없습니다: ' + e.message); F.docs = null; if (H.curView === 'factory') render(); return; }
    // 범위가 저장 안 돼 있으면 시험 대비 화면과 같이 쓰도록 저장
    try { const s = await fdb().collection('scopes').doc(scopeId(k)).get(); if (!s.exists) await fdb().collection('scopes').doc(scopeId(k)).set({ name: `${k.school} ${k.grade}학년 ${k.sem}학기 ${k.exam}`, school: k.school, grade: +k.grade, sem: +k.sem, exam: k.exam, year: +k.year, units: bp.units.map(unitName), unitKeys: bp.units, src: 'range', at: Date.now(), by: ctx.user }); } catch (_) {}
    let wl = null; try { wl = await navigator.wakeLock.request('screen'); } catch (_) {}
    const W = H.WN && H.WN();
    const ctl = { cost: { usd: 0, n: 0 }, skip: new Set(), roots: W ? await W.liveRoots() : null, noAI: '', aiFail: 0, r: 1 };
    F.busy = { id, step: 0, total: bp.pos.length * 3, text: '시작', roots: !!ctl.roots };
    let beat = 0;
    const prog = async text => { F.busy.text = text; paintBusy(); if (Date.now() - beat > 15000) { beat = Date.now(); try { await ref.update({ prog: text, lockAt: Date.now(), usd: ctl.cost.usd }); } catch (_) {} } };
    try {
      await poolP();
      const taken = new Set(), rounds = []; let empty = 0, unchecked = 0;
      for (let r = 1; r <= 3; r++) {
        ctl.r = r; const items = [];
        for (const x of roundPos(bp, r)) {
          F.busy.step++; await prog(`${r}회 ${x.p}번 채우는 중 (${F.busy.step}/${F.busy.total}) · AI $${ctl.cost.usd.toFixed(2)}`);
          const c = await fill(k, x, taken, ctl);
          if (c.kind === 'empty') empty++; if (c.kind === 'ai' && c.chk === false) unchecked++;
          items.push(slimM(c, x));
        }
        rounds.push({ no: r, items });
      }
      const doc = { state: 'done', rounds, usd: +ctl.cost.usd.toFixed(3), aiN: ctl.cost.n, empty, unchecked, doneAt: new Date().toISOString(), lockAt: Date.now(), prog: '', mo: monthKST(),
        bp: clean({ n: bp.pos.length, total: bp.total, essays: bp.essays, dcount: bp.dcount, base: bp.base ? `${bp.base.y} ${bp.base.g}-${bp.base.t} ${bp.base.x}` : '', sameN: bp.same.length, schN: bp.sch.length, thin: bp.thin, units: bp.units, counts: bp.counts }),
        note: ctl.noAI ? (ctl.noAI === '한도' ? `AI 한도 $${CAP}에 닿아 나머지는 비슷한 문항으로 채웠습니다` : `AI를 쓰지 못했습니다: ${ctl.noAI}`) : '' };
      await ref.update(doc);
      F.docs[id] = Object.assign({}, F.docs[id] || {}, { id, school: k.school, grade: +k.grade, year: +k.year, sem: +k.sem, exam: k.exam, label: labelOf(k), by: ctx.user, byName: me.name || '', at: new Date().toISOString() }, doc);
      toast(`모의고사 3회분을 만들었습니다${empty ? ` · 빈자리 ${empty}` : ''}`);
    } catch (e) {
      try { await ref.update({ lockAt: 0, prog: '멈춤: ' + String(e.message).slice(0, 120), usd: ctl.cost.usd }); } catch (_) {}
      toast('만들지 못했습니다: ' + e.message);
    } finally {
      F.busy = null; try { wl && wl.release(); } catch (_) {}
      if (H.curView === 'factory') render();
    }
  }
  function paintBusy() {
    const el = document.getElementById('fBusy'); if (!el || !F.busy) return;
    const b = F.busy; el.innerHTML = `<div class="fprog"><i style="width:${Math.round(b.step / b.total * 100)}%"></i></div><p class="dl">${esc(b.text)}</p><p class="dl">이 창을 닫지 말아 주세요. 끝나면 회차별 문항표가 나옵니다.${b.roots ? '' : ' (이 PC는 MYBOX가 연결되지 않아 이미 잘라 둔 교재 문제만 씁니다)'}</p>`;
  }

  // ---------- 바꾸기 ----------
  async function swap(doc, r, j, how) {
    const k = keyOfDoc(doc), round = doc.rounds[r - 1], old = round.items[j];
    const taken = new Set(doc.rounds.flatMap(x => x.items.map(i => i.key)));
    const slot = { p: j + 1, pts: old.pts || 0, d4: old.d4 || (old.diff === 1 ? 1 : old.diff === 3 ? 3 : 2), essay: !!old.essay, unit: old.unit, code: old.code ?? -1, type: old.type || '', up: old.up || 0 };
    const W = H.WN && H.WN();
    const ctl = { cost: { usd: 0, n: 0 }, skip: new Set([old.key]), roots: W ? await W.liveRoots() : null, noAI: how === 'ai' ? '' : 'skip', aiFail: 0, r };
    let c;
    if (how === 'ai') { try { c = await makeAI(k, slot, ctl.cost); c.why = c.chk ? 'AI 변형 · 정답 확인' : 'AI 변형 · 확인 필요'; } catch (e) { return toast(e.message === 'cap' ? 'AI 한도' : '만들지 못했습니다: ' + e.message); } }
    else { c = await fill(k, slot, taken, ctl); if (c.kind === 'empty') return toast('바꿀 문항이 없습니다 — AI 변형을 써 보세요'); }
    round.items[j] = slimM(c, slot);
    const usd = +((doc.usd || 0) + ctl.cost.usd).toFixed(3);
    const empty = doc.rounds.reduce((s, x) => s + x.items.filter(i => i.kind === 'empty').length, 0);
    const unchecked = doc.rounds.reduce((s, x) => s + x.items.filter(i => i.kind === 'ai' && i.chk === false).length, 0);
    await fdb().collection('mocks').doc(doc.id).update({ rounds: clean(doc.rounds), usd, aiN: (doc.aiN || 0) + ctl.cost.n, empty, unchecked, editedAt: new Date().toISOString(), editedBy: ctx.user });
    Object.assign(doc, { usd, empty, unchecked }); toast('바꿨습니다'); render();
  }
  const keyOfDoc = d => ({ school: d.school, grade: +d.grade, year: +d.year, sem: +d.sem, exam: d.exam });

  // ---------- 인쇄 · 학생에게 내기 ----------
  function printRound(doc, r, teacher) {
    const W = H.WN && H.WN(); if (!W || !W.printSet) return toast('이 브라우저에서는 인쇄를 준비할 수 없습니다 (PC 크롬·엣지)');
    const items = doc.rounds[r - 1].items.filter(i => i.kind !== 'empty');
    const t = `${doc.year}학년도 ${doc.sem}학기 ${doc.exam} 대비 모의고사 ${r}회`;
    const set = { kind: '모의고사', title: t, per: 4, items, print: { title: `${doc.school} ${doc.grade}학년 ${t}`, kick: `MOCK TEST · 모의고사 ${r}회`, chip: `${r}회`, unit: `${doc.school} 대비 · ${doc.grade}학년 · ${items.length}문항 · ${items.reduce((s, i) => s + (+i.pts || 0), 0)}점`, footer: `수학도서관 · ${doc.school} ${doc.grade}학년 ${doc.sem}학기 ${doc.exam} 모의고사 ${r}회`, noTag: !teacher, sheetOnly: !teacher } };
    W.printSet({ name: '', grade: doc.grade }, set, teacher ? 'teacher' : 'student', ctx.getImgs);
  }
  async function give(doc, r, ids) {
    const items = doc.rounds[r - 1].items.filter(i => i.kind !== 'empty'); let ok = 0;
    for (const sid of ids) { const st = (D.students || {})[sid]; if (!st) continue; try { await H.PR.saveSetFor(st, '테스트', `${doc.school} ${doc.sem}학기 ${doc.exam} 모의고사 ${r}회`, items); ok++; } catch (e) { toast(`${st.name}: ${e.message}`); } }
    toast(`${ok}명에게 ${r}회를 냈습니다 — 학생 → 추천 · 테스트에서 결과를 넣으면 분석지가 나옵니다`);
  }

  // ---------- 범위 ----------
  const midGroups = course => { const seen = new Map(); (D.catalog || []).forEach(c => { if (c[1] !== course) return; const kk = `${c[1]}|${c[3]}.${c[4]}`; if (!seen.has(kk)) seen.set(kk, { k: kk, big: c[2], name: c[4], midNo: c[3] }); }); return window.SudoUnits ? window.SudoUnits.group(course, [...seen.values()]) : [{ label: course, items: [...seen.values()] }]; };
  async function loadRange(k) {
    const id = scopeId(k); if (F.unitsFor === id) return;
    F.unitsFor = id; F.units = new Set(); F.rangeSaved = false;
    try { const d = await fdb().collection('scopes').doc(id).get(); if (d.exists) { F.units = new Set(d.data().unitKeys || []); F.rangeSaved = true; } } catch (_) {}
  }

  // ---------- 화면 ----------
  async function events() {
    let U = null; try { U = H.sch ? await H.sch.upcoming() : null; } catch (_) {}
    const out = [], seen = new Set();
    ((U && U.up) || []).filter(p => p.dday <= 90 && !p.perf).forEach(p => {
      const i = evInfo(p); if (i.x === '시험') return;
      (p.grades && p.grades.length ? p.grades : [1, 2, 3]).forEach(g => { const k = { school: p.sc.name, grade: +g, year: i.y, sem: i.t, exam: i.x, dday: p.dday }; const id = idOf(k); if (!seen.has(id)) { seen.add(id); out.push(k); } });
    });
    return out;
  }
  function statusOf(k) {
    const d = F.docs[idOf(k)];
    if (d && d.state === 'done') return ['done', '만들어짐', `${d.byName || d.by} · ${md(d.doneAt || d.at)}`];
    if (d && d.state === 'making' && !stale(d) && d.lockAt !== 0) return ['run', '만드는 중', `${d.byName || d.by} · ${d.prog || ''}`];
    if (d && d.state === 'making') return ['new', '멈춤 · 다시 만들 수 있음', d.prog || ''];
    const { same, sch } = examsOf(k);
    if (!same.length) return ['thin', '근거 적음', sch.length ? `같은 시험 없음 · 학교 시험 ${sch.length}개로 보충` : '이 학교 분석된 시험 없음'];
    return ['new', '만들 수 있음', `같은 시험 ${same.length}개 (검수 ${same.filter(e => e.an.status !== 'ai').length})`];
  }

  async function render() {
    const main = $('#main');
    if (!F.docs) { main.innerHTML = '<p class="dl">불러오는 중…</p>'; F.err = ''; try { await loadDocs(); } catch (e) { F.docs = {}; F.err = e.message; } }
    if (H.curView && H.curView !== 'factory') return;
    if (F.sel) return detail(main, F.sel);
    const ev = await events();
    if (H.curView && H.curView !== 'factory') return;
    const schools = [...new Set((D.exams || []).map(e => e.s))].sort();
    const y = new Date().getFullYear(), sem = (new Date().getMonth() + 1) >= 8 || (new Date().getMonth() + 1) <= 1 ? 2 : 1;
    const done = Object.values(F.docs).sort((a, b) => String(b.doneAt || b.at).localeCompare(String(a.doneAt || a.at)));
    main.innerHTML = `<div class="head"><div><div class="kicker">학교 시험 모양 그대로 · 3회분 · 한 학교·학년·시험에 한 번</div><h1>문제 제작소</h1></div></div>${errBox()}
      <section class="card"><h2>다가오는 시험 <small>나이스 학사일정 · 90일 안</small></h2>
        ${ev.length ? `<div class="fgrid">${ev.map(k => { const [c, t, s] = statusOf(k); return `<button type="button" class="fcard" data-k="${esc(JSON.stringify(k))}"><span class="row2"><b>${esc(k.school)} ${k.grade}학년</b><span class="fpill f-${c}">${t}</span></span><span class="dl">D-${k.dday} · ${k.sem}학기 ${esc(k.exam)}</span><span class="dl">${esc(s)}</span></button>`; }).join('')}</div>` : '<div class="empty">90일 안에 나이스에 올라온 시험 일정이 없습니다. 아래에서 직접 고르세요.</div>'}
      </section>
      <section class="card"><h2>직접 고르기 <small>나이스에 없는 시험</small></h2>
        <div class="frow"><select id="fS">${schools.map(s => `<option>${esc(s)}</option>`).join('')}</select><select id="fG">${[1, 2, 3].map(g => `<option value="${g}">${g}학년</option>`).join('')}</select><select id="fY">${[y - 1, y, y + 1].map(v => `<option ${v === y ? 'selected' : ''}>${v}</option>`).join('')}</select><select id="fT"><option value="1" ${sem === 1 ? 'selected' : ''}>1학기</option><option value="2" ${sem === 2 ? 'selected' : ''}>2학기</option></select><select id="fX"><option>중간</option><option selected>기말</option></select><button type="button" class="btn sm" id="fGo">열기</button></div>
      </section>
      <section class="card"><h2>만든 모의고사 <small>${done.length}개</small></h2>
        ${done.length ? `<div class="ftbl"><table><tr><th>학교 · 학년 · 시험</th><th>만든 사람</th><th>날짜</th><th>상태</th><th>AI</th></tr>${done.map(d => `<tr data-open="${esc(JSON.stringify(keyOfDoc(d)))}"><td><button type="button" class="linkbtn">${esc(d.label)}</button></td><td>${esc(d.byName || d.by)}</td><td>${md(d.doneAt || d.at)}</td><td>${d.state === 'done' ? '만들어짐' : stale(d) || d.lockAt === 0 ? '멈춤' : '만드는 중'}${d.empty ? ` · 빈자리 ${d.empty}` : ''}${d.unchecked ? ` · 확인 필요 ${d.unchecked}` : ''}</td><td>$${(d.usd || 0).toFixed(2)}</td></tr>`).join('')}</table></div>` : '<div class="empty">아직 없습니다.</div>'}
      </section>`;
    $$('[data-k]').forEach(b => b.onclick = () => { F.sel = JSON.parse(b.dataset.k); F.round = 1; F.give = false; render(); });
    $$('[data-open]').forEach(b => b.onclick = () => { F.sel = JSON.parse(b.dataset.open); F.round = 1; F.give = false; render(); });
    $('#fGo').onclick = () => { F.sel = { school: $('#fS').value, grade: +$('#fG').value, year: +$('#fY').value, sem: +$('#fT').value, exam: $('#fX').value }; F.round = 1; render(); };
  }

  const errBox = () => (F.err ? `<div class="callout">모의고사 저장 칸을 아직 쓸 수 없습니다 (${esc(F.err)}). Firebase 규칙에 mocks 줄을 게시하면 만들 수 있습니다. 틀과 예상은 미리 볼 수 있습니다.</div>` : '');
  async function detail(main, k) {
    const id = idOf(k);
    try { const d = await fdb().collection('mocks').doc(id).get(); if (d.exists && !d.data().archived) F.docs[id] = Object.assign({ id }, d.data()); else delete F.docs[id]; } catch (_) {}
    if (H.curView && H.curView !== 'factory') return;
    const doc = F.docs[id];
    const back = '<button type="button" class="linkbtn" id="fBack">← 문제 제작소</button>';
    const head = sub => `<div class="head"><div><div class="kicker">${back}</div><h1>${esc(labelOf(k))}</h1>${sub ? `<div class="dl">${sub}</div>` : ''}</div></div>`;
    if (F.busy && F.busy.id === id) { main.innerHTML = head('만드는 중') + '<section class="card" id="fBusy"></section>'; paintBusy(); $('#fBack').onclick = () => { F.sel = null; render(); }; return; }
    if (doc && doc.state === 'done') return done(main, k, doc, head);
    if (doc && doc.state === 'making' && !stale(doc) && doc.lockAt !== 0) {
      main.innerHTML = head('') + `<section class="card"><p><b>${esc(doc.byName || doc.by)}</b> 선생님이 만드는 중입니다.</p><p class="dl">${esc(doc.prog || '')} · 마지막 소식 ${md(doc.lockAt)}</p><p class="dl">끝나면 여기에서 열 수 있습니다. 30분 넘게 소식이 없으면 다시 만들 수 있게 풀립니다.</p><button type="button" class="btn sm ghost" id="fRe">새로 보기</button></section>`;
      $('#fBack').onclick = () => { F.sel = null; render(); }; $('#fRe').onclick = () => render(); return;
    }
    // 아직 없음 → 범위 · 틀 · 예상 비용 · [3회분 만들기]
    await loadRange(k);
    if (H.curView && H.curView !== 'factory') return;
    const course = `중등${k.grade}-${k.sem}`, groups = midGroups(course);
    const R = F.units;
    const bp = R.size ? blueprint(k, R) : null;
    const cnt = bp ? await plan(k, bp) : null;
    if (H.curView && H.curView !== 'factory') return;
    const est = cnt ? Math.min(CAP, cnt.need * USD_ONE) : 0;
    const S = H.reg && H.reg.aiSettings ? H.reg.aiSettings() : null;
    const W = H.WN && H.WN(); const roots = W ? await W.liveRoots() : null;
    const stopped = doc && doc.state === 'making' ? `<div class="callout">지난번 만들기가 멈췄습니다 (${esc(doc.prog || '')}). 다시 만들 수 있습니다.</div>` : '';
    main.innerHTML = errBox() + head(R.size ? `범위: ${[...orderUnits([...R])].map(unitName).map(esc).join(' · ')}${F.rangeSaved ? ' (시험 대비에 저장된 범위)' : ''}` : '먼저 시험 범위를 고르세요') + stopped + `
      <section class="card"><h2>시험 범위 <small>${esc(course.replace('중등', '중'))} · 고른 범위는 시험 대비 화면과 같이 씁니다</small></h2>
        ${groups.length ? `<div class="pgroups">${groups.map(G => `<div class="pgrp"><div class="pgh"><b>${esc(G.label)}</b><button type="button" class="linkbtn" data-rb="${esc(G.items.map(m => m.k).join('\n'))}">${G.items.every(m => R.has(m.k)) ? '대단원 빼기' : '대단원 전체'}</button></div><div class="punits">${G.items.map(m => `<button type="button" class="chip" data-ru="${esc(m.k)}" aria-pressed="${R.has(m.k)}">${esc(m.name)}</button>`).join('')}</div></div>`).join('')}</div>` : '<div class="empty">단원·유형 목록에 이 과정이 없습니다.</div>'}
      </section>
      ${bp ? `<section class="card"><h2>시험의 틀 <small>${bp.base ? `틀: ${esc(k.school)} ${bp.base.y} ${bp.base.g}-${bp.base.t} ${esc(bp.base.x)}${bp.base.an.status === 'ai' ? ' (검수 전)' : ''}` : '이 학교 분석된 시험이 없어 기본 틀'} · 근거 ${bp.same.length ? `같은 시험 ${bp.same.length}개` : `학교 시험 ${bp.sch.length}개`}</small></h2>
        ${bp.thin ? '<div class="callout">같은 학년·학기·시험의 지난 시험이 없어, 이 학교의 다른 시험 모양으로 대신합니다. 시험 등록(미리 분석)이 쌓이면 더 정확해집니다.</div>' : ''}
        <div class="fstats"><span>문항 <b>${bp.pos.length}</b></span><span>총점 <b>${bp.total}</b></span><span>객관식 <b>${bp.pos.length - bp.essays}</b> · 서답형 <b>${bp.essays}</b></span></div>
        <div class="fbars">${[1, 2, 3, 4].filter(d => bp.dcount[d]).map(d => `<span>${DN4[d]}</span><div class="fbar"><i style="width:${Math.round(bp.dcount[d] / bp.pos.length * 100)}%"></i></div><span>${bp.dcount[d]}문항</span>`).join('')}</div>
        <p class="dl">단원 비중: ${bp.units.map((u, i) => `${esc(unitName(u))} ${bp.counts[i]}`).join(' · ')} (지난 시험에 나온 비율을 이번 범위에 맞춤) · 3회는 응용 ${Math.max(1, Math.round(bp.pos.length * 0.1))}문항을 실력으로</p>
      </section>
      <section class="card"><h2>문항 채우기 예상 <small>3회분 ${bp.pos.length * 3}자리 · 회차끼리 겹치지 않음</small></h2>
        <div class="fstats"><span><span class="ftag k-book">학원 교재</span> ${cnt.book}</span><span><span class="ftag k-print">학교 프린트</span> ${cnt.print}</span><span><span class="ftag k-ai">학원 제작</span> ${cnt.ai}</span><span><span class="ftag k-new">AI 변형</span> ${cnt.need}</span></div>
        <p class="dl">AI 변형 ${cnt.need}문항 × 약 $${USD_ONE.toFixed(2)} (만들기 + 따로 풀어 정답 확인) ≈ <b>$${est.toFixed(2)}</b> · 한도 $${CAP}${cnt.need * USD_ONE > CAP ? ' — 한도를 넘는 자리는 비슷한 난이도 문항으로 채웁니다' : ''}${S && S.url ? '' : ' · <b>AI 연결 전이라 AI 변형 자리는 비슷한 문항이나 빈자리가 됩니다</b>'}</p>
        <p class="dl">${roots ? '이 PC의 MYBOX에서 교재 문제를 잘라 저장해 두므로, 다른 PC·선생님도 바로 인쇄할 수 있습니다.' : '이 PC는 MYBOX가 연결되지 않아, 이미 잘라 둔 교재 문제만 씁니다(나머지는 다른 문항·AI로). MYBOX가 연결된 PC에서 만들면 교재 문제를 더 많이 씁니다.'} 만드는 데 몇 분 걸립니다.</p>
        <div class="row2" style="justify-content:flex-end"><button type="button" class="btn gold" id="fMake" ${F.err ? 'disabled' : ''}>3회분 만들기${est ? ` (약 $${est.toFixed(2)})` : ''}</button></div>
      </section>` : ''}`;
    $('#fBack').onclick = () => { F.sel = null; render(); };
    const reR = () => render();
    $$('[data-rb]').forEach(b => b.onclick = () => { const ks = b.dataset.rb.split('\n'); const all = ks.every(x => R.has(x)); ks.forEach(x => all ? R.delete(x) : R.add(x)); F.rangeSaved = false; reR(); });
    $$('[data-ru]').forEach(b => b.onclick = () => { const x = b.dataset.ru; if (R.has(x)) R.delete(x); else R.add(x); F.rangeSaved = false; reR(); });
    const mk = $('#fMake');
    if (mk) mk.onclick = () => {
      if (!confirm(`${labelOf(k)} 모의고사 3회분을 만들까요?\n만들면 다른 선생님은 이 학교·학년·시험을 다시 만들 수 없고, 만든 것을 함께 씁니다.${est ? `\nAI 예상 비용 약 $${est.toFixed(2)} (한도 $${CAP})` : ''}`)) return;
      F.busy = { id, step: 0, total: bp.pos.length * 3, text: '잠금 확인 중…', roots: !!roots }; render();
      create(k, bp, false);
    };
  }

  function done(main, k, doc, head) {
    const r = Math.min(3, Math.max(1, F.round)), round = doc.rounds[r - 1];
    const edit = canEdit(doc);
    const studs = Object.values(D.students || {}).filter(s => s.school === doc.school && +s.grade === +doc.grade);
    const flags = [doc.empty ? `빈자리 ${doc.empty}` : '', doc.unchecked ? `AI 정답 확인 필요 ${doc.unchecked}` : ''].filter(Boolean).join(' · ');
    main.innerHTML = head(`${esc(doc.byName || doc.by)} ${md(doc.doneAt || doc.at)} 만듦 · ${round.items.length}문항 × 3회 · AI $${(doc.usd || 0).toFixed(2)}${doc.bp && doc.bp.base ? ` · 틀 ${esc(doc.school)} ${esc(doc.bp.base)}` : ''}`) + `
      ${doc.note ? `<div class="callout">${esc(doc.note)}</div>` : ''}${flags ? `<div class="callout">${esc(flags)} — ${edit ? '표에서 [바꾸기]로 고쳐 주세요' : '만든 선생님이나 원장님이 고칠 수 있습니다'}.</div>` : ''}
      <section class="card">
        <div class="row2" style="justify-content:space-between;flex-wrap:wrap;gap:8px">
          <div class="segx sm" role="tablist" style="flex:1 1 260px">${[1, 2, 3].map(n => `<button type="button" role="tab" data-r="${n}" aria-selected="${n === r}">${n}회${n === 3 ? ' (실력 한 단계)' : ''}</button>`).join('')}</div>
          <div class="row2" style="gap:6px;flex-wrap:wrap"><button type="button" class="btn sm" id="fPrint">시험지 인쇄</button><button type="button" class="btn sm ghost" id="fPrintT">정답·해설 포함 (선생님용)</button><button type="button" class="btn sm ghost" id="fGive">학생에게 내기</button>${owner ? '<button type="button" class="btn sm ghost" id="fRegen">다시 만들기</button>' : ''}</div>
        </div>
        <div id="fGiveBox" ${F.give ? '' : 'hidden'} class="fgive">${studs.length ? `<p class="dl">${esc(doc.school)} ${doc.grade}학년 학생${me.role === 'teacher' ? ' (선생님 학생만)' : ''} — ${r}회를 냅니다. 학생 → 추천 · 테스트에 들어가고, 결과를 넣으면 분석지가 나옵니다.</p><div class="punits">${studs.map(s => `<label class="chip"><input type="checkbox" data-gs="${esc(s.id)}" checked> ${esc(s.name)}</label>`).join('')}</div><button type="button" class="btn sm" id="fGiveGo">고른 학생에게 ${r}회 내기</button>` : `<p class="dl">${esc(doc.school)} ${doc.grade}학년 학생이 없습니다.</p>`}</div>
        <div class="ftbl"><table><tr><th>번호</th><th>단원 · 유형</th><th>난이도</th><th>배점</th><th>출처</th>${edit ? '<th></th>' : ''}</tr>
          ${round.items.map((x, j) => `<tr class="${x.kind === 'empty' ? 'fempty' : ''}"><td>${j + 1}${x.essay ? ' <small class="dl">서답</small>' : ''}</td><td>${esc(unitName(x.unit))}${x.type ? ` <small class="dl">· ${esc(x.type)}</small>` : ''}</td><td>${DN4[x.d4] || DN3[x.diff] || ''}${x.up ? ' <small class="dl">↑</small>' : ''}</td><td>${x.pts || ''}</td><td><span class="ftag k-${x.kind === 'mat' ? 'book' : x.kind === 'ai' ? (String(x.key).startsWith('a|') && /AI 변형/.test(x.why || '') ? 'new' : 'ai') : x.kind}">${x.kind === 'ai' && !/AI 변형/.test(x.why || '') ? '학원 제작' : KLAB[x.kind] || x.kind}</span> ${esc(x.kind === 'empty' ? '맞는 문항 없음' : x.label || '')}${x.kind === 'ai' && x.chk === false ? ' <b class="fwarn">정답 확인 필요</b>' : ''}${x.why && !/AI 변형/.test(x.why) ? ` <small class="dl">${esc(x.why)}</small>` : ''}</td>${edit ? `<td class="fact"><button type="button" class="linkbtn" data-sw="${j}">유사문항</button> <button type="button" class="linkbtn" data-av="${j}">AI 변형</button></td>` : ''}</tr>`).join('')}
        </table></div>
        <p class="dl">출처는 이 화면에만 보이고, 학생용 시험지에는 나오지 않습니다. 시험지는 오답노트와 같은 모양으로 한 쪽에 4문제(한 단에 2문제)씩 들어갑니다.</p>
      </section>`;
    $('#fBack').onclick = () => { F.sel = null; render(); };
    $$('[data-r]').forEach(b => b.onclick = () => { F.round = +b.dataset.r; render(); });
    $('#fPrint').onclick = () => printRound(doc, r, false);
    $('#fPrintT').onclick = () => printRound(doc, r, true);
    $('#fGive').onclick = () => { F.give = !F.give; $('#fGiveBox').hidden = !F.give; };
    const gg = $('#fGiveGo'); if (gg) gg.onclick = async () => { const ids = $$('[data-gs]').filter(c => c.checked).map(c => c.dataset.gs); if (!ids.length) return toast('학생을 고르세요'); gg.disabled = true; await give(doc, r, ids); gg.disabled = false; F.give = false; render(); };
    const rg = $('#fRegen'); if (rg) rg.onclick = async () => {
      if (!confirm('이 모의고사를 다시 만들까요? 지금 것은 지우지 않고 보관합니다.')) return;
      await loadRange(k); if (!F.units.size) return toast('시험 범위가 없습니다');
      const bp = blueprint(k, F.units); F.busy = { id: idOf(k), step: 0, total: bp.pos.length * 3, text: '다시 만드는 중…', roots: false }; render(); create(k, bp, true);
    };
    const busyBtn = async (b, fn) => { b.disabled = true; const t = b.textContent; b.textContent = '…'; try { await fn(); } catch (e) { toast(e.message); } finally { b.disabled = false; b.textContent = t; } };
    $$('[data-sw]').forEach(b => b.onclick = () => busyBtn(b, () => swap(doc, r, +b.dataset.sw, 'pool')));
    $$('[data-av]').forEach(b => b.onclick = () => { if (!confirm(`${+b.dataset.av + 1}번을 AI 변형으로 바꿀까요? 약 $${USD_ONE.toFixed(2)}`)) return; busyBtn(b, () => swap(doc, r, +b.dataset.av, 'ai')); });
  }

  // 홈 AI 비용 카드에서 쓰는 이번 달 모의고사 AI 비용
  async function costMonth(mo) {
    const s = await fdb().collection('mocks').where('mo', '==', mo).get();
    let usd = 0, n = 0; s.docs.forEach(d => { const x = d.data(); usd += x.usd || 0; n += x.aiN || 0; });
    return { usd, n };
  }
  return { render, costMonth, blueprint, reset: () => { F.docs = null; F.sel = null; } };
};
