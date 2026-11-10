// 수학도서관 — 홈: 다가오는 시험(D-day) · 새 소식 · 할 일 (권한마다 다르게) · 바로가기
window.SudoHome = function (H) {
  const { D, ctx, byId, esc, $, $$ } = H;
  const me = (ctx && ctx.me) || { role: 'owner', name: '원장' };
  const ROLEN = { owner: '원장님', co: '원장님', admin: '선생님', teacher: '선생님' };
  const staffAll = me.role !== 'teacher';
  const day = 864e5;
  const ago = t => { const d = Math.floor((Date.now() - t) / day); return d <= 0 ? '오늘' : d === 1 ? '어제' : d + '일 전'; };

  function todo() {
    const out = [];
    const studs = Object.values(D.students || {});
    // 교재 오답: 1주일 넘게 입력이 없는 학생 (교재가 있는 학생만)
    const quiet = studs.map(s => { const o = s.odap || {}; const last = Math.max(0, ...(o.records || []).map(r => r.at || 0)); return { s, last, books: (o.books || []).length }; })
      .filter(x => x.books && Date.now() - x.last > 7 * day).sort((a, b) => a.last - b.last);
    if (quiet.length) out.push({ t: `교재 오답 입력이 1주일 넘게 없는 학생 ${quiet.length}명`, d: quiet.slice(0, 6).map(x => `${x.s.name}${x.last ? ` (${ago(x.last)})` : ' (아직 없음)'}`).join(' · '), go: '#students' });
    // 오답노트를 아직 안 만든 오답
    let left = 0, who = 0;
    studs.forEach(s => { const o = s.odap || {}; const noted = o.noted || {}; const ks = new Set(); (o.records || []).forEach(r => (r.wrongs || []).forEach(w => ks.add(r.bookId + '|' + w.sec + '|' + w.no))); const n = Math.max(0, ks.size - Object.keys(noted).length); if (n) { left += n; who++; } });
    if (left) out.push({ t: `오답노트에 아직 안 넣은 오답 ${left}개`, d: `학생 ${who}명 · 학생 → 교재 오답 → [오답노트 만들기]`, go: '#students' });
    if (staffAll) {
      const rev = (D.exams || []).filter(e => e.an && e.an.status === 'ai');
      if (rev.length) out.push({ t: `검수 전 시험 ${rev.length}개`, d: rev.slice(0, 4).map(e => `${e.s} ${e.g}-${e.t} ${e.x}`).join(' · '), go: '#archive' });
      const noRes = studs.filter(s => !Object.values(D.results || {}).some(r => r.student === s.id));
      if (noRes.length && studs.length) out.push({ t: `시험 결과를 아직 안 넣은 학생 ${noRes.length}명`, d: '학생 → 시험 결과에서 틀린 번호를 넣으면 학생 분석지가 만들어집니다', go: '#students' });
    }
    if (!studs.length) out.push({ t: me.role === 'teacher' ? '담당 학생을 등록해 주세요' : '학생을 등록해 주세요', d: '학생 → 학생 등록', go: '#students' });
    return out;
  }

  async function render() {
    const main = $('#main');
    const now = new Date();
    const studs = Object.values(D.students || {});
    const T = todo();
    main.innerHTML = `
      <div class="head"><div><div class="kicker">${now.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' })}</div><h1>${esc(me.name || '')} ${ROLEN[me.role] || ''}, 안녕하세요</h1></div></div>
      <div class="homegrid">
        <section class="card hcard"><h2>다가오는 시험 <small>나이스 학사일정</small></h2><div id="hmD"><p class="dl">불러오는 중…</p></div></section>
        <section class="card hcard"><h2>할 일 <small>${me.role === 'teacher' ? '담당 학생 기준' : '학원 전체'}</small></h2>
          ${T.length ? `<ul class="todo2">${T.map(x => `<li><a href="${x.go}"><b>${esc(x.t)}</b><small>${esc(x.d)}</small></a></li>`).join('')}</ul>` : '<div class="empty">지금 할 일이 없습니다.</div>'}</section>
        <section class="card hcard"><h2>바로가기</h2><div class="quick">
          <a class="qbtn" href="#students"><b>교재 오답 입력</b><small>학생 고르기 → 교재 → 틀린 번호</small></a>
          <a class="qbtn" href="#students"><b>오답노트 만들기</b><small>학생별 1차 오답노트 · 인쇄</small></a>
          <a class="qbtn" href="#output"><b>분석지 만들기</b><small>학교 · 학생 분석지</small></a>
          <a class="qbtn" href="#sources"><b>자료함</b><small>교재 · 기출 · 프린트 찾기</small></a>
          ${staffAll ? '<a class="qbtn" href="#register"><b>시험 등록</b><small>새 기출 분석</small></a>' : ''}</div></section>
        <section class="card hcard"><h2>새 소식 <small>바뀐 시험 일정</small></h2><div id="hmN"><p class="dl">불러오는 중…</p></div></section>
        <section class="card hcard"><h2>${me.role === 'teacher' ? '내 학생' : '학생'} <small>${studs.length}명</small></h2>
          ${studs.length ? `<ul class="hstud">${studs.map(s => { const o = s.odap || {}; const last = Math.max(0, ...(o.records || []).map(r => r.at || 0)); return { s, last }; }).sort((a, b) => b.last - a.last).slice(0, 8)
            .map(x => `<li><a href="#students" data-hs="${esc(x.s.id)}"><b>${esc(x.s.name)}</b><span class="dl">${esc(x.s.school)} ${x.s.grade}학년</span><small>${x.last ? '교재 오답 ' + ago(x.last) : '교재 오답 없음'}</small></a></li>`).join('')}</ul>`
            : '<div class="empty">아직 학생이 없습니다.</div>'}</section>
      </div>`;
    $$('[data-hs]').forEach(a => a.onclick = () => { try { const k = 'sudo.students'; const v = JSON.parse(localStorage.getItem(k) || '{}'); v.sel = a.dataset.hs; v.tab = 'book'; localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} if (H.selectStudent) H.selectStudent(a.dataset.hs); });
    // 학교 소식 (나이스)
    let U = null;
    try { U = H.sch ? await H.sch.upcoming() : null; } catch (_) { U = null; }
    if ((location.hash || '#home') !== '#home' && location.hash !== '') return;
    const dEl = $('#hmD'), nEl = $('#hmN'); if (!dEl) return;
    const up = U ? U.up : [];
    dEl.innerHTML = up.length ? `<div class="ddays">${up.slice(0, 8).map(p => { const live = p.dday <= 0; return `<div class="dd ${live ? 'live' : p.dday <= 14 ? 'soon' : ''}"><b class="ddn">${live ? '시험 중' : 'D-' + p.dday}</b><span class="ddsc">${esc(p.sc.name)} ${esc(p.gtxt)}</span><span>${esc(p.label)}</span><small>${esc(p.range)}</small></div>`; }).join('')}</div>${staffAll ? '<a class="lnk" href="#news">학교 소식 전체 보기</a>' : ''}`
      : `<div class="empty">${U ? '앞으로 120일 안에 나이스에 올라온 시험 일정이 없습니다.' : '학교 소식을 불러오지 못했습니다.'}</div>`;
    const ns = U ? U.news : [];
    nEl.innerHTML = ns.length ? `<ul class="newslist">${ns.slice(0, 6).map(n => `<li><b>${esc(n.name)}</b> ${esc(n.text)} <small class="dl">${esc(new Date(n.at).toLocaleDateString('ko-KR'))}</small></li>`).join('')}</ul>` : '<div class="empty">새 소식이 없습니다.</div>';
  }
  return { render };
};
