var VEHICLES = { bache: "🚚 Bâché", frigo: "❄️ Frigorifique", plateau: "📐 Plateau", benne: "🏗️ Benne" };
function vehicleLabel(v) { return VEHICLES[v] || "🚚 Bâché"; }
function uid() { return Math.random().toString(36).slice(2, 10); }
function esc(s) { var d = document.createElementr("div"); d.textContent = s == null ? "" : s; return d.innerHTML; }
function jsStr(s) { return "'" + String(s == null ? "" : s).replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "'"; }

// ================= état =================
var state = {
  lang: getStoredLang(),
  session: null, myProfile: null, myDriverProfile: null, profilesById: {},
  trips: [], reservations: [], requests: [], offers: [],
  clientSubTab: "browse", chauffeurSubTab: "mytrips",
  authMode: "login", authError: "", authBusy: false,
  editingProfile: false, profileError: "", _chosenRole: null,
  search: "", sortBy: "date", tripsPage: 1, tripsPageSize: 10, resPage: 1, resPageSize: 10, expandedRes: null,
  showNewTrip: false, showNewRequest: false,
  reserveFor: null, expandedTrip: null, activeChat: null,
  messages: {}, messageMeta: [],
  tripError: "", reserveError: "", reqError: ""
};

function myId() { return state.session ? state.session.user.id : null; }
function profileById(id) { return state.profilesById[id] || null; }
function displayName(p) { return p ? (p.prenom + " " + p.nom) : "—"; }
function profileInitials(p) { if (!p) return "?"; return (((p.prenom||"")[0]||"") + ((p.nom||"")[0]||"")).toUpperCase(); }
function verifiedTag(p) { return p && p.verified ? '<span class="verified">✅ Vérifié</span>' : ""; }

// ================= thème =================
function togglePwd(fieldId, btn) {
  var el = document.getElementById(fieldId);
  if (el.type === "password") { el.type = "text"; btn.textContent = "🙈"; }
  else { el.type = "password"; btn.textContent = "👁️"; }
}
function toggleTheme() {
  var el = document.documentElement; var dark = el.getAttribute("data-theme") === "dark";
  el.setAttribute("data-theme", dark ? "light" : "dark");
  document.getElementById("themeBtn").textContent = dark ? "🌙" : "☀️";
}

// ================= toasts =================
function showToast(msg, type) {
  var wrap = document.getElementById("toastWrap");
  var t = document.createElementr("div"); t.className = "toast" + (type ? " " + type : ""); t.textContent = msg;
  wrap.appendChild(t);
  setTimeout(function () { t.style.opacity = "0"; t.style.transition = "opacity .3s"; setTimeout(function () { t.remove(); }, 300); }, 2600);
}

// ================= géoloc & autocomplétion (OSM/Nominatim) =================
var addressDebounce = {}, lastSuggestions = {}, coords = { origin: null, dest: null };
function onAddressInput(fieldId) {
  var val = document.getElementById(fieldId).value;
  clearTimeout(addressDebounce[fieldId]);
  if (val.trim().length < 3) { document.getElementById("sugg-" + fieldId).innerHTML = ""; return; }
  addressDebounce[fieldId] = setTimeout(function () { searchAddress(fieldId, val); }, 350);
}
function searchAddress(fieldId, query) {
  var url = "https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=dz&q=" + encodeURIComponent(query);
  fetch(url, { headers: { "Accept-Language": "fr" } }).then(function (r) { return r.json(); })
    .then(function (results) { renderSuggestions(fieldId, results); })
    .catch(function () { document.getElementById("sugg-" + fieldId).innerHTML = '<div class="suggestion-item muted">Suggestions indisponibles</div>'; });
}
function renderSuggestions(fieldId, results) {
  var box = document.getElementById("sugg-" + fieldId); if (!box) return;
  if (!results || !results.length) { box.innerHTML = ""; return; }
  lastSuggestions[fieldId] = results;
  box.innerHTML = results.map(function (r, i) { return '<div class="suggestion-item" onmousedown="selectAddress(\'' + fieldId + '\',' + i + ')">' + esc(r.display_name) + '</div>'; }).join("");
}
function selectAddress(fieldId, idx) {
  var r = lastSuggestions[fieldId][idx];
  document.getElementById(fieldId).value = r.display_name;
  document.getElementById("sugg-" + fieldId).innerHTML = "";
  var key = (fieldId === "f-origin" || fieldId === "r-origin") ? "origin" : "dest";
  coords[key] = { lat: parseFloat(r.lat), lon: parseFloat(r.lon) };
  updateRoutePreview();
}
function hideSuggestionsLater(fieldId) { setTimeout(function () { var box = document.getElementById("sugg-" + fieldId); if (box) box.innerHTML = ""; }, 200); }
function useMyLocation(fieldId, btn) {
  if (!navigator.geolocation) { showToast("Géolocalisation non supportée.", "err"); return; }
  btn.textContent = "…";
  navigator.geolocation.getCurrentPosition(function (pos) {
    var lat = pos.coords.latitude, lon = pos.coords.longitude;
    fetch("https://nominatim.openstreetmap.org/reverse?format=json&lat=" + lat + "&lon=" + lon, { headers: { "Accept-Language": "fr" } })
      .then(function (r) { return r.json(); })
      .then(function (data) { document.getElementById(fieldId).value = data.display_name || (lat.toFixed(5) + ", " + lon.toFixed(5)); coords.origin = { lat: lat, lon: lon }; btn.textContent = "📍"; updateRoutePreview(); })
      .catch(function () { document.getElementById(fieldId).value = lat.toFixed(5) + ", " + lon.toFixed(5); coords.origin = { lat: lat, lon: lon }; btn.textContent = "📍"; updateRoutePreview(); });
  }, function (err) { showToast("Position indisponible : " + err.message, "err"); btn.textContent = "📍"; });
}

// ================= carte + itinéraire =================
var routeMap = null, routeLayer = null, routeInfo = null;
function ensureMap() {
  var el = document.getElementById("route-map"); if (!el) return null;
  if (routeMap) { routeMap.remove(); routeMap = null; }
  routeMap = L.map(el, { zoomControl: false, attributionControl: false }).setView([28.0, 2.5], 4.2);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18 }).addTo(routeMap);
  routeLayer = L.layerGroup().addTo(routeMap);
  return routeMap;
}
function updateRoutePreview() {
  var el = document.getElementById("route-map"); if (!el) return;
  if (!routeMap) ensureMap();
  routeLayer.clearLayers();
  var pts = [];
  if (coords.origin) { L.marker([coords.origin.lat, coords.origin.lon]).addTo(routeLayer); pts.push([coords.origin.lat, coords.origin.lon]); }
  if (coords.dest) { L.marker([coords.dest.lat, coords.dest.lon]).addTo(routeLayer); pts.push([coords.dest.lat, coords.dest.lon]); }
  if (pts.length === 2) { L.polyline(pts, { color: "#0b7a5e", weight: 4, opacity: .85 }).addTo(routeLayer); routeMap.fitBounds(pts, { padding: [24, 24] }); fetchRouteInfo(); }
  else if (pts.length === 1) { routeMap.setView(pts[0], 11); var infoEl = document.getElementById("route-info"); if (infoEl) infoEl.textContent = ""; routeInfo = null; }
}
function fetchRouteInfo() {
  var infoEl = document.getElementById("route-info"); if (infoEl) infoEl.textContent = "Calcul de l'itinéraire…";
  var url = "https://router.project-osrm.org/route/v1/driving/" + coords.origin.lon + "," + coords.origin.lat + ";" + coords.dest.lon + "," + coords.dest.lat + "?overview=false";
  fetch(url).then(function (r) { return r.json(); }).then(function (data) {
    if (data.routes && data.routes[0]) {
      var km = data.routes[0].distance / 1000, min = data.routes[0].duration / 60;
      routeInfo = { distanceKm: Math.round(km), durationMin: Math.round(min) };
      if (infoEl) infoEl.innerHTML = "🛣️ ≈ " + routeInfo.distanceKm + " km · ≈ " + formatDuration(routeInfo.durationMin);
    } else if (infoEl) infoEl.textContent = "";
  }).catch(function () { if (infoEl) infoEl.textContent = "Itinéraire indisponible."; routeInfo = null; });
}
function formatDuration(min) { var h = Math.floor(min / 60), m = Math.round(min % 60); return h > 0 ? (h + "h" + (m ? (m < 10 ? "0" + m : m) : "")) : (m + " min"); }
function osmDirectionsUrl(t) { if (!t.origin_lat || !t.dest_lat) return null; return "https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=" + t.origin_lat + "%2C" + t.origin_lon + "%3B" + t.dest_lat + "%2C" + t.dest_lon; }

