// ============================================================
//  Layout "TV" (ladrilhos): tela inicial, TV ao vivo e dados do canal no player
//  - Inicio  : logo no topo, TV ao Vivo grande, 4 atalhos e coluna de acoes
//  - Ao vivo : grupos | canais | pre-visualizacao + programacao
//  - Player  : logo, numero, grupo, nome do canal e programa atual/seguinte
//  Mesmo arquivo nos dois apps Android. Usa window.AppCore (definido no app.js).
// ============================================================
window.TVUI = (function () {
  var C = null;            // window.AppCore
  var active = false;      // a tela de TV ao vivo esta aberta
  var cur = null;          // estado da tela de TV ao vivo
  var info = { ch: null }; // canal mostrado no player
  var epgCache = {};       // id -> { t, list }
  var epgTimer = null;
  var bootDone = false;    // a tela inicial ja apareceu uma vez nesta abertura do app
  var CHUNK = 120;         // canais desenhados por vez (listas grandes nao travam a TV)

  // ============================================================
  //  PREFERENCIAS DO USUARIO (tela de Ajustes) - ficam guardadas no aparelho
  //  As CORES sao sempre as da marca (definidas em js/config.js / Estudio):
  //  o usuario nao troca cor. Ele escolhe o ESTILO e as opcoes de uso.
  //  Para travar tambem o estilo:  personalizar: false  em js/config.js.
  // ============================================================
  var ESTILOS = ['classico', 'neon', 'cartoes', 'minimal', 'cinema'];
  var ESTILO_NOME = { classico: 'Cl\u00e1ssico', neon: 'Neon', cartoes: 'Cart\u00f5es', minimal: 'Minimal', cinema: 'Cinema' };
  var FITS = [['contain', 'Original'], ['cover', 'Preencher a tela'], ['fill', 'Esticar']];
  var PREF_KEY = 'tvui.prefs';
  // cores que versoes anteriores deixavam o usuario trocar: sao limpas na 1a abertura
  var VARS = ['--red', '--red2', '--red-rgb', '--redglow', '--pink', '--pink2', '--purple', '--pink-rgb', '--pinkglow', '--bg', '--bg2', '--panel', '--card', '--card2'];
  function cfgOf() { return window.APP_CONFIG || {}; }
  function podePersonalizar() { return cfgOf().personalizar !== false; }
  function prefs() { try { return JSON.parse(localStorage.getItem(PREF_KEY) || '{}') || {}; } catch (e) { return {}; } }
  function savePrefs(p) { try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch (e) {} }
  function pref(k, def) { var v = prefs()[k]; return v === undefined ? def : v; }
  function setPref(k, v) { var p = prefs(); p[k] = v; savePrefs(p); }
  function applyPrefs() {
    var p = prefs(), E = document.documentElement, base = cfgOf().estilo;
    var est = (podePersonalizar() && ESTILOS.indexOf(p.estilo) >= 0) ? p.estilo : (ESTILOS.indexOf(base) >= 0 ? base : 'classico');
    E.setAttribute('data-estilo', est);
    if (p.tema !== undefined) {           // sobra da versao que deixava trocar as cores
      delete p.tema; savePrefs(p);
      VARS.forEach(function (v) { E.style.removeProperty(v); });
      var c = window.AppCore; if (c && c.brandTheme) c.brandTheme();
    }
  }
  applyPrefs();
  // relogio do app: 24 h (padrao) ou 12 h
  function clock() {
    var d = new Date(), h = d.getHours(), m = d.getMinutes();
    function p2(n) { return (n < 10 ? '0' : '') + n; }
    if (!pref('hora12', false)) return p2(h) + ':' + p2(m);
    return ((h % 12) || 12) + ':' + p2(m) + (h < 12 ? ' AM' : ' PM');
  }

  // ---------- Tela de Ajustes (blocos usados pelos dois apps) ----------
  // o: { pin, conta, sobre, reload } = blocos extras (o app que ja tem o seu nao pede)
  function prefsHtml(o) {
    o = o || {};
    var c = core(), st = c.state || {}, ui = st.userInfo || {}, P = prefs();
    function opt(g, val, label, on) { return '<button class="ap-opt' + (on ? ' on' : '') + '" data-ap="' + g + '" data-v="' + val + '">' + label + '</button>'; }
    function simNao(g, on) { return opt(g, '1', 'Ligado', on) + opt(g, '0', 'Desligado', !on); }
    function line(t, d, inner) { return '<div class="ap-line"><div class="ap-l"><b>' + t + '</b><span>' + d + '</span></div><div class="ap-row">' + inner + '</div></div>'; }
    function card(t, inner) { return '<div class="ap-card"><div class="ap-t">' + t + '</div>' + inner + '</div>'; }
    function kv(k, v) { return '<div><span>' + k + '</span><b>' + esc(v || '-') + '</b></div>'; }
    var est = document.documentElement.getAttribute('data-estilo'), fit = P.fit || 'contain', html = '';

    if (podePersonalizar()) html += card('Apar\u00eancia',
      line('Estilo do app', 'Formato da tela inicial e das listas. As cores s\u00e3o as do aplicativo.', ESTILOS.map(function (e) { return opt('estilo', e, ESTILO_NOME[e], e === est); }).join('')) +
      line('Rel\u00f3gio', 'Formato da hora mostrada no app.', opt('hora12', '0', '24 horas', !P.hora12) + opt('hora12', '1', '12 horas', !!P.hora12)));

    html += card('Reprodu\u00e7\u00e3o',
      line('Pr\u00f3ximo epis\u00f3dio autom\u00e1tico', 'Ao terminar um epis\u00f3dio, come\u00e7a o seguinte sozinho.', simNao('autoNext', P.autoNext !== false)) +
      line('Formato da imagem', 'Como o v\u00eddeo ocupa a tela.', FITS.map(function (f) { return opt('fit', f[0], f[1], f[0] === fit); }).join('')) +
      line('Abrir na TV ao vivo', 'Ao entrar no app, vai direto para os canais.', simNao('startLive', !!P.startLive)));

    if (o.pin) html += card('Controle dos pais',
      '<div class="ap-d">PIN para abrir categorias adultas. Deixe vazio para n\u00e3o bloquear.</div>' +
      '<div class="ap-row"><input class="ap-input" id="apPin" type="text" inputmode="numeric" autocomplete="off" maxlength="8" placeholder="PIN (s\u00f3 n\u00fameros)" value="' + esc(window.Store.getAdultPin() || '') + '">' +
      '<button class="ap-opt" data-ap="savePin">Salvar PIN</button></div>');

    html += card('Dados do aparelho',
      '<div class="ap-d">Apaga s\u00f3 o que est\u00e1 guardado neste aparelho. A conta n\u00e3o \u00e9 alterada.</div><div class="ap-row">' +
      (o.reload ? '<button class="ap-opt" data-ap="reload">Recarregar listas</button>' : '') +
      '<button class="ap-opt" data-ap="clear" data-v="history">Limpar canais recentes</button>' +
      '<button class="ap-opt" data-ap="clear" data-v="progress">Limpar \u201ccontinuar assistindo\u201d</button>' +
      '<button class="ap-opt" data-ap="clear" data-v="favorites">Limpar favoritos</button></div>');

    if (o.conta) html += card('Minha conta',
      '<div class="ap-kv">' + kv('Usu\u00e1rio', st.server ? st.server.user : '') + kv('Vencimento', window.API.formatExpire(ui.expire)) +
      kv('Situa\u00e7\u00e3o', ui.status) + kv('Conex\u00f5es', (ui.activeCon || '0') + ' de ' + (ui.maxCon || '-')) + '</div>' +
      '<div class="ap-row"><button class="ap-opt" data-ap="logout">Sair / trocar de conta</button></div>');

    if (o.sobre) html += card('Sobre',
      '<div class="ap-kv">' + kv('Aplicativo', (c.CFG.brand || '') + (c.version ? ' v' + c.version : '')) + kv('ID do aparelho', window.Store.getDeviceId()) + '</div>');
    return html;
  }
  function wirePrefs(root) {
    if (!root) return;
    // escuta no bloco de Ajustes (refeito a cada abertura), nunca no app inteiro: senao os cliques se acumulam
    root = root.querySelector('.settings') || root;
    var c = core(), LIMPAR = { history: ['history', []], progress: ['progress', {}], favorites: ['favorites', []] };
    var NOME = { history: 'Canais recentes apagados', progress: 'Lista \u201ccontinuar assistindo\u201d apagada', favorites: 'Favoritos apagados' };
    function mark(g, v) { Array.prototype.forEach.call(root.querySelectorAll('[data-ap="' + g + '"]'), function (n) { n.classList.toggle('on', n.getAttribute('data-v') === v); }); }
    root.addEventListener('click', function (e) {
      var n = e.target.closest ? e.target.closest('[data-ap]') : null;
      if (!n || !root.contains(n)) return;
      var g = n.getAttribute('data-ap'), v = n.getAttribute('data-v');
      if (g === 'estilo') { setPref('estilo', v); applyPrefs(); mark(g, v); c.toast('Estilo aplicado'); }
      else if (g === 'hora12') { setPref('hora12', v === '1'); mark(g, v); var ck = document.getElementById('clock'); if (ck) ck.textContent = clock(); c.toast('Rel\u00f3gio ajustado'); }
      else if (g === 'autoNext' || g === 'startLive') { setPref(g, v === '1'); mark(g, v); c.toast('Op\u00e7\u00e3o salva'); }
      else if (g === 'fit') { setPref('fit', v); mark(g, v); if (window.Player.setFit) window.Player.setFit(v); c.toast('Formato da imagem salvo'); }
      else if (g === 'savePin') {
        var val = String((root.querySelector('#apPin') || {}).value || '').replace(/\D/g, '');
        window.Store.setAdultPin(val); c.state.adultUnlocked = false;
        var inp = root.querySelector('#apPin'); if (inp) inp.value = val;
        c.toast(val ? 'PIN salvo' : 'Bloqueio por PIN desligado');
      }
      else if (g === 'reload') c.nav('reload');
      else if (g === 'logout') c.logout();
      else if (g === 'clear') {
        // apagar pede confirmacao: o 2o toque (em ate 4 s) e que apaga
        if (n.getAttribute('data-sure') !== '1') {
          var old = n.textContent;
          n.setAttribute('data-sure', '1'); n.textContent = 'Toque de novo para apagar'; n.classList.add('warn');
          setTimeout(function () { if (n.getAttribute('data-sure') === '1') { n.removeAttribute('data-sure'); n.textContent = old; n.classList.remove('warn'); } }, 4000);
          n.setAttribute('data-old', old);
          return;
        }
        n.removeAttribute('data-sure'); n.classList.remove('warn'); n.textContent = n.getAttribute('data-old') || n.textContent;
        window.Store.setJson(LIMPAR[v][0], LIMPAR[v][1]);
        c.toast(NOME[v]);
      }
    });
  }

  function core() { return C || (C = window.AppCore); }
  function $(id) { return document.getElementById(id); }
  function esc(s) { return core().esc(s); }
  function idOf(ch) { return ch ? String(ch.streamId || ch.id || '') : ''; }
  function icon(a, b) { var I = core().IC; return I[a] || I[b] || ''; }
  var IC_EXIT = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4"/><path d="M15 8l4 4-4 4"/><path d="M19 12H9"/></svg>';
  var IC_USER = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4.500 20.500a7.500 7.500 0 0 1 15 0"/></svg>';

  function isAdultName(n) {
    var low = String(n || '').toLowerCase(), kw = (core().CFG.adultKeywords || []);
    for (var i = 0; i < kw.length; i++) if (low.indexOf(kw[i]) >= 0) return true;
    return false;
  }
  function hm(s) { var m = String(s || '').match(/(\d{2}):(\d{2})/); return m ? m[1] + ':' + m[2] : ''; }
  function toMs(s) { var d = Date.parse(String(s || '').replace(' ', 'T')); return isNaN(d) ? 0 : d; }

  // ============================================================
  //  TELA INICIAL
  // ============================================================
  function home() {
    var c = core(), st = c.state, b = st.branding || {};
    var name = esc(c.CFG.brand);
    var logo = b.logomenu
      ? '<img src="' + esc(b.logomenu) + '" alt="" onerror="this.style.display=\'none\';this.nextSibling.style.display=\'block\'"/><span style="display:none">' + name + '</span>'
      : '<span>' + name + '</span>';
    var exp = window.API.formatExpire(st.userInfo && st.userInfo.expire);
    var expTxt = /ilimitad/i.test(exp) ? 'Ilimitado' : 'Expira em ' + exp;
    function mid(dest, ic, label) { return '<button class="tvh-tile" data-tv="' + dest + '">' + ic + '<span>' + label + '</span></button>'; }
    function side(dest, ic, label) { return '<button class="tvh-act" data-tv="' + dest + '">' + ic + '<span>' + label + '</span></button>'; }
    c.h('<div class="view tvh">' +
      '<div class="tvh-clock" id="clock">' + c.nowClock() + '</div>' +
      '<div class="tvh-logo">' + logo + '</div>' +
      '<div class="tvh-grid">' +
        '<button class="tvh-tile tvh-big" data-tv="live">' + icon('live', 'liveTv') + '<span>TV ao Vivo</span></button>' +
        '<div class="tvh-mid">' +
          mid('movies', icon('movies'), 'Filmes') + mid('series', icon('series'), 'Séries') +
          mid('favorites', icon('fav', 'star'), 'Favoritos') + mid('search', icon('search'), 'Buscar') +
        '</div>' +
        '<div class="tvh-side">' +
          side('settings', icon('settings'), 'Configurações') +
          side('reload', icon('reload'), 'Recarregar') +
          side('exit', IC_EXIT, 'Sair') +
        '</div>' +
      '</div>' +
      '<div class="tvh-foot">' + IC_USER + '<span>' + esc(st.server ? st.server.user : '') + '</span><i></i><b>' + esc(expTxt) + '</b></div>' +
      '</div>');
    c.qsa('[data-tv]').forEach(function (n) {
      n.addEventListener('click', function () {
        var d = n.getAttribute('data-tv');
        if (d === 'exit') c.logout(); else c.nav(d);
      });
    });
    if (c.startClock) c.startClock();
    c.viewReady(c.qs('.tvh-big'));
    if (!bootDone) { bootDone = true; if (pref('startLive', false)) setTimeout(function () { if (c.qs('.tvh')) c.nav('live'); }, 0); }
  }

  // ============================================================
  //  TV AO VIVO
  // ============================================================
  function live(params) {
    var c = core();
    params = params || {};
    cur = { params: params, cats: [], all: null, adultIds: {}, list: [], view: [], shown: 0, catIdx: -1, filter: '', req: 0 };
    active = true;
    function pill(dest, label, on) { return '<button class="tvl-pill' + (on ? ' on' : '') + '" data-tv="' + dest + '">' + label + '</button>'; }
    c.h('<div class="view tvl">' +
      '<div class="tvl-top">' +
        '<div class="tvl-clock" id="clock">' + c.nowClock() + '</div>' +
        pill('home', 'Início') + pill('live', 'TV ao Vivo', true) + pill('movies', 'Filmes') + pill('series', 'Séries') +
        '<label class="tvl-search">' + icon('search') + '<input type="text" id="tvFind" placeholder="Procurar canal" autocomplete="off" spellcheck="false"></label>' +
      '</div>' +
      '<div class="tvl-body">' +
        '<div class="tvl-col tvl-groups" id="tvGroups"><div class="tvl-wait"><div class="spinner"></div></div></div>' +
        '<div class="tvl-col tvl-chans" id="tvChans"></div>' +
        '<div class="tvl-right">' +
          '<div class="tvl-prev" id="tvPrev"><div class="tvl-hint">Selecione um canal para assistir</div></div>' +
          '<div class="tvl-name" id="tvName"></div>' +
          '<div class="tvl-epg" id="tvEpg"></div>' +
          '<div class="tvl-btns">' +
            '<button class="tvl-btn" data-a="full">Tela cheia</button>' +
            '<button class="tvl-btn" data-a="fav" id="tvFavBtn">Adicionar aos Favoritos</button>' +
            '<button class="tvl-btn" data-a="find">Procurar</button>' +
          '</div>' +
        '</div>' +
      '</div></div>');
    if (c.startClock) c.startClock();

    c.qsa('.tvl-pill').forEach(function (n) {
      n.addEventListener('click', function () {
        var d = n.getAttribute('data-tv');
        if (d === 'home') c.back(); else if (d !== 'live') c.nav(d);
      });
    });
    var find = $('tvFind');
    find.addEventListener('input', function () { if (!cur) return; cur.filter = find.value.trim().toLowerCase(); drawChans(); });
    c.qsa('.tvl-btn').forEach(function (n) {
      n.addEventListener('click', function () {
        var a = n.getAttribute('data-a');
        if (a === 'full') { if (playingHere()) goFull(); else c.toast('Selecione um canal primeiro'); }
        else if (a === 'fav') toggleFav();
        else if (a === 'find') { find.focus(); }
      });
    });
    $('tvPrev').addEventListener('click', function () { if (playingHere()) goFull(); });

    var groups = $('tvGroups'), chans = $('tvChans');
    groups.addEventListener('click', function (e) {
      var n = e.target.closest ? e.target.closest('[data-g]') : null;
      if (n) pickCat(+n.getAttribute('data-g'), true);
    });
    chans.addEventListener('click', function (e) {
      var n = e.target.closest ? e.target.closest('[data-i]') : null;
      if (n) onChan(+n.getAttribute('data-i'));
    });
    chans.addEventListener('focusin', function (e) {
      var n = e.target.closest ? e.target.closest('[data-i]') : null;
      if (n && cur) showEpg(cur.view[+n.getAttribute('data-i')], false);
    });
    chans.addEventListener('scroll', function () {
      if (cur && cur.shown < cur.view.length && chans.scrollTop + chans.clientHeight > chans.scrollHeight - 400) moreChans();
    });

    place();
    var mine = cur;
    // uma chamada so traz todos os canais: contagem por grupo e troca de grupo instantanea
    Promise.all([
      c.getCategories('live').catch(function () { return []; }),
      c.getStreams('live', '').catch(function () { return null; })
    ]).then(function (r) {
      if (cur !== mine || !$('tvGroups')) return;
      var cats = r[0] || [], all = (r[1] && r[1].length) ? r[1] : null;
      if (!cats.length && !all) { groups.innerHTML = '<div class="tvl-empty">Não foi possível carregar os canais. Verifique a conexão.</div>'; c.viewReady(c.qs('.tvl-pill')); return; }
      cur.all = all;
      var count = {};
      if (all) all.forEach(function (ch) { count[ch.categoryId] = (count[ch.categoryId] || 0) + 1; });
      cats.forEach(function (ct) { if (isAdultName(ct.name)) cur.adultIds[ct.id] = true; });
      cur.cats = [];
      if (all) cur.cats.push({ type: 'all', name: 'Todos os canais' });
      cur.cats.push({ type: 'rec', name: 'Vistos recentemente' }, { type: 'fav', name: 'Favoritos' });
      cur.first = cur.cats.length;
      cats.forEach(function (ct) { cur.cats.push({ type: 'cat', id: ct.id, name: ct.name, n: all ? (count[ct.id] || 0) : null }); });
      drawGroups();
      var start = (params.catIdx != null && cur.cats[params.catIdx]) ? params.catIdx : (cur.cats[cur.first] ? cur.first : 0);
      pickCat(start, false);
    });
  }

  function listOf(cat) {
    var c = core(), S = window.Store;
    if (cat.type === 'all') return Promise.resolve(cur.all.filter(function (ch) { return c.state.adultUnlocked || !cur.adultIds[ch.categoryId]; }));
    if (cat.type === 'fav') return Promise.resolve(S.getFavorites().filter(function (f) { return f.kind === 'live'; }));
    if (cat.type === 'rec') return Promise.resolve(S.getHistory().filter(function (f) { return f.kind === 'live'; }));
    if (cur.all) return Promise.resolve(cur.all.filter(function (ch) { return ch.categoryId === cat.id; }));
    return c.getStreams('live', cat.id);
  }
  function countOf(cat) {
    var S = window.Store;
    if (cat.type === 'all') return cur.all.length;
    if (cat.type === 'fav') return S.getFavorites().filter(function (f) { return f.kind === 'live'; }).length;
    if (cat.type === 'rec') return S.getHistory().filter(function (f) { return f.kind === 'live'; }).length;
    return cat.n;
  }
  function drawGroups() {
    $('tvGroups').innerHTML = cur.cats.map(function (ct, i) {
      var n = countOf(ct);
      return '<div class="tvl-g' + (i === cur.catIdx ? ' on' : '') + '" tabindex="0" data-g="' + i + '"><span class="t">' + esc(ct.name) + '</span>' +
        (n == null ? '' : '<span class="n">' + n + '</span>') + '</div>';
    }).join('');
  }

  function pickCat(i, byUser) {
    var c = core(), cat = cur.cats[i];
    if (!cat) return;
    var mine = cur, req = ++cur.req;
    var ok = cat.type === 'cat' ? c.guardAdult({ id: cat.id, name: cat.name }) : Promise.resolve(true);
    ok.then(function (allowed) {
      if (cur !== mine || req !== cur.req) return;
      if (!allowed) { c.viewReady(c.qs('.tvl-g.on') || c.qs('.tvl-g')); return; }
      cur.catIdx = i; cur.params.catIdx = i;
      c.qsa('.tvl-g').forEach(function (n, k) { n.classList.toggle('on', k === i); });
      $('tvChans').innerHTML = '<div class="tvl-wait"><div class="spinner"></div></div>';
      return listOf(cat).then(function (list) {
        if (cur !== mine || req !== cur.req) return;
        cur.list = list || [];
        drawChans();
        var first = c.qs('.tvl-ch.on') || c.qs('.tvl-ch');
        if (byUser && first && c.kbd()) c.focusEl(first);
        else c.viewReady(first || c.qs('.tvl-g.on'));
      });
    }).catch(function () {
      if (cur !== mine || req !== cur.req) return;
      $('tvChans').innerHTML = '<div class="tvl-empty">Erro ao carregar os canais deste grupo.</div>';
    });
  }

  function rowHtml(ch, i) {
    var c = core(), on = info.ch && idOf(info.ch) === idOf(ch) && window.Player.isOpen();
    return '<div class="tvl-ch' + (on ? ' on' : '') + '" tabindex="0" data-i="' + i + '"><span class="n">' + esc(ch.num || (i + 1)) + '</span>' +
      c.img('lg', ch.poster, c.LOGO_PH) + '<span class="t">' + esc(ch.title) + '</span></div>';
  }
  function drawChans() {
    var box = $('tvChans'); if (!box || !cur) return;
    var f = cur.filter;
    cur.view = f ? cur.list.filter(function (ch) { return String(ch.title || '').toLowerCase().indexOf(f) >= 0; }) : cur.list;
    cur.shown = 0;
    box.scrollTop = 0;
    if (!cur.view.length) { box.innerHTML = '<div class="tvl-empty">' + (f ? 'Nenhum canal com esse nome.' : 'Nenhum canal neste grupo.') + '</div>'; return; }
    box.innerHTML = '';
    moreChans();
  }
  function moreChans() {
    var box = $('tvChans'), from = cur.shown, to = Math.min(cur.view.length, from + CHUNK), html = '';
    for (var i = from; i < to; i++) html += rowHtml(cur.view[i], i);
    box.insertAdjacentHTML('beforeend', html);
    cur.shown = to;
  }

  function playingHere() { return !!(info.ch && window.Player.isOpen() && window.Player.isLive()); }

  // 1o OK: toca na pre-visualizacao. 2o OK no mesmo canal: tela cheia.
  function onChan(i) {
    var ch = cur.view[i]; if (!ch) return;
    var P = window.Player, url = window.API.liveUrl(core().state.server, idOf(ch));
    if (P.isOpen() && P.currentUrl() === url) { goFull(); return; }
    play(ch, i);
  }
  function play(ch, i) {
    var c = core(), keep = document.activeElement;
    window.Store.addHistory(ch);
    c.setLiveCtx(cur.view, i);
    setInfo(ch, cur.view, i);
    place();
    c.openPlayer(window.API.liveUrl(c.state.server, idOf(ch)), ch.title, { live: true, mini: true });
    if (keep && keep.isConnected && c.kbd()) c.focusEl(keep);
    showEpg(ch, true);
  }
  function goFull() {
    var P = window.Player;
    if (!P.isOpen()) return;
    cur.focusBack = document.activeElement;
    try { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); } catch (e) {}
    P.expandFull();
  }

  function toggleFav() {
    var c = core(), ch = info.ch;
    if (!ch) { c.toast('Selecione um canal primeiro'); return; }
    var on = window.Store.toggleFavorite(ch);
    c.toast(on ? 'Canal adicionado aos favoritos' : 'Canal removido dos favoritos');
    paintFav();
    if (cur) drawGroups();
  }
  function paintFav() {
    var on = !!(info.ch && window.Store.isFavorite(info.ch));
    var b = $('tvFavBtn'); if (b) b.textContent = on ? 'Remover dos Favoritos' : 'Adicionar aos Favoritos';
    var p = $('plLvFav'); if (p) p.classList.toggle('on', on);
  }

  // ---- programacao (EPG), com cache curto ----
  function getEpg(ch) {
    var id = idOf(ch), hit = epgCache[id];
    if (hit && Date.now() - hit.t < 120000) return Promise.resolve(hit.list);
    return window.API.epg(core().state.server, id).then(function (list) {
      list = list || []; epgCache[id] = { t: Date.now(), list: list }; return list;
    });
  }
  function showEpg(ch, now) {
    if (!ch || !$('tvEpg')) return;
    if (epgTimer) clearTimeout(epgTimer);
    var id = idOf(ch);
    if (cur) cur.epgId = id;
    $('tvName').textContent = ch.title || '';
    epgTimer = setTimeout(function () {
      getEpg(ch).then(function (list) {
        var box = $('tvEpg'); if (!box || !cur || cur.epgId !== id) return;
        if (!list.length) { box.innerHTML = '<div class="tvl-noepg">Sem programação disponível para este canal.</div>'; return; }
        box.innerHTML = list.slice(0, 4).map(function (e, k) {
          var t = hm(e.start) ? hm(e.start) + ' ~ ' + hm(e.stop) : '';
          return '<div class="tvl-e' + (k === 0 ? ' now' : '') + '"><span class="h">' + esc(t) + '</span><span class="p">' + esc(e.title || '-') + '</span></div>';
        }).join('');
      }).catch(function () { var box = $('tvEpg'); if (box && cur && cur.epgId === id) box.innerHTML = ''; });
    }, now ? 0 : 280);
  }

  // A pre-visualizacao e o proprio player, encaixado sobre o quadro #tvPrev
  function place() {
    var el = $('tvPrev'); if (!el) return;
    var r = el.getBoundingClientRect(), s = document.documentElement.style;
    s.setProperty('--mx', Math.round(r.left) + 'px'); s.setProperty('--my', Math.round(r.top) + 'px');
    s.setProperty('--mw', Math.round(r.width) + 'px'); s.setProperty('--mh', Math.round(r.height) + 'px');
  }

  // ============================================================
  //  DADOS DO CANAL NO PLAYER (tela cheia)
  // ============================================================
  function ensureOverlay() {
    if ($('plLive')) return;
    var ui = $('plUi'); if (!ui) return;
    var d = document.createElement('div');
    d.id = 'plLive';
    d.innerHTML = '<div class="plv-row"><img id="plLvLogo" alt=""><div class="plv-txt"><div id="plLvMeta"></div><div id="plLvName"></div></div>' +
      '<button id="plLvFav" title="Favoritar"><svg viewBox="0 0 24 24"><path d="M12 20.300 4.600 13a4.800 4.800 0 0 1 6.800-6.800l.6.6.6-.6a4.800 4.800 0 0 1 6.800 6.800z"/></svg></button></div>' +
      '<div class="plv-epg"><span id="plLvNow"></span><span id="plLvNext"></span></div>' +
      '<div class="plv-bar"><i id="plLvBar"></i></div>' +
      '<div class="plv-res"><b>AO VIVO</b><span id="plLvRes"></span></div>';
    ui.appendChild(d);
    $('plLvFav').addEventListener('click', function (e) { e.stopPropagation(); toggleFav(); window.Player.resetHideTimer(); });
    $('plLvLogo').addEventListener('error', function () { this.style.visibility = 'hidden'; });
    var v = $('videoEl');
    function res() { var r = $('plLvRes'); if (r) r.textContent = (v.videoWidth && v.videoHeight) ? v.videoWidth + 'x' + v.videoHeight : ''; }
    if (v) { v.addEventListener('resize', res); v.addEventListener('playing', res); v.addEventListener('loadedmetadata', res); }
    // toque na pre-visualizacao = tela cheia (antes dos outros tratadores do player)
    var pl = $('player');
    pl.addEventListener('click', function (e) {
      if (window.Player.mode() !== 'mini') return;
      e.stopPropagation(); e.preventDefault();
      if (active && cur) goFull(); else window.Player.expandFull();
    }, true);
    window.addEventListener('resize', function () { setTimeout(place, 60); setTimeout(place, 400); });
  }

  // chamado sempre que um canal comeca a tocar (lista, zap pelo controle, favoritos...)
  function setInfo(ch, list, idx) {
    ensureOverlay();
    info.ch = ch || null;
    if (!ch) return;
    var c = core(), id = idOf(ch);
    var logo = $('plLvLogo');
    if (logo) { logo.style.visibility = ch.poster ? 'visible' : 'hidden'; if (ch.poster) logo.src = ch.poster; else logo.removeAttribute('src'); }
    var group = '';
    if (cur) { for (var i = 0; i < cur.cats.length; i++) if (cur.cats[i].type === 'cat' && cur.cats[i].id === ch.categoryId) { group = cur.cats[i].name; break; } }
    var meta = [String(ch.num || (idx != null && idx >= 0 ? idx + 1 : '') || '')];
    if (group) meta.push('Grupo: ' + group);
    $('plLvMeta').textContent = meta.filter(Boolean).join('  •  ');
    $('plLvName').textContent = ch.title || '';
    $('plLvNow').textContent = ''; $('plLvNext').textContent = ''; $('plLvBar').style.width = '0'; $('plLvRes').textContent = '';
    paintFav();
    // lista: marca o canal que esta tocando
    if (active && cur) {
      c.qsa('.tvl-ch').forEach(function (n) { var x = cur.view[+n.getAttribute('data-i')]; n.classList.toggle('on', !!x && idOf(x) === id); });
      if ($('tvName')) { cur.epgId = id; $('tvName').textContent = ch.title || ''; }
    }
    getEpg(ch).then(function (l) {
      if (!info.ch || idOf(info.ch) !== id) return;
      var a = l[0], b = l[1];
      $('plLvNow').textContent = a ? ((hm(a.start) ? hm(a.start) + '  ' : '') + (a.title || '')) : '';
      $('plLvNext').textContent = b ? ((hm(b.start) ? hm(b.start) + '  ' : '') + (b.title || '')) : '';
      var s = a ? toMs(a.start) : 0, e = a ? toMs(a.stop) : 0, n = Date.now();
      $('plLvBar').style.width = (s && e > s && n >= s && n <= e) ? Math.round((n - s) / (e - s) * 100) + '%' : '0';
    }).catch(function () {});
  }

  // ============================================================
  //  Ganchos chamados pelo app.js
  // ============================================================
  // VOLTAR: da tela cheia volta para a lista com a pre-visualizacao; da lista, sai da tela
  function back() {
    if (!active) return false;
    var P = window.Player, c = core();
    if (P.isOpen() && P.mode() !== 'mini' && P.isLive() && P.toMini && $('tvPrev')) {
      place();
      P.toMini();
      var row = c.qs('.tvl-ch.on') || (cur && cur.focusBack);
      if (row && row.isConnected) c.focusEl(row);
      return true;
    }
    if (P.isOpen()) c.closePlayer();
    active = false;
    return false;
  }
  // chamado antes de desenhar qualquer tela: a pre-visualizacao nao pode ficar por cima
  function leave() {
    if (!active) return;
    active = false;
    var P = window.Player;
    if (P.isOpen() && P.mode() === 'mini') core().closePlayer();
    cur = null;
  }

  return { home: home, live: live, info: setInfo, back: back, leave: leave, place: place,
    prefsHtml: prefsHtml, wirePrefs: wirePrefs, reapply: function () {}, pref: pref, clock: clock };
})();
