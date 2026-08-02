'use strict';
const CONFIG = window.APP_CONFIG || {SCRIPT_URL:'',LOGIN_PAGE:'index.html',SESSION_KEY:'sitampu_session',USER_KEY:'sitampu_user'};
const $ = (id)=>document.getElementById(id);
let currentUser=null,usersCache=[],currentFilter='all',activeChatId=null,chatUsers=[],notificationsCache=[],initialized=false,chatPoll=null,notificationPoll=null,lastChatUnreadTotal=null,knownNotificationIds=new Set(),chatLoading=false,notificationLoading=false;

const demoSubmissions=[
{id:'A-0012',name:'Ahmad Saputra',date:'26 Juli 2026',status:'Menunggu'},
{id:'A-0011',name:'Rina Marlina',date:'25 Juli 2026',status:'Diproses'},
{id:'A-0010',name:'Dedi Irawan',date:'24 Juli 2026',status:'Selesai'}];


function getSession(){try{return{token:sessionStorage.getItem(CONFIG.SESSION_KEY),user:JSON.parse(sessionStorage.getItem(CONFIG.USER_KEY)||'null')}}catch{return{token:null,user:null}}}
function clearSession(){sessionStorage.removeItem(CONFIG.SESSION_KEY);sessionStorage.removeItem(CONFIG.USER_KEY)}
function redirectToLogin(){clearSession();location.replace(CONFIG.LOGIN_PAGE||'index.html')}
function escapeHtml(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]))}
async function callApi(payload){
 if(!CONFIG.SCRIPT_URL||CONFIG.SCRIPT_URL.includes('PASTE_')) throw new Error('SCRIPT_URL pada config.js belum diisi.');
 const token=sessionStorage.getItem(CONFIG.SESSION_KEY); const body={...payload}; if(token)body.token=token;
 const res=await fetch(CONFIG.SCRIPT_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(body),redirect:'follow'});
 if(!res.ok)throw new Error(`Server merespons ${res.status}`);
 const data=await res.json(); if(data.sessionExpired){redirectToLogin();throw new Error('Sesi login berakhir.');} return data;
}
function toast(title,icon='success'){if(window.Swal)Swal.fire({title,icon,timer:1800,showConfirmButton:false,toast:true,position:'top-end'});else alert(title)}
function loading(title){if(window.Swal)Swal.fire({title,allowOutsideClick:false,showConfirmButton:false,didOpen:()=>Swal.showLoading()})}

function applyTheme(theme){
 const allowed=['light','dark','colorful','system']; if(!allowed.includes(theme))theme='system';
 localStorage.setItem('sitampu_theme',theme); const resolved=theme==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):theme;
 document.documentElement.dataset.theme=resolved; document.documentElement.dataset.preference=theme; document.documentElement.style.colorScheme=resolved==='dark'?'dark':'light';
 document.querySelectorAll('[data-theme]').forEach(b=>b.classList.toggle('active',b.dataset.theme===theme));
 const icons={light:'fa-sun',dark:'fa-moon',colorful:'fa-palette',system:'fa-desktop'}; $('themeMain').innerHTML=`<i class="fas ${icons[theme]}"></i>`;
}
function setupTheme(){applyTheme(localStorage.getItem('sitampu_theme')||'system');$('themeMain').onclick=e=>{e.stopPropagation();$('themeMenu').classList.toggle('open')};document.querySelectorAll('[data-theme]').forEach(b=>b.onclick=()=>{applyTheme(b.dataset.theme);$('themeMenu').classList.remove('open')});matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>{if((localStorage.getItem('sitampu_theme')||'system')==='system')applyTheme('system')})}
function setDate(){const now=new Date();$('currentDate').textContent=now.toLocaleDateString('id-ID',{weekday:'long',day:'2-digit',month:'long',year:'numeric'})}

