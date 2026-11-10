// 수학도서관 — 교재 오답 입력 · 1차 오답노트 (오답노트 앱 화면을 옮겨 옴)
// odap/wrong.js는 오답노트 앱 코드를 거의 그대로 쓰고, 여기서 저장 위치만 sudo-naesin으로 바꿔 준다.
//   catalogBooks → sources('ob_'+id)   bankItems → items('o_'+id)   analysisQueue → aiqueue('oq_'+id)
//   students → students (오답 기록은 학생 문서의 odap 칸: books · records · sheets · noted)
//   examScopes → scopes   aiUsage → meta/wnUsage
// 권한: 선생님은 자기 학생만(Firestore 규칙). AI(재타이핑·풀이)는 원장님만, 버튼을 누를 때만.
import { createWrong } from './odap/wrong.js';
import * as F from './odap/folders.js';

const ODAP = { apiKey: 'AIzaSyBjsP047j1IHSmObLP8-sRrqWnZb81R2Bg', authDomain: 'sudo-odap.firebaseapp.com', projectId: 'sudo-odap', appId: '1:723497466991:web:15675e85baf3812f4f219a' };
const ODAP_API = 'https://odap-note-api.ilmvm66.workers.dev';
const V = 'https://www.gstatic.com/firebasejs/10.14.1/';
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- Firestore 어댑터 (오답노트 모듈식 SDK 호출 → 내신분석 compat SDK) ----------
const MAP = {
  catalogBooks: { col: 'sources', pre: 'ob_' },
  bankItems: { col: 'items', pre: 'o_' },
  analysisQueue: { col: 'aiqueue', pre: 'oq_' },
  students: { col: 'students', pre: '' },
  examScopes: { col: 'scopes', pre: '' },
  aiUsage: { meta: 'wnUsage' }
};
const STU = { catalogIds: 'books', records: 'records', sheets: 'sheets', noted: 'noted' };

export function makeFs(db, opt) {
  const FV = firebase.firestore.FieldValue;
  const strip = (pre, id) => (pre && id.startsWith(pre) ? id.slice(pre.length) : id);
  const real = (r) => {
    const m = MAP[r.n]; if (!m) throw new Error('알 수 없는 칸: ' + r.n);
    if (m.meta) return db.collection('meta').doc(m.meta);
    return r.id ? db.collection(m.col).doc(m.pre + r.id) : db.collection(m.col);
  };
  // 학생: 오답노트 칸 이름 ↔ students.odap
  const fromStudent = (d) => { const o = (d && d.odap) || {}; return Object.assign({}, d, { catalogIds: (o.books || []).map((x) => strip('ob_', x)), records: o.records || [], sheets: o.sheets || [], noted: o.noted || {} }); };
  const toStudent = (data) => {
    const out = { editedAt: new Date().toISOString() };
    Object.entries(data).forEach(([k, v]) => {
      const f = STU[k]; if (!f) return;
      out['odap.' + f] = k === 'catalogIds' && Array.isArray(v) ? v.map((x) => 'ob_' + x) : v;
    });
    return out;
  };
  // 문항 은행에 새로 넣는 오답노트 교재 문항: 통합 자료 표시를 같이 남김
  const toItem = (data) => (data && data.bookId ? Object.assign({ source: 'ob_' + data.bookId, from: '교재' }, data) : data);
  const conv = (r, data) => (r.n === 'bankItems' ? toItem(data) : r.n === 'aiUsage' ? { [r.id]: data } : data);
  // 원장·관리자가 아니면 자료·문항·대기열 쓰기는 '되면 좋고' (규칙에 막혀도 오답노트는 계속 만든다)
  const soft = (r, p) => (r.n !== 'students' && !opt.admin() ? p.catch((e) => { console.warn('[wn] 저장 건너뜀', r.n, e.message); }) : p);
  const snap = (r, s) => {
    const raw = s.exists ? s.data() : undefined;
    const d = raw && r.n === 'students' ? fromStudent(raw) : raw && r.n === 'aiUsage' ? raw[r.id] : raw;
    return { id: r.id, exists: () => !!d, data: () => d };
  };
  let auto = 0;
  return {
    collection: (_db, ...p) => ({ n: p[p.length - 1] }),
    doc: (a, ...p) => (a && a.n && !p.length ? { n: a.n, id: Date.now().toString(36) + (auto++).toString(36) + Math.random().toString(36).slice(2, 6) } : { n: p[p.length - 2], id: p[p.length - 1] }),
    async getDoc(r) { return snap(r, await real(r).get()); },
    async getDocs(c) {
      const m = MAP[c.n];
      let q = real(c);
      if (c.n === 'catalogBooks') q = q.where('origin.app', '==', 'odap');
      let s;
      try { s = await q.get(); } catch (e) { if (c.n === 'examScopes') return { docs: [] }; throw e; }
      return { docs: s.docs.map((d) => { const id = strip(m.pre, d.id); const x = d.data(); return { id, exists: () => true, data: () => (c.n === 'students' ? fromStudent(x) : x) }; }) };
    },
    setDoc: (r, data, o) => soft(r, real(r).set(r.n === 'students' ? toStudent(data) : conv(r, data), o || {})),
    updateDoc: (r, data) => soft(r, r.n === 'students' ? real(r).update(toStudent(data)) : real(r).update(conv(r, data))),
    deleteDoc: (r) => soft(r, real(r).delete()),
    writeBatch: () => {
      const b = db.batch(); let first = null;
      return { set(r, data, o) { first ||= r; b.set(real(r), conv(r, data), o || {}); return this; }, commit: () => (first ? soft(first, b.commit()) : Promise.resolve()) };
    },
    increment: (n) => FV.increment(n),
    arrayUnion: (...v) => FV.arrayUnion(...v)
  };
}

