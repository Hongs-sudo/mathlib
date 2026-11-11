// 수학도서관 — 정리 대기열 (통합 5단계): 자료마다 ①~⑥ 어디까지 정리됐는지 보여 주고, 시험이 가까운 것부터 '다음 할 일' 하나씩.
// 정리 단계: ① 등록 ② 정보 확인 ③ 문항 위치 ④ 단원·유형 ⑤ 본문·정답 ⑥ 검수 완료 — 지금 데이터에서 계산한다(따로 적어 두지 않음).
// 보는 사람: 원장님·관리자. AI(미리 분석)는 원장님이 예상 비용을 보고 누를 때만. MYBOX 원본·기존 자료는 고치거나 지우지 않는다.
window.SudoQueue = function (H) {
  const { D, ctx, byId, esc, toast, $, $$ } = H;
  const me = (ctx && ctx.me) || { role: 'owner' };
  const owner = me.role === 'owner' || me.role === 'co';
  const DAYS = 30;                       // 1순위: 시험 D-day 30일 안 (11-11 원장님 결정)
  const USD_PER_EXAM = 0.16;             // 미리 분석 1건 (Sonnet 기준, 10월 실제 사용량)
  const STEP = ['', '① 등록', '② 정보 확인', '③ 문항 위치', '④ 단원·유형', '⑤ 본문·정답', '⑥ 검수 완료'];
  const Q = { q: '', group: 'all', sel: new Set(), open: null, showDone: false, busy: null, up: null };
  const semNow = () => { const m = new Date().getMonth() + 1; return m >= 8 || m <= 1 ? 2 : 1; };
  const norm = s => String(s || '').replace(/[\s·.\-_()]/g, '');

  // ---------- 단계 계산 ----------
  const share = (items, f) => items.length && items.filter(f).length / items.length >= 0.8;
  function examStage(e) {
    const r = { kind: '기출', id: e.id, e, title: `${e.s} ${e.y} ${e.g}학년 ${e.t}학기 ${e.x}`, sub: '' };
    const read = H.reg && H.reg.readable ? H.reg.readable(e) : true;
    if (!read) return Object.assign(r, { done: 1, hand: (e.fl || []).length ? '한글·다른 형식만 있음 (PDF·그림 없음)' : '파일 없음', sub: '시험지 파일을 PDF로 바꾸면 이어서 정리할 수 있습니다' });
    const infoOk = e.s && e.y && [1, 2, 3].includes(+e.g) && [1, 2].includes(+e.t) && ['중간', '기말'].includes(e.x);
    if (!infoOk) return Object.assign(r, { done: 1, sub: '학교·연도·학년·학기·시험 중 빈 칸이 있음' });
    if (!e.an) return Object.assign(r, { done: 2, sub: D.drafts && D.drafts[e.id] ? '검수 대기 초안이 있음' : '아직 분석 안 함 · AI 미리 분석으로 ③~⑤를 한 번에', ai: !(D.drafts && D.drafts[e.id]) });
    const it = e.an.items || [];
    let done = 2;
    if (share(it, i => i[16])) done = 3; else return Object.assign(r, { done, sub: '문항 칸(위치)이 비어 있는 문항이 많음' });
    if (share(it, i => i[8] >= 0 || i[7])) done = 4; else return Object.assign(r, { done, sub: '유형이 안 붙은 문항이 많음' });
    if (share(it, i => i[10] || i[13])) done = 5; else return Object.assign(r, { done, sub: '정답·문항 그림이 빈 문항이 많음' });
    if (e.an.status !== 'ai') done = 6;
    return Object.assign(r, { done, sub: done === 6 ? `검수 완료 · ${it.length}문항` : `AI 분석 끝 · 검수 전 · ${it.length}문항` });
  }
  const isHigh = b => /고등/.test(b.grade || '') || b.kind === '고등 교재';
  function bookStage(b) {
    const r = { kind: '교재', id: b.id, b, title: b.title, sub: '' };
    const hasPdf = (b.files || []).some(f => /pdf$/i.test(f.ext || f.rel || ''));
    if (!hasPdf) return Object.assign(r, { done: 1, hand: 'PDF 파일 없음' });
    if (b.review) return Object.assign(r, { done: 1, hand: "오답노트에서 '확인 필요' 표시됨" });
    const gOk = /^중\d(-[12])?$/.test(b.grade || '') || /^고등·/.test(b.grade || '');
    if (!b.infoOk && !(gOk && b.kind && b.kind !== '한글/기타')) return Object.assign(r, { done: 1, sub: `${b.grade || '과정 없음'} · ${b.kind || '종류 없음'} — 맞는지 확인` });
    const o = b.outline && b.outline.v === 2 ? b.outline : null;
    if (!o) return Object.assign(r, { done: 2, sub: `${b.grade} · ${b.kind} · 문항 위치 아직 (AI 없이 PDF 글자로 읽음)` });
    const secs = o.sections || [];
    const mapped = secs.filter(s => (b.secUnits || {})[s.key]).length;
    if (!b.unitsOk) return Object.assign(r, { done: 3, sub: `구역 ${secs.length}개 · 단원 연결 ${mapped}/${secs.length}` });
    const nAns = Object.keys(o.ans || {}).length, nQ = Object.keys(o.where || {}).length;
    if (!nAns && !b.noAnsOk) return Object.assign(r, { done: 4, sub: `해설지에서 정답을 못 찾음 (문항 ${nQ})` });
    if (!b.checkedAt) return Object.assign(r, { done: 5, sub: `문항 ${nQ} · 정답 ${nAns} · 검수 전` });
    return Object.assign(r, { done: 6, sub: `검수 완료 · 문항 ${nQ}` });
  }
  function matStage(m) {
    const r = { kind: '자료실', id: m.id, m, title: m.title, sub: '' };
    const st = m.status || (m.origin && m.origin.status);
    if (st === 'fail') return Object.assign(r, { done: 1, hand: '자료실 색인 실패' });
    return Object.assign(r, { done: st === 'done' ? 6 : 4, sub: st === 'done' ? '자료실 확인 끝' : '자료실 색인됨 · 영역 확인 전' });
  }

  // ---------- 대기열 만들기 ----------
  async function build() {
    const src = H.src ? await H.src.load() : [];
    if (!Q.up && H.sch) { try { Q.up = (await H.sch.upcoming()).up; } catch (_) { Q.up = []; } }
    const rows = [];
    const studentBooks = new Set(Object.values(D.students || {}).flatMap(s => ((s.odap || {}).books || [])));
    const sem = semNow();
    // 1순위: 시험 D-day 30일 안인 학교·학년의 같은 학기·같은 시험 지난 기출
    const near = (Q.up || []).filter(p => p.dday <= DAYS && p.kind !== 'perf');
    const pri1 = new Map();
    near.forEach(p => {
      const t = /1학기/.test(p.label) ? 1 : /2학기/.test(p.label) ? 2 : sem, x = /중간/.test(p.label) ? '중간' : /기말/.test(p.label) ? '기말' : '';
      const gs = (p.grades || []).length ? p.grades : [1, 2, 3];
      const head = `${p.dday <= 0 ? '시험 중' : 'D-' + p.dday} ${p.sc.name} ${gs.join('·')}학년 ${p.label} (${p.range})`;
      D.exams.filter(e => e.s === p.sc.name && gs.includes(+e.g) && +e.t === t && (!x || e.x === x)).forEach(e => { if (!pri1.has(e.id)) pri1.set(e.id, { head, d: p.dday }); });
    });
    D.exams.forEach(e => {
      const r = examStage(e);
      if (pri1.has(e.id)) Object.assign(r, { g: 1, head: pri1.get(e.id).head, ord: pri1.get(e.id).d * 1e4 - e.y });
      else Object.assign(r, { g: 4, head: `${e.y}년`, ord: (3000 - e.y) * 1e4 + (e.s.charCodeAt(0) || 0) });
      rows.push(r);
    });
    src.forEach(x => {
      if (x.id.startsWith('ob_')) {
        if ((x.sameExams || []).length) return; // 시험지와 같은 파일 → 기출 쪽에서 정리
        const r = bookStage(x);
        if (x.kind === '기출·시험지') Object.assign(r, { hand: r.hand || '보관함에 없는 기출 파일 — 시험 등록에서 시험으로 올리기' });
        if (studentBooks.has(x.id)) Object.assign(r, { g: 2, head: '학생이 쓰는 교재', ord: 0 });
        else if (isHigh(x)) Object.assign(r, { g: 6, head: '고등 교재 (맨 뒤)', ord: 0 });
        else if (['내신대비', '교과서 자료', '수업자료'].includes(x.kind) && (new RegExp(`-${sem}$`).test(x.grade || '') || /^중\d$/.test(x.grade || ''))) Object.assign(r, { g: 3, head: `이번 학기(${sem}학기) 내신대비 · 프린트`, ord: 0 });
        else Object.assign(r, { g: 5, head: '나머지 중등 교재', ord: 0 });
        rows.push(r);
      } else if (x.id.startsWith('mt_')) {
        const r = matStage(x); Object.assign(r, { g: 3, head: `이번 학기(${sem}학기) 내신대비 · 프린트`, ord: 1 }); rows.push(r);
      }
    });
    rows.forEach(r => { if (r.hand) { r.g = 9; r.head = r.hand; } });
    return rows;
  }
  const GROUPS = [['all', '전체 순서'], [1, `1 시험 가까운 기출 (D-${DAYS})`], [2, '2 학생 교재'], [3, '3 내신대비·프린트'], [4, '4 지난 기출'], [5, '나머지 중등 교재'], [6, '고등 교재'], [9, '손 필요']];

  // 홈 '할 일'용 (자료 목록 없이 기출만으로 빠르게)
  async function urgent() {
    let up = Q.up; if (!up && H.sch) { try { up = Q.up = (await H.sch.upcoming()).up; } catch (_) { up = []; } }
    const out = [];
    (up || []).filter(p => p.dday <= DAYS && p.kind !== 'perf').forEach(p => {
      const t = /1학기/.test(p.label) ? 1 : /2학기/.test(p.label) ? 2 : semNow(), x = /중간/.test(p.label) ? '중간' : /기말/.test(p.label) ? '기말' : '';
      const gs = (p.grades || []).length ? p.grades : [1, 2, 3];
      const left = D.exams.filter(e => e.s === p.sc.name && gs.includes(+e.g) && +e.t === t && (!x || e.x === x)).map(examStage).filter(r => r.done < 6);
      if (left.length) out.push({ t: `${p.dday <= 0 ? '시험 중' : 'D-' + p.dday} ${p.sc.name} ${gs.join('·')}학년 — 정리 안 된 기출 ${left.length}개`, d: left.slice(0, 3).map(r => `${r.e.y} ${r.e.g}-${r.e.t} ${r.e.x}`).join(' · '), go: '#queue' });
    });
    return out;
  }

  // ---------- 화면 ----------
  let ROWS = null;
  async function render(reload) {
    const main = $('#main');
    if (!ROWS || reload) {
      main.innerHTML = '<div class="head"><div><div class="kicker">시험이 가까운 것부터 · 원장님·관리자</div><h1>정리 대기열</h1></div></div><p class="dl">자료와 시험의 정리 상태를 계산하는 중… (처음 한 번 몇 초)</p>';
      try { ROWS = await build(); } catch (e) { main.innerHTML += `<div class="callout">불러오지 못했습니다: ${esc(e.message)}</div>`; return; }
      if ((location.hash || '') !== '#queue') return;
    }
    const left = ROWS.filter(r => r.done < 6);
    const cnt = g => (g === 'all' ? left : left.filter(r => r.g === g)).length;
    const qq = norm(Q.q);
    let list = (Q.showDone ? ROWS : left).filter(r => (Q.group === 'all' || r.g === Q.group) && (!qq || norm(r.title).includes(qq)));
    list = list.sort((a, b) => a.g - b.g || a.ord - b.ord || a.title.localeCompare(b.title, 'ko'));
    const show = list.slice(0, 120);
    const doneN = ROWS.length - left.length;
    let lastHead = '';
    const body = show.map(r => { const h = r.head !== lastHead ? `<div class="qgrp">${esc(r.head)}</div>` : ''; lastHead = r.head; return h + rowHtml(r); }).join('');
    main.innerHTML = `
      <div class="head"><div><div class="kicker">시험이 가까운 것부터 · 원장님·관리자</div><h1>정리 대기열</h1></div>
        <div class="headact"><button type="button" class="btn ghost" id="qRe">다시 계산</button></div></div>
      <p class="dl">남은 것 ${left.length.toLocaleString()} · 검수 완료 ${doneN.toLocaleString()} · 정리 단계 ① 등록 ② 정보 확인 ③ 문항 위치 ④ 단원·유형 ⑤ 본문·정답 ⑥ 검수 완료</p>
      <div class="chips qchips">${GROUPS.map(([g, l]) => `<button type="button" class="chip" data-qg="${g}" aria-pressed="${String(Q.group) === String(g)}">${esc(l)} <small>${cnt(g).toLocaleString()}</small></button>`).join('')}
        <label class="qdone"><input type="checkbox" id="qDone" ${Q.showDone ? 'checked' : ''}> 끝난 것도 보기</label>
        <input type="search" id="qQ" class="qsearch" placeholder="이름으로 찾기" value="${esc(Q.q)}" aria-label="대기열에서 찾기">
        <button type="button" class="linkbtn" id="qAll">보이는 것 중 한꺼번에 할 수 있는 것 모두 고르기</button></div>
      ${batchHtml()}
      <section class="card qlist">${body || '<div class="empty">이 묶음에는 정리할 것이 없습니다.</div>'}${list.length > show.length ? `<p class="dl" style="padding:8px 12px">앞의 120개만 보입니다. 위 묶음을 골라 좁혀 보세요. (모두 ${list.length.toLocaleString()}개)</p>` : ''}</section>`;
    bind();
  }
  function bar(done) { return `<span class="qst" title="${STEP[Math.min(done + 1, 6)] || ''}">${[1, 2, 3, 4, 5, 6].map(k => `<i class="${k <= done ? 'd' : k === done + 1 ? 'n' : ''}"></i>`).join('')}</span>`; }
  function action(r) {
    if (r.done >= 6) return r.kind === '교재' ? ['open', '보기'] : ['review', '보기'];
    if (r.hand) return r.kind === '기출' ? ['info', '시험 정보'] : r.kind === '자료실' ? ['lib', '자료실 열기'] : r.b && r.b.kind === '기출·시험지' ? ['reg', '시험 등록으로'] : ['info', '② 정보 확인'];
    if (r.kind === '자료실') return ['lib', '⑤ 자료실에서 확인'];
    if (r.kind === '기출') {
      if (r.done < 2) return ['info', '② 정보 확인'];
      if (!r.e.an) return D.drafts && D.drafts[r.id] ? ['draft', '⑥ 초안 검수'] : ['ai', '③~⑤ AI 미리 분석'];
      return ['review', `${STEP[r.done + 1]} · 검수 열기`];
    }
    return [['', 'info', 'info', 'outline', 'units', 'ans', 'check'][r.done + 1] || 'info', STEP[r.done + 1]];
  }
  function rowHtml(r) {
    const [a, label] = action(r);
    const canSel = (a === 'ai' && owner) || a === 'outline';
    const open = Q.open === r.id;
    return `<div class="qrow2 ${open ? 'on' : ''}">
      <span>${canSel ? `<input type="checkbox" data-qs="${esc(r.id)}" ${Q.sel.has(r.id) ? 'checked' : ''} aria-label="고르기">` : ''}</span>
      <span class="qt"><b>${esc(r.title)}</b><small class="dl">${esc(r.kind)} · ${esc(r.sub || r.hand || '')}</small></span>
      ${bar(r.done)}
      <button type="button" class="btn ${a === 'ai' || a === 'outline' ? '' : 'ghost'} sm" data-qa="${a}" data-qid="${esc(r.id)}" ${a === 'ai' && !owner ? 'disabled title="AI는 원장님만"' : ''}>${esc(label)}</button></div>
      ${open ? `<div class="qpanel" id="qPanel"></div>` : ''}`;
  }
  function batchHtml() {
    if (!Q.sel.size) return '';
    const sel = ROWS.filter(r => Q.sel.has(r.id));
    const ai = sel.filter(r => action(r)[0] === 'ai'), ol = sel.filter(r => action(r)[0] === 'outline');
    const model = H.reg && H.reg.modelName ? H.reg.modelName() : '';
    return `<div class="qbatch"><span><b>고른 것 ${sel.length}개</b>${ol.length ? ` · 문항 위치 읽기 ${ol.length}개 (AI 없음)` : ''}${ai.length ? ` · AI 미리 분석 ${ai.length}건 <b>예상 약 $${(ai.length * USD_PER_EXAM).toFixed(2)}</b> (Sonnet 기준 1건 약 $${USD_PER_EXAM}${model ? ` · 지금 모델 ${esc(model)}` : ''})` : ''}</span>
      <span class="qbb">${Q.busy ? `<span class="dl">${esc(Q.busy)}</span>` : `${ol.length ? `<button type="button" class="btn" id="qOl">문항 위치 읽기 ${ol.length}개</button>` : ''}${ai.length && owner ? `<button type="button" class="btn" id="qAi">AI 미리 분석 ${ai.length}건 시작</button>` : ''}<button type="button" class="btn ghost" id="qClr">고르기 풀기</button>`}</span></div>`;
  }
  function bind() {
    $$('[data-qg]').forEach(b => b.onclick = () => { const g = b.dataset.qg; Q.group = g === 'all' ? 'all' : +g; render(); });
    $('#qDone').onchange = ev => { Q.showDone = ev.target.checked; render(); };
    $('#qRe').onclick = () => { Q.up = null; if (H.src && H.src.reset) H.src.reset(); render(true); };
    $$('[data-qs]').forEach(c => c.onchange = () => { if (c.checked) Q.sel.add(c.dataset.qs); else Q.sel.delete(c.dataset.qs); render(); });
    let tq; $('#qQ').oninput = ev => { clearTimeout(tq); tq = setTimeout(() => { Q.q = ev.target.value; render(); const n = $('#qQ'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 300); };
    $('#qAll').onclick = () => { $$('[data-qs]').forEach(c => Q.sel.add(c.dataset.qs)); render(); };
    const clr = $('#qClr'); if (clr) clr.onclick = () => { Q.sel.clear(); render(); };
    const ai = $('#qAi'); if (ai) ai.onclick = () => {
      const ids = ROWS.filter(r => Q.sel.has(r.id) && action(r)[0] === 'ai').map(r => r.id);
      if (!confirm(`AI 미리 분석 ${ids.length}건을 시작할까요?\n예상 비용 약 $${(ids.length * USD_PER_EXAM).toFixed(2)} (Sonnet 기준 · 실제 금액은 Claude 콘솔에서 확인)\n'시험 등록 → 미리 분석' 화면에서 진행되고, 끝나면 '검수 전'으로 저장됩니다.`)) return;
      Q.sel.clear(); ROWS = null; H.reg.preRun(ids);
    };
    const ol = $('#qOl'); if (ol) ol.onclick = () => runOutlines(ROWS.filter(r => Q.sel.has(r.id) && action(r)[0] === 'outline'));
    $$('[data-qa]').forEach(b => b.onclick = () => act(b.dataset.qa, ROWS.find(r => r.id === b.dataset.qid)));
    if (Q.open) { const r = ROWS.find(x => x.id === Q.open); const p = $('#qPanel'); if (r && p) panel(r, p); }
  }
  async function saveSrc(id, data) {
    await firebase.firestore().collection('sources').doc(id).set(Object.assign({}, data, { editedAt: new Date().toISOString(), editedBy: ctx.user }), { merge: true });
    const x = (H.src && H.src.find && H.src.find(id)); if (x) Object.assign(x, data);
  }
  function refreshRow(id) { const i = ROWS.findIndex(r => r.id === id); if (i < 0) return; const r = ROWS[i]; const n = r.kind === '교재' ? bookStage(r.b) : r.kind === '기출' ? examStage(byId[id] || r.e) : r; ROWS[i] = Object.assign(n, { g: r.hand && !n.hand ? r.g : n.hand ? 9 : r.g, head: n.hand ? n.hand : r.g === 9 ? '이번에 확인함' : r.head, ord: r.ord }); }
  async function act(a, r) {
    if (!r) return;
    if (a === 'ai') { Q.sel.add(r.id); render(); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    if (a === 'review' || a === 'draft') return H.reg.editExam ? (a === 'draft' ? H.reg.pickExam(r.id) : H.reg.editExam(r.id)) : null;
    if (a === 'lib') { location.hash = '#library'; return; }
    if (a === 'reg') { location.hash = '#register'; return; }
    if (a === 'info' && r.kind === '기출') { if (H.openExamInfo) H.openExamInfo(r.e); return; }
    if (a === 'outline') return runOutlines([r]);
    Q.open = Q.open === r.id ? null : r.id; render();
  }
  // ② 정보 확인 · ④ 단원 연결 · ⑤ 정답 확인 · ⑥ 검수 완료 (교재, 그 자리에서)
  const GRADES = ['중1-1', '중1-2', '중2-1', '중2-2', '중3-1', '중3-2', '중1', '중2', '중3', '고등·공통수학1', '고등·공통수학2', '고등·대수', '고등·미적분1', '고등·확률과 통계', '고등·기하'];
  const KINDS = ['내신대비', '시중교재', '교과서 자료', '수업자료', '고등 교재', '기출·시험지', '한글/기타'];
  function courses(b) { const m = String(b.grade || '').match(/^중(\d)(?:-(\d))?$/); if (!m) return []; return m[2] ? [`중등${m[1]}-${m[2]}`] : [`중등${m[1]}-1`, `중등${m[1]}-2`]; }
  function mids(b) { const out = []; courses(b).forEach(c => { const seen = new Set(); (D.catalog || []).forEach(x => { if (x[1] !== c) return; const k = `${c}|${x[3]}.${x[4]}`; if (seen.has(k)) return; seen.add(k); out.push({ k, label: `${c.replace('중등', '중')} ${x[3]}. ${x[4]}`, name: x[4] }); }); }); return out; }
  function guess(b, ms) {
    const o = b.outline, toc = b.toc || [], out = {};
    let prev = '';
    (o.sections || []).forEach(s => {
      const lab = norm(s.label);
      let hit = ms.find(m => m.name && lab.includes(norm(m.name)));
      if (!hit) { const pg = +((String(s.key).match(/^p(\d+)/) || [])[1] || (String(s.label).match(/(\d+)\s*쪽/) || [])[1] || 0); const t = pg ? toc.filter(t => +t.page <= pg).pop() : null; if (t) hit = ms.find(m => norm(t.title).includes(norm(m.name)) || norm(m.name).includes(norm(t.title))); }
      out[s.key] = hit ? hit.k : prev ? prev + '?' : '';
      if (hit) prev = hit.k;
    });
    return out;
  }
  function panel(r, p) {
    const b = r.b, [a] = action(r);
    if (a === 'info') {
      p.innerHTML = `<b>② 정보 확인</b><div class="qform"><label class="sel"><span>과정</span><select id="qpG">${GRADES.concat(GRADES.includes(b.grade) ? [] : [b.grade || '']).map(g => `<option ${g === b.grade ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select></label>
        <label class="sel"><span>종류</span><select id="qpK">${KINDS.concat(KINDS.includes(b.kind) ? [] : [b.kind || '']).map(k => `<option ${k === b.kind ? 'selected' : ''}>${esc(k)}</option>`).join('')}</select></label></div>
        <p class="dl">파일: ${esc(((b.files || [])[0] || {}).rel || '')}</p>
        <div class="qbtns"><button type="button" class="btn sm" id="qpOk">확인</button>${b.review ? '<button type="button" class="btn ghost sm" id="qpRv">확인 필요 표시 풀기</button>' : ''}</div>`;
      $('#qpOk').onclick = async () => { try { const grade = $('#qpG').value, kind = $('#qpK').value; await saveSrc(b.id, { grade, kind, infoOk: true, review: 0 }); Object.assign(b, { grade, kind, infoOk: true, review: 0 }); refreshRow(b.id); Q.open = null; toast('정보를 확인했습니다'); render(); } catch (e) { toast('저장 실패: ' + e.message); } };
      const rv = $('#qpRv'); if (rv) rv.onclick = $('#qpOk').onclick;
      return;
    }
    if (a === 'units') {
      const ms = mids(b);
      if (!ms.length) { p.innerHTML = `<p class="dl">과정(${esc(b.grade || '없음')})에 맞는 단원 목록이 없습니다. 먼저 ② 정보 확인에서 과정을 '중2-2'처럼 학기까지 골라 주세요.</p>`; return; }
      const cur = Object.assign(guess(b, ms), b.secUnits || {});
      const secs = b.outline.sections || [];
      p.innerHTML = `<b>④ 단원 연결 — 구역 ${secs.length}개</b><p class="dl">교재 목차와 구역 이름으로 먼저 골라 두었습니다. <span class="qq">물음표</span> 줄만 확인하면 됩니다. AI 없음.</p>
        <div class="qsecs">${secs.map(s => { const v = cur[s.key] || ''; const q = v.endsWith('?'); const vv = v.replace(/\?$/, ''); return `<div class="${q || !vv ? 'q' : ''}"><span>${esc(s.label)}</span><select data-sk="${esc(s.key)}"><option value="">(고르기)</option>${ms.map(m => `<option value="${esc(m.k)}" ${m.k === vv ? 'selected' : ''}>${esc(m.label)}${m.k === vv && q ? ' ?' : ''}</option>`).join('')}</select></div>`; }).join('')}</div>
        <div class="qbtns"><button type="button" class="btn sm" id="qpU">모두 확인</button></div>`;
      $$('#qPanel [data-sk]').forEach(sel => sel.onchange = () => sel.parentElement.classList.toggle('q', !sel.value));
      $('#qpU').onclick = async () => {
        const map = {}; let empty = 0; $$('#qPanel [data-sk]').forEach(sel => { if (sel.value) map[sel.dataset.sk] = sel.value; else empty++; });
        if (empty && !confirm(`단원을 고르지 않은 구역이 ${empty}개 있습니다. 그대로 확인할까요?`)) return;
        try { await saveSrc(b.id, { secUnits: map, unitsOk: true }); Object.assign(b, { secUnits: map, unitsOk: true }); refreshRow(b.id); Q.open = null; toast('단원을 연결했습니다'); render(); } catch (e) { toast('저장 실패: ' + e.message); }
      };
      return;
    }
    if (a === 'ans') {
      p.innerHTML = `<b>⑤ 정답</b><p class="dl">해설지(답지) PDF에서 정답을 찾지 못했습니다. 답지 파일이 교재 폴더에 있는지 MYBOX에서 확인해 주세요. 답지가 없는 교재라면 그대로 넘어갈 수 있습니다 (오답노트에는 원장님 AI 풀이로 채움).</p>
        <div class="qbtns"><button type="button" class="btn ghost sm" id="qpRe">답지 다시 찾기</button><button type="button" class="btn sm" id="qpNo">답지 없는 교재로 넘어가기</button></div>`;
      $('#qpNo').onclick = async () => { await saveSrc(b.id, { noAnsOk: true }); b.noAnsOk = true; refreshRow(b.id); Q.open = null; render(); };
      $('#qpRe').onclick = async () => { await saveSrc(b.id, { outline: firebase.firestore.FieldValue.delete() }); delete b.outline; refreshRow(b.id); Q.open = null; render(); runOutlines([ROWS.find(x => x.id === b.id)]); };
      return;
    }
    if (a === 'check' || a === 'open') {
      const o = b.outline || {}; const secs = o.sections || [];
      p.innerHTML = `<b>${a === 'check' ? '⑥ 검수' : '정리 내용'}</b><p class="dl">구역 ${secs.length}개 · 문항 ${Object.keys(o.where || {}).length} · 정답 ${Object.keys(o.ans || {}).length} · 해설 ${Object.keys(o.sol || {}).length}</p>
        <div class="qsecs ro">${secs.slice(0, 40).map(s => `<div><span>${esc(s.label)}</span><span class="dl">${esc(String((b.secUnits || {})[s.key] || '').split('|').pop() || '단원 없음')}</span></div>`).join('')}</div>
        <p class="dl">학생 교재 오답 입력에서 이 교재를 고르면 이 구역·번호로 나오고, 오답노트는 원본 잘라내기와 해설지 정답을 씁니다.</p>
        ${a === 'check' ? '<div class="qbtns"><button type="button" class="btn sm" id="qpC">검수 완료</button><button type="button" class="btn ghost sm" id="qpBack">단원 다시 연결</button></div>' : '<div class="qbtns"><button type="button" class="btn ghost sm" id="qpBack">단원 다시 연결</button></div>'}`;
      const c = $('#qpC'); if (c) c.onclick = async () => { const at = new Date().toISOString(); await saveSrc(b.id, { checkedAt: at, checkedBy: ctx.user }); b.checkedAt = at; refreshRow(b.id); Q.open = null; toast('검수 완료로 표시했습니다'); render(); };
      $('#qpBack').onclick = async () => { await saveSrc(b.id, { unitsOk: false }); b.unitsOk = false; refreshRow(b.id); render(); };
    }
  }
  // ③ 문항 위치 읽기 (교재) — 이 PC의 MYBOX에서 PDF를 열어 글자로 읽음, AI 없음
  async function runOutlines(rs) {
    const W = H.WN && H.WN(); if (!W) return toast('이 브라우저에서는 MYBOX 파일을 열 수 없습니다 (PC 크롬·엣지)');
    let ok = 0, fail = [];
    for (let k = 0; k < rs.length; k++) {
      const r = rs[k]; Q.busy = `문항 위치 읽는 중 ${k + 1}/${rs.length} · ${r.title}`; render();
      try { const o = await W.readOutline(r.id, (p, n) => { const s = $('.qbatch .dl'); if (s) s.textContent = `${Q.busy} · ${p}/${n}쪽`; }); r.b.outline = o; await saveSrc(r.id, {}).catch(() => {}); refreshRow(r.id); ok++; Q.sel.delete(r.id); }
      catch (e) { fail.push(`${r.title}: ${e.message}`); }
    }
    Q.busy = null; render();
    toast(`문항 위치 ${ok}개 읽음${fail.length ? ` · 못 읽음 ${fail.length}개 (${fail[0].slice(0, 80)})` : ''}`);
  }
  return { render, urgent, examStage };
};