function showPage(pageId){
 if(pageId==='userPage'&&currentUser?.jabatan!=='Admin')return toast('Menu ini hanya untuk Admin','warning');
 if(pageId==='chatPage'&&innerWidth<=760&&!activeChatId)document.querySelector('.chat-layout')?.classList.remove('mobile-conversation-open');
 document.querySelectorAll('.page').forEach(p=>p.classList.toggle('active',p.id===pageId));document.querySelectorAll('.nav-item').forEach(n=>n.classList.toggle('active',n.dataset.page===pageId));
 if(innerWidth<=760)document.body.classList.remove('mobile-sidebar-open');
 if(pageId==='userPage'&&currentUser?.jabatan==='Admin'&&!usersCache.length)loadUsers();
}
function setupNavigation(){document.querySelectorAll('.nav-item').forEach(btn=>btn.onclick=()=>showPage(btn.dataset.page));document.querySelectorAll('.service-card').forEach(card=>card.onclick=()=>showPage(card.dataset.pageTarget));$('sidebarToggle').onclick=()=>{if(innerWidth<=760)document.body.classList.toggle('mobile-sidebar-open');else document.body.classList.toggle('sidebar-collapsed')};$('mobileClose').onclick=() => document.body.classList.remove('mobile-sidebar-open');$('sidebarOverlay').onclick=()=>document.body.classList.remove('mobile-sidebar-open')}
function setupProfile(){const toggle=()=>$('profileMenu').classList.toggle('open');$('profileCard').onclick=toggle;$('profileCard').onkeydown=e=>{if(e.key==='Enter'||e.key===' ')toggle()};$('profileInfoBtn').onclick=()=>Swal.fire({title:escapeHtml(currentUser.nama),html:`<b>Username:</b> ${escapeHtml(currentUser.username||'-')}<br><b>Jabatan:</b> ${escapeHtml(currentUser.jabatan)}<br><b>Instansi:</b> ${escapeHtml(currentUser.instansi)}`,icon:'info'});$('logoutBtn').onclick=logout}
function setupSearch(){const apply=()=>{const q=$('menuSearch').value.trim().toLowerCase();$('menuSearch').parentElement.classList.toggle('has-value',!!q);let shown=0;document.querySelectorAll('.service-card').forEach(c=>{const category=c.dataset.category||'';const matchFilter=currentFilter==='all'||category.includes(currentFilter);const matchText=!q||`${c.dataset.keywords} ${c.textContent}`.toLowerCase().includes(q);const visible=matchFilter&&matchText&&!c.classList.contains('role-hidden');c.style.display=visible?'':'none';if(visible)shown++});$('noResults').classList.toggle('hidden',shown>0)};$('menuSearch').oninput=apply;$('clearSearch').onclick=()=>{$('menuSearch').value='';apply();$('menuSearch').focus()};document.querySelectorAll('.chip').forEach(c=>c.onclick=()=>{currentFilter=c.dataset.filter;document.querySelectorAll('.chip').forEach(x=>x.classList.toggle('active',x===c));apply()})}

function renderSubmissions(list=demoSubmissions){$('submissionTableBody').innerHTML=list.map(s=>`<tr><td>${s.id}</td><td>${s.name}</td><td>${s.date}</td><td><span class="status-badge status-${s.status.toLowerCase()}">${s.status}</span></td><td><button class="detail-btn" data-submission="${s.id}"><i class="fas fa-eye"></i> Detail</button></td></tr>`).join('');document.querySelectorAll('[data-submission]').forEach(b=>b.onclick=()=>Swal.fire({title:`Detail ${b.dataset.submission}`,text:'Fitur detail siap dihubungkan ke sheet Pengajuan.',icon:'info'}))}
function setupSubmissions(){renderSubmissions();$('submissionSearch').oninput=()=>{const q=$('submissionSearch').value.toLowerCase();renderSubmissions(demoSubmissions.filter(s=>Object.values(s).join(' ').toLowerCase().includes(q)))};$('newSubmissionBtn').onclick=()=>Swal.fire({title:'Pengajuan Baru',html:'<input id="swal-name" class="swal2-input" placeholder="Nama pemohon"><textarea id="swal-note" class="swal2-textarea" placeholder="Keterangan"></textarea>',showCancelButton:true,confirmButtonText:'Simpan',preConfirm:()=>{const name=document.getElementById('swal-name').value.trim();if(!name){Swal.showValidationMessage('Nama pemohon wajib diisi');return false}return{name}}}).then(r=>{if(r.isConfirmed){demoSubmissions.unshift({id:`A-${String(13+demoSubmissions.length).padStart(4,'0')}`,name:r.value.name,date:new Date().toLocaleDateString('id-ID'),status:'Menunggu'});renderSubmissions();toast('Pengajuan berhasil ditambahkan')}})}