// ================= AUTHENTIFICATION =================
async function initAuth() {
  var { data } = await sb.auth.getSession();
  state.session = data.session;
  sb.auth.onAuthStateChange(function (event, session) {
    state.session = session;
    if (event === "PASSWORD_RECOVERY") { state.authMode = "reset"; render(); return; }
    onAuthChange();
  });
  await onAuthChange();
}
async function onAuthChange() {
  if (state.session) {
    await loadMyProfile();
    if (state.myProfile) { await loadMyDriverProfile(); await loadAllData(); subscribeRealtime(); }
  } else {
    state.myProfile = null;
    if (dataChannel) { sb.removeChannel(dataChannel); dataChannel = null; }
  }
  render();
}
async function doSignup() {
  var email = document.getElementById("auth-email").value.trim();
  var pass = document.getElementById("auth-pass").value;
  if (!email || pass.length < 6) { state.authError = "Email valide + mot de passe (6 caractères min) requis."; render(); return; }
  state.authBusy = true; state.authError = ""; render();
  var { data, error } = await sb.auth.signUp({ email: email, password: pass });
  state.authBusy = false;
  if (error) { state.authError = error.message; render(); return; }
  if (!data.session) { state.authError = ""; showToast("Compte créé — vérifie ta boîte mail pour confirmer, puis connecte-toi.", "ok"); state.authMode = "login"; render(); return; }
  state.session = data.session; await onAuthChange();
}
async function doLogin() {
  var email = document.getElementById("auth-email").value.trim();
  var pass = document.getElementById("auth-pass").value;
  if (!email || !pass) { state.authError = "Email et mot de passe requis."; render(); return; }
  state.authBusy = true; state.authError = ""; render();
  var { data, error } = await sb.auth.signInWithPassword({ email: email, password: pass });
  state.authBusy = false;
  if (error) { state.authError = error.message; render(); return; }
  state.session = data.session; await onAuthChange();
}
async function doLogout() { await sb.auth.signOut(); state.session = null; await onAuthChange(); }
async function doForgotPassword() {
  var email = document.getElementById("auth-email").value.trim();
  if (!email) { state.authError = "Entre ton email d'abord."; render(); return; }
  state.authBusy = true; state.authError = ""; render();
  var { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + window.location.pathname });
  state.authBusy = false;
  if (error) { state.authError = error.message; render(); return; }
  state.authMode = "login"; render();
  showToast("Email envoyé — clique le lien reçu pour choisir un nouveau mot de passe.", "ok");
}
async function doUpdatePassword() {
  var pass = document.getElementById("reset-pass").value;
  var pass2 = document.getElementById("reset-pass2").value;
  if (pass.length < 6) { state.authError = "6 caractères minimum."; render(); return; }
  if (pass !== pass2) { state.authError = "Les deux mots de passe ne correspondent pas."; render(); return; }
  state.authBusy = true; state.authError = ""; render();
  var { error } = await sb.auth.updateUser({ password: pass });
  state.authBusy = false;
  if (error) { state.authError = error.message; render(); return; }
  state.authMode = "login"; state.authError = "";
  showToast("Mot de passe mis à jour ✅", "ok");
  await onAuthChange();
}

async function loadMyProfile() {
  var { data } = await sb.from("profiles").select("*").eq("id", myId()).maybeSingle();
  state.myProfile = data || null;
}
async function loadMyDriverProfile() {
  var { data } = await sb.from("driver_profiles").select("*").eq("id", myId()).maybeSingle();
  state.myDriverProfile = data || null;
}
async function saveDriverProfile() {}
function driverVerifiedTag(p) { return p && p.driver_verified ? '<span class="verified">🚚 Chauffeur vérifié</span>' : ""; }
async function saveProfileToDb() {
  var prenom = document.getElementById("p-prenom").value.trim();
  var nom = document.getElementById("p-nom").value.trim();
  var tel = document.getElementById("p-tel").value.trim();
  var verified = document.getElementById("p-verified").checked;
  var isDriver = state._chosenRole === "chauffeur";
  if (!prenom || !nom || !tel) { state.profileError = "Prénom, nom et téléphone sont obligatoires."; render(); return; }
  var license, plate, vehicle;
  if (isDriver) {
    license = document.getElementById("d-license").value.trim();
    plate = document.getElementById("d-plate").value.trim();
    vehicle = document.getElementById("d-vehicle").value;
    if (!license || !plate) { state.profileError = "N° de permis et plaque d'immatriculation sont obligatoires pour un compte chauffeur."; render(); return; }
  }
  var row = { id: myId(), prenom: prenom, nom: nom, tel: tel, verified: verified, role: state._chosenRole, driver_verified: isDriver };
  var { error } = await sb.from("profiles").upsert(row);
  if (error) { state.profileError = error.message; render(); return; }
  if (isDriver) {
    var { error: derr } = await sb.from("driver_profiles").upsert({ id: myId(), license_number: license, plate: plate, vehicle_type: vehicle });
    if (derr) { state.profileError = derr.message; render(); return; }
  }
  state.myProfile = row; state.editingProfile = false; state.profileError = "";
  await loadMyDriverProfile(); await loadAllData(); subscribeRealtime();
  render(); showToast("Profil enregistré", "ok");
}

// ================= chargement des données =================
var dataChannel = null, threadChannel = null;
async function loadAllData() {
  var [profilesRes, tripsRes, resvRes, reqRes, offRes, msgMetaRes] = await Promise.all([
    sb.from("profiles").select("*"),
    sb.from("trips").select("*").order("created_at", { ascending: false }),
    sb.from("reservations").select("*").order("created_at", { ascending: false }),
    sb.from("requests").select("*").order("created_at", { ascending: false }),
    sb.from("request_offers").select("*").order("created_at", { ascending: false }),
    sb.from("messages").select("thread_type, thread_id, sender_id, created_at").order("created_at", { ascending: false })
  ]);
  state.profilesById = {}; (profilesRes.data || []).forEach(function (p) { state.profilesById[p.id] = p; });
  state.trips = tripsRes.data || []; state.reservations = resvRes.data || [];
  state.requests = reqRes.data || []; state.offers = offRes.data || [];
  state.messageMeta = msgMetaRes.data || [];
}
function subscribeRealtime() {
  if (dataChannel) return;
  dataChannel = sb.channel("public-data")
    .on("postgres_changes", { event: "*", schema: "public", table: "trips" }, handleDataChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "reservations" }, handleDataChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "requests" }, handleDataChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "request_offers" }, handleDataChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, handleDataChange)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, handleDataChange)
    .subscribe();
}
function handleDataChange() { loadAllData().then(render); }

