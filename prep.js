// 수학도서관 — 7단계 '시험 대비': 시험 범위 → 대비 자료 · 시험 후 적중 보고 · 수행평가 · 숙제 모아 보기 (+ AI 비용 기록)
// 원장님 결정(11-17): 범위는 선생님도 넣음 · 적중 보고는 학원용이 기본, 학부모 카드는 골라서 · 숙제는 완료 체크 기본, 결과(틀린 번호)도 가능 · 수행평가는 선생님도 입력.
// 저장: scopes(시험 범위 src:'range' — 오답노트 '시험 범위'와 같이 씀, 수행평가 kind:'perf') · sets(숙제 hw · hwOpen).

// AI 비용 기록 (추정): 이번 달 종류별 금액·건수 → meta/aiCost. 원장님 계정에서만 저장됨(규칙: meta는 원장).
(function () {
  const PRICE = m => (/opus/i.test(m) ? [5, 25] : /haiku/i.test(m) ? [1, 5] : /mini/i.test(m) ? [0.25, 2] : /gpt/i.test(m) ? [1.25, 10] : [3, 15]); // 100만 토큰당 $ (입력, 출력) — 추정
  window.SudoCost = function (kind, model, usage, usdFixed) {
    try {
      const p = PRICE(model || '');
      const usd = usdFixed != null ? usdFixed : ((usage && usage.in) || 0) / 1e6 * p[0] + ((usage && usage.out) || 0) / 1e6 * p[1];
      const mo = new Date(Date.now() + 9 * 36e5).toISOString().slice(0, 7), FV = firebase.firestore.FieldValue;
      return firebase.firestore().collection('meta').doc('aiCost').set({ [mo]: { [kind]: { usd: FV.increment(+usd.toFixed(4)), n: FV.increment(1) } } }, { merge: true }).catch(() => {});
    } catch (_) { return Promise.resolve(); }
  };
})();

