import "./style.css";
import { auth as fbAuth, db as fbDb } from "./firebase";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "firebase/auth";
import { ref, set, update, get } from "firebase/database";
const API = import.meta.env?.VITE_API_URL || "";
async function getIP() {
    try {
        const r = await fetch("https://api.ipify.org?format=json");
        const j = await r.json();
        return j.ip || "unknown";
    }
    catch {
        return "unknown";
    }
}
function toEmail(username) {
    const clean = username.toLowerCase().replace(/[^a-z0-9._-]/g, "_");
    return `${clean}@mavimesaj.local`;
}
// DOM
const authView = document.getElementById("authView");
const appView = document.getElementById("appView");
const topbarRight = document.getElementById("topbarRight");
const topUser = document.getElementById("topUser");
const tabLogin = document.getElementById("tabLogin");
const tabRegister = document.getElementById("tabRegister");
const authForm = document.getElementById("authForm");
const inpUser = document.getElementById("inpUser");
const inpPass = document.getElementById("inpPass");
const btnAuth = document.getElementById("btnAuth");
const authError = document.getElementById("authError");
const btnLogout = document.getElementById("btnLogout");
const btnToggleSidebar = document.getElementById("btnToggleSidebar");
const btnSwapSidebar = document.getElementById("btnSwapSidebar");
const sidebarHandle = document.getElementById("sidebarHandle");
const myAvatar = document.getElementById("myAvatar");
const myAvatarImg = document.getElementById("myAvatarImg");
const btnAvatar = document.getElementById("btnAvatar");
const inpAvatar = document.getElementById("inpAvatar");
const myName = document.getElementById("myName");
const btnChangeAvatar = document.getElementById("btnChangeAvatar");
const btnRemoveAvatar = document.getElementById("btnRemoveAvatar");
const avatarModal = document.getElementById("avatarModal");
const avatarPromptView = document.getElementById("avatarPromptView");
const avatarEditorView = document.getElementById("avatarEditorView");
const avatarBackdrop = document.getElementById("avatarBackdrop");
const btnAvatarNow = document.getElementById("btnAvatarNow");
const btnAvatarLater = document.getElementById("btnAvatarLater");
const editorFrame = document.getElementById("editorFrame");
const editorImg = document.getElementById("editorImg");
const zoomRange = document.getElementById("zoomRange");
const zoomVal = document.getElementById("zoomVal");
const btnEditorCancel = document.getElementById("btnEditorCancel");
const btnEditorSave = document.getElementById("btnEditorSave");
const myCode = document.getElementById("myCode");
const btnCopyCode = document.getElementById("btnCopyCode");
const inpFriendCode = document.getElementById("inpFriendCode");
const btnAddFriend = document.getElementById("btnAddFriend");
const addFriendMsg = document.getElementById("addFriendMsg");
const inpSearch = document.getElementById("inpSearch");
const friendList = document.getElementById("friendList");
const friendCount = document.getElementById("friendCount");
const onlineInfo = document.getElementById("onlineInfo");
const chatEmpty = document.getElementById("chatEmpty");
const chatActive = document.getElementById("chatActive");
const peerAvatar = document.getElementById("peerAvatar");
const peerAvatarText = document.getElementById("peerAvatarText");
const peerAvatarImg = document.getElementById("peerAvatarImg");
const peerName = document.getElementById("peerName");
const peerStatus = document.getElementById("peerStatus");
const messagesEl = document.getElementById("messages");
const msgForm = document.getElementById("msgForm");
const inpMsg = document.getElementById("inpMsg");
const btnVoiceCall = document.getElementById("btnVoiceCall");
const btnVideoCall = document.getElementById("btnVideoCall");
const callModal = document.getElementById("callModal");
const callTitle = document.getElementById("callTitle");
const callTimer = document.getElementById("callTimer");
const remoteVideo = document.getElementById("remoteVideo");
const localVideo = document.getElementById("localVideo");
const audioOnly = document.getElementById("audioOnly");
const callAvatar = document.getElementById("callAvatar");
const callPeerName = document.getElementById("callPeerName");
const callState = document.getElementById("callState");
const btnMute = document.getElementById("btnMute");
const btnCam = document.getElementById("btnCam");
const btnEndCall = document.getElementById("btnEndCall");
const btnSpeaker = document.getElementById("btnSpeaker");
const callInfo = document.getElementById("callInfo");
const incomingToast = document.getElementById("incomingToast");
const incomingAvatar = document.getElementById("incomingAvatar");
const incomingName = document.getElementById("incomingName");
const incomingType = document.getElementById("incomingType");
const btnAcceptCall = document.getElementById("btnAcceptCall");
const btnRejectCall = document.getElementById("btnRejectCall");
const toastEl = document.getElementById("toast");
let token = localStorage.getItem("mavi_token");
let me = null;
let friends = [];
let selected = null;
let messages = [];
let ws = null;
let mode = "login";
let pc = null;
let localStream = null;
let callWith = null;
let callType = null;
let timerInterval = null;
let callStart = 0;
let pendingOffer = null;
// Helpers
function toast(msg, ms = 2500) {
    toastEl.textContent = msg;
    toastEl.classList.remove("hidden");
    setTimeout(() => toastEl.classList.add("hidden"), ms);
}
function initials(name) { return name.slice(0, 2).toUpperCase(); }
function fmtTime(iso) {
    const d = new Date(iso);
    return d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
}
function setAuthMode(m) {
    mode = m;
    tabLogin.classList.toggle("active", m === "login");
    tabRegister.classList.toggle("active", m === "register");
    btnAuth.textContent = m === "login" ? "Giriş Yap" : "Hesap Oluştur";
}
tabLogin.onclick = () => setAuthMode("login");
tabRegister.onclick = () => setAuthMode("register");
async function api(path, opts = {}) {
    const headers = { "Content-Type": "application/json", ...opts.headers };
    if (token)
        headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(`${API}${path}`, { ...opts, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok)
        throw new Error(data.error || `Hata ${res.status}`);
    return data;
}
// Sidebar ayarlanabilir
function initSidebar() {
    const savedWidth = localStorage.getItem("mavi_sidebar_width");
    if (savedWidth)
        document.documentElement.style.setProperty("--sidebar-width", savedWidth + "px");
    const pos = localStorage.getItem("mavi_sidebar_pos");
    if (pos === "right")
        appView.classList.add("sidebar-right");
    const collapsed = localStorage.getItem("mavi_sidebar_collapsed") === "1";
    if (collapsed)
        appView.classList.add("sidebar-collapsed");
}
initSidebar();
btnToggleSidebar.onclick = () => {
    appView.classList.toggle("sidebar-collapsed");
    localStorage.setItem("mavi_sidebar_collapsed", appView.classList.contains("sidebar-collapsed") ? "1" : "0");
};
btnSwapSidebar.onclick = () => {
    appView.classList.toggle("sidebar-right");
    localStorage.setItem("mavi_sidebar_pos", appView.classList.contains("sidebar-right") ? "right" : "left");
    toast(appView.classList.contains("sidebar-right") ? "Menü sağa alındı" : "Menü sola alındı");
};
let dragging = false;
sidebarHandle.addEventListener("mousedown", (e) => {
    dragging = true;
    document.body.style.cursor = "col-resize";
    e.preventDefault();
});
window.addEventListener("mousemove", (e) => {
    if (!dragging)
        return;
    const isRight = appView.classList.contains("sidebar-right");
    let newWidth;
    if (isRight)
        newWidth = window.innerWidth - e.clientX;
    else
        newWidth = e.clientX;
    newWidth = Math.max(240, Math.min(480, newWidth));
    document.documentElement.style.setProperty("--sidebar-width", newWidth + "px");
});
window.addEventListener("mouseup", () => {
    if (dragging) {
        dragging = false;
        document.body.style.cursor = "";
        const w = getComputedStyle(document.documentElement).getPropertyValue("--sidebar-width");
        localStorage.setItem("mavi_sidebar_width", parseInt(w).toString());
    }
});
// Profil fotoğrafı ve ayarlanabilir editör
function avatarKey(username) { return `mavi_avatar_${username}`; }
function loadMyAvatar() {
    if (!me)
        return;
    const data = localStorage.getItem(avatarKey(me.username));
    if (data) {
        myAvatarImg.src = data;
        myAvatarImg.classList.remove("hidden");
        myAvatar.classList.add("hidden");
        btnAvatar.style.background = "transparent";
        btnRemoveAvatar.classList.remove("hidden");
    }
    else if (fbAuth.currentUser) {
        get(ref(fbDb, `users/${fbAuth.currentUser.uid}/avatar`)).then(s => {
            const v = s.val();
            if (v) {
                localStorage.setItem(avatarKey(me.username), v);
                myAvatarImg.src = v;
                myAvatarImg.classList.remove("hidden");
                myAvatar.classList.add("hidden");
                btnAvatar.style.background = "transparent";
                btnRemoveAvatar.classList.remove("hidden");
            }
            else {
                btnRemoveAvatar.classList.add("hidden");
            }
        }).catch(() => { });
    }
    else {
        btnRemoveAvatar.classList.add("hidden");
    }
}
function getAvatarFor(username) {
    return localStorage.getItem(avatarKey(username));
}
function updatePeerAvatar(username) {
    const data = getAvatarFor(username);
    if (data) {
        peerAvatarImg.src = data;
        peerAvatarImg.classList.remove("hidden");
        peerAvatarText.classList.add("hidden");
        peerAvatar.style.background = "transparent";
    }
    else {
        peerAvatarImg.classList.add("hidden");
        peerAvatarText.classList.remove("hidden");
        peerAvatarText.textContent = initials(username);
        peerAvatar.style.background = "";
    }
}
// Avatar modal - soru ve ayarlama (tam oturan)
let editorState = { scale: 1, x: 0, y: 0, dragging: false, startX: 0, startY: 0, naturalW: 0, naturalH: 0, minScale: 1 };
function openAvatarPrompt() {
    avatarPromptView.classList.remove("hidden");
    avatarEditorView.classList.add("hidden");
    avatarModal.classList.remove("hidden");
}
function closeAvatarModal() {
    avatarModal.classList.add("hidden");
}
function openEditorWithDataUrl(dataUrl) {
    avatarPromptView.classList.add("hidden");
    avatarEditorView.classList.remove("hidden");
    avatarModal.classList.remove("hidden");
    editorImg.onload = () => {
        editorState.naturalW = editorImg.naturalWidth;
        editorState.naturalH = editorImg.naturalHeight;
        const frame = 220;
        // tam kaplama için en küçük ölçek
        const scaleFit = Math.max(frame / editorState.naturalW, frame / editorState.naturalH);
        editorState.minScale = scaleFit;
        editorState.scale = scaleFit;
        // tam ortala
        editorState.x = (frame - editorState.naturalW * editorState.scale) / 2;
        editorState.y = (frame - editorState.naturalH * editorState.scale) / 2;
        // img boyutunu doğal boyuta sabitle, transform ile ölçekle
        editorImg.style.width = editorState.naturalW + "px";
        editorImg.style.height = editorState.naturalH + "px";
        zoomRange.min = String(scaleFit);
        zoomRange.max = String(scaleFit * 3);
        zoomRange.step = "0.01";
        zoomRange.value = String(scaleFit);
        applyEditorTransform();
    };
    editorImg.src = dataUrl;
}
function applyEditorTransform() {
    // tam piksel hizalama için translate + scale ayrı
    editorImg.style.transform = `translate(${editorState.x}px, ${editorState.y}px) scale(${editorState.scale})`;
    editorImg.style.transformOrigin = "top left";
    const pct = Math.round((editorState.scale / editorState.minScale) * 100);
    zoomVal.textContent = pct + "%";
    // sınırları uygula
    clampEditorPos();
}
function clampEditorPos() {
    const frame = 220;
    const w = editorState.naturalW * editorState.scale;
    const h = editorState.naturalH * editorState.scale;
    const minX = Math.min(0, frame - w);
    const minY = Math.min(0, frame - h);
    const maxX = 0;
    const maxY = 0;
    editorState.x = Math.max(minX, Math.min(maxX, editorState.x));
    editorState.y = Math.max(minY, Math.min(maxY, editorState.y));
}
function saveEditor() {
    if (!me || !editorImg.src)
        return;
    const frame = 220;
    const dpr = 2;
    const canvas = document.createElement("canvas");
    canvas.width = frame * dpr;
    canvas.height = frame * dpr;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    // tam oturan kare - beyaz dolgu sonra tam kaplama
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, frame, frame);
    // doğrudan çiz, köşe yuvarlama CSS'de yapılacak
    ctx.drawImage(editorImg, editorState.x, editorState.y, editorState.naturalW * editorState.scale, editorState.naturalH * editorState.scale);
    const out = canvas.toDataURL("image/jpeg", 0.88);
    localStorage.setItem(avatarKey(me.username), out);
    localStorage.setItem(`mavi_avatar_global_${me.username}`, out);
    myAvatarImg.src = out;
    myAvatarImg.classList.remove("hidden");
    myAvatar.classList.add("hidden");
    btnAvatar.style.background = "transparent";
    btnRemoveAvatar.classList.remove("hidden");
    if (fbAuth.currentUser) {
        update(ref(fbDb, `users/${fbAuth.currentUser.uid}`), { avatar: out }).catch(() => { });
        set(ref(fbDb, `avatars/${me.username}`), out).catch(() => { });
    }
    toast("Profil fotoğrafı kaydedildi");
    renderFriends();
    if (selected)
        updatePeerAvatar(selected);
    closeAvatarModal();
}
// Editor etkileşimleri - tam oturan sürükleme
editorFrame.addEventListener("mousedown", (e) => {
    editorState.dragging = true;
    editorState.startX = e.clientX - editorState.x;
    editorState.startY = e.clientY - editorState.y;
    editorFrame.style.cursor = "grabbing";
    e.preventDefault();
});
window.addEventListener("mousemove", (e) => {
    if (!editorState.dragging)
        return;
    editorState.x = e.clientX - editorState.startX;
    editorState.y = e.clientY - editorState.startY;
    clampEditorPos();
    applyEditorTransform();
});
window.addEventListener("mouseup", () => {
    if (editorState.dragging) {
        editorState.dragging = false;
        editorFrame.style.cursor = "grab";
    }
});
editorFrame.addEventListener("touchstart", (e) => {
    const t = e.touches[0];
    editorState.dragging = true;
    editorState.startX = t.clientX - editorState.x;
    editorState.startY = t.clientY - editorState.y;
}, { passive: true });
window.addEventListener("touchmove", (e) => {
    if (!editorState.dragging)
        return;
    const t = e.touches[0];
    editorState.x = t.clientX - editorState.startX;
    editorState.y = t.clientY - editorState.startY;
    clampEditorPos();
    applyEditorTransform();
}, { passive: true });
window.addEventListener("touchend", () => { editorState.dragging = false; });
zoomRange.addEventListener("input", () => {
    const newScale = parseFloat(zoomRange.value);
    const frame = 220;
    const oldScale = editorState.scale;
    // frame merkezinin img içindeki oranını koru
    const cx = (frame / 2 - editorState.x) / oldScale;
    const cy = (frame / 2 - editorState.y) / oldScale;
    editorState.scale = newScale;
    editorState.x = frame / 2 - cx * newScale;
    editorState.y = frame / 2 - cy * newScale;
    clampEditorPos();
    applyEditorTransform();
});
btnAvatarNow.onclick = () => { inpAvatar.click(); };
btnAvatarLater.onclick = () => closeAvatarModal();
btnEditorCancel.onclick = () => {
    // editörden prompta dön, eğer prompt kapalı ise sadece kapat
    if (!localStorage.getItem(avatarKey(me.username))) {
        avatarEditorView.classList.add("hidden");
        avatarPromptView.classList.remove("hidden");
    }
    else {
        closeAvatarModal();
    }
};
btnEditorSave.onclick = saveEditor;
avatarBackdrop.onclick = () => closeAvatarModal();
btnAvatar.onclick = () => {
    // direkt editör promptu aç, mevcut foto varsa editörle aç
    const existing = me ? getAvatarFor(me.username) : null;
    if (existing) {
        openEditorWithDataUrl(existing);
    }
    else {
        openAvatarPrompt();
    }
};
inpAvatar.onchange = () => {
    const file = inpAvatar.files?.[0];
    if (!file || !me)
        return;
    if (file.size > 5 * 1024 * 1024) {
        toast("Dosya 5 MB'den küçük olmalı");
        return;
    }
    if (!file.type.startsWith("image/")) {
        toast("Lütfen bir görsel seçin");
        return;
    }
    const reader = new FileReader();
    reader.onload = () => openEditorWithDataUrl(reader.result);
    reader.readAsDataURL(file);
    inpAvatar.value = "";
};
btnChangeAvatar.onclick = () => {
    // her zaman değiştirme imkanı - doğrudan dosya seçtir
    inpAvatar.click();
};
btnRemoveAvatar.onclick = async () => {
    if (!me)
        return;
    localStorage.removeItem(avatarKey(me.username));
    localStorage.removeItem(`mavi_avatar_global_${me.username}`);
    myAvatarImg.classList.add("hidden");
    myAvatarImg.removeAttribute("src");
    myAvatar.textContent = initials(me.username);
    myAvatar.classList.remove("hidden");
    btnAvatar.style.background = "";
    btnRemoveAvatar.classList.add("hidden");
    if (fbAuth.currentUser) {
        await update(ref(fbDb, `users/${fbAuth.currentUser.uid}`), { avatar: null }).catch(() => { });
        // @ts-ignore
        await set(ref(fbDb, `avatars/${me.username}`), null).catch(() => { });
    }
    toast("Profil fotoğrafı kaldırıldı");
    renderFriends();
    if (selected)
        updatePeerAvatar(selected);
};
async function checkAuth() {
    if (!token) {
        showAuth();
        return;
    }
    try {
        const data = await api("/api/auth/me");
        me = data;
        localStorage.setItem("mavi_user", JSON.stringify(me));
        showApp();
    }
    catch {
        token = null;
        localStorage.removeItem("mavi_token");
        showAuth();
    }
}
function showAuth() {
    authView.classList.remove("hidden");
    appView.classList.add("hidden");
    topbarRight.classList.add("hidden");
    me = null;
}
function showApp() {
    authView.classList.add("hidden");
    appView.classList.remove("hidden");
    topbarRight.classList.remove("hidden");
    if (me) {
        topUser.textContent = `@${me.username}`;
        const av = getAvatarFor(me.username);
        if (av) {
            myAvatarImg.src = av;
            myAvatarImg.classList.remove("hidden");
            myAvatar.classList.add("hidden");
            btnAvatar.style.background = "transparent";
            btnRemoveAvatar.classList.remove("hidden");
        }
        else {
            myAvatarImg.classList.add("hidden");
            myAvatar.textContent = initials(me.username);
            myAvatar.classList.remove("hidden");
            btnAvatar.style.background = "";
            btnRemoveAvatar.classList.add("hidden");
        }
        myName.textContent = me.username;
        myCode.textContent = me.friendCode;
        loadMyAvatar();
    }
    connectWS();
    loadFriends();
}
onAuthStateChanged(fbAuth, (u) => {
    if (u && me) {
        getIP().then(ip => {
            update(ref(fbDb, `users/${u.uid}`), { lastLogin: new Date().toISOString(), ip }).catch(() => { });
        });
    }
});
authForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    authError.classList.add("hidden");
    const username = inpUser.value.trim();
    const password = inpPass.value;
    if (!username || !password) {
        authError.textContent = "Kullanıcı adı ve şifre gerekli";
        authError.classList.remove("hidden");
        return;
    }
    if (username.length < 3) {
        authError.textContent = "Kullanıcı adı en az 3 karakter olmalı";
        authError.classList.remove("hidden");
        return;
    }
    const email = toEmail(username);
    btnAuth.disabled = true;
    btnAuth.textContent = "Bekleyin...";
    try {
        if (mode === "register") {
            let data = null;
            try {
                data = await api("/api/auth/register", { method: "POST", body: JSON.stringify({ username, password }) });
            }
            catch (e) {
                // zaten alınmış ise şifre doğruysa girişe yönlendir
                const m = String(e.message || "");
                if (m.includes("alınmış") || m.includes("409") || m.includes("zaten")) {
                    try {
                        const loginData = await api("/api/auth/login", { method: "POST", body: JSON.stringify({ username, password }) });
                        // Firebase'de de giriş dene
                        try {
                            const cred2 = await signInWithEmailAndPassword(fbAuth, email, password);
                            const ip2 = await getIP();
                            await update(ref(fbDb, `users/${cred2.user.uid}`), { username, email, ip: ip2, lastLogin: new Date().toISOString() }).catch(async () => {
                                await set(ref(fbDb, `users/${cred2.user.uid}`), { username, email, ip: ip2, lastLogin: new Date().toISOString() });
                            });
                        }
                        catch { }
                        token = loginData.token;
                        me = loginData.user;
                        localStorage.setItem("mavi_token", token);
                        localStorage.setItem("mavi_user", JSON.stringify(me));
                        toast("Bu kullanıcı adı zaten vardı, giriş yapıldı");
                        showApp();
                        return;
                    }
                    catch { }
                }
                throw e;
            }
            token = data.token;
            me = data.user;
            localStorage.setItem("mavi_token", token);
            localStorage.setItem("mavi_user", JSON.stringify(me));
            try {
                const cred = await createUserWithEmailAndPassword(fbAuth, email, password);
                const ip = await getIP();
                await set(ref(fbDb, `users/${cred.user.uid}`), {
                    username: me.username, email, friendCode: me.friendCode, ip,
                    createdAt: new Date().toISOString(), lastLogin: new Date().toISOString()
                });
            }
            catch (fbErr) {
                if (fbErr.code === "auth/email-already-in-use") {
                    try {
                        const cred = await signInWithEmailAndPassword(fbAuth, email, password);
                        const ip = await getIP();
                        await update(ref(fbDb, `users/${cred.user.uid}`), { username: me.username, email, ip, lastLogin: new Date().toISOString() }).catch(async () => {
                            await set(ref(fbDb, `users/${cred.user.uid}`), { username: me.username, email, friendCode: me.friendCode, ip, lastLogin: new Date().toISOString() });
                        });
                    }
                    catch { }
                }
                else if (fbErr.code) {
                    console.warn("Firebase:", fbErr);
                }
            }
            toast(`Hesap oluşturuldu. Kodun: ${me.friendCode}`);
            showApp();
            setTimeout(() => openAvatarPrompt(), 500);
        }
        else {
            // Giriş
            let fbOk = true;
            try {
                const cred = await signInWithEmailAndPassword(fbAuth, email, password);
                const ip = await getIP();
                await update(ref(fbDb, `users/${cred.user.uid}`), { username, email, ip, lastLogin: new Date().toISOString() }).catch(async () => {
                    await set(ref(fbDb, `users/${cred.user.uid}`), { username, email, ip, lastLogin: new Date().toISOString() });
                });
            }
            catch (fbErr) {
                // Firebase yoksa da backend ile devam et
                if (fbErr.code !== "auth/user-not-found" && fbErr.code !== "auth/invalid-credential" && fbErr.code !== "auth/wrong-password")
                    fbOk = false;
                // hata yine backend'e bırak
            }
            const data = await api("/api/auth/login", { method: "POST", body: JSON.stringify({ username, password }) });
            token = data.token;
            me = data.user;
            localStorage.setItem("mavi_token", token);
            localStorage.setItem("mavi_user", JSON.stringify(me));
            toast("Hoş geldin");
            showApp();
            // Firebase kaydı yoksa oluştur
            if (!fbOk) {
                try {
                    const c = await createUserWithEmailAndPassword(fbAuth, email, password);
                    const ip = await getIP();
                    await set(ref(fbDb, `users/${c.user.uid}`), { username: me.username, email, friendCode: me.friendCode, ip, lastLogin: new Date().toISOString() });
                }
                catch { }
            }
        }
    }
    catch (err) {
        let msg = String(err.message || "Bir hata oluştu");
        const code = String(err.code || "");
        if (msg.includes("alınmış") || msg.includes("409") || code.includes("already-in-use")) {
            msg = "Bu kullanıcı adı zaten alınmış. Giriş Yapmayı deneyin veya başka bir ad seçin.";
        }
        else if (code === "auth/invalid-email" || msg.includes("Geçersiz")) {
            msg = "Geçersiz kullanıcı adı. Sadece harf, rakam, _ . - kullanın.";
        }
        else if (code === "auth/weak-password" || msg.includes("zayıf")) {
            msg = "Şifre çok zayıf. En az 4 karakter girin.";
        }
        else if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found") || msg.includes("hatalı") || msg.includes("bulunamadı")) {
            msg = "Kullanıcı adı veya şifre hatalı.";
        }
        else if (msg.includes("Kullanıcı adı ve şifre gerekli")) {
            msg = "Kullanıcı adı ve şifre gerekli.";
        }
        authError.textContent = msg;
        authError.classList.remove("hidden");
    }
    finally {
        btnAuth.disabled = false;
        setAuthMode(mode);
    }
});
btnLogout.onclick = async () => {
    try {
        await signOut(fbAuth);
    }
    catch { }
    token = null;
    me = null;
    localStorage.removeItem("mavi_token");
    localStorage.removeItem("mavi_user");
    if (ws)
        ws.close();
    selected = null;
    showAuth();
    toast("Çıkış yapıldı");
};
btnCopyCode.onclick = async () => {
    if (!me)
        return;
    try {
        await navigator.clipboard.writeText(me.friendCode);
        toast(`Kod kopyalandı: ${me.friendCode}`);
    }
    catch {
        const ta = document.createElement("textarea");
        ta.value = me.friendCode;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
        toast("Kod kopyalandı");
    }
};
async function loadFriends() {
    try {
        const data = await api("/api/friends");
        friends = data;
        renderFriends();
    }
    catch (e) {
        console.error(e);
    }
}
function renderFriends() {
    const q = inpSearch.value.trim().toLowerCase();
    let list = friends;
    if (q)
        list = friends.filter(f => f.username.toLowerCase().includes(q) || f.friendCode.toLowerCase().includes(q));
    friendCount.textContent = String(friends.length);
    friendList.innerHTML = "";
    if (list.length === 0) {
        friendList.innerHTML = `<li style="padding:16px;text-align:center;color:var(--muted);font-size:13px">${q ? "Sonuç yok" : "Henüz arkadaşın yok. Kod ile ekle."}</li>`;
        return;
    }
    for (const f of list) {
        const li = document.createElement("li");
        li.className = "friend-item" + (selected === f.username ? " active" : "");
        const av = getAvatarFor(f.username);
        const avatarHtml = av ? `<img src="${av}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:6px">` : initials(f.username);
        li.innerHTML = `
      <div class="avatar small">${avatarHtml}</div>
      <div class="meta">
        <div class="name">${f.username} <span class="${f.online ? "online" : "offline"}" title="${f.online ? "çevrimiçi" : "çevrimdışı"}"></span></div>
        <div class="sub">${f.friendCode} - ${f.online ? "çevrimiçi" : "çevrimdışı"}</div>
      </div>
      <div class="peer-muted">›</div>
    `;
        li.onclick = () => selectFriend(f.username);
        friendList.appendChild(li);
    }
    if (selected) {
        const f = friends.find(x => x.username === selected);
        if (f)
            peerStatus.textContent = f.online ? "çevrimiçi" : "çevrimdışı";
    }
    onlineInfo.textContent = `${friends.filter(f => f.online).length} çevrimiçi - ${friends.length} arkadaş`;
    // eksik avatarları Firebase'den çek ve oturt
    for (const f of list) {
        if (!getAvatarFor(f.username)) {
            get(ref(fbDb, `avatars/${f.username}`)).then(snap => {
                const v = snap.val();
                if (v) {
                    localStorage.setItem(avatarKey(f.username), v);
                    // sadece bir kere yeniden çiz
                    const stillMissing = !document.querySelector(`.friend-item img[src="${v}"]`);
                    if (stillMissing)
                        renderFriends();
                    if (selected === f.username)
                        updatePeerAvatar(f.username);
                }
            }).catch(() => { });
        }
    }
}
inpSearch.addEventListener("input", renderFriends);
btnAddFriend.onclick = async () => {
    const code = inpFriendCode.value.trim().toUpperCase();
    if (!code)
        return toast("Kod girin");
    if (!code.startsWith("MAVİ-") && !code.startsWith("MAVI-"))
        return toast("Kod biçimi: MAVİ-XXXXXX");
    // normalize MAVI -> MAVİ desteği
    const normalized = code.replace("MAVI-", "MAVİ-");
    // backend MAVI- bekliyor, çevir
    const backendCode = normalized.replace("MAVİ-", "MAVI-");
    if (backendCode.length !== 11)
        return toast("Kod biçimi: MAVİ-XXXXXX");
    btnAddFriend.disabled = true;
    addFriendMsg.classList.add("hidden");
    try {
        const data = await api("/api/friends/add", { method: "POST", body: JSON.stringify({ friendCode: backendCode }) });
        toast(`${data.friend.username} eklendi`);
        inpFriendCode.value = "";
        await loadFriends();
        selectFriend(data.friend.username);
    }
    catch (err) {
        addFriendMsg.textContent = err.message;
        addFriendMsg.className = "micro error";
        addFriendMsg.classList.remove("hidden");
    }
    finally {
        btnAddFriend.disabled = false;
    }
};
async function selectFriend(username) {
    selected = username;
    renderFriends();
    chatEmpty.classList.add("hidden");
    chatActive.classList.remove("hidden");
    const f = friends.find(x => x.username === username);
    updatePeerAvatar(username);
    peerName.textContent = username;
    peerStatus.textContent = f?.online ? "çevrimiçi" : "çevrimdışı";
    messagesEl.innerHTML = `<div style="text-align:center;color:var(--muted);font-size:13px;padding:20px">Yükleniyor...</div>`;
    try {
        const data = await api(`/api/messages/${encodeURIComponent(username)}`);
        messages = data;
        renderMessages();
    }
    catch (err) {
        messagesEl.innerHTML = `<div style="text-align:center;color:#b91c1c;padding:20px">${err.message}</div>`;
    }
}
function renderMessages() {
    if (!selected || !me)
        return;
    messagesEl.innerHTML = "";
    if (messages.length === 0) {
        messagesEl.innerHTML = `<div style="text-align:center;color:var(--muted);font-size:13px;padding:30px">Henüz mesaj yok. İlk mesajı sen gönder.</div>`;
        return;
    }
    for (const m of messages) {
        const div = document.createElement("div");
        const isMe = m.from === me.username;
        div.className = `msg ${isMe ? "me" : "other"}`;
        div.innerHTML = `${escapeHtml(m.text)}<span class="time">${fmtTime(m.timestamp)}</span>`;
        messagesEl.appendChild(div);
    }
    messagesEl.scrollTop = messagesEl.scrollHeight;
}
function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
msgForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = inpMsg.value.trim();
    if (!text || !selected || !me)
        return;
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "chat:message", to: selected, payload: { text } }));
    }
    else {
        toast("Bağlantı yok, yeniden bağlanılıyor...");
        connectWS();
    }
    inpMsg.value = "";
});
function getWsUrl() {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    if (location.port === "5173")
        return `ws://localhost:3000/ws?token=${encodeURIComponent(token || "")}`;
    return `${proto}//${location.host}/ws?token=${encodeURIComponent(token || "")}`;
}
function connectWS() {
    if (!token)
        return;
    if (ws && ws.readyState === WebSocket.OPEN)
        return;
    if (ws)
        try {
            ws.close();
        }
        catch { }
    const url = getWsUrl();
    ws = new WebSocket(url);
    onlineInfo.textContent = "Bağlanıyor...";
    ws.onopen = () => {
        onlineInfo.textContent = "Bağlı";
    };
    ws.onclose = () => {
        onlineInfo.textContent = "Bağlantı kesildi, 2 saniye sonra yeniden...";
        setTimeout(() => { if (token)
            connectWS(); }, 2000);
    };
    ws.onerror = () => { onlineInfo.textContent = "Bağlantı hatası"; };
    ws.onmessage = (ev) => {
        try {
            const data = JSON.parse(ev.data);
            handleWsMessage(data);
        }
        catch { }
    };
}
function handleWsMessage(data) {
    if (data.type === "chat:message") {
        const msg = data.payload;
        if (selected && ((msg.from === selected && msg.to === me.username) || (msg.from === me.username && msg.to === selected))) {
            if (!messages.some(m => m.id === msg.id)) {
                messages.push(msg);
                renderMessages();
            }
        }
        else if (msg.from !== me.username) {
            toast(`${msg.from}: ${msg.text.slice(0, 40)}`);
            loadFriends();
        }
        if (msg.from === me.username && msg.to === selected && !messages.some(m => m.id === msg.id)) {
            messages.push(msg);
            renderMessages();
        }
    }
    else if (data.type === "friend:added") {
        loadFriends();
        toast(`${data.payload.username} seni ekledi`);
    }
    else if (data.type === "presence") {
        const { username, online } = data.payload;
        const f = friends.find(x => x.username === username);
        if (f) {
            f.online = online;
            renderFriends();
        }
    }
    else if (data.type?.startsWith("call:")) {
        handleCallSignal(data);
    }
}
const rtcConfig = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };
function handleCallSignal(data) {
    const from = data.from;
    if (data.type === "call:offer") {
        pendingOffer = data;
        const av = getAvatarFor(from);
        if (av) {
            incomingAvatar.innerHTML = `<img src="${av}" alt="" style="width:100%;height:100%;object-fit:cover">`;
        }
        else {
            incomingAvatar.textContent = initials(from);
        }
        incomingName.textContent = from;
        const isVideo = data.payload?.isVideo;
        incomingType.textContent = isVideo ? "Görüntülü arama..." : "Sesli arama...";
        incomingToast.classList.remove("hidden");
        setTimeout(() => { if (!callWith)
            incomingToast.classList.add("hidden"); }, 30000);
    }
    else if (data.type === "call:answer") {
        if (pc && callWith === from) {
            pc.setRemoteDescription(new RTCSessionDescription(data.payload.sdp));
            callState.textContent = "Bağlandı";
            startTimer();
        }
    }
    else if (data.type === "call:ice-candidate") {
        if (pc && data.payload.candidate) {
            pc.addIceCandidate(new RTCIceCandidate(data.payload.candidate)).catch(console.error);
        }
    }
    else if (data.type === "call:end" || data.type === "call:reject") {
        if (callWith === from) {
            const rejected = data.type === "call:reject";
            toast(rejected ? "Arama reddedildi" : "Arama sonlandırıldı");
            endCall(false);
        }
        else if (pendingOffer?.from === from) {
            incomingToast.classList.add("hidden");
            pendingOffer = null;
        }
    }
}
async function startCall(to, isVideo) {
    if (!to)
        return;
    if (pc) {
        toast("Zaten bir aramadasın");
        return;
    }
    callWith = to;
    callType = isVideo ? "video" : "voice";
    showCallUI(to, isVideo, "Aranıyor...");
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: isVideo });
        attachLocalStream();
        await createPeerAndOffer(to, isVideo);
    }
    catch (err) {
        toast("Mikrofon/kamera izni gerekli: " + (err.message || ""));
        endCall(true);
    }
}
async function acceptCall() {
    if (!pendingOffer)
        return;
    const from = pendingOffer.from;
    const isVideo = !!pendingOffer.payload?.isVideo;
    callWith = from;
    callType = isVideo ? "video" : "voice";
    incomingToast.classList.add("hidden");
    showCallUI(from, isVideo, "Bağlanıyor...");
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: isVideo });
        attachLocalStream();
        await createPeerAndAnswer(pendingOffer);
        pendingOffer = null;
    }
    catch (err) {
        toast("İzin hatası: " + err.message);
        if (ws)
            ws.send(JSON.stringify({ type: "call:reject", to: from }));
        endCall(false);
    }
}
function rejectCall() {
    if (!pendingOffer)
        return;
    const from = pendingOffer.from;
    if (ws)
        ws.send(JSON.stringify({ type: "call:reject", to: from }));
    incomingToast.classList.add("hidden");
    pendingOffer = null;
    toast("Reddedildi");
}
function showCallUI(peer, isVideo, state) {
    callModal.classList.remove("hidden");
    const av = getAvatarFor(peer);
    if (av)
        callAvatar.innerHTML = `<img src="${av}" alt="" style="width:100%;height:100%;object-fit:cover">`;
    else {
        callAvatar.textContent = initials(peer);
        callAvatar.innerHTML = initials(peer);
    }
    callPeerName.textContent = peer;
    callTitle.textContent = isVideo ? "Görüntülü Arama" : "Sesli Arama";
    callState.textContent = state;
    callTimer.textContent = "00:00";
    callWith = peer;
    if (isVideo) {
        audioOnly.classList.add("hidden");
        remoteVideo.classList.remove("hidden");
        localVideo.classList.remove("hidden");
        remoteVideo.style.display = "";
        callInfo.textContent = "Kamera ve mikrofon aktif";
    }
    else {
        audioOnly.classList.remove("hidden");
        callInfo.textContent = "Sesli arama - hoparlör açık";
    }
    btnMute.textContent = "Mikrofon";
    btnCam.textContent = "Kamera";
    btnMute.classList.remove("muted");
    btnCam.classList.remove("muted");
    btnCam.style.display = isVideo ? "" : "none";
    localVideo.style.display = isVideo ? "" : "none";
}
function attachLocalStream() {
    if (localStream) {
        localVideo.srcObject = localStream;
    }
}
async function createPeerAndOffer(to, isVideo) {
    pc = new RTCPeerConnection(rtcConfig);
    setupPeerEvents(to);
    localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    ws?.send(JSON.stringify({ type: "call:offer", to, payload: { sdp: offer, isVideo } }));
}
async function createPeerAndAnswer(offerMsg) {
    pc = new RTCPeerConnection(rtcConfig);
    setupPeerEvents(offerMsg.from);
    localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
    await pc.setRemoteDescription(new RTCSessionDescription(offerMsg.payload.sdp));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    ws?.send(JSON.stringify({ type: "call:answer", to: offerMsg.from, payload: { sdp: answer } }));
    callState.textContent = "Bağlandı";
    startTimer();
}
function setupPeerEvents(to) {
    if (!pc)
        return;
    pc.onicecandidate = (e) => {
        if (e.candidate)
            ws?.send(JSON.stringify({ type: "call:ice-candidate", to, payload: { candidate: e.candidate } }));
    };
    pc.ontrack = (e) => {
        const stream = e.streams[0];
        remoteVideo.srcObject = stream;
        remoteVideo.classList.remove("hidden");
        if (callType === "voice") {
            remoteVideo.style.display = "none";
        }
        else {
            audioOnly.classList.add("hidden");
        }
        callState.textContent = "Bağlandı";
        if (!timerInterval)
            startTimer();
    };
    pc.onconnectionstatechange = () => {
        const s = pc?.connectionState;
        if (s === "connected") {
            callState.textContent = "Bağlandı";
            startTimer();
        }
        else if (s === "failed" || s === "disconnected") {
            callState.textContent = "Bağlantı koptu";
        }
    };
}
function startTimer() {
    if (timerInterval)
        return;
    callStart = Date.now();
    timerInterval = window.setInterval(() => {
        const sec = Math.floor((Date.now() - callStart) / 1000);
        const m = String(Math.floor(sec / 60)).padStart(2, "0");
        const s = String(sec % 60).padStart(2, "0");
        callTimer.textContent = `${m}:${s}`;
    }, 1000);
}
function endCall(notifyPeer) {
    if (notifyPeer && callWith && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "call:end", to: callWith }));
    }
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    if (pc) {
        try {
            pc.close();
        }
        catch { }
        pc = null;
    }
    if (localStream) {
        localStream.getTracks().forEach(t => t.stop());
        localStream = null;
    }
    remoteVideo.srcObject = null;
    localVideo.srcObject = null;
    callModal.classList.add("hidden");
    callWith = null;
    callType = null;
    callState.textContent = "Bağlanıyor...";
}
btnVoiceCall.onclick = () => { if (selected)
    startCall(selected, false); };
btnVideoCall.onclick = () => { if (selected)
    startCall(selected, true); };
btnAcceptCall.onclick = acceptCall;
btnRejectCall.onclick = rejectCall;
btnEndCall.onclick = () => endCall(true);
btnMute.onclick = () => {
    if (!localStream)
        return;
    const track = localStream.getAudioTracks()[0];
    if (!track)
        return;
    track.enabled = !track.enabled;
    btnMute.classList.toggle("muted", !track.enabled);
    btnMute.textContent = track.enabled ? "Mikrofon" : "Sessiz";
    callInfo.textContent = track.enabled ? "Mikrofon açık" : "Mikrofon kapalı";
};
btnCam.onclick = () => {
    if (!localStream)
        return;
    const track = localStream.getVideoTracks()[0];
    if (!track)
        return;
    track.enabled = !track.enabled;
    btnCam.classList.toggle("muted", !track.enabled);
    btnCam.textContent = track.enabled ? "Kamera" : "Kapalı";
};
btnSpeaker.onclick = () => {
    toast("Hoparlör modu: tarayıcı varsayılanını kullanıyor");
};
window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !callModal.classList.contains("hidden"))
        endCall(true);
});
setAuthMode("login");
checkAuth();