// ================= messages (chat) =================
function threadKey(type, id) { return type + ":" + id; }
function lastSeenKey(type, id) { return "seen:" + type + ":" + id; }
function getLastSeen(type, id) { try { return localStorage.getItem(lastSeenKey(type, id)) || ""; } catch (e) { return ""; } }
function markSeen(type, id) { try { localStorage.setItem(lastSeenKey(type, id), new Date().toISOString()); } catch (e) {} }
function hasUnread(type, id) {
  for (var i = 0; i < state.messageMeta.length; i++) {
    var m = state.messageMeta[i];
    if (m.thread_type === type && m.thread_id === id && m.sender_id !== myId()) {
      return m.created_at > getLastSeen(type, id);
    }
  }
  return false;
}
function chatBtnHtml(type, id, withName) {
  var dot = hasUnread(type, id) ? '<span style="position:absolute; top:-2px; right:-2px; width:9px; height:9px; border-radius:50%; background:#dc2626; border:2px solid var(--card);"></span>' : "";
  return '<span style="position:relative; display:inline-block;"><button class="chat-icon-btn" onclick="openChat(' + jsStr(type) + ',' + jsStr(id) + ',' + jsStr(withName) + ')" title="Chat">💬</button>' + dot + '</span>';
}
async function loadThreadMessages(type, id) {
  var { data } = await sb.from("messages").select("*").eq("thread_type", type).eq("thread_id", id).order("created_at");
  state.messages[threadKey(type, id)] = data || [];
}
function subscribeThread(type, id) {
  if (threadChannel) { sb.removeChannel(threadChannel); threadChannel = null; }
  threadChannel = sb.channel("thread-" + type + "-" + id)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: "thread_id=eq." + id }, function (payload) {
      if (payload.new.thread_type !== type) return;
      var key = threadKey(type, id);
      var arr = state.messages[key] || [];
      if (!arr.find(function (m) { return m.id === payload.new.id; })) arr = arr.concat([payload.new]);
      state.messages[key] = arr; markSeen(type, id); renderChatOverlay();
    }).subscribe();
}
async function openChat(type, id, withName) {
  state.activeChat = { type: type, id: id, withName: withName };
  markSeen(type, id);
  renderChatOverlay();
  await loadThreadMessages(type, id);
  subscribeThread(type, id);
  renderChatOverlay();
}
function closeChat() {
  var ac = state.activeChat;
  if (ac) markSeen(ac.type, ac.id);
  state.activeChat = null;
  if (threadChannel) { sb.removeChannel(threadChannel); threadChannel = null; }
  renderChatOverlay();
  render();
}
async function sendChatMessage() {
  var input = document.getElementById("chat-input"); if (!input) return;
  var text = input.value.trim(); if (!text) return;
  var ac = state.activeChat; if (!ac) return;
  input.value = "";
  await sb.from("messages").insert({ thread_type: ac.type, thread_id: ac.id, sender_id: myId(), text: text });
}

// ================= dérivées =================
function tripOf(tripId) { return state.trips.find(function (x) { return x.id === tripId; }); }
function requestOf(reqId) { return state.requests.find(function (x) { return x.id === reqId; }); }
function tripLabel(tripId) { var t = tripOf(tripId); if (!t) return "trajet supprimé"; return esc(t.origin) + " → " + esc(t.destination) + " · " + esc(t.date); }
function driverStats(driverId) {
  var relevant = state.reservations.filter(function (r) { var t = tripOf(r.trip_id); return t && t.driver_id === driverId; });
  var ratings = relevant.filter(function (r) { return r.rating; }).map(function (r) { return r.rating; });
  var avg = ratings.length ? (ratings.reduce(function (a, b) { return a + b; }, 0) / ratings.length) : null;
  var delivered = relevant.filter(function (r) { return r.status === "terminee"; }).length;
  return { avg: avg, count: ratings.length, delivered: delivered };
}
function tierBadge(delivered) {
  if (delivered >= 50) return '<span class="tier">🥇 Expert</span>';
  if (delivered >= 20) return '<span class="tier">🥈 Confirmé</span>';
  if (delivered >= 5) return '<span class="tier">🥉 Actif</span>';
  return "";
}
function starsDisplay(avg, count) { if (!avg) return '<span class="muted">Pas encore d\'avis</span>'; return '<span style="color:#e0a100;">★</span> ' + avg.toFixed(1) + ' <span class="muted">(' + count + ' avis)</span>'; }
function badge(status) {
  var map = { en_attente: [tr("status_waiting"), "badge-wait"], validee: [tr("status_validated"), "badge-ok"], en_route: [tr("status_enroute"), "badge-route"], refusee: [tr("status_refused"), "badge-no"], terminee: [tr("status_delivered"), "badge-done"], annulee: [tr("status_cancelled"), "badge-cancel"], ouverte: [tr("status_open"), "badge-wait"], prise_en_charge: [tr("status_taken"), "badge-ok"], proposee: [tr("status_proposed"), "badge-wait"], acceptee: [tr("status_accepted"), "badge-ok"] };
  var v = map[status] || [status, "badge-cancel"];
  return '<span class="badge ' + v[1] + '">' + v[0] + '</span>';
}
function routeBadgeHtml(t) {
  if (!t.distance_km) return "";
  var h = '<span class="route-badge">🛣️ ' + t.distance_km + ' km · ' + formatDuration(t.duration_min) + '</span>';
  var url = osmDirectionsUrl(t); if (url) h += ' <a class="route-link" href="' + url + '" target="_blank" rel="noopener">Itinéraire ↗</a>';
  return h;
}
function co2Html(r, t) {
  if (!t || !t.distance_km || !t.capacity) return "";
  var kg = Math.round(t.distance_km * 0.9 * (r.m3 / t.capacity));
  return '<div class="co2">🌱 ≈ ' + kg + ' kg de CO₂ économisés en mutualisant ce chargement (estimation illustrative)</div>';
}
function renderChatOverlay() {
  var el = document.getElementById("chatOverlay");
  var ac = state.activeChat;
  if (!ac) { el.innerHTML = ""; return; }

  var msgs = (state.messages[threadKey(ac.type, ac.id)] || []).map(function (m) {
    var mine = m.sender_id === myId();
    var t = new Date(m.created_at); var hh = ("0" + t.getHours()).slice(-2), mm = ("0" + t.getMinutes()).slice(-2);
    return '<div class="chat-row ' + (mine ? "me" : "other") + '"><div class="chat-bubble"><div class="txt">' + esc(m.text) + '</div><div class="chat-time">' + hh + ':' + mm + '</div></div></div>';
  }).join("");
  if (!msgs) msgs = '<p class="muted" style="text-align:center; margin-top:20px;">' + tr("no_messages") + '</p>';

  el.innerHTML = '<div class="chat-backdrop" onclick="if(event.target===this)closeChat();">' +
    '<div class="chat-sheet">' +
      '<div class="chat-header"><span class="avatar" style="margin:0;">' + esc((ac.withName||"?").slice(0,2).toUpperCase()) + '</span>' +
        '<span class="name">' + esc(ac.withName || "Chat") + '</span>' +
        '<button class="chat-close" onclick="closeChat()">✕</button></div>' +
      '<div class="chat-msgs" id="chat-msgs">' + msgs + '</div>' +
      '<div class="chat-inputbar">' +
        '<input type="text" id="chat-input" placeholder=tr("write_message") onkeydown="if(event.key===\'Enter\')sendChatMessage()" />' +
        '<button class="chat-send" onclick="sendChatMessage()">➤</button>' +
      '</div>' +
    '</div></div>';

  var box = document.getElementById("chat-msgs");
  if (box) box.scrollTop = box.scrollHeight;
}
function ratingHint() { return '<p class="muted" style="margin:2px 0 10px;">ℹ️ ' + tr("rating_hint").replace('ℹ️ ','') + '</p>'; }
function ratingWidget(r) {
  if (r.rating) { var s = ""; for (var i = 1; i <= 5; i++) s += (i <= r.rating ? "★" : "☆"); return '<div class="muted" style="margin-top:6px;"><span style="color:#e0a100;">' + s + '</span> ' + tr("thanks_rating") + '</div>'; }
  var stars = ""; for (var i = 1; i <= 5; i++) stars += '<span onclick="rateReservation(\'' + r.id + '\',' + i + ')">☆</span>';
  return '<div style="margin-top:6px;"><span class="muted">' + tr("rate_driver") + '</span><span class="stars">' + stars + '</span></div>';
}