async function loadChatUsers(){try{const r=await callApi({action:'getChatUsers'});if(!r.success)throw new Error(r.message||'Gagal memuat user chat');const nextUsers=(r.users||[]).sort((a,b)=>(Number(b.lastTime)||0)-(Number(a.lastTime)||0)||String(a.nama||a.username).localeCompare(String(b.nama||b.username),'id'));const nextUnread=nextUsers.reduce((n,u)=>n+Math.max(0,Number(u.unreadCount)||0),0);if(lastChatUnreadTotal!==null&&nextUnread>lastChatUnreadTotal){showDesktopNotification('Pesan chat baru',`${nextUnread-lastChatUnreadTotal} pesan baru masuk.`);}lastChatUnreadTotal=nextUnread;chatUsers=nextUsers;renderChatList();if(activeChatId&&!chatUsers.some(u=>String(u.username).toLowerCase()===String(activeChatId).toLowerCase())){activeChatId=null;renderEmptyChat();}}catch(e){$('chatList').innerHTML=`<div class="notification-empty">${escapeHtml(e.message)}</div>`;}}
function renderChatList(){if(!chatUsers.length){$('chatList').innerHTML='<div class="notification-empty">Tidak ada user lain.</div>';return;}$('chatList').innerHTML=chatUsers.map(u=>{const unread=Math.max(0,Number(u.unreadCount)||0),isActive=String(u.username).toLowerCase()===String(activeChatId||'').toLowerCase(),lastTime=u.lastTime?new Date(Number(u.lastTime)).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'}):'';return `<button type="button" class="chat-contact ${isActive?'active':''}" data-chat="${escapeHtml(u.username)}" aria-label="Buka chat dengan ${escapeHtml(u.nama||u.username)}${unread?`, ${unread} pesan belum dibaca`:''}"><div class="contact-avatar">${escapeHtml((u.nama||u.username).split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase())}</div><div class="contact-copy"><div style="display:flex;align-items:center;gap:8px"><strong style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(u.nama||u.username)}</strong>${lastTime?`<small style="margin-left:auto;flex:0 0 auto">${lastTime}</small>`:''}</div><small class="contact-last">${escapeHtml(u.lastMessage?(u.lastSender==='Anda'?'Anda: ':'')+u.lastMessage:`${u.jabatan||'User'} · ${u.instansi||'-'}`)}</small></div>${unread?`<span class="contact-count" title="${unread} pesan masuk belum dibaca">${unread>99?'99+':unread}</span>`:''}</button>`}).join('');document.querySelectorAll('[data-chat]').forEach(el=>el.onclick=()=>openChat(el.dataset.chat));}
function renderEmptyChat(){$('chatTitle').textContent='Pilih pengguna';$('chatSubtitle').textContent='-';$('chatBody').innerHTML='<div class="chat-placeholder"><i class="fas fa-comments"></i><p>Pilih pengguna untuk membuka chat.</p></div>';}
async function openChat(username){activeChatId=username;const user=chatUsers.find(u=>String(u.username).toLowerCase()===String(username).toLowerCase());$('chatTitle').textContent=user?.nama||username;$('chatSubtitle').textContent=`${user?.jabatan||'User'} · chat tersimpan 24 jam`;if(user)user.unreadCount=0;document.querySelector('.chat-layout')?.classList.add('mobile-conversation-open');renderChatList();$('chatMessage')?.focus({preventScroll:true});await refreshActiveChat();loadChatUsers();loadNotifications(false);}
async function refreshActiveChat(){if(!activeChatId)return;try{const r=await callApi({action:'getChats',withUser:activeChatId});if(!r.success)throw new Error(r.message||'Gagal memuat chat');$('chatBody').innerHTML=r.messages.length?r.messages.map(m=>`<div class="bubble ${m.type}">${escapeHtml(m.text)}<small class="bubble-time">${new Date(m.time).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'})}</small></div>`).join(''):'<div class="chat-placeholder"><i class="fas fa-message"></i><p>Belum ada pesan. Mulai percakapan.</p></div>';$('chatBody').scrollTop=$('chatBody').scrollHeight;loadNotifications(false);}catch(e){toast(e.message,'error');}}
function setupChat(){renderEmptyChat();const backToUsers=()=>{document.querySelector('.chat-layout')?.classList.remove('mobile-conversation-open');activeChatId=null;renderEmptyChat();renderChatList();};$('chatBackBtn').onclick=backToUsers;$('chatForm').onsubmit=async e=>{e.preventDefault();const text=$('chatMessage').value.trim();if(!text)return;if(!activeChatId)return toast('Pilih pengguna terlebih dahulu','warning');$('chatMessage').value='';const button=$('chatForm').querySelector('button');button.disabled=true;try{const r=await callApi({action:'sendChat',to:activeChatId,message:text});if(!r.success)throw new Error(r.message||'Pesan gagal dikirim');await refreshActiveChat();loadChatUsers();}catch(err){$('chatMessage').value=text;Swal.fire({title:'Pesan Gagal Dikirim',text:err.message,icon:'error'});}finally{button.disabled=false;$('chatMessage').focus();}};const pollChat=async()=>{if(document.visibilityState==='visible'&&!chatLoading){chatLoading=true;try{await loadChatUsers();if(activeChatId)await refreshActiveChat();}finally{chatLoading=false;}}chatPoll=setTimeout(pollChat,document.visibilityState==='visible'?6000:30000);};chatPoll=setTimeout(pollChat,6000);window.addEventListener('resize',()=>{if(innerWidth>760)document.querySelector('.chat-layout')?.classList.remove('mobile-conversation-open')},{passive:true});}
function showDesktopNotification(title,body){if(!('Notification'in window)||Notification.permission!=='granted'||document.visibilityState==='visible')return;try{new Notification(title,{body,icon:'LOGO.PNG',badge:'LOGO.PNG',tag:'sitampu-notification',renotify:true});}catch{}}
async function enableBrowserNotifications(){if(!('Notification'in window)||Notification.permission!=='default')return;const result=await Swal.fire({title:'Aktifkan Notifikasi?',text:'Izinkan notifikasi bawaan browser atau perangkat saat ada pesan baru.',icon:'question',showCancelButton:true,confirmButtonText:'Izinkan',cancelButtonText:'Nanti'});if(!result.isConfirmed)return;const permission=await Notification.requestPermission();if(permission==='granted')toast('Notifikasi perangkat aktif');else toast('Izin notifikasi tidak diberikan','warning');}
function notificationIcon(type){const t=String(type||'').toLowerCase();if(t==='chat')return'fa-comments';if(['pengajuan','ajuan','status','diterima','ditolak','diproses'].includes(t))return t==='ditolak'?'fa-circle-xmark':t==='diterima'?'fa-circle-check':'fa-file-circle-check';if(t==='user')return'fa-user-gear';return'fa-bell';}
function renderNotifications(){const unread=notificationsCache.filter(n=>!n.read).length;$('notificationBadge').textContent=unread>99?'99+':String(unread);$('notificationBadge').style.display=unread?'grid':'none';$('notificationList').innerHTML=notificationsCache.length?notificationsCache.map(n=>`<div class="notification-item ${n.read?'':'unread'}" data-notification="${escapeHtml(n.id)}"><div class="notification-icon"><i class="fas ${notificationIcon(n.type)}"></i></div><div class="notification-copy"><strong>${escapeHtml(n.title)}</strong><span>${escapeHtml(n.message)}</span><small>${new Date(n.time).toLocaleString('id-ID')}</small></div></div>`).join(''):'<div class="notification-empty"><i class="fas fa-bell-slash"></i><p>Belum ada notifikasi.</p></div>';document.querySelectorAll('[data-notification]').forEach(el=>el.onclick=()=>openNotification(el.dataset.notification));}
async function loadNotifications(showError=true){try{const r=await callApi({action:'getNotifications'});if(!r.success)throw new Error(r.message||'Gagal memuat notifikasi');const incoming=r.notifications||[],fresh=incoming.filter(n=>!n.read&&!knownNotificationIds.has(String(n.id)));if(knownNotificationIds.size&&fresh.length){const newest=fresh[0];showDesktopNotification(newest.title||'Notifikasi Si-Tampu',newest.message||'Ada notifikasi baru.');}incoming.forEach(n=>knownNotificationIds.add(String(n.id)));notificationsCache=incoming;renderNotifications();}catch(e){if(showError)toast(e.message,'error');}}
async function openNotification(id){const n=notificationsCache.find(x=>x.id===id);if(!n)return;if(!n.read){await callApi({action:'markNotificationRead',id});n.read=true;renderNotifications();}Swal.fire({title:escapeHtml(n.title),html:`<div style="text-align:left">${escapeHtml(n.message)}<br><small>${new Date(n.time).toLocaleString('id-ID')}</small></div>`,icon:n.type==='chat'?'info':'success',confirmButtonText:'Tutup'});if(n.type==='chat'&&n.reference){$('notificationMenu').classList.remove('open');showPage('chatPage');if(chatUsers.some(u=>u.username===n.reference))openChat(n.reference);}}
function setupNotifications(){$('notificationMain').onclick=e=>{e.stopPropagation();$('notificationMenu').classList.toggle('open');$('themeMenu').classList.remove('open');loadNotifications(false)};$('markAllReadBtn').onclick=async()=>{await callApi({action:'markAllNotificationsRead'});notificationsCache.forEach(n=>n.read=true);renderNotifications();};const pollNotifications=async()=>{if(!notificationLoading){notificationLoading=true;try{await loadNotifications(false);}finally{notificationLoading=false;}}notificationPoll=setTimeout(pollNotifications,document.visibilityState==='visible'?15000:60000);};notificationPoll=setTimeout(pollNotifications,15000);}

async function validateSession(){const {token,user}=getSession();if(!token||!user){redirectToLogin();return null}try{const r=await callApi({action:'validateSession'});if(!r.success||!r.user){redirectToLogin();return null}sessionStorage.setItem(CONFIG.USER_KEY,JSON.stringify(r.user));return r.user}catch(e){console.error(e);if(user){toast('Server tidak dapat dihubungi. Menggunakan sesi lokal sementara.','warning');return user}redirectToLogin();return null}}
function applyUser(user){currentUser=user;$('sideName').textContent=user.nama||user.username||'User';$('sideRole').textContent=`${user.jabatan||''} ${user.instansi||''}`.trim();$('profileInitial').textContent=(user.nama||user.username||'U').split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();$('welcome').textContent=`Halo ${user.nama||user.username}, kelola pengajuan dan layanan Si-Tampu dari dashboard ini.`;const admin=user.jabatan==='Admin';document.querySelectorAll('.admin-only').forEach(el=>{el.classList.toggle('role-hidden',!admin);el.style.display=admin?'':'none'})}
async function logout(){const r=await Swal.fire({title:'Keluar dari sistem?',text:'Anda harus login kembali untuk membuka dashboard.',icon:'question',showCancelButton:true,confirmButtonText:'Ya, Keluar',cancelButtonText:'Batal'});if(!r.isConfirmed)return;try{await callApi({action:'logout'})}catch{}clearSession();location.replace(CONFIG.LOGIN_PAGE||'index.html')}

async function loadUsers(){if(currentUser?.jabatan!=='Admin')return;const tbody=$('userTableBody');tbody.innerHTML='<tr><td colspan="5">Memuat data user...</td></tr>';try{loading('Memuat data user...');const r=await callApi({action:'getUsers'});Swal.close();if(!r.success&&r.message)throw new Error(r.message);usersCache=r.users||r||[];renderUsers(usersCache)}catch(e){Swal.close();tbody.innerHTML=`<tr><td colspan="5">${escapeHtml(e.message)}</td></tr>`;Swal.fire({title:'Gagal Memuat User',text:e.message,icon:'error'})}}
function renderUsers(users){const tbody=$('userTableBody');if(!users.length){tbody.innerHTML='<tr><td colspan="5">Tidak ada data user.</td></tr>';return}tbody.innerHTML='';users.forEach(u=>{const tr=document.createElement('tr');tr.innerHTML=`<td data-label="Username">${escapeHtml(u.username)}</td><td data-label="Nama">${escapeHtml(u.nama)}</td><td data-label="Jabatan"><span class="jabatan-badge badge-${String(u.jabatan).toLowerCase()}">${escapeHtml(u.jabatan)}</span></td><td data-label="Instansi">${escapeHtml(u.instansi)}</td><td data-label="Aksi"><div class="action-buttons"><button class="edit-btn"><i class="fas fa-edit"></i> Edit</button><button class="delete-btn"><i class="fas fa-trash"></i> Hapus</button></div></td>`;tr.querySelector('.edit-btn').onclick=()=>openEditModal(u);tr.querySelector('.delete-btn').onclick=()=>deleteUser(u.username,u.nama);tbody.appendChild(tr)})}
function openAddUserModal(){$('addUserModal').classList.remove('hidden');$('newUsername').focus()}function closeAddUserModal(){$('addUserModal').classList.add('hidden')}function togglePassword(inputId,buttonId){const input=$(inputId),icon=$(buttonId).querySelector('i');input.type=input.type==='password'?'text':'password';icon.className=`fas ${input.type==='text'?'fa-eye-slash':'fa-eye'}`}
async function addUser(){const p={action:'addUser',username:$('newUsername').value.trim(),password:$('newPassword').value,nama:$('newNama').value.trim(),jabatan:$('newJabatan').value,instansi:$('newInstansi').value.trim()};if(!p.username||!p.password||!p.nama||!p.instansi)return Swal.fire({title:'Form Belum Lengkap',text:'Semua kolom wajib diisi.',icon:'warning'});if(p.password.length<6)return Swal.fire({title:'Password Terlalu Pendek',text:'Minimal 6 karakter.',icon:'warning'});try{loading('Menambahkan user...');const r=await callApi(p);Swal.close();if(!r.success)throw new Error(r.message||'Gagal menambahkan user');['newUsername','newPassword','newNama','newInstansi'].forEach(id=>$(id).value='');closeAddUserModal();toast('User berhasil ditambahkan');loadUsers();loadChatUsers();loadNotifications(false)}catch(e){Swal.close();Swal.fire({title:'Gagal',text:e.message,icon:'error'})}}
function openEditModal(u){$('editModal').classList.remove('hidden');$('oldUsername').value=u.username;$('editUsername').value=u.username;$('editPassword').value='';$('editNama').value=u.nama;$('editJabatan').value=u.jabatan;$('editInstansi').value=u.instansi}
function closeEditModal(){$('editModal').classList.add('hidden')}
async function saveEdit(){const p={action:'editUser',oldUsername:$('oldUsername').value,username:$('editUsername').value.trim(),password:$('editPassword').value,nama:$('editNama').value.trim(),jabatan:$('editJabatan').value,instansi:$('editInstansi').value.trim()};if(!p.username||!p.nama||!p.instansi)return Swal.fire({title:'Form Belum Lengkap',icon:'warning'});if(p.password&&p.password.length<6)return Swal.fire({title:'Password minimal 6 karakter',icon:'warning'});try{loading('Menyimpan perubahan...');const r=await callApi(p);Swal.close();if(!r.success)throw new Error(r.message||'Gagal memperbarui user');closeEditModal();toast('Data user diperbarui');loadUsers()}catch(e){Swal.close();Swal.fire({title:'Gagal',text:e.message,icon:'error'})}}
async function deleteUser(username,nama){const c=await Swal.fire({title:'Hapus User?',html:`User <b>${escapeHtml(nama)}</b> akan dihapus.`,icon:'warning',showCancelButton:true,confirmButtonText:'Hapus',confirmButtonColor:'#ef4444'});if(!c.isConfirmed)return;try{loading('Menghapus user...');const r=await callApi({action:'deleteUser',username});Swal.close();if(!r.success)throw new Error(r.message||'Gagal menghapus user');toast('User dihapus');loadUsers()}catch(e){Swal.close();Swal.fire({title:'Gagal',text:e.message,icon:'error'})}}
function setupUserFeatures(){$('toggleEditPassword').onclick=()=>togglePassword('editPassword','toggleEditPassword');$('toggleNewPassword').onclick=()=>togglePassword('newPassword','toggleNewPassword');$('openAddUserBtn').onclick=openAddUserModal;$('closeAddUserBtn').onclick=closeAddUserModal;$('cancelAddUserBtn').onclick=closeAddUserModal;$('addUserBtn').onclick=addUser;$('refreshUsersBtn').onclick=loadUsers;$('saveEditBtn').onclick=saveEdit;$('cancelEditBtn').onclick=closeEditModal;$('cancelEditBtnBottom').onclick=closeEditModal;$('editModal').onclick=e=>{if(e.target===$('editModal'))closeEditModal()};$('addUserModal').onclick=e=>{if(e.target===$('addUserModal'))closeAddUserModal()};$('userSearch').oninput=()=>{const q=$('userSearch').value.toLowerCase();renderUsers(usersCache.filter(u=>Object.values(u).join(' ').toLowerCase().includes(q)))}}
function setupGlobalClose(){document.addEventListener('click',e=>{if(!e.target.closest('.theme-selector'))$('themeMenu').classList.remove('open');if(!e.target.closest('.notification-selector'))$('notificationMenu').classList.remove('open');if(!e.target.closest('.sidebar-bottom'))$('profileMenu').classList.remove('open')});document.addEventListener('keydown',e=>{if(e.key==='Escape'){ $('themeMenu').classList.remove('open');$('profileMenu').classList.remove('open');closeEditModal();closeAddUserModal();$('notificationMenu').classList.remove('open')}})}

async function initialize(){if(initialized)return;initialized=true;setupTheme();setDate();setupNavigation();setupProfile();setupSearch();setupSubmissions();setupChat();setupNotifications();setupUserFeatures();setupGlobalClose();const user=await validateSession();if(!user)return;applyUser(user);await loadChatUsers();await loadNotifications(false);setTimeout(enableBrowserNotifications,700)}
window.addEventListener('pageshow',initialize);

/* =========================================================
   AUTO LOGOUT SETELAH 2 JAM TIDAK ADA AKTIVITAS
   Tempelkan kode ini paling bawah pada dashboard.js
========================================================= */

(function setupAutoLogout() {
    const IDLE_LIMIT = 2 * 60 * 1000; // 2 jam
    const CHECK_INTERVAL = 30 * 1000; // Periksa setiap 30 detik
    const ACTIVITY_KEY = 'sitampu_last_activity';

    let lastSavedActivity = 0;
    let isLoggingOut = false;

    /**
     * Mengambil nama key sesi dari config.js.
     * Tetap memiliki nilai cadangan apabila config tidak tersedia.
     */
    function getSessionKey() {
        return window.APP_CONFIG?.SESSION_KEY || 'sitampu_session';
    }

    function getUserKey() {
        return window.APP_CONFIG?.USER_KEY || 'sitampu_user';
    }

    function getLoginPage() {
        return window.APP_CONFIG?.LOGIN_PAGE || 'index.html';
    }

    /**
     * Memeriksa apakah pengguna masih memiliki sesi login.
     */
    function hasLoginSession() {
        return Boolean(
            localStorage.getItem(getSessionKey()) ||
            localStorage.getItem(getUserKey()) ||
            localStorage.getItem('user')
        );
    }

    /**
     * Mencatat waktu aktivitas terakhir.
     * Penulisan ke localStorage dibatasi agar tidak terlalu sering.
     */
    function updateLastActivity() {
        if (isLoggingOut || !hasLoginSession()) {
            return;
        }

        const now = Date.now();

        // Simpan maksimal satu kali setiap 5 detik
        if (now - lastSavedActivity < 5000) {
            return;
        }

        lastSavedActivity = now;
        localStorage.setItem(ACTIVITY_KEY, String(now));
    }

    /**
     * Mengambil waktu aktivitas terakhir.
     */
    function getLastActivity() {
        const storedTime = Number(localStorage.getItem(ACTIVITY_KEY));

        if (!Number.isFinite(storedTime) || storedTime <= 0) {
            const now = Date.now();
            localStorage.setItem(ACTIVITY_KEY, String(now));
            return now;
        }

        return storedTime;
    }

    /**
     * Menghapus seluruh data autentikasi.
     */
    function clearLoginSession() {
        localStorage.removeItem(getSessionKey());
        localStorage.removeItem(getUserKey());

        // Mendukung nama penyimpanan dari versi sebelumnya
        localStorage.removeItem('user');
        localStorage.removeItem('sitampu_session');
        localStorage.removeItem('sitampu_user');
        localStorage.removeItem(ACTIVITY_KEY);

        sessionStorage.clear();
    }

    /**
     * Logout otomatis akibat tidak ada aktivitas selama dua jam.
     */
    function autoLogout() {
        if (isLoggingOut) {
            return;
        }

        isLoggingOut = true;
        clearLoginSession();

        const loginPage = getLoginPage();

        // Gunakan SweetAlert2 apabila tersedia
        if (window.Swal && typeof window.Swal.fire === 'function') {
            window.Swal.fire({
                title: 'Sesi Berakhir',
                text: 'Anda otomatis logout karena tidak ada aktivitas selama 2 jam.',
                icon: 'warning',
                confirmButtonText: 'Login Kembali',
                allowOutsideClick: false,
                allowEscapeKey: false
            }).then(() => {
                window.location.replace(loginPage);
            });

            return;
        }

        alert(
            'Sesi berakhir. Anda otomatis logout karena tidak ada aktivitas selama 2 jam.'
        );

        window.location.replace(loginPage);
    }

    /**
     * Memeriksa durasi tidak aktif pengguna.
     */
    function checkIdleTime() {
        if (isLoggingOut || !hasLoginSession()) {
            return;
        }

        const lastActivity = getLastActivity();
        const idleDuration = Date.now() - lastActivity;

        if (idleDuration >= IDLE_LIMIT) {
            autoLogout();
        }
    }

    /**
     * Aktivitas yang dianggap sebagai penggunaan dashboard.
     */
    const activityEvents = [
        'mousedown',
        'mousemove',
        'keydown',
        'scroll',
        'touchstart',
        'pointerdown',
        'click'
    ];

    activityEvents.forEach((eventName) => {
        window.addEventListener(eventName, updateLastActivity, {
            passive: true
        });
    });

    /**
     * Periksa saat pengguna kembali membuka tab.
     * Jangan langsung mencatat aktivitas sebelum pemeriksaan selesai.
     */
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            checkIdleTime();

            if (!isLoggingOut) {
                updateLastActivity();
            }
        }
    });

    window.addEventListener('focus', () => {
        checkIdleTime();

        if (!isLoggingOut) {
            updateLastActivity();
        }
    });

    /**
     * Tetap memeriksa saat halaman dipulihkan oleh tombol Back/Forward.
     */
    window.addEventListener('pageshow', () => {
        checkIdleTime();

        if (!isLoggingOut) {
            updateLastActivity();
        }
    });

    /**
     * Sinkronisasi logout dan aktivitas antar-tab browser.
     */
    window.addEventListener('storage', (event) => {
        if (event.key === ACTIVITY_KEY && event.newValue) {
            lastSavedActivity = Number(event.newValue) || 0;
        }

        if (
            event.key === getSessionKey() ||
            event.key === getUserKey() ||
            event.key === 'user'
        ) {
            if (!hasLoginSession() && !isLoggingOut) {
                isLoggingOut = true;
                window.location.replace(getLoginPage());
            }
        }
    });

    /**
     * Inisialisasi.
     */
    if (hasLoginSession()) {
        if (!localStorage.getItem(ACTIVITY_KEY)) {
            localStorage.setItem(ACTIVITY_KEY, String(Date.now()));
        }

        checkIdleTime();

        window.setInterval(checkIdleTime, CHECK_INTERVAL);
    }
})();