window.SudoPrep = function (H) {
  const { D, ctx, byId, esc, toast, $, $$ } = H;
  const me = (ctx && ctx.me) || { role: 'owner' };
  const fdb = () => firebase.firestore();
  const T = { tab: 'range', ev: 0, g: null, units: null, made: [], exam: null, parent: false };
  const unitName = u => String(u || '').split('|').pop().replace(/^\s*\d+\s*\.\s*/, '');
  const md = s => { const d = new Date(s); return `${d.getMonth() + 1}/${d.getDate()}`; };
  const todayS = () => (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();  // 한국 날짜
  const mine = q => (me.role === 'teacher' ? q.where('owner', '==', ctx.user) : q);
  const evInfo = p => ({ t: /1학기/.test(p.label) ? 1 : 2, x: /중간/.test(p.label) ? '중간' : /기말/.test(p.label) ? '기말' : '시험', y: +p.start.slice(0, 4) });
  const rid = (p, g) => { const i = evInfo(p); return `rng_${p.sc.name}_${g}_${i.y}_${i.t}_${i.x}`; };
  const midGroups = course => { const seen = new Map(); (D.catalog || []).forEach(c => { if (c[1] !== course) return; const k = `${c[1]}|${c[3]}.${c[4]}`; if (!seen.has(k)) seen.set(k, { k, big: c[2], name: c[4], midNo: c[3] }); }); return window.SudoUnits.group(course, [...seen.values()]); };
  const midsOf = course => midGroups(course).flatMap(g => g.items);

  async function render() {
    const main = $('#main');
    const TABS = [['range', '시험 범위 · 대비'], ['hit', '시험 후 적중 보고'], ['perf', '수행평가'], ['hw', '숙제 모아 보기']];
    main.innerHTML = `<div class="head"><div><div class="kicker">범위 → 대비 자료 → 테스트지 · 시험 뒤 적중 보고 · 수행평가 · 숙제</div><h1>시험 대비</h1></div></div>
      <div class="segx" role="tablist" style="margin-bottom:12px">${TABS.map(([k, l]) => `<button type="button" role="tab" data-pt="${k}" aria-selected="${T.tab === k}">${l}</button>`).join('')}</div>
      <section class="card" id="prepBox"><p class="dl">불러오는 중…</p></section>`;
    $$('[data-pt]').forEach(b => b.onclick = () => { T.tab = b.dataset.pt; render(); });
    const box = $('#prepBox');
    try { await ({ range, hit, perf, hw })[T.tab](box); } catch (e) { box.innerHTML = `<div class="callout">불러오지 못했습니다: ${esc(e.message)}</div>`; }
  }

  // ---------- 1. 시험 범위 → 대비 자료 ----------
  async function range(box) {
    const up = ((H.sch ? await H.sch.upcoming() : { up: [] }).up || []).filter(p => p.dday <= 70);
    if (!up.length) { box.innerHTML = '<div class="empty">앞으로 70일 안의 시험 일정이 없습니다 (나이스 학사일정 기준).</div>'; return; }
    const p = up[Math.min(T.ev, up.length - 1)], info = evInfo(p);
    const gs = (p.grades && p.grades.length ? p.grades : [1, 2, 3]).map(Number);
    if (!gs.includes(T.g)) { T.g = gs[0]; T.units = null; }
    const course = `중등${T.g}-${info.t}`, mids = midsOf(course);
    const id = rid(p, T.g);
    if (!T.units || T.unitsFor !== id) {
      T.unitsFor = id; T.made = [];
      const d = await fdb().collection('scopes').doc(id).get().catch(() => null);
      T.saved = d && d.exists ? d.data() : null;
      T.units = new Set(T.saved ? T.saved.unitKeys || [] : []);
    }
    const PR = H.PR; const pool = PR ? await PR.pool() : [];
    const cnt = k => { const a = pool.filter(c => c.unit === k && ((c.kind !== 'exam' && c.kind !== 'print') || !c.school || c.school === p.sc.name)); return { b: a.filter(c => c.kind === 'book' || c.kind === 'mat').length, pr: a.filter(c => c.kind === 'print').length, x: a.filter(c => c.kind === 'exam').length, a: a.filter(c => c.kind === 'ai').length }; };
    const studs = Object.values(D.students || {}).filter(s => s.school === p.sc.name && +s.grade === T.g);
    const sel = [...T.units]; const tot = sel.reduce((a, k) => { const c = cnt(k); return { b: a.b + c.b, pr: a.pr + c.pr, x: a.x + c.x, a: a.a + c.a }; }, { b: 0, pr: 0, x: 0, a: 0 });
    box.innerHTML = `<div class="row2"><label class="sel" style="flex:2"><span>시험</span><select id="rEv">${up.map((q, k) => `<option value="${k}" ${k === T.ev ? 'selected' : ''}>${q.dday <= 0 ? '시험 중' : 'D-' + q.dday} · ${esc(q.sc.name)} ${esc(q.label)} (${esc(q.range)})</option>`).join('')}</select></label>
        <label class="sel"><span>학년</span><select id="rG">${gs.map(g => `<option value="${g}" ${g === T.g ? 'selected' : ''}>${g}학년</option>`).join('')}</select></label></div>
      <h3 class="wnh3">시험 범위 <small class="dl">${esc(course.replace('중등', '중'))} 단원에서 고르기${T.saved ? ` · 저장됨 (${esc(String(T.saved.by || '').split('@')[0])} ${md(T.saved.at)})` : ''}</small></h3>
      ${mids.length ? `<div class="pgroups">${midGroups(course).map(G => `<div class="pgrp"><div class="pgh"><b>${esc(G.label)}</b><button type="button" class="linkbtn" data-rb="${esc(G.items.map(m => m.k).join('\n'))}">${G.items.every(m => T.units.has(m.k)) ? '대단원 빼기' : '대단원 전체'}</button></div><div class="punits">${G.items.map(m => { const c = cnt(m.k); return `<button type="button" class="chip" data-ru="${esc(m.k)}" aria-pressed="${T.units.has(m.k)}">${esc(m.name)} <small>${c.b + c.pr + c.x + c.a}</small></button>`; }).join('')}</div></div>`).join('')}</div>` : '<div class="empty">단원·유형 목록에 이 과정이 없습니다.</div>'}
      <div class="qbtns" style="margin-top:8px"><button type="button" class="btn sm" id="rSave" ${sel.length ? '' : 'disabled'}>범위 저장</button><span class="dl">저장한 범위는 학생 오답노트의 '시험 범위'에서도 고를 수 있습니다.</span></div>
      <h3 class="wnh3">대비 자료 <small class="dl">고른 범위 안에서</small></h3>
      ${sel.length ? `<div class="list2"><div><span>학원 교재 문제 (정리된 교재 · 자료실)</span><b>${tot.b}문항</b></div><div><span>학교 프린트</span><b>${tot.pr}문항</b></div><div><span>${esc(p.sc.name)} 지난 기출 문항</span><b>${tot.x}문항</b></div><div><span>학원 제작 (AI 변형 채택)</span><b>${tot.a}문항</b></div></div>
        <p class="dl">다른 학교 기출은 쓰지 않습니다. 교재는 정리 대기열에서 ③④까지 끝난 것만 들어갑니다.</p>` : '<p class="dl">범위를 고르면 쓸 수 있는 문제 수가 나옵니다.</p>'}
      <h3 class="wnh3">학생별 테스트지 <small class="dl">${esc(p.sc.name)} ${T.g}학년 ${studs.length}명 · 15문항 · 하20·중50·상30 · 푼 문제는 유사문항으로</small></h3>
      ${studs.length ? `<div class="punits">${studs.map(s => `<label class="chip"><input type="checkbox" data-rs="${esc(s.id)}" checked> ${esc(s.name)}</label>`).join('')}</div>` : '<p class="dl">이 학교·학년 학생이 없습니다' + (me.role === 'teacher' ? ' (선생님이 등록한 학생만 보입니다)' : '') + '.</p>'}
      <div class="qbtns" style="margin-top:8px"><button type="button" class="btn sm" id="rMake" ${sel.length && studs.length ? '' : 'disabled'}>고른 학생 테스트지 만들기</button><button type="button" class="btn ghost sm" id="rBundle" ${sel.length ? '' : 'disabled'}>대비 묶음 인쇄 (공통 15문항 · 선생님용)</button></div>
      ${T.made.length ? `<div class="wnsheets">${T.made.map(m => `<div class="wns"><span>${esc(m.st.name)} · ${m.set ? `${m.set.items.length}문항` : `<span class="hwtag late">${esc(m.err)}</span>`}</span>${m.set ? `<span class="wnsb"><button type="button" class="linkbtn" data-rp="${esc(m.set.id)}" data-aud="student">학생용</button><button type="button" class="linkbtn" data-rp="${esc(m.set.id)}" data-aud="teacher">선생님용</button></span>` : ''}</div>`).join('')}</div><p class="dl">만든 테스트지는 학생 → 추천 · 테스트 탭에도 있고, 결과도 거기서 넣습니다.</p>` : ''}`;
    $('#rEv').onchange = ev => { T.ev = +ev.target.value; T.units = null; render(); };
    $('#rG').onchange = ev => { T.g = +ev.target.value; T.units = null; render(); };
    $$('[data-rb]').forEach(b => b.onclick = () => { const ks = b.dataset.rb.split('\n'); const all = ks.every(k => T.units.has(k)); ks.forEach(k => all ? T.units.delete(k) : T.units.add(k)); render(); });
    $$('[data-ru]').forEach(b => b.onclick = () => { const k = b.dataset.ru; if (T.units.has(k)) T.units.delete(k); else T.units.add(k); render(); });
    $('#rSave').onclick = async () => {
      const keys = [...T.units];
      const doc = { name: `${p.sc.name} ${T.g}학년 ${info.t}학기 ${info.x}`, school: p.sc.name, grade: T.g, sem: info.t, exam: info.x, year: info.y, units: keys.map(unitName), unitKeys: keys, src: 'range', at: Date.now(), by: ctx.user };
      try { await fdb().collection('scopes').doc(id).set(doc); T.saved = doc; if (PR && PR.resetScopes) PR.resetScopes(); toast('시험 범위를 저장했습니다'); render(); } catch (e) { toast('저장 실패: ' + e.message); }
    };
    $('#rMake').onclick = async ev => {
      const b = ev.currentTarget; b.disabled = true; T.made = [];
      const ids = $$('[data-rs]').filter(c => c.checked).map(c => c.dataset.rs);
      for (const sid of ids) { const st = D.students[sid]; b.textContent = `만드는 중 ${T.made.length + 1}/${ids.length} · ${st.name}`;
        try { const items = await PR.testFor(st, [...T.units], 15); if (!items.length) throw new Error('고를 문제가 없음'); const set = await PR.saveSetFor(st, '테스트', `${p.sc.name} ${info.x} 대비 · ${[...T.units].map(unitName).join(', ')}`, items); T.made.push({ st, set }); }
        catch (e) { T.made.push({ st, err: e.message }); } }
      toast(`테스트지 ${T.made.filter(m => m.set).length}개를 만들었습니다`); render();
    };
    $('#rBundle').onclick = async () => {
      const pseudo = { id: '_bundle', name: `${p.sc.name} ${T.g}학년`, school: p.sc.name, grade: T.g, odap: {} };
      const items = await PR.testFor(pseudo, [...T.units], 15);
      if (!items.length) return toast('고를 문제가 없습니다');
      PR.print(pseudo, { kind: '테스트', title: `${p.sc.name} ${T.g}학년 ${info.x} 대비 묶음`, items: items.map(PR.slim) }, 'teacher');
    };
    $$('[data-rp]').forEach(b => b.onclick = () => { const m = T.made.find(x => x.set && x.set.id === b.dataset.rp); PR.print(m.st, m.set, b.dataset.aud); });
  }

  // ---------- 2. 시험 후 적중 보고 ----------
  async function hit(box) {
    const exams = (D.exams || []).filter(e => e.an && e.an.items && e.an.items.length).sort((a, b) => b.y - a.y || (b.t - a.t) || (b.x === '기말') - (a.x === '기말')).slice(0, 80);
    if (!T.exam && exams[0]) T.exam = exams[0].id;
    const e = byId[T.exam];
    let sets = [];
    try { const s = await mine(fdb().collection('sets')).get(); sets = s.docs.map(d => d.data()); } catch (err) { box.innerHTML = `<div class="callout">문제지 기록을 못 읽었습니다 (Firebase 규칙 sets 필요): ${esc(err.message)}</div>`; return; }
    const studs = Object.values(D.students || {}).filter(s => e && s.school === e.s && +s.grade === +e.g);
    const sids = new Set(studs.map(s => s.id));
    const used = sets.filter(s => sids.has(s.sid)).flatMap(s => (s.items || []).map(x => Object.assign({ setTitle: s.title, setAt: s.at }, x)));
    let ranges = []; try { const r = await fdb().collection('scopes').where('src', '==', 'range').get(); ranges = r.docs.map(d => d.data()).filter(r => e && r.school === e.s && +r.grade === +e.g && +r.sem === +e.t); } catch (_) {}
    const rangeUnits = new Set(ranges.flatMap(r => r.unitKeys || []));
    const unitOfCat = ci => { const c = (D.catalog || [])[ci]; return c ? `${c[1]}|${c[3]}.${c[4]}` : ''; };
    const rows = e ? e.an.items.map(i => { const u = i[8] >= 0 ? unitOfCat(i[8]) : ''; const t = used.find(x => i[8] >= 0 && x.code === i[8]); const un = !t && used.find(x => u && x.unit === u);
      return { no: i[0], u, type: i[7] || '', lvl: t ? 2 : un ? 1 : rangeUnits.has(u) ? 0.5 : 0, by: t || un }; }) : [];
    const n = rows.length, t2 = rows.filter(r => r.lvl === 2).length, t1 = rows.filter(r => r.lvl >= 1).length;
    box.innerHTML = `<div class="row2"><label class="sel" style="flex:2"><span>분석된 시험</span><select id="hE">${exams.map(x => `<option value="${x.id}" ${x.id === T.exam ? 'selected' : ''}>${esc(x.s)} ${x.y} ${x.g}학년 ${x.t}학기 ${esc(x.x)}</option>`).join('')}</select></label></div>
      ${e ? `<p class="dl">${esc(e.s)} ${e.g}학년 학생 ${studs.length}명에게 낸 추천 문제지·테스트지 ${sets.filter(s => sids.has(s.sid)).length}개(${used.length}문항)와 저장한 시험 범위로 맞춰 봅니다. AI 없이 단원·유형으로 비교합니다.</p>
      <div class="list2"><div><span>같은 유형 적중</span><b>${t2}/${n} (${n ? Math.round(t2 / n * 100) : 0}%)</b></div><div><span>같은 단원까지</span><b>${t1}/${n} (${n ? Math.round(t1 / n * 100) : 0}%)</b></div></div>
      <div class="hitgrid">${rows.map(r => `<span class="hc l${String(r.lvl).replace('.', '')}" title="${esc(unitName(r.u))} ${esc(r.type)}${r.by ? ' ← ' + esc(r.by.label) : ''}">${r.no}</span>`).join('')}</div>
      <p class="dl"><span class="hc l2">유</span> 같은 유형을 풀었음 · <span class="hc l1">단</span> 같은 단원을 풀었음 · <span class="hc l05">범</span> 범위에는 넣었음 · <span class="hc l0">-</span> 없음</p>
      <div class="qbtns"><button type="button" class="btn sm" id="hA4">A4 적중 보고 (학원용)</button><label class="qdone"><input type="checkbox" id="hPar" ${T.parent ? 'checked' : ''}> 학부모님께 보낼 카드도 만들기</label>${T.parent ? '<button type="button" class="btn ghost sm" id="hCard">학부모용 카드</button>' : ''}</div>` : '<div class="empty">분석된 시험이 없습니다.</div>'}`;
    const he = $('#hE'); if (he) he.onchange = ev => { T.exam = ev.target.value; render(); };
    if (!e) return;
    $('#hPar').onchange = ev => { T.parent = ev.target.checked; render(); };
    $('#hA4').onclick = () => {
      const w = window.open('', '_blank'); if (!w) return toast('팝업이 막혀 있습니다');
      w.document.write(`<!doctype html><meta charset="utf-8"><title>${esc(e.s)} 적중 보고</title><style>@page{size:A4;margin:14mm}body{font-family:"Pretendard","Noto Sans KR","Malgun Gothic",sans-serif;font-size:12.5px;color:#18211F;padding:16px}h1{font-size:20px;color:#0A4844;margin:0 0 4px}table{width:100%;border-collapse:collapse}td,th{border-bottom:1px solid #DCE3E0;padding:4px 6px;text-align:left}th{background:#E8F0ED}.k{color:#7A5C14;font-weight:700;font-size:11px}.y{color:#2E7566;font-weight:700}.pr{position:fixed;top:8px;right:8px}@media print{.pr{display:none}}</style>
        <button class="pr" onclick="print()">인쇄 · PDF로 저장</button><div class="k">수학도서관 · 시험 후 적중 보고 (학원용)</div><h1>${esc(e.s)} ${e.y} ${e.g}학년 ${e.t}학기 ${esc(e.x)}</h1>
        <p>같은 유형 적중 <b>${t2}/${n}</b> · 같은 단원까지 <b>${t1}/${n}</b> · 비교한 자료: 추천 문제지·테스트지 ${used.length}문항 (학생 ${studs.length}명)</p>
        <table><tr><th>번호</th><th>단원</th><th>유형</th><th>적중</th><th>우리 자료</th></tr>${rows.map(r => `<tr><td>${r.no}</td><td>${esc(unitName(r.u))}</td><td>${esc(r.type)}</td><td class="${r.lvl >= 1 ? 'y' : ''}">${r.lvl === 2 ? '같은 유형' : r.lvl === 1 ? '같은 단원' : r.lvl ? '범위 안' : '-'}</td><td>${r.by ? esc(r.by.label) : ''}</td></tr>`).join('')}</table></html>`);
    };
    const hc = $('#hCard'); if (hc) hc.onclick = () => {
      const c = document.createElement('canvas'); c.width = 1080; c.height = 1080; const g = c.getContext('2d'); const F = (w, s) => `${w} ${s}px "Pretendard","Noto Sans KR","Malgun Gothic",sans-serif`;
      g.fillStyle = '#0A4844'; g.fillRect(0, 0, 1080, 1080); g.fillStyle = '#DEBC62'; g.fillRect(80, 110, 120, 8);
      g.fillStyle = '#CFE1DB'; g.font = F(500, 38); g.fillText('수학도서관 · 시험 적중', 80, 190);
      g.fillStyle = '#fff'; g.font = F(800, 58); g.fillText(`${e.s} ${e.g}학년 ${e.t}학기 ${e.x}`, 80, 280);
      g.fillStyle = '#DEBC62'; g.font = F(800, 180); g.fillText(`${t1}`, 80, 520); const w0 = g.measureText(`${t1}`).width; g.fillStyle = '#CFE1DB'; g.font = F(700, 72); g.fillText(` / ${n}문항`, 80 + w0, 520);
      g.fillStyle = '#fff'; g.font = F(600, 42); g.fillText(`내신대비 때 같은 단원·유형을 미리 풀었습니다`, 80, 620);
      g.fillStyle = '#CFE1DB'; g.font = F(500, 38); g.fillText(`같은 유형 ${t2}문항 · 같은 단원 ${t1 - t2}문항`, 80, 690);
      g.fillStyle = '#CFE1DB'; g.font = F(500, 30); g.fillText('수학도서관 · 1:1 명품 맞춤 수학학원', 80, 1000);
      const url = c.toDataURL('image/png'); const w = window.open('', '_blank'); if (!w) return toast('팝업이 막혀 있습니다');
      w.document.write(`<!doctype html><meta charset="utf-8"><body style="margin:0;background:#222;display:flex;flex-direction:column;align-items:center;gap:12px;padding:16px;font-family:sans-serif"><a download="${esc(e.s)}_적중.png" href="${url}" style="background:#DEBC62;color:#0A4844;padding:10px 18px;border-radius:10px;font-weight:700;text-decoration:none">이미지 저장</a><img src="${url}" style="max-width:min(540px,100%);border-radius:12px"></body>`);
    };
  }

  // ---------- 3. 수행평가 ----------
  async function perfList() { try { const s = await fdb().collection('scopes').where('kind', '==', 'perf').get(); return s.docs.map(d => Object.assign({ id: d.id }, d.data())).sort((a, b) => a.date.localeCompare(b.date)); } catch (_) { return []; } }
  async function perf(box) {
    const L = await perfList(); const t0 = todayS();
    const schools = [...new Set([...Object.values(D.students || {}).map(s => s.school), ...((H.sch && (await H.sch.upcoming()).up) || []).map(p => p.sc.name)].filter(Boolean))].sort();
    box.innerHTML = `<p class="dl">나이스 학사일정에는 수행평가가 거의 올라오지 않아 여기서 넣습니다. 넣은 수행평가는 홈 '다가오는 시험'에 D-day로 같이 나옵니다.</p>
      <div class="row2"><label class="sel"><span>학교</span><select id="fS">${schools.map(s => `<option>${esc(s)}</option>`).join('')}</select></label><label class="sel"><span>학년</span><select id="fG"><option>1</option><option selected>2</option><option>3</option></select></label>
        <label class="sel"><span>날짜</span><input type="date" id="fD" value="${t0}"></label><label class="sel" style="flex:2"><span>내용</span><input type="text" id="fT" placeholder="예: 서술형 수행평가 (일차함수)"></label><button type="button" class="btn sm" id="fAdd">넣기</button></div>
      ${L.length ? `<div class="wnsheets">${L.map(x => `<div class="wns"><span>${x.date < t0 ? '<s>' : ''}${esc(x.date.slice(5).replace('-', '/'))} · ${esc(x.school)} ${x.grade}학년 · ${esc(x.title)}${x.date < t0 ? '</s>' : ''}<br><small class="dl">${esc(String(x.by || '').split('@')[0])}</small></span><span class="wnsb"><button type="button" class="linkbtn danger" data-fx="${x.id}">지우기</button></span></div>`).join('')}</div>` : '<div class="empty">넣은 수행평가가 없습니다.</div>'}`;
    $('#fAdd').onclick = async () => { const d = { kind: 'perf', school: $('#fS').value, grade: +$('#fG').value, date: $('#fD').value, title: $('#fT').value.trim(), name: '', by: ctx.user, at: Date.now() }; if (!d.title || !d.date) return toast('날짜와 내용을 넣어 주세요');
      d.name = `수행평가 · ${d.school} ${d.grade}학년 · ${d.title}`; try { await fdb().collection('scopes').add(d); toast('수행평가를 넣었습니다'); render(); } catch (e) { toast('저장 실패: ' + e.message); } };
    $$('[data-fx]').forEach(b => b.onclick = async () => { if (!confirm('이 수행평가를 지울까요?')) return; await fdb().collection('scopes').doc(b.dataset.fx).delete().catch(e => toast(e.message)); render(); });
  }

  // ---------- 4. 숙제 모아 보기 ----------
  async function openHw() { const s = await mine(fdb().collection('sets').where('hwOpen', '==', true)).get(); return s.docs.map(d => Object.assign({ id: d.id }, d.data())).sort((a, b) => (a.hw.due || '').localeCompare(b.hw.due || '')); }
  async function hw(box) {
    let L; try { L = await openHw(); } catch (e) { box.innerHTML = `<div class="callout">숙제를 못 읽었습니다 (Firebase 규칙 sets 필요): ${esc(e.message)}</div>`; return; }
    const t0 = todayS();
    box.innerHTML = `<p class="dl">숙제는 학생 → 추천 · 테스트 탭에서 냅니다 (문제지·테스트지를 [숙제로], 또는 '교재·범위로 숙제 내기'). 완료 체크가 기본이고, 틀린 번호까지 넣으려면 학생 화면의 [결과 넣기]를 쓰세요.</p>
      ${L.length ? `<div class="wnsheets">${L.map(x => `<div class="wns"><span><b>${esc(x.sname || '')}</b> · ${esc(x.kind === '숙제' ? '숙제' : x.kind === '테스트' ? '테스트지' : '추천 문제지')} · <span class="hwtag ${x.hw.due < t0 ? 'late' : ''}">${esc(x.hw.due.slice(5).replace('-', '/'))}까지${x.hw.due < t0 ? ' · 마감 지남' : ''}</span><br><small class="dl">${esc(x.title || '')}</small></span>
        <span class="wnsb"><button type="button" class="linkbtn" data-hd="${x.id}">완료</button><button type="button" class="linkbtn" data-hs="${esc(x.sid)}">학생 화면</button></span></div>`).join('')}</div>` : '<div class="empty">남은 숙제가 없습니다.</div>'}`;
    $$('[data-hd]').forEach(b => b.onclick = async () => { await fdb().collection('sets').doc(b.dataset.hd).update({ 'hw.done': true, 'hw.doneAt': new Date().toISOString(), 'hw.doneBy': ctx.user, hwOpen: false }).catch(e => toast(e.message)); render(); });
    $$('[data-hs]').forEach(b => b.onclick = () => { if (H.selectStudent) { H.selectStudent(b.dataset.hs); try { const k = 'mathlib.students'; const v = JSON.parse(localStorage.getItem(k) || '{}'); v.tab = 'prac'; localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} } location.hash = '#students'; });
  }

  // ---------- 홈에서 쓰는 것 ----------
  async function homeTodos() {
    const out = [];
    try { const L = await openHw(); const late = L.filter(x => x.hw.due < todayS()); if (late.length) out.push({ t: `마감 지난 숙제 ${late.length}개`, d: late.slice(0, 4).map(x => `${x.sname} (${x.hw.due.slice(5).replace('-', '/')})`).join(' · '), go: '#prep' }); } catch (_) {}
    // 오답 재도전: 교재 오답을 넣은 지 3·7·14일 되는 학생
    const due = Object.values(D.students || {}).filter(s => ((s.odap || {}).records || []).some(r => (r.wrongs || []).length && [3, 7, 14].some(d => Math.abs((Date.now() - r.at) / 864e5 - d) < 1)));
    if (due.length) out.push({ t: `오늘 오답 재도전할 학생 ${due.length}명`, d: due.slice(0, 5).map(s => s.name).join(' · ') + ' — 추천 문제지의 복습 칸에 들어갑니다', go: '#students' });
    return out;
  }
  async function homePerf() { const t0 = todayS(); return (await perfList()).filter(x => x.date >= t0).map(x => ({ perf: true, name: x.school, label: `수행평가 · ${x.title}`, grades: [x.grade], dday: Math.round((new Date(x.date + 'T00:00:00') - new Date(t0 + 'T00:00:00')) / 864e5), range: x.date.slice(5).replace('-', '/') })); }
  async function aiCost() {
    const mo = new Date(Date.now() + 9 * 36e5).toISOString().slice(0, 7);
    const [a, w] = await Promise.all([fdb().collection('meta').doc('aiCost').get().catch(() => null), fdb().collection('meta').doc('wnUsage').get().catch(() => null)]);
    const A = (a && a.exists && a.data()[mo]) || {}; let wn = { usd: 0, n: 0 };
    if (w && w.exists) Object.entries(w.data()).forEach(([day, v]) => { if (day.startsWith(mo)) { wn.usd += v.usd || 0; wn.n += v.calls || 0; } });
    let mk = { usd: 0, n: 0 }; try { if (H.factory) mk = await H.factory.costMonth(mo); } catch (_) { /* 규칙 전 */ }
    const rows = [['시험 분석', A.exam], ['AI 변형', A.variant], ['오답노트 AI', wn], ['모의고사', mk]].map(([l, v]) => ({ l, usd: (v && v.usd) || 0, n: (v && v.n) || 0 }));
    return { mo, rows, total: rows.reduce((s, r) => s + r.usd, 0) };
  }
  return { render, homeTodos, homePerf, aiCost };
};