// ================= suivi en direct =================
async function startTrip(resId) {
  var r = state.reservations.find(function (x) { return x.id === resId; });
  var t = tripOf(r.trip_id);
  var eta = (t && t.duration_min) ? t.duration_min : 60;
  var { error } = await sb.from("reservations").update({ status: "en_route", started_at: new Date().toISOString(), eta_minutes: eta }).eq("id", resId);
  if (error) { showToast(error.message, "err"); return; }
  await loadAllData(); render(); showToast("Trajet démarré 🚚 — suivi en direct activé");
}
function progressOf(r) {
  if (r.status !== "en_route" || !r.started_at) return null;
  var elapsedMin = (Date.now() - new Date(r.started_at).getTime()) / 60000;
  var pct = Math.min(100, (elapsedMin / r.eta_minutes) * 100);
  var remainMin = Math.max(0, Math.round(r.eta_minutes - elapsedMin));
  return { pct: pct, remainMin: remainMin };
}
function progressHtml(r) {
  var p = progressOf(r); if (!p) return "";
  return '<div class="progress-outer"><div class="progress-inner" id="progress-' + r.id + '" style="width:' + p.pct.toFixed(1) + '%;"></div></div>' +
    '<div class="eta-text" id="eta-' + r.id + '">🚚 En route — arrivée estimée dans ' + formatDuration(p.remainMin) + '</div>';
}
setInterval(function () {
  state.reservations.forEach(function (r) {
    if (r.status !== "en_route") return;
    var p = progressOf(r); if (!p) return;
    var bar = document.getElementById("progress-" + r.id), eta = document.getElementById("eta-" + r.id);
    if (bar) bar.style.width = p.pct.toFixed(1) + "%";
    if (eta) eta.textContent = p.remainMin > 0 ? ("🚚 En route — arrivée estimée dans " + formatDuration(p.remainMin)) : "🚚 Arrivée estimée imminente";
  });
}, 4000);

// ================= rendu =================
function render() {
  if (state.authMode === "reset") { renderResetPassword(); return; }
  if (!state.session) { renderAuth(); return; }
  if (!state.myProfile) { renderProfileSetup(); return; }

  document.getElementById("idbox").style.display = "flex";
  document.getElementById("logoutBtn").style.display = "inline-block";
  document.getElementById("idboxText").textContent = displayName(state.myProfile) + " · " + (state.myProfile.role === "chauffeur" ? "🚚 Chauffeur" : "📦 Client");

  var html = state.myProfile.role === "chauffeur" ? renderChauffeur() : renderClient();
  html += '<p class="footer-note">© ' + new Date().getFullYear() + ' ECORoute — HD &amp; BS</p>';
  document.getElementById("app").innerHTML = html;

  if (state.myProfile.role === "chauffeur" && state.showNewTrip) setTimeout(function () { ensureMap(); updateRoutePreview(); }, 0);
  if (state.myProfile.role === "client" && state.clientSubTab === "requests" && state.showNewRequest) setTimeout(function () { ensureMap(); updateRoutePreview(); }, 0);
}

function renderAuth() {
  document.getElementById("idbox").style.display = "none";
  document.getElementById("logoutBtn").style.display = "none";
  if (state.authMode === "forgot") {
    var hf = '<div class="authwrap"><div class="authcard">' +
      '<h2 style="margin-top:0;">Mot de passe oublié</h2>' +
      '<p class="muted" style="margin-top:-4px;">Entre ton email, tu recevras un lien pour en choisir un nouveau.</p>' +
      '<input class="field" id="auth-email" type="email" placeholder=tr("email") autocomplete="username" />' +
      '<button class="btn btn-amber" ' + (state.authBusy ? "disabled" : "") + ' onclick="doForgotPassword()">' +
        (state.authBusy ? '<span class="spinner"></span>' : "") + tr("forgot_send") + '</button>' +
      '<button class="btn btn-outline" style="width:100%; margin-top:10px;" onclick="state.authMode=\'login\'; state.authError=\'\'; render();">← Retour à la connexion</button>' +
      (state.authError ? '<div class="error">' + esc(state.authError) + '</div>' : '') +
    '</div></div>';
    document.getElementById("app").innerHTML = hf;
    return;
  }
  var h = '<div class="authwrap"><div class="authcard">' +
    '<div class="authtabs">' +
      '<button class="' + (state.authMode === "login" ? "active" : "") + '" onclick="state.authMode=\'login\'; state.authError=\'\'; render();">Connexion</button>' +
      '<button class="' + (state.authMode === "signup" ? "active" : "") + '" onclick="state.authMode=\'signup\'; state.authError=\'\'; render();">Créer un compte</button>' +
    '</div>' +
    '<input class="field" id="auth-email" type="email" placeholder=tr("email") autocomplete="username" />' +
    '<div class="pwd-wrap"><input class="field" id="auth-pass" type="password" placeholder=tr("password") autocomplete="' + (state.authMode === "login" ? "current-password" : "new-password") + '" />' +
      '<button type="button" class="pwd-toggle" onclick="togglePwd(\'auth-pass\', this)">👁️</button></div>' +
    '<button class="btn btn-amber" ' + (state.authBusy ? "disabled" : "") + ' onclick="' + (state.authMode === "login" ? "doLogin()" : "doSignup()") + '">' +
      (state.authBusy ? '<span class="spinner"></span>' : "") + (state.authMode === "login" ? tr("login_btn") : tr("signup_btn")) + '</button>' +
    (state.authMode === "login" ? '<button class="btn-outline" style="width:100%; margin-top:10px; text-align:center;" onclick="state.authMode=\'forgot\'; state.authError=\'\'; render();">Mot de passe oublié ?</button>' : '') +
    (state.authError ? '<div class="error">' + esc(state.authError) + '</div>' : '') +
    '<p class="muted" style="margin-top:14px; text-align:center;"><img src="icons/icon-192.png" alt="" style="width:20px;height:20px;border-radius:5px;vertical-align:-5px;" /> ECORoute — marketplace de capacité camion</p>' +
  '</div></div>';
  document.getElementById("app").innerHTML = h;
}

function renderResetPassword() {
  document.getElementById("idbox").style.display = "none";
  document.getElementById("logoutBtn").style.display = "none";
  var h = '<div class="authwrap"><div class="authcard">' +
    '<h2 style="margin-top:0;">Choisis un nouveau mot de passe</h2>' +
    '<div class="pwd-wrap"><input class="field" id="reset-pass" type="password" placeholder=tr("reset_new") autocomplete="new-password" />' +
      '<button type="button" class="pwd-toggle" onclick="togglePwd(\'reset-pass\', this)">👁️</button></div>' +
    '<div class="pwd-wrap"><input class="field" id="reset-pass2" type="password" placeholder=tr("reset_confirm") autocomplete="new-password" />' +
      '<button type="button" class="pwd-toggle" onclick="togglePwd(\'reset-pass2\', this)">👁️</button></div>' +
    '<button class="btn btn-amber" ' + (state.authBusy ? "disabled" : "") + ' onclick="doUpdatePassword()">' +
      (state.authBusy ? '<span class="spinner"></span>' : "") + tr("reset_update") + '</button>' +
    (state.authError ? '<div class="error">' + esc(state.authError) + '</div>' : '') +
  '</div></div>';
  document.getElementById("app").innerHTML = h;
}

