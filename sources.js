// 수학도서관 — 자료함: 교재(오답노트 교재 정리) · 기출(시험지 보관함) · 학교 프린트 · 학원 교재를 한 목록에서
// 데이터: Firestore sources (3단계에서 옮김). 같은 MYBOX 파일은 하나로, 개정 전 판은 '예전 판'으로 접어 둔다.
// MYBOX 교재 폴더: 이 PC의 크롬에 연결(오답노트 앱과 같은 연결을 같이 씀). 파일은 읽기만.
window.SudoSources = function (H) {
  const { ctx, esc, toast, $, $$ } = H;
  const me = (ctx && ctx.me) || { role: 'owner' };
  const S = { list: null, loading: null, err: '', kind: '전체', course: '', q: '', open: null, items: {}, roots: null, more: 0 };
  const KINDS = ['전체', '교재', '기출', '학교 프린트', '학원 교재', '선생님 보조자료'];
  const kindOf = x => x.origin && x.origin.app === 'odap' ? '교재' : x.kind === '기출' ? '기출' : x.kind || '자료';
  const edition = t => (/\(22개정\)/.test(t) ? 22 : /\(15개정\)/.test(t) ? 15 : 0);
  const baseTitle = t => String(t || '').replace(/\s*\((22|15)개정\)/, '').trim();
  const norm = s => String(s || '').replace(/[\s_·.\-]+/g, '').toLowerCase();

  function load() {
    if (S.list) return Promise.resolve(S.list);
    if (!S.loading) S.loading = firebase.firestore().collection('sources').get().then(snap => {
      const all = snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
      // 같은 파일: 자료실 자료(mt_)가 오답노트 교재와 같은 파일이면 교재 쪽에만 보이게
      const hidden = new Set(all.filter(x => x.id.startsWith('mt_') && (x.sameBooks || []).length).map(x => x.id));
      const vis = all.filter(x => !hidden.has(x.id) && x.title);
      // 예전 판: 같은 이름의 22개정 교재가 있으면 15개정은 그 밑으로
      const by = new Map();
      vis.filter(x => kindOf(x) === '교재').forEach(x => { const k = baseTitle(x.title) + '|' + (x.grade || ''); if (!by.has(k)) by.set(k, []); by.get(k).push(x); });
      const old = new Set();
      by.forEach(g => { if (g.length < 2) return; const top = g.find(x => edition(x.title) === 22) || g[0]; top.olds = g.filter(x => x !== top); top.olds.forEach(x => old.add(x.id)); });
      S.list = vis.filter(x => !old.has(x.id)).map(x => Object.assign(x, { K: kindOf(x), same: all.filter(y => (x.sameExams || []).includes(y.id.replace(/^ex_/, '')) || (y.sameBooks || []).includes(x.id)).map(y => y.id) }))
        .sort((a, b) => a.title.localeCompare(b.title, 'ko'));
      S.hiddenN = hidden.size; S.oldN = old.size;
      return S.list;
    }, e => { S.err = e.message; S.loading = null; throw e; });
    return S.loading;
  }
  const courseOf = x => x.course || (x.exam ? `중등${x.exam.grade}-${x.exam.sem}` : '') || '';

  async function render() {
    const main = $('#main');
    if (!S.list) {
      main.innerHTML = '<div class="head"><div><div class="kicker">교재 · 기출 · 학교 프린트 · 학원 교재</div><h1>자료함</h1></div></div><p class="dl">자료 목록을 불러오는 중… (처음 한 번 몇 초 걸립니다)</p>';
      try { await load(); } catch (e) { main.innerHTML += `<div class="callout">불러오지 못했습니다: ${esc(e.message)}</div>`; return; }
      if ((location.hash || '') !== '#sources') return;
    }
    const courses = [...new Set(S.list.map(courseOf).filter(Boolean))].sort();
    const q = norm(S.q);
    const rows = S.list.filter(x => (S.kind === '전체' || x.K === S.kind) && (!S.course || courseOf(x) === S.course) && (!q || norm(x.title).includes(q) || norm(x.school).includes(q)));
    const cnt = k => S.list.filter(x => k === '전체' || x.K === k).length;
    const show = rows.slice(0, 200 + S.more);
    main.innerHTML = `
      <div class="head"><div><div class="kicker">교재 · 기출 · 학교 프린트 · 학원 교재</div><h1>자료함</h1></div>
        <div class="headact"><button type="button" class="btn ghost" id="srcFold">MYBOX 교재 폴더</button></div></div>
      <p class="dl">${S.list.length.toLocaleString()}개${S.hiddenN ? ` · 같은 파일 ${S.hiddenN}개는 하나로` : ''}${S.oldN ? ` · 예전 판 ${S.oldN}개 접어 둠` : ''}</p>
      <div id="srcRoots"></div>
      <div class="srcbar">
        <div class="chips">${KINDS.map(k => `<button type="button" class="chip" data-kind="${k}" aria-pressed="${S.kind === k}">${k} <small>${cnt(k).toLocaleString()}</small></button>`).join('')}</div>
        <div class="row2"><label class="sel"><span>과정</span><select id="srcCourse"><option value="">전체</option>${courses.map(c => `<option ${c === S.course ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
          <input type="search" id="srcQ" class="bigsearch" placeholder="이름·학교로 찾기 (띄어쓰기 무시)" value="${esc(S.q)}" aria-label="자료 찾기"></div></div>
      <section class="card srclist">${show.length ? show.map(rowHtml).join('') : '<div class="empty">찾는 자료가 없습니다. 종류·과정을 "전체"로 바꿔 보세요.</div>'}
        ${rows.length > show.length ? `<button type="button" class="btn ghost" id="srcMore">${(rows.length - show.length).toLocaleString()}개 더 보기</button>` : ''}</section>`;
    bind();
    if (S.showRoots) roots();
  }
  function rowHtml(x) {
    const o = x.outline && x.outline.sections ? x.outline.sections.length : 0;
    const tag = x.K === '기출' ? (x.analyzed ? '<span class="pill ok">분석 완료</span>' : '<span class="pill">분석 전</span>') : x.K === '교재' ? (o ? `<span class="pill ok">구역 ${o}</span>` : '') : '';
    const open = S.open === x.id;
    return `<div class="srow2 ${open ? 'on' : ''}"><button type="button" class="srcrow" data-src="${esc(x.id)}">
        <span class="srct"><b>${esc(x.title)}</b><small class="dl">${esc(x.K === '교재' && x.kind && x.kind !== '교재' ? '교재 · ' + x.kind : x.K)}${x.grade ? ' · ' + esc(x.grade) : courseOf(x) ? ' · ' + esc(courseOf(x)) : ''}${x.school ? ' · ' + esc(x.school) : ''}${(x.files || []).length ? ` · 파일 ${x.files.length}` : ''}${x.olds && x.olds.length ? ` · 예전 판 ${x.olds.length}` : ''}</small></span>
        <span class="srcg">${tag}${x.same.length ? '<span class="pill">같은 파일 있음</span>' : ''}</span></button>
      ${open ? detail(x) : ''}</div>`;
  }
  function detail(x) {
    const secs = x.outline && x.outline.sections || [];
    const units = [...new Set(secs.map(s => String(s.label || '').replace(/^[^/]+\//, '').replace(/\s*-\s*\d+\s*레벨/, '').replace(/\s*\d+\s*회차.*$/, '').replace(/^\d+(\.\d+)*\s*/, '').trim()).filter(Boolean))];
    const it = S.items[x.id];
    const files = (x.files || []).slice(0, 12);
    return `<div class="srcdet">
      ${files.length ? `<div class="srcfiles">${files.map((f, i) => `<div><span>${esc(f.role || f.ext || '')}${f.audience ? ' · ' + esc(f.audience) : ''}</span><code>${esc(f.rel || f.path || '')}</code>${(f.rel && f.label) ? `<button type="button" class="linkbtn" data-fopen="${esc(x.id)}|${i}">열기</button>` : ''}</div>`).join('')}${(x.files || []).length > 12 ? `<small class="dl">외 ${x.files.length - 12}개</small>` : ''}</div>` : ''}
      ${units.length ? `<p class="small"><b>단원</b> ${units.slice(0, 20).map(esc).join(' · ')}${units.length > 20 ? ' …' : ''}</p>` : x.K === '교재' ? '<p class="dl">단원(구역)은 학생 교재 오답 입력에서 이 교재를 처음 고를 때 읽어 둡니다.</p>' : ''}
      <p class="small"><b>문항 은행</b> ${it === undefined ? `<button type="button" class="linkbtn" data-icount="${esc(x.id)}">세어 보기</button>` : it === null ? '세는 중…' : it + '문항'}</p>
      ${x.same.length ? `<p class="small"><b>같은 파일</b> ${x.same.map(id => { const y = S.list.find(z => z.id === id); return y ? esc(y.title) : esc(id); }).join(' · ')}</p>` : ''}
      ${x.olds && x.olds.length ? `<p class="small"><b>예전 판</b> ${x.olds.map(o => esc(o.title)).join(' · ')}</p>` : ''}
      ${x.K === '기출' && x.exam && me.role !== 'teacher' && H.openExam ? `<button type="button" class="btn ghost sm" data-exam="${esc(x.exam.id)}">시험지 보관함에서 보기</button>` : ''}</div>`;
  }
  function bind() {
    $$('[data-kind]').forEach(b => b.onclick = () => { S.kind = b.dataset.kind; S.more = 0; render(); });
    $('#srcCourse').onchange = ev => { S.course = ev.target.value; S.more = 0; render(); };
    let t; $('#srcQ').oninput = ev => { clearTimeout(t); t = setTimeout(() => { S.q = ev.target.value; S.more = 0; render(); const n = $('#srcQ'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 250); };
    $$('[data-src]').forEach(b => b.onclick = () => { S.open = S.open === b.dataset.src ? null : b.dataset.src; render(); });
    const m = $('#srcMore'); if (m) m.onclick = () => { S.more += 300; render(); };
    $('#srcFold').onclick = () => { S.showRoots = !S.showRoots; if (S.showRoots) roots(); else $('#srcRoots').innerHTML = ''; };
    $$('[data-exam]').forEach(b => b.onclick = () => H.openExam(b.dataset.exam));
    $$('[data-icount]').forEach(b => b.onclick = async () => {
      const id = b.dataset.icount; S.items[id] = null; render();
      try { const s = await firebase.firestore().collection('items').where('source', '==', id).get(); S.items[id] = s.size; } catch (e) { S.items[id] = undefined; toast('세지 못했습니다: ' + e.message); }
      render();
    });
    $$('[data-fopen]').forEach(b => b.onclick = async () => {
      const [id, i] = b.dataset.fopen.split('|'); const x = S.list.find(y => y.id === id); const f = x && x.files[+i];
      const W = H.WN && H.WN(); if (!W) return toast('이 브라우저에서는 MYBOX 파일을 열 수 없습니다');
      try { await W.openFile(x, f); } catch (e) { toast(e.message); }
    });
  }
  // ---------- MYBOX 교재 폴더 ----------
  async function roots() {
    const box = $('#srcRoots'); if (!box) return;
    const W = H.WN && H.WN();
    if (!W) { box.innerHTML = '<div class="callout">이 브라우저에서는 폴더 연결을 쓸 수 없습니다. PC의 크롬·엣지에서 열어 주세요.</div>'; return; }
    box.innerHTML = '<section class="card rootcard"><h2>MYBOX 교재 폴더</h2><p class="dl">이 PC에 연결한 폴더를 확인하는 중…</p></section>';
    let rs, err = '';
    try { rs = await W.folders(); } catch (e) { rs = []; err = e.message; }
    const labels = new Set(rs.map(r => r.label));
    const need = W.DEFAULT_ROOTS.filter(d => !labels.has(d.label));
    box.innerHTML = `<section class="card rootcard"><h2>MYBOX 교재 폴더 <small>이 PC의 크롬에만 저장 · 파일은 읽기만</small></h2>
      ${err ? `<div class="callout">${esc(err)}. 크롬(또는 수학도서관 앱 창)을 모두 닫았다가 다시 열고 눌러 주세요. 예전 '오답노트' 앱 창이 열려 있으면 그것도 닫아 주세요.</div>` : ''}
      ${rs.length ? `<ul class="rootlist">${rs.map((r, i) => `<li><b>${esc(r.label)}</b><small class="dl">${esc(r.path || '')}</small><span class="rtact">${r.perm === 'granted' ? '<span class="pill ok">열림</span>' : `<span class="pill warn">허락 필요</span><button type="button" class="btn sm" data-rask="${i}">허락</button><button type="button" class="btn sm ghost" data-rpick="${i}">다시 고르기</button>`}</span></li>`).join('')}</ul>
        <button type="button" class="btn ghost" id="rtRe">모두 다시 연결 (허락)</button>` : '<p class="dl">아직 이 PC에 연결한 교재 폴더가 없습니다. 오답노트 앱에서 연결해 둔 폴더가 있으면 여기에 같이 보입니다.</p>'}
      ${need.length ? `<div class="row2" style="margin-top:10px"><label class="sel"><span>연결할 폴더</span><select id="rtPick">${need.map((d, i) => `<option value="${i}">${esc(d.label)} — ${esc(d.path)}</option>`).join('')}</select></label><button type="button" class="btn" id="rtAdd">폴더 고르기</button></div>
        <p class="dl">[폴더 고르기]를 누르면 폴더 창이 열립니다. 위에 적힌 MYBOX 경로의 폴더를 골라 주세요.</p>` : ''}</section>`;
    // 허락: 버튼을 누른 그 순간 바로 물어야 브라우저가 허락 창을 띄움 (앞에 기다리는 일이 있으면 안 됨)
    const why = e => (e && e.name === 'SecurityError' ? '브라우저가 허락 창을 띄우지 않았습니다(버튼을 다시 눌러 주세요)' : e && e.name === 'NotFoundError' ? '폴더를 찾지 못했습니다 — [다시 고르기]로 폴더를 다시 골라 주세요' : (e && (e.name + ' ' + e.message)) || '알 수 없음');
    $$('[data-rask]').forEach(b => b.onclick = () => {
      const r = rs[+b.dataset.rask]; b.disabled = true;
      let p; try { p = r.handle.requestPermission({ mode: 'read' }); } catch (e) { toast(`${r.label}: ${why(e)}`); b.disabled = false; return; }
      Promise.race([p, new Promise((_, no) => setTimeout(() => no({ name: 'Timeout', message: '' }), 20000))])
        .then(x => { toast(x === 'granted' ? `${r.label} 폴더를 열었습니다` : `${r.label}: 허락하지 않았습니다 (${x})`); roots(); })
        .catch(e => { toast(`${r.label}: ${e.name === 'Timeout' ? '허락 창이 뜨지 않습니다 — [다시 고르기]로 폴더를 다시 골라 주세요' : why(e)}`); roots(); });
    });
    $$('[data-rpick]').forEach(b => b.onclick = async () => {
      const r = rs[+b.dataset.rpick];
      try { const x = await W.repick(r); toast(x.same ? `${r.label} 폴더를 다시 연결했습니다` : `${r.label}: '${x.name}' 폴더로 연결했습니다 (원래는 '${x.want}' — 다르면 다시 골라 주세요)`); }
      catch (e) { if (e.name !== 'AbortError') toast(`${r.label}: ${why(e)}`); }
      roots();
    });
    const re = $('#rtRe'); if (re) re.onclick = async () => {
      re.disabled = true; re.textContent = '허락 창을 확인해 주세요…';
      const todo = rs.filter(r => r.perm !== 'granted'); let ok = 0; const bad = [];
      for (const r of todo) {
        try { const x = await Promise.race([r.handle.requestPermission({ mode: 'read' }), new Promise((_, no) => setTimeout(() => no({ name: 'Timeout', message: '' }), 20000))]); if (x === 'granted') ok++; else bad.push(`${r.label}(${x})`); }
        catch (e) { bad.push(`${r.label}(${e.name === 'Timeout' ? '창 안 뜸' : e.name})`); }
      }
      toast(`${ok}개 열림${bad.length ? ` · 안 된 폴더: ${bad.join(', ')} — 그 줄의 [허락] 또는 [다시 고르기]를 눌러 주세요` : ''}`);
      roots();
    };
    const ad = $('#rtAdd'); if (ad) ad.onclick = async () => { const d = need[+$('#rtPick').value]; try { await W.addFolder(d); toast(d.label + ' 폴더를 연결했습니다'); } catch (e) { if (e.name !== 'AbortError') toast(e.message); } roots(); };
  }
  const reset = () => { S.list = null; S.loading = null; };
  const find = id => (S.list || []).find(x => x.id === id);
  return { render, load, reset, find };
};
