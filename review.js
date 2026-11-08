/* No-sign-in cut review. Notes go to a Google Apps Script web app that writes a Google Sheet.
   Each video folder sets window.REVIEW = {video, title} and has a versions.json next to it. */
(function(){
  const SCRIPT = window.REVIEW_SCRIPT;          // set in /config.js
  const VIDEO = window.REVIEW.video;
  const FPS = 30, TAGS = ["Cut","Graphic","Caption","Audio","Take","Other"];
  const $ = id => document.getElementById(id);
  const vid = $('vid'), bar = $('bar');
  let versions = [], verId = null, notes = [], filter = 'open', person = 'all';
  let rangeMode = false, rangeStart = null, pending = null, tag = null;
  const store = { get(k){ try{ return localStorage.getItem(k); }catch(_){ return null; } }, set(k,v){ try{ localStorage.setItem(k,v); }catch(_){} } };
  let myName = store.get('review.name') || '';
  let myToken = store.get('review.token');
  if(!myToken){ myToken = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2)); store.set('review.token', myToken); }
  const mine = new Set(JSON.parse(store.get('review.mine') || '[]'));

  function fmt(t){ if(!isFinite(t)) t = 0; const m = Math.floor(t/60), s = t - m*60; return m + ':' + s.toFixed(2).padStart(5,'0'); }
  function fmtShort(t){ if(!isFinite(t)) t = 0; const m = Math.floor(t/60), s = Math.floor(t - m*60); return m + ':' + String(s).padStart(2,'0'); }
  function say(m){ $('status').textContent = m || ''; }
  function hue(s){ let h = 0; for(const c of s) h = (h*31 + c.charCodeAt(0)) % 360; return 'hsl(' + h + ' 45% 38%)'; }

  TAGS.forEach(n => { const b = document.createElement('button'); b.type='button'; b.className='chip'; b.textContent=n;
    b.onclick = () => { tag = (tag===n? null : n); [...$('tags').children].forEach(c => c.classList.toggle('on', c.textContent===tag)); };
    $('tags').appendChild(b); });

  function step(d){ vid.pause(); vid.currentTime = Math.max(0, Math.min((vid.duration||0), vid.currentTime + d)); }
  $('back2').onclick = () => step(-2); $('fwd2').onclick = () => step(2);
  $('prevf').onclick = () => step(-1/FPS); $('nextf').onclick = () => step(1/FPS);
  function seekX(x){ const r = bar.getBoundingClientRect(); if(vid.duration) vid.currentTime = Math.max(0,Math.min(1,(x - r.left)/r.width))*vid.duration; }
  let drag = false;
  bar.addEventListener('pointerdown', e => { if(e.target.classList.contains('mk')) return; drag = true; vid.pause(); bar.setPointerCapture(e.pointerId); seekX(e.clientX); });
  bar.addEventListener('pointermove', e => { if(drag) seekX(e.clientX); });
  bar.addEventListener('pointerup', () => { drag = false; });

  function drawTime(){
    const t = vid.currentTime, d = vid.duration || 0;
    $('time').innerHTML = ''; $('time').append(fmt(t) + ' '); const sp = document.createElement('span'); sp.textContent = '/ ' + fmtShort(d); $('time').append(sp);
    $('addM').textContent = (rangeMode && rangeStart!=null) ? ('Add note ' + fmt(Math.min(rangeStart,t)) + '–' + fmt(Math.max(rangeStart,t))) : ('Add note at ' + fmt(t));
    const p = d ? t/d*100 : 0; $('fill').style.width = p + '%'; $('head').style.left = p + '%';
    if(rangeMode && rangeStart!=null && d){ const a = Math.min(rangeStart,t), b = Math.max(rangeStart,t), r = $('rng'); r.hidden = false; r.style.left = (a/d*100)+'%'; r.style.width = ((b-a)/d*100)+'%'; }
    document.querySelectorAll('.note').forEach(n => { const a = +n.dataset.t, b = +(n.dataset.e||a); n.classList.toggle('current', t >= a-0.25 && t <= b+0.6); });
  }
  vid.addEventListener('timeupdate', drawTime); vid.addEventListener('seeked', drawTime); vid.addEventListener('loadedmetadata', () => { drawTime(); render(); });
  (function loop(){ if(!vid.paused) drawTime(); requestAnimationFrame(loop); })();

  function toggleRange(){
    rangeMode = !rangeMode;
    [$('range'), $('rangeM')].forEach(b => { b.classList.toggle('on', rangeMode); b.setAttribute('aria-pressed', rangeMode); });
    if(rangeMode){ rangeStart = vid.currentTime; $('range').textContent = 'Stretch from ' + fmt(rangeStart) + ' (tap to cancel)'; $('rangeM').textContent = 'Cancel'; say('Play or scrub to the end of the stretch, then tap Add note.'); }
    else { rangeStart = null; $('rng').hidden = true; $('range').textContent = 'Mark a stretch'; $('rangeM').textContent = 'Stretch'; say(''); }
    drawTime();
  }
  $('range').onclick = toggleRange; $('rangeM').onclick = toggleRange;

  function sheet(open){ ['composer','namebox'].forEach(id => $(id).hidden = id !== open); $('dock').style.visibility = open ? 'hidden' : ''; }
  function openComposer(){
    vid.pause();
    if(!myName){ sheet('namebox'); $('nm').focus(); return; }
    const t = vid.currentTime;
    pending = (rangeMode && rangeStart!=null && Math.abs(t-rangeStart) > 0.1) ? {t: Math.min(rangeStart,t), e: Math.max(rangeStart,t)} : {t, e: null};
    $('at').textContent = (pending.e!=null ? ('From ' + fmt(pending.t) + ' to ' + fmt(pending.e)) : ('At ' + fmt(pending.t))) + ' · as ' + myName;
    sheet('composer'); $('txt').focus();
  }
  function closeAll(){ sheet(null); $('txt').value=''; tag = null; [...$('tags').children].forEach(c => c.classList.remove('on')); pending = null; if(rangeMode) toggleRange(); }
  $('add').onclick = openComposer; $('addM').onclick = openComposer; $('cancel').onclick = closeAll; $('ncancel').onclick = closeAll;
  $('namebox').addEventListener('submit', e => { e.preventDefault(); const n = $('nm').value.trim(); if(!n) return; myName = n.slice(0,60); store.set('review.name', myName); openComposer(); });
  $('txt').addEventListener('keydown', e => { if(e.key==='Enter' && (e.metaKey||e.ctrlKey)){ e.preventDefault(); $('composer').requestSubmit(); } });
  document.addEventListener('keydown', e => {
    if(e.target.matches('textarea,input,select')) return;
    if(e.key==='n'||e.key==='N'){ e.preventDefault(); openComposer(); }
    if(e.key===',') step(-1/FPS); if(e.key==='.') step(1/FPS);
  });

  async function post(body){
    // text/plain keeps this a "simple" request, so Apps Script accepts it without a CORS preflight
    await fetch(SCRIPT, { method:'POST', mode:'no-cors', headers:{'Content-Type':'text/plain'}, body: JSON.stringify(body) });
  }
  $('composer').addEventListener('submit', async e => {
    e.preventDefault();
    const text = $('txt').value.trim(); if(!text){ say('Write what should change first.'); return; }
    if(!SCRIPT){ say('Notes aren\'t switched on yet. Tell Harrison.'); return; }
    const n = { action:'add', video: VIDEO, version: verId, t: +pending.t.toFixed(3), e: pending.e==null ? null : +pending.e.toFixed(3), text, tag: tag||'', name: myName, token: myToken };
    $('save').disabled = true;
    try{
      await post(n);
      notes.push(Object.assign({id:'local-'+Date.now(), status:'open', created:new Date().toISOString(), _local:true}, n));
      say('Saved at ' + fmt(n.t) + '. Thanks!'); closeAll(); render(); setTimeout(load, 1500);
    }catch(_){ say('Couldn\'t save that note. Check your connection and try again.'); }
    finally{ $('save').disabled = false; }
  });

  document.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { filter = b.dataset.f; document.querySelectorAll('[data-f]').forEach(c => c.classList.toggle('on', c===b)); render(); });

  function here(){ return notes.filter(n => n.version === verId); }
  function render(){
    const h = here(), names = [...new Set(h.map(n => n.name || 'Someone'))];
    const pe = $('people'); pe.innerHTML = ''; pe.hidden = names.length < 2;
    if(person!=='all' && !names.includes(person)) person = 'all';
    const mk = (id, label) => { const b = document.createElement('button'); b.className = 'chip' + (person===id?' on':''); b.textContent = label; b.onclick = () => { person = id; render(); }; pe.appendChild(b); };
    mk('all', 'Everyone (' + h.length + ')'); names.forEach(nm => mk(nm, nm + ' (' + h.filter(n => (n.name||'Someone')===nm).length + ')'));
    const open = h.filter(n => n.status!=='done').length;
    $('count').textContent = h.length ? (open + ' open · ' + (h.length-open) + ' done') : 'Notes';
    const v = h.filter(n => (person==='all' || (n.name||'Someone')===person) && (filter==='all' || (filter==='open' ? n.status!=='done' : n.status==='done'))).sort((a,b) => a.t - b.t);
    const list = $('list'); list.innerHTML = '';
    if(!v.length){ const e = document.createElement('div'); e.className='empty';
      e.textContent = h.length ? 'Nothing in this view. Switch to All or Everyone to see every note.' : 'No notes yet. Pause on the moment you want changed, tap Add note, and write what should change.';
      list.appendChild(e); }
    v.forEach(n => {
      const el = document.createElement('article'); el.className = 'note' + (n.status==='done'?' done':''); el.dataset.t = n.t; if(n.e!=='' && n.e!=null) el.dataset.e = n.e;
      const s = document.createElement('button'); s.className = 'seek'; s.textContent = el.dataset.e ? (fmt(+n.t) + '–' + fmt(+n.e)) : fmt(+n.t); s.onclick = () => { vid.currentTime = +n.t; vid.play().catch(()=>{}); };
      const body = document.createElement('div');
      const by = document.createElement('div'); by.className = 'by'; const dot = document.createElement('span'); dot.className = 'dot'; const nm = n.name || 'Someone'; dot.style.background = hue(nm); dot.textContent = nm[0].toUpperCase(); by.append(dot, nm);
      const tx = document.createElement('div'); tx.className = 'txt'; tx.textContent = n.text;
      body.append(by, tx);
      const meta = document.createElement('div'); meta.className = 'meta';
      const p = document.createElement('span'); p.className = 'pill ' + (n.status==='done'?'done':'open'); p.textContent = n.status==='done' ? 'Done' : 'Open'; meta.appendChild(p);
      if(n.tag){ const tg = document.createElement('span'); tg.textContent = n.tag; meta.appendChild(tg); }
      if(!n._local && (n.name === myName)){
        const del = document.createElement('button'); del.className = 'link'; del.textContent = 'Delete';
        del.onclick = async () => { if(del.dataset.armed){ await post({action:'delete', id:n.id, token:myToken}).catch(()=>{}); notes = notes.filter(x => x !== n); render(); setTimeout(load, 1500); }
          else { del.dataset.armed = '1'; del.textContent = 'Tap again to delete'; setTimeout(() => { delete del.dataset.armed; del.textContent = 'Delete'; }, 3000); } };
        meta.appendChild(del);
      }
      el.append(s, body, meta);
      if(n.reply){ const r = document.createElement('div'); r.className = 'reply'; r.textContent = 'Harrison: ' + n.reply; el.appendChild(r); }
      list.appendChild(el);
    });
    bar.querySelectorAll('.mk').forEach(m => m.remove());
    const d = vid.duration;
    if(d) h.forEach(n => { const m = document.createElement('button'); m.className = 'mk' + (n.status==='done'?' done':''); m.style.left = (n.t/d*100)+'%'; m.setAttribute('aria-label','Note at '+fmt(+n.t)); m.onclick = ev => { ev.stopPropagation(); vid.currentTime = +n.t; vid.pause(); }; bar.appendChild(m); });
    drawTime();
  }

  function pick(id){
    verId = id; const v = versions.find(x => x.id===id); if(!v) return;
    $('vidname').textContent = v.label || id;
    if(vid.dataset.src !== v.file){ vid.dataset.src = v.file; vid.src = v.file; }
    store.set('review.ver.' + VIDEO, id); render();
  }
  $('ver').onchange = e => pick(e.target.value);

  let loading = false;
  async function load(){
    if(!SCRIPT || loading) return; loading = true;
    try{
      const r = await fetch(SCRIPT + '?video=' + encodeURIComponent(VIDEO));
      const j = await r.json(); notes = j.notes || []; say(''); render();
    }catch(_){ say('Couldn\'t load notes right now. They\'ll appear when the connection is back.'); }
    finally{ loading = false; }
  }

  (async function boot(){
    document.title = window.REVIEW.title + ' · Review';
    $('title').firstChild.textContent = window.REVIEW.title;
    try{ versions = await (await fetch('versions.json', {cache:'no-store'})).json(); }catch(_){ versions = []; }
    const sel = $('ver');
    versions.forEach(v => { const o = document.createElement('option'); o.value = v.id; o.textContent = v.label || v.id; sel.appendChild(o); });
    if(!versions.length){ $('vidname').textContent = 'No cut uploaded yet'; return; }
    const want = store.get('review.ver.' + VIDEO);
    const id = versions.some(v => v.id===want) ? want : versions[0].id; sel.value = id; pick(id);
    if(!SCRIPT) say('Notes aren\'t switched on yet.');
    load(); setInterval(() => { if(document.visibilityState==='visible' && $('composer').hidden) load(); }, 15000);
  })();
})();