function renderProfileSetup() {
  document.getElementById("idbox").style.display = "none";
  document.getElementById("logoutBtn").style.display = "inline-block";

  if (!state._chosenRole) {
    var h0 = '<div class="authwrap"><div class="authcard">' +
      '<h2 style="margin-top:0;">' + tr("role_question") + '</h2>' +
      '<p class="muted" style="margin-top:-4px;">Ce choix est définitif pour ce compte — crée un second compte avec un autre email si tu veux aussi jouer l\'autre rôle.</p>' +
      '<button class="btn btn-dark" style="width:100%; margin-bottom:10px;" onclick="state._chosenRole=\'client\'; render();">📦 Je suis Client — je réserve du transport</button>' +
      '<button class="btn btn-amber" onclick="state._chosenRole=\'chauffeur\'; render();">🚚 Je suis Chauffeur — je transporte</button>' +
    '</div></div>';
    document.getElementById("app").innerHTML = h0;
    return;
  }

  var isDriver = state._chosenRole === "chauffeur";
  var h = '<div class="authwrap"><div class="authcard">' +
    '<h2 style="margin-top:0;">' + (isDriver ? "🚚 Profil chauffeur" : "📦 Profil client") + '</h2>' +
    '<input class="field" id="p-prenom" placeholder=tr("ph_prenom") />' +
    '<input class="field" id="p-nom" placeholder=tr("ph_nom") />' +
    '<input class="field" id="p-tel" placeholder=tr("ph_tel") />' +
    (isDriver ?
      '<input class="field" id="d-license" placeholder=tr("ph_license") />' +
      '<input class="field" id="d-plate" placeholder="Plaque d\'immatriculation" />' +
      '<select class="field" id="d-vehicle">' + Object.keys(VEHICLES).map(function (k) { return '<option value="' + k + '">' + VEHICLES[k] + '</option>'; }).join("") + '</select>'
    : '') +
    '<label class="muted" style="display:flex; align-items:center; gap:6px; margin-bottom:12px;"><input type="checkbox" id="p-verified" /> Je certifie mon identité (simulation de vérification)</label>' +
    '<button class="btn btn-outline" style="margin-bottom:10px;" onclick="state._chosenRole=null; render();">← Changer de rôle</button>' +
    '<button class="btn btn-amber" onclick="saveProfileToDb()">Continuer</button>' +
    (state.profileError ? '<div class="error">' + esc(state.profileError) + '</div>' : '') +
  '</div></div>';
  document.getElementById("app").innerHTML = h;
}

function driverOnboardingHtml() { return ""; }

function subtabsHtml(which) {
  if (which === "chauffeur") {
    return '<div class="subtabs">' +
      '<button class="' + (state.chauffeurSubTab === "mytrips" ? "active" : "") + '" onclick="state.chauffeurSubTab=\'mytrips\'; render();">' + tr("tab_mytrips") + '</button>' +
      '<button class="' + (state.chauffeurSubTab === "clientrequests" ? "active" : "") + '" onclick="state.chauffeurSubTab=\'clientrequests\'; render();">' + tr("tab_clientrequests") + '</button></div>';
  }
  return '<div class="subtabs">' +
    '<button class="' + (state.clientSubTab === "browse" ? "active" : "") + '" onclick="state.clientSubTab=\'browse\'; render();">' + tr("tab_trips") + '</button>' +
    '<button class="' + (state.clientSubTab === "reservations" ? "active" : "") + '" onclick="state.clientSubTab=\'reservations\'; render();">' + tr("tab_reservations") + '</button>' +
    '<button class="' + (state.clientSubTab === "requests" ? "active" : "") + '" onclick="state.clientSubTab=\'requests\'; render();">' + tr("tab_requests") + '</button></div>';
}

function renderChauffeur() {
  var h = subtabsHtml("chauffeur");
  if (state.chauffeurSubTab === "clientrequests") return h + renderClientRequestsForDrivers();
  return h + renderMyTrips();
}

function renderMyTrips() {
  var name = myId();
  var myTrips = state.trips.filter(function (t) { return t.driver_id === name; });
  var myRes = state.reservations.filter(function (r) { var t = tripOf(r.trip_id); return t && t.driver_id === name; });
  var m3Valides = myRes.filter(function (r) { return r.status === "validee" || r.status === "en_route" || r.status === "terminee"; }).reduce(function (a, r) { return a + r.m3; }, 0);
  var stats = driverStats(name);

  var h = '<div class="stats">' +
    '<div class="stat"><div class="num">' + myTrips.length + '</div><div class="lbl">Trajets publiés</div></div>' +
    '<div class="stat"><div class="num">' + m3Valides + ' m³</div><div class="lbl">Chargement validé</div></div>' +
    '<div class="stat"><div class="num">' + (stats.avg ? stats.avg.toFixed(1) + ' ★' : "—") + '</div><div class="lbl">' + (stats.count ? stats.count + ' avis' : "aucun avis") + '</div></div></div>';
  if (stats.delivered > 0) h += '<div style="margin:-4px 0 14px;">' + stats.delivered + ' livraisons effectuées ' + tierBadge(stats.delivered) + '</div>';

  h += '<div class="toprow"><h2 style="margin:0;">' + tr("my_trips") + '</h2><button class="btn btn-dark" onclick="toggleNewTrip()">' + tr("publish_trip") + '</button></div>';

  if (state.showNewTrip) {
    h += '<div class="card">' +
      '<div class="addr-wrap"><div class="addr-row">' +
        '<input class="field" id="f-origin" placeholder=tr("ph_origin") value="' + esc(state._origin||"") + '" oninput="onAddressInput(\'f-origin\')" onblur="hideSuggestionsLater(\'f-origin\')" autocomplete="off" />' +
        '<button type="button" class="geo-btn" title="Utiliser ma position" onclick="useMyLocation(\'f-origin\', this)">📍</button></div>' +
      '<div class="suggestions" id="sugg-f-origin"></div></div>' +
      '<div class="addr-wrap"><input class="field" id="f-dest" placeholder=tr("ph_dest") value="' + esc(state._dest||"") + '" oninput="onAddressInput(\'f-dest\')" onblur="hideSuggestionsLater(\'f-dest\')" autocomplete="off" />' +
        '<div class="suggestions" id="sugg-f-dest"></div></div>' +
      '<div id="route-map"></div><div id="route-info" class="muted"></div>' +
      '<div class="grid2">' +
        '<input class="field" id="f-date" type="date" value="' + esc(state._date||"") + '" />' +
        '<select class="field" id="f-vehicle">' + Object.keys(VEHICLES).map(function (k) { return '<option value="' + k + '"' + (state._vehicle === k ? " selected" : "") + '>' + VEHICLES[k] + '</option>'; }).join("") + '</select>' +
      '</div>' +
      '<input class="field" id="f-cap" type="number" min="0" placeholder="' + tr("ph_capacity") + '" value="' + esc(state._cap||"") + '" />' +
      '<input class="field" id="f-price" type="number" min="0" placeholder="' + tr("ph_price") + '" value="' + esc(state._price||"") + '" />' +
      '<button class="btn btn-amber" onclick="publishTrip()"">' + tr("publish_btn") + '</button>' +
      (state.tripError ? '<div class="error">' + esc(state.tripError) + '</div>' : '') + '</div>';
  }

  if (myTrips.length === 0) h += '<p class="muted">Aucun trajet publié pour l\'instant.</p>';
  myTrips.forEach(function (t) {
    var tripRes = state.reservations.filter(function (r) { return r.trip_id === t.id; });
    h += '<div class="card"><div class="flexwrap">' +
        '<div><b>' + esc(t.origin) + ' → ' + esc(t.destination) + '</b> <span class="muted">· ' + esc(t.date) + ' · ' + vehicleLabel(t.vehicle_type) + '</span><div>' + routeBadgeHtml(t) + '</div></div>' +
        '<div class="muted">' + t.remaining + ' / ' + t.capacity + ' ' + tr("m3_available") + (t.price ? ' · ' + t.price + '/m³' : '') + '</div></div>';
    if (tripRes.length > 0) {
      h += '<div class="reslist">';
      tripRes.forEach(function (r) {
        var cp = profileById(r.client_id);
        h += '<div class="resitem"><div class="flexwrap">' +
            '<div><b>' + esc(displayName(cp)) + '</b> ' + verifiedTag(cp) + ' demande ' + r.m3 + ' m³</div>' +
            '<div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">' + badge(r.status) +
              (r.status === "en_attente" ? '<button class="btn-ok" onclick="decide(\'' + r.id + '\',\'validee\')"">' + tr("validate_btn") + '</button><button class="btn-no" onclick="decide(\'' + r.id + '\',\'refusee\')"">' + tr("refuse_btn") + '</button>' : '') +
              (r.status === "validee" ? '<button class="btn-purple" onclick="startTrip(\'' + r.id + '\')">▶ Démarrer le trajet</button>' : '') +
              (r.status === "en_route" ? '<button class="btn-info" onclick="decide(\'' + r.id + '\',\'terminee\')"">' + tr("mark_delivered") + '</button>' : '') +
              chatBtnHtml("reservation", r.id, displayName(cp)) + '</div></div>' +
          ((r.status === "validee" || r.status === "en_route" || r.status === "terminee") ? '<div class="contact">📞 Contact client : ' + esc(cp ? cp.tel : "") + '</div>' : '') +
          progressHtml(r) + '</div>';
      });
      h += '</div>';
    }
    h += '</div>';
  });
  return h;
}