// ---------- 오답노트 AI (원장님만: 오답노트 Firebase 계정으로 Worker 호출) ----------
let odapP = null;
function odap() {
  odapP ||= Promise.all([import(V + 'firebase-app.js'), import(V + 'firebase-auth.js')]).then(([A, AU]) => {
    const app = A.getApps().find((a) => a.name === 'odap') || A.initializeApp(ODAP, 'odap');
    const auth = AU.getAuth(app);
    return new Promise((res) => { const u = AU.onAuthStateChanged(auth, () => { u(); res({ AU, auth }); }); setTimeout(() => res({ AU, auth }), 3000); });
  });
  return odapP;
}

window.SudoWN = function (H) {
  const { ctx, toast } = H;
  const me = (ctx && ctx.me) || { role: 'owner' };
  const owner = me.role === 'owner';
  const admin = () => ['owner', 'co', 'admin'].includes(me.role);
  const db = firebase.firestore();
  const fs = makeFs(db, { admin });

  // 창 (오답노트 화면 모양 그대로)
  let modal = document.getElementById('wnModal');
  if (!modal) {
    document.body.insertAdjacentHTML('beforeend', '<dialog id="wnModal"><div id="wnBody"></div></dialog>');
    modal = document.getElementById('wnModal');
    modal.addEventListener('click', (e) => { if (e.target.closest('[data-a="close"]')) modal.close(); });
    modal.addEventListener('close', () => { if (W.onClose) W.onClose(); });
  }
  const openModal = (html) => { document.getElementById('wnBody').innerHTML = html; if (!modal.open) modal.showModal(); };
  const closeModal = () => { if (modal.open) modal.close(); };

  const W = { onClose: null, aiUser: null };
  async function ai(path, body) {
    if (!owner) throw new Error('AI는 원장님만 쓸 수 있습니다');
    const o = await odap();
    const u = o.auth.currentUser;
    if (!u) throw new Error('먼저 학생 화면의 [AI 연결]을 눌러 주세요');
    const res = await fetch(ODAP_API + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + await u.getIdToken() }, body: JSON.stringify(body) });
    const j = (res.headers.get('content-type') || '').includes('json') ? await res.json() : null;
    if (!res.ok) throw new Error((j && j.error) || `요청 실패 (${res.status})`);
    return j;
  }
  const noAI = () => !owner || !W.aiUser;

  const wctx = { db, fs, aid: () => 'mathlib', ai, toast, openModal, closeModal, uid: () => ctx.user, noAI };
  const WR = createWrong(wctx);

  // 학생 문서(내신분석 모양) → 오답노트 모양
  const asStudent = (s) => { const o = s.odap || {}; return Object.assign({}, s, { catalogIds: (o.books || []).map((x) => (x.startsWith('ob_') ? x.slice(3) : x)), records: o.records || [], sheets: o.sheets || [], noted: o.noted || {} }); };
  async function fresh(id) { const s = await fs.getDoc(fs.doc(db, 'a', 'x', 'students', id)); return s.exists() ? Object.assign({ id }, s.data()) : null; }

  // AI 연결 상태 (원장님만)
  async function aiState() { if (!owner) return null; try { const o = await odap(); W.aiUser = o.auth.currentUser; } catch { W.aiUser = null; } return W.aiUser; }
  async function aiLogin() {
    const o = await odap();
    const p = new o.AU.GoogleAuthProvider(); p.setCustomParameters({ login_hint: ctx.user });
    const r = await o.AU.signInWithPopup(o.auth, p);
    W.aiUser = r.user; return r.user;
  }

  // ---------- 학생 화면 안의 '교재 오답' 칸 ----------
  async function panel(box, st, refresh) {
    const s = asStudent(st);
    const pr = WR.progress(s);
    const sheets = [...(s.sheets || [])].sort((a, b) => (b.at || 0) - (a.at || 0));
    await aiState();
    box.innerHTML = `<div class="wnhead"><h2>교재 오답 <small>교재 고르기 → 틀린 번호 누르기 → 오답노트</small></h2>
      <div class="wnact">${owner ? (W.aiUser ? '<span class="pill ok" title="오답노트 AI(재타이핑·풀이)를 쓸 수 있습니다">AI 연결됨</span>' : '<button type="button" class="btn ghost" id="wnAI" title="스캔본 재타이핑·AI 풀이에 필요합니다 (원장님만)">AI 연결</button>') : ''}
        <button type="button" class="btn ghost" id="wnNote" ${pr.length ? '' : 'disabled'}>오답노트 만들기</button><button type="button" class="btn" id="wnIn">오답 입력</button></div></div>
      ${pr.length ? `<div class="wnprog">${pr.map((b) => `<div class="wnp"><b>${esc(b.title)}</b><span class="wnbar"><i style="width:${b.total ? Math.round((b.done / b.total) * 100) : 0}%"></i></span><small>오답 ${b.total} · 오답노트 ${b.done}${b.fixed ? ` · 해결 ${b.fixed}` : ''}${b.left.length ? ` · 남은 단원 ${esc(b.left.slice(0, 3).join(', '))}${b.left.length > 3 ? ' 외' : ''}` : ''}</small></div>`).join('')}</div>`
        : `<div class="empty">${(s.catalogIds || []).length ? `교재 ${(s.catalogIds || []).length}종이 있습니다. ` : ''}아직 입력한 오답이 없습니다. [오답 입력]에서 교재를 고르고 틀린 번호를 누르세요.</div>`}
      ${sheets.length ? `<h3 class="wnh3">만든 오답노트 ${sheets.length}개</h3><div class="wnsheets">${sheets.slice(0, 12).map((x) => `<div class="wns"><span>${esc(new Date(x.at).toLocaleDateString('ko-KR'))} · ${esc(x.kind || '1차')} · ${x.count || 0}문항${x.scope ? ' · ' + esc(x.scope) : ''}<br><small class="dl">${esc((x.books || []).join(' · '))}</small></span>
        <span class="wnsb"><button type="button" class="linkbtn" data-wp="${esc(x.id)}" data-aud="student">학생용</button><button type="button" class="linkbtn" data-wp="${esc(x.id)}" data-aud="teacher">선생님용</button><button type="button" class="linkbtn" data-we="${esc(x.id)}">고치기</button><button type="button" class="linkbtn" data-wd="${esc(x.id)}">지우기</button></span></div>`).join('')}</div>` : ''}
      <p class="dl wnfoot">같은 구역을 다시 풀고 '다 맞음·풀었음'으로 입력할 때 그 번호가 오답에 없으면 맞힌 것으로 셉니다. 2번 연달아 맞히면 '해결'.${owner ? '' : ' 스캔본 교재의 AI 타이핑·AI 풀이는 원장님만 쓸 수 있어, 필요한 문항은 원장님 AI 대기 목록에 올라갑니다.'}</p>`;
    const re = async () => { const f = await fresh(st.id); if (f) { Object.assign(st, { odap: f.odap }); refresh(); } };
    W.onClose = () => { re().catch(() => {}); };
    const run = (fn) => async (ev) => { const b = ev.currentTarget; b.disabled = true; try { const f = await fresh(st.id); await fn(f || s); } catch (e) { toast(e.message); } b.disabled = false; };
    box.querySelector('#wnIn').onclick = run((f) => WR.entry(f));
    box.querySelector('#wnNote').onclick = run((f) => WR.noteSetup(f));
    const a = box.querySelector('#wnAI'); if (a) a.onclick = async () => { try { await aiLogin(); toast('AI를 연결했습니다'); panel(box, st, refresh); } catch (e) { if (!/popup-closed|cancelled/.test(e.code || '')) toast('AI 연결 실패: ' + e.message); } };
    box.querySelectorAll('[data-wp]').forEach((b) => b.onclick = () => { WR.printSheet(s, b.dataset.wp, b.dataset.aud); });
    box.querySelectorAll('[data-we]').forEach((b) => b.onclick = run((f) => WR.editSheet(f, b.dataset.we)));
    box.querySelectorAll('[data-wd]').forEach((b) => b.onclick = run(async (f) => { if (await WR.deleteSheet(f, b.dataset.wd)) await re(); }));
  }

  // ---------- 자료함 ----------
  async function catalog() { return WR.catalog(); }
  async function folders() { try { const rs = await F.listRoots(); return Promise.all(rs.map(async (r) => Object.assign(r, { perm: await F.permission(r) }))); } catch { return []; } }
  async function reconnect() { const rs = await F.listRoots(); return F.reconnectAll(rs); }
  async function addFolder(def) { if (!F.supported()) throw new Error('이 브라우저는 폴더 연결을 지원하지 않습니다 (PC 크롬·엣지에서 해 주세요)'); return F.addRoot(def); }
  async function openFile(src, f) {
    const rs = await F.listRoots();
    const r = rs.find((x) => x.label === f.label);
    if (!r) throw new Error(`"${f.label}" 폴더가 이 PC에 연결되어 있지 않습니다`);
    if ((await F.permission(r)) !== 'granted') { const [[, p]] = await F.reconnectAll([r]); if (p !== 'granted') throw new Error('폴더 허락이 필요합니다'); }
    const file = await F.openFile(r, f.rel);
    const url = URL.createObjectURL(file); window.open(url, '_blank'); setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  return { panel, catalog, folders, reconnect, addFolder, openFile, DEFAULT_ROOTS: F.DEFAULT_ROOTS, asStudent, progress: (s) => WR.progress(asStudent(s)) };
};
dispatchEvent(new Event('wn-ready'));