function renderClientRequestsForDrivers() {
  var name = myId();
  var open = state.requests.filter(function (r) { return r.status === "ouverte"; });
  var h = '<h2>' + tr("driver_requests_title") + '</h2>';
  if (open.length === 0) h += '<p class="muted">Aucune demande ouverte pour l\'instant.</p>';
  open.forEach(function (rq) {
    var cp = profileById(rq.client_id);
    var myOffer = state.offers.find(function (o) { return o.request_id === rq.id && o.driver_id === name; });
    h += '<div class="card"><div class="flexwrap"><div>' +
        '<div><b>' + esc(rq.origin) + ' → ' + esc(rq.destination) + '</b></div>' +
        '<div class="muted">' + esc(rq.date) + ' · ' + rq.m3_needed + ' ' + tr("m3_wanted") + ' · ' + esc(displayName(cp)) + ' ' + verifiedTag(cp) + '</div>' +
        (rq.note ? '<div class="muted" style="margin-top:3px;">"' + esc(rq.note) + '"</div>' : '') +
        '<div>' + routeBadgeHtml(rq) + '</div></div>' +
        (myOffer ? badge(myOffer.status) : '<div><select class="field" style="width:auto; display:inline-block; margin:0 6px 0 0;" id="veh-' + rq.id + '">' + Object.keys(VEHICLES).map(function (k) { return '<option value="' + k + '">' + VEHICLES[k] + '</option>'; }).join("") + '</select><button class="btn btn-amber" style="width:auto;" onclick="offerOnRequest(\'' + rq.id + '\')"">' + tr("im_interested") + '</button></div>') +
      '</div>';
    if (myOffer) {
      h += ((myOffer.status === "acceptee") ? '<div class="contact">📞 Contact client : ' + esc(cp ? cp.tel : "") + '</div>' : '') +
        '<div style="margin-top:8px;">' + chatBtnHtml("offer", myOffer.id, displayName(cp)) + '</div>';
    }
    h += '</div>';
  });
  return h;
}

function renderClient() {
  var h = subtabsHtml("client");
  if (state.clientSubTab === "requests") return h + renderMyRequests();
  if (state.clientSubTab === "reservations") return h + renderMyReservationsOnly();
  return h + renderBrowseTrips();
}

function renderBrowseTrips() {
  var h = '<input class="field" id="searchInput" placeholder="Rechercher un trajet (ville de départ ou d\'arrivée)" value="' + esc(state.search) + '" oninput="state.search=this.value; state.tripsPage=1; render(); var el=document.getElementById(\'searchInput\'); el.focus(); el.selectionStart=el.value.length;" />';
  h += '<div class="toprow"><h2 style="margin:0;">' + tr("trips_available") + '</h2>' +
    '<select class="field" style="width:auto; margin:0;" onchange="state.sortBy=this.value; state.tripsPage=1; render();">' +
      '<option value="date"' + (state.sortBy === "date" ? " selected" : "") + '>Trier : date</option>' +
      '<option value="prix"' + (state.sortBy === "prix" ? " selected" : "") + '>Trier : prix</option>' +
      '<option value="capacite"' + (state.sortBy === "capacite" ? " selected" : "") + '>Trier : capacité dispo</option></select></div>';

  var available = state.trips.filter(function (t) { return t.remaining > 0; }).filter(function (t) { if (!state.search.trim()) return true; return (t.origin + t.destination).toLowerCase().indexOf(state.search.trim().toLowerCase()) !== -1; });
  available = available.slice().sort(function (a, b) { if (state.sortBy === "prix") return (a.price||0) - (b.price||0); if (state.sortBy === "capacite") return b.remaining - a.remaining; return new Date(a.date) - new Date(b.date); });

  var totalPages = Math.max(1, Math.ceil(available.length / state.tripsPageSize));
  if (state.tripsPage > totalPages) state.tripsPage = totalPages;
  var pageItems = available.slice((state.tripsPage - 1) * state.tripsPageSize, state.tripsPage * state.tripsPageSize);

  if (available.length === 0) h += '<p class="muted">' + tr("no_trips") + '</p>';
  pageItems.forEach(function (t) {
    var dp = profileById(t.driver_id);
    var stats = driverStats(t.driver_id);
    var isOpen = state.expandedTrip === t.id;
    h += '<div class="card trip-row" style="' + (isOpen ? 'border-color:var(--brand);' : '') + '" onclick="toggleTripExpand(\'' + t.id + '\')">' +
      '<div class="trip-row-line1"><span class="trip-row-route">' + esc(t.origin) + ' → ' + esc(t.destination) + '</span>' +
        (t.price ? '<span class="trip-row-price">' + t.price + '/m³</span>' : '<span class="trip-row-price muted">prix à discuter</span>') + '</div>' +
      '<div class="trip-row-line2"><div class="trip-row-line2-left">' +
        '<span class="avatar-sm">' + profileInitials(dp) + '</span>' +
        '<span>' + esc(t.date) + '</span>' +
        (stats.avg ? '<span>★ ' + stats.avg.toFixed(1) + '</span>' : '') +
      '</div><span class="muted">' + t.remaining + ' ' + tr("m3_available") + '</span></div>';
    if (isOpen) {
      h += '<div class="trip-details" onclick="event.stopPropagation();">' +
        '<div class="flexwrap" style="margin-bottom:8px;">' +
          '<span>' + esc(displayName(dp)) + ' ' + verifiedTag(dp) + ' ' + driverVerifiedTag(dp) + tierBadge(stats.delivered) + '</span>' +
          '<span class="muted">' + vehicleLabel(t.vehicle_type) + '</span>' +
        '</div>' +
        (t.distance_km ? '<div style="margin-bottom:8px;">' + routeBadgeHtml(t) + '</div>' : '') +
        (state.reserveFor === t.id ?
          '<input class="field" style="width:140px; display:inline-block;" id="f-m3" type="number" min="1" max="' + t.remaining + '" placeholder="' + tr("m3_wanted") + '" value="' + esc(state._reserveM3||"") + '" oninput="updateEstimate(this,' + (t.price||0) + ')" />' +
          ' <span class="muted" id="estimate-txt"></span><br/>' +
          '<button class="btn btn-amber" style="width:auto;" onclick="submitReservation(\'' + t.id + '\')"">' + tr("send_request") + '</button>' +
          (state.reserveError ? '<div class="error">' + esc(state.reserveError) + '</div>' : '')
        : '<button class="btn btn-dark" onclick="toggleReserve(\'' + t.id + '\')"">' + tr("reserve_btn") + '</button>') +
      '</div>';
    }
    h += '</div>';
  });

  if (available.length > state.tripsPageSize) {
    h += '<div class="pager">' +
      '<button ' + (state.tripsPage <= 1 ? "disabled" : "") + ' onclick="state.tripsPage--; render();">‹</button>' +
      '<span class="muted">Page ' + state.tripsPage + ' sur ' + totalPages + '</span>' +
      '<button ' + (state.tripsPage >= totalPages ? "disabled" : "") + ' onclick="state.tripsPage++; render();">›</button>' +
    '</div>';
  }
  return h;
}

function renderMyReservationsOnly() {
  var name = myId();
  var myRes = state.reservations.filter(function (r) { return r.client_id === name; });
  var h = '<h2 style="margin-top:0;">' + tr("my_reservations") + '</h2>';
  if (myRes.length === 0) { h += '<p class="muted">' + tr("no_reservations") + '</p>'; return h; }
  h += ratingHint();

  var totalPages = Math.max(1, Math.ceil(myRes.length / state.resPageSize));
  if (state.resPage > totalPages) state.resPage = totalPages;
  var pageItems = myRes.slice((state.resPage - 1) * state.resPageSize, state.resPage * state.resPageSize);

  pageItems.forEach(function (r) {
    var t = tripOf(r.trip_id); var dp = t ? profileById(t.driver_id) : null;
    var isOpen = state.expandedRes === r.id;
    h += '<div class="card trip-row" onclick="toggleResExpand(\'' + r.id + '\')">' +
      '<div class="trip-row-line1"><span class="trip-row-route">' + (t ? esc(t.origin) + ' → ' + esc(t.destination) : "Trajet supprimé") + '</span>' + badge(r.status) + '</div>' +
      '<div class="trip-row-line2"><div class="trip-row-line2-left">' +
        (dp ? '<span class="avatar-sm">' + profileInitials(dp) + '</span>' : '') +
        '<span>' + (t ? esc(t.date) : "") + '</span>' +
      '</div><span class="muted">' + r.m3 + ' m³</span></div>';
    if (isOpen) {
      h += '<div class="trip-details" onclick="event.stopPropagation();">' +
        ((r.status === "validee" || r.status === "en_route" || r.status === "terminee") && dp ? '<div class="contact">📞 Contact chauffeur : ' + esc(dp.tel) + '</div>' : '') +
        (t ? '<div style="margin:6px 0;">' + routeBadgeHtml(t) + '</div>' : '') +
        progressHtml(r) +
        (r.status === "terminee" ? co2Html(r, t) + ratingWidget(r) : '') +
        '<div class="flexwrap" style="margin-top:8px;">' +
          (r.status === "en_attente" ? '<button class="btn-outline" onclick="decide(\'' + r.id + '\',\'annulee\')"">' + tr("cancel_btn") + '</button>' : '<span></span>') +
          chatBtnHtml("reservation", r.id, dp ? displayName(dp) : "Chauffeur") +
        '</div>' +
      '</div>';
    }
    h += '</div>';
  });

  if (myRes.length > state.resPageSize) {
    h += '<div class="pager">' +
      '<button ' + (state.resPage <= 1 ? "disabled" : "") + ' onclick="state.resPage--; render();">‹</button>' +
      '<span class="muted">Page ' + state.resPage + ' sur ' + totalPages + '</span>' +
      '<button ' + (state.resPage >= totalPages ? "disabled" : "") + ' onclick="state.resPage++; render();">›</button>' +
    '</div>';
  }
  return h;
}

function renderMyRequests() {
  var name = myId();
  var h = '<div class="toprow"><h2 style="margin:0;">' + tr("my_requests_title") + '</h2><button class="btn btn-dark" onclick="toggleNewRequest()">' + tr("post_request") + '</button></div>';

  if (state.showNewRequest) {
    h += '<div class="card">' +
      '<div class="addr-wrap"><div class="addr-row">' +
        '<input class="field" id="r-origin" placeholder=tr("ph_origin") value="' + esc(state._rOrigin||"") + '" oninput="onAddressInput(\'r-origin\')" onblur="hideSuggestionsLater(\'r-origin\')" autocomplete="off" />' +
        '<button type="button" class="geo-btn" title="Utiliser ma position" onclick="useMyLocation(\'r-origin\', this)">📍</button></div>' +
      '<div class="suggestions" id="sugg-r-origin"></div></div>' +
      '<div class="addr-wrap"><input class="field" id="r-dest" placeholder=tr("ph_dest") value="' + esc(state._rDest||"") + '" oninput="onAddressInput(\'r-dest\')" onblur="hideSuggestionsLater(\'r-dest\')" autocomplete="off" />' +
        '<div class="suggestions" id="sugg-r-dest"></div></div>' +
      '<div id="route-map"></div><div id="route-info" class="muted"></div>' +
      '<input class="field" id="r-date" type="date" value="' + esc(state._rDate||"") + '" />' +
      '<input class="field" id="r-m3" type="number" min="1" placeholder="' + tr("ph_m3_needed") + '" value="' + esc(state._rM3||"") + '" />' +
      '<input class="field" id="r-note" placeholder=tr("ph_note") value="' + esc(state._rNote||"") + '" />' +
      '<button class="btn btn-amber" onclick="publishRequest()">Publier la demande</button>' +
      (state.reqError ? '<div class="error">' + esc(state.reqError) + '</div>' : '') + '</div>';
  }

  var myReq = state.requests.filter(function (r) { return r.client_id === name; });
  if (myReq.length === 0) h += '<p class="muted">Aucune demande postée pour l\'instant. Publie une demande pour que des chauffeurs disponibles te contactent directement.</p>';
  myReq.forEach(function (rq) {
    h += '<div class="card"><div class="flexwrap"><div><b>' + esc(rq.origin) + ' → ' + esc(rq.destination) + '</b> <span class="muted">· ' + esc(rq.date) + ' · ' + rq.m3_needed + ' m³</span><div>' + routeBadgeHtml(rq) + '</div></div>' + badge(rq.status) + '</div>';
    var myOffers = state.offers.filter(function (o) { return o.request_id === rq.id; });
    if (myOffers.length === 0) h += '<p class="muted" style="margin-top:8px;">Aucune proposition de chauffeur pour l\'instant.</p>';
    else {
      h += '<div class="reslist">';
      myOffers.forEach(function (o) {
        var dp = profileById(o.driver_id);
        h += '<div class="resitem"><div class="flexwrap"><div><b>' + esc(displayName(dp)) + '</b> ' + verifiedTag(dp) + ' ' + driverVerifiedTag(dp) + ' · ' + vehicleLabel(o.vehicle_type) + '</div>' +
            '<div style="display:flex; gap:6px; align-items:center;">' + badge(o.status) +
              (o.status === "proposee" ? '<button class="btn-ok" onclick="acceptOffer(\'' + rq.id + '\',\'' + o.id + '\')"">' + tr("accept_btn") + '</button>' : '') +
              chatBtnHtml("offer", o.id, displayName(dp)) + '</div></div>' +
          (o.status === "acceptee" ? '<div class="contact">📞 Contact chauffeur : ' + esc(dp ? dp.tel : "") + '</div>' : '') + '</div>';
      });
      h += '</div>';
    }
    h += '</div>';
  });
  return h;
}

function updateEstimate(input, price) {
  var span = document.getElementById("estimate-txt"); var m3 = Number(input.value); if (!span) return;
  span.textContent = (price && m3 > 0) ? ("≈ " + (m3 * price).toLocaleString() + " estimé") : "";
}

// ================= actions =================
function toggleNewTrip() {
  state.showNewTrip = !state.showNewTrip; state.tripError = ""; coords = { origin: null, dest: null }; routeInfo = null; render();
}
function toggleReserve(id) { state.reserveFor = state.reserveFor === id ? null : id; state.reserveError = ""; render(); }
function toggleTripExpand(id) { state.expandedTrip = state.expandedTrip === id ? null : id; if (state.expandedTrip !== id) { state.reserveFor = null; } render(); }
function toggleResExpand(id) { state.expandedRes = state.expandedRes === id ? null : id; render(); }
function toggleNewRequest() { state.showNewRequest = !state.showNewRequest; state.reqError = ""; coords = { origin: null, dest: null }; routeInfo = null; render(); }

async function publishTrip() {
  state._origin = document.getElementById("f-origin").value;
  state._dest = document.getElementById("f-dest").value;
  state._date = document.getElementById("f-date").value;
  state._cap = document.getElementById("f-cap").value;
  state._price = document.getElementById("f-price").value;
  state._vehicle = document.getElementById("f-vehicle").value;
  if (!state._origin || !state._dest || !state._date || !state._cap) { state.tripError = "Départ, arrivée, date et capacité sont obligatoires."; render(); return; }
  var row = {
    driver_id: myId(), origin: state._origin.trim(), destination: state._dest.trim(), date: state._date, vehicle_type: state._vehicle,
    capacity: Number(state._cap), remaining: Number(state._cap), price: state._price ? Number(state._price) : null,
    origin_lat: coords.origin ? coords.origin.lat : null, origin_lon: coords.origin ? coords.origin.lon : null,
    dest_lat: coords.dest ? coords.dest.lat : null, dest_lon: coords.dest ? coords.dest.lon : null,
    distance_km: routeInfo ? routeInfo.distanceKm : null, duration_min: routeInfo ? routeInfo.durationMin : null
  };
  var { error } = await sb.from("trips").insert(row);
  if (error) { state.tripError = error.message; render(); return; }
  state.showNewTrip = false; state.tripError = "";
  state._origin = state._dest = state._date = state._cap = state._price = "";
  coords = { origin: null, dest: null }; routeInfo = null;
  await loadAllData(); render(); showToast("Trajet publié 🚚", "ok");
}

async function submitReservation(tripId) {
  var t = tripOf(tripId);
  state._reserveM3 = document.getElementById("f-m3").value;
  if (!state._reserveM3 || Number(state._reserveM3) <= 0) { state.reserveError = "Indiquez un nombre de m³ valide."; render(); return; }
  if (Number(state._reserveM3) > t.remaining) { state.reserveError = "Seulement " + t.remaining + " m³ disponibles sur ce trajet."; render(); return; }
  var { error } = await sb.from("reservations").insert({ trip_id: tripId, client_id: myId(), m3: Number(state._reserveM3), status: "en_attente" });
  if (error) { state.reserveError = error.message; render(); return; }
  state.reserveFor = null; state.reserveError = ""; state._reserveM3 = "";
  await loadAllData(); render(); showToast("Demande envoyée", "ok");
}

async function decide(resId, status) {
  var r = state.reservations.find(function (x) { return x.id === resId; });
  var wasValidated = r.status === "validee" || r.status === "en_route" || r.status === "terminee";
  var { error } = await sb.from("reservations").update({ status: status }).eq("id", resId);
  if (error) { showToast(error.message, "err"); return; }
  if (status === "validee" && !wasValidated) {
    var t = tripOf(r.trip_id);
    await sb.from("trips").update({ remaining: Math.max(0, t.remaining - r.m3) }).eq("id", t.id);
  }
  await loadAllData(); render();
  var labels = { validee: "Réservation validée ✅", refusee: "Réservation refusée", terminee: "Livraison marquée 📦", annulee: "Réservation annulée" };
  showToast(labels[status] || "Mis à jour");
}
async function rateReservation(resId, stars) {
  var { error } = await sb.from("reservations").update({ rating: stars }).eq("id", resId);
  if (error) { showToast(error.message, "err"); return; }
  await loadAllData(); render(); showToast("Merci pour votre avis ⭐");
}

async function publishRequest() {
  state._rOrigin = document.getElementById("r-origin").value;
  state._rDest = document.getElementById("r-dest").value;
  state._rDate = document.getElementById("r-date").value;
  state._rM3 = document.getElementById("r-m3").value;
  state._rNote = document.getElementById("r-note").value;
  if (!state._rOrigin || !state._rDest || !state._rDate || !state._rM3) { state.reqError = "Départ, arrivée, date et m³ sont obligatoires."; render(); return; }
  var row = {
    client_id: myId(), origin: state._rOrigin.trim(), destination: state._rDest.trim(), date: state._rDate, m3_needed: Number(state._rM3), note: state._rNote.trim(),
    origin_lat: coords.origin ? coords.origin.lat : null, origin_lon: coords.origin ? coords.origin.lon : null,
    dest_lat: coords.dest ? coords.dest.lat : null, dest_lon: coords.dest ? coords.dest.lon : null,
    distance_km: routeInfo ? routeInfo.distanceKm : null, duration_min: routeInfo ? routeInfo.durationMin : null, status: "ouverte"
  };
  var { error } = await sb.from("requests").insert(row);
  if (error) { state.reqError = error.message; render(); return; }
  state.showNewRequest = false; state.reqError = "";
  state._rOrigin = state._rDest = state._rDate = state._rM3 = state._rNote = "";
  coords = { origin: null, dest: null }; routeInfo = null;
  await loadAllData(); render(); showToast("Demande publiée 📢", "ok");
}
async function offerOnRequest(reqId) {
  var vehSel = document.getElementById("veh-" + reqId);
  var vehicle = vehSel ? vehSel.value : "bache";
  var { error } = await sb.from("request_offers").insert({ request_id: reqId, driver_id: myId(), vehicle_type: vehicle, status: "proposee" });
  if (error) { showToast(error.message, "err"); return; }
  await loadAllData(); render(); showToast("Proposition envoyée");
}
async function acceptOffer(reqId, offerId) {
  var offersForReq = state.offers.filter(function (o) { return o.request_id === reqId; });
  await Promise.all(offersForReq.map(function (o) {
    var newStatus = (o.id === offerId) ? "acceptee" : (o.status === "proposee" ? "refusee" : o.status);
    return sb.from("request_offers").update({ status: newStatus }).eq("id", o.id);
  }));
  await sb.from("requests").update({ status: "prise_en_charge" }).eq("id", reqId);
  await loadAllData(); render(); showToast("Chauffeur accepté ✅", "ok");
}

// ================= init =================
if ("serviceWorker" in navigator) {
  window.addEventListener("load", function () { navigator.serviceWorker.register("sw.js").catch(function () {}); });
}
document.documentElement.setAttribute("lang", state.lang);
document.documentElement.setAttribute("dir", state.lang === "ar" ? "rtl" : "ltr");
document.getElementById("langSelect").value = state.lang;
initAuth();
