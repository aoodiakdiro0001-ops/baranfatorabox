/* Baran FatoraBox v1.0.0 — app.js (vanilla, CSP-safe: no inline handlers/styles) */
'use strict';

/* ── state ── */
const S = {
  lang: 'ar', authActive: false, code: null,
  clients: [], invoices: [], settings: null,
  editing: null,           // invoice being edited (null = new)
  rows: [], view: 'dash',
};

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0);
const todayISO = () => new Date().toISOString().slice(0, 10);

/* ── i18n ── */
const I18N = {
  ar: {
    gateHint: 'مقفلة بكلمة مرور — أدخل الرمز للمتابعة', unlock: 'فتح',
    tabDash: 'لوحة', tabInv: 'الفواتير', tabCli: 'العملاء', tabSet: 'الإعدادات',
    stMtd: 'مبيعات الشهر', stVat: 'ضريبة مستحقة (غير محصّلة)', stOverdue: 'فواتير متأخرة', stOpen: 'مبالغ مفتوحة',
    monthly: 'المبيعات شهرياً', last6: 'آخر 6 أشهر', topClients: 'أفضل العملاء', recent: 'أحدث الفواتير',
    newInvoice: '+ فاتورة جديدة', allInvoices: 'كل الفواتير', searchPh: 'بحث رقم/عميل…', allStatus: 'الكل',
    stDraft: 'مسودة', stSent: 'أُرسلت', stPartial: 'جزئية', stPaid: 'مدفوعة', stVoid: 'ملغاة',
    clients: 'العملاء', newClient: '+ عميل', business: 'بيانات المنشأة',
    bName: 'الاسم التجاري', bLegal: 'الاسم القانوني (يظهر في QR)', bVat: 'الرقم الضريبي (15 خانة)', bCr: 'السجل التجاري',
    bPhone: 'الهاتف', bEmail: 'البريد', bAddr: 'العنوان', tax: 'الضريبة والعملة',
    vatPreset: 'قيمة مضافة جاهزة', custom: 'مخصص', vatRate: 'نسبة الضريبة %', currency: 'العملة', prefix: 'بادئة الترقيم',
    terms: 'شروط تظهر أسفل الفاتورة', lang: 'لغة الواجهة', lockSec: 'الحماية والبيانات',
    setLock: '🔒 تعيين رمز مرور', backup: '⬇️ نسخة احتياطية JSON', csv: '⬇️ تصدير CSV',
    reset: '⚠️ تهيئة نهائية (حذف الكل)',
    lockNote: 'الرمز يُحفظ مُهشّراً (SHA-256) داخل data/db.json فقط — بلا سحابة، بلا تتبع. المحرك: ملقم واحد صفر-اعتماديات يطابق ZATCA TLV مُتحقّقة بـVision.',
    newInvTitle: 'فاتورة جديدة', editInvTitle: 'تعديل الفاتورة', client: 'العميل', cliQuick: 'أو اسم سريع (نقدي)',
    issueDate: 'تاريخ الإصدار', dueDate: 'الاستحقاق', cur: 'العملة',
    iDesc: 'الوصف', iQty: 'كمية', iPrice: 'سعر', iVat: 'ض%', iDisc: 'خصم', iLine: 'بند', addRow: '+ بند',
    subtotal: 'المجموع قبل الضريبة', vatT: 'الضريبة', total: 'الإجمالي',
    serverAuth: 'الملقم هو المرجع النهائي في الحساب', notes: 'ملاحظات', save: 'حفظ', cancel: 'إلغاء',
    invoiceNo: 'فاتورة', print: '🖨️ طباعة / PDF', close: 'إغلاق',
    num: 'الرقم', date: 'التاريخ', due: 'الاستحقاق', status: 'الحالة', amount: 'المبلغ', actions: 'إجراءات',
    name: 'الاسم', vatNo: 'الرقم الضريبي', email: 'البريد', phone: 'الهاتف', edit: 'تعديل', del: 'حذف',
    clientName: 'العميل', qty: 'الكمية', price: 'السعر', desc: 'الوصف',
    conf: 'تأكيد الحذف؟', payFull: 'تسديد كامل', addPay: 'خدف جزئي…', addPayT: 'دفعة جديدة',
    pAmount: 'المبلغ', pDate: 'التاريخ', pMethod: 'الطريقة', methodCash: 'نقدي', methodBank: 'تحويل',
    methodCard: 'بطاقة', methodUsdt: 'USDT', pNote: 'ملاحظة', remaining: 'المتبقي',
    toSent: 'حدد كأُرسلت', toPaid: 'حدد كمدفوعة', toVoid: 'إلغاء الفاتورة',
    saved: 'تم الحفظ ✓', deleted: 'حُذف', error: 'خطأ', refunded: 'تم',
    qrMissing: 'لا QR (الرقم الضريبي غير معيّن في الإعدادات أو العميل)',
    tlvTitle: 'حقل TLV (ZATCA Phase-1):', paidOn: 'مدفوعات:',
    resetWarn: 'سيُحذف كل شيء نهائياً — اكتب RESET للتأكيد:', resetGo: 'تهيئة',
    noData: 'لا بيانات بعد — أنشئ أول فاتورة 👇',
    locked: 'منشأة مقفلة برمز', setLockT: 'تعيين رمز المرور', lockCode: 'الرمز (4+ خانات)', lockHint: 'لا يمكن تغييره لاحقاً من الواجهة — يُعدّل يدوياً في data/db.json',
    alreadyLocked: 'الرمز معيّن مسبقاً (يُعدّل يدوياً في data/db.json)',
    footer: '**Baran Avisat** — Professional Programmer\n📧 baranavisat@gmail.com · 📞 +90 531 326 37 22 · WhatsApp: wa.me/905313263722\nGitHub: github.com/aoodiakdiro0001-ops\nSupport BTC: bc1q8dhtdrndxsl70e97t8grydfe6pjue37zrhzf6c · USDT-TRC20: TLWdTjqqogkXNEXGiPWsGdjFP6ioycxeWW',
  },
  tr: {
    gateHint: 'Şifre ile korumalı — devam etmek için kodu girin', unlock: 'Aç',
    tabDash: 'Panel', tabInv: 'Faturalar', tabCli: 'Müşteriler', tabSet: 'Ayarlar',
    stMtd: 'Bu ayın satışı', stVat: 'Tahsil edilmeyen KDV', stOverdue: 'Geciken faturalar', stOpen: 'Açık tutarlar',
    monthly: 'Aylık satış', last6: 'son 6 ay', topClients: 'En iyi müşteriler', recent: 'Son faturalar',
    newInvoice: '+ Yeni fatura', allInvoices: 'Tüm faturalar', searchPh: 'numara/müşteri ara…', allStatus: 'Hepsi',
    stDraft: 'Taslak', stSent: 'Gönderildi', stPartial: 'Kısmi', stPaid: 'Ödendi', stVoid: 'İptal',
    clients: 'Müşteriler', newClient: '+ Müşteri', business: 'Firma bilgileri',
    bName: 'Ticari ad', bLegal: 'Yasal ad (QR görüntülenir)', bVat: 'Vergi no (15 hane)', bCr: 'Ticaret sicil',
    bPhone: 'Telefon', bEmail: 'E-posta', bAddr: 'Adres', tax: 'Vergi ve para birimi',
    vatPreset: 'Hazır KDV', custom: 'Özel', vatRate: 'Vergi oranı %', currency: 'Para birimi', prefix: 'Numara öneki',
    terms: 'Fatura sonunda görünür şartlar', lang: 'Arayüz dili', lockSec: 'Güvenlik ve veri',
    setLock: '🔒 Şifre belirle', backup: '⬇️ JSON yedek', csv: '⬇️ CSV dışa aktar',
    reset: '⚠️ Tam sıfırlama (hepsini sil)',
    lockNote: 'Kod yalnızca data/db.json içinde SHA-256 hash tutulur — bulut yok, izleme yok. Motor: zero-dep tek sunucu, Vision ile doğrulanmış ZATCA TLV.',
    newInvTitle: 'Yeni fatura', editInvTitle: 'Faturayı düzelt', client: 'Müşteri', cliQuick: 'veya hızlı ad (nakit)',
    issueDate: 'Düzenleme tarihi', dueDate: 'Vade', cur: 'Para birimi',
    iDesc: 'Açıklama', iQty: 'Miktar', iPrice: 'Fiyat', iVat: 'KDV%', iDisc: 'İndirim', iLine: 'Satır', addRow: '+ satır',
    subtotal: 'Vergi öncesi toplam', vatT: 'Vergi', total: 'Genel toplam',
    serverAuth: 'Sunucu hesaplamada nihai mercidir', notes: 'Notlar', save: 'Kaydet', cancel: 'İptal',
    invoiceNo: 'Fatura', print: '🖨️ Yazdır / PDF', close: 'Kapat',
    num: 'No', date: 'Tarih', due: 'Vade', status: 'Durum', amount: 'Tutar', actions: 'İşlemler',
    name: 'Ad', vatNo: 'Vergi no', email: 'E-posta', phone: 'Telefon', edit: 'Düzelt', del: 'Sil',
    clientName: 'Müşteri', qty: 'Miktar', price: 'Fiyat', desc: 'Açıklama',
    conf: 'Silme onaylanıyor mu?', payFull: 'Tam ödeme', addPay: 'Kısmi ödeme…', addPayT: 'Yeni ödeme',
    pAmount: 'Tutar', pDate: 'Tarih', pMethod: 'Yöntem', methodCash: 'Nakit', methodBank: 'Havale',
    methodCard: 'Kart', methodUsdt: 'USDT', pNote: 'Not', remaining: 'Kalan',
    toSent: 'Gönderildi işaretle', toPaid: 'Ödendi işaretle', toVoid: 'Faturayı iptal et',
    saved: 'Kaydedildi ✓', deleted: 'Silindi', error: 'Hata', refunded: 'Tamam',
    qrMissing: 'QR yok (VAT no tanımlı değil)', tlvTitle: 'TLV alanı (ZATCA Phase-1):', paidOn: 'Ödemeler:',
    resetWarn: 'Her şey kalıcı olarak silinecek — onay için RESET yazın:', resetGo: 'Sıfırla',
    noData: 'Henüz veri yok — ilk faturayı oluşturun 👇',
    locked: 'Kod korumalı', setLockT: 'Şifre belirleme', lockCode: 'Kod (4+ karakter)', lockHint: 'Arayüzden sonradan değiştirilemez — data/db.json içinden elle düzenlenir',
    alreadyLocked: 'Kod zaten belirlendi (data/db.json içinden elle düzenlenir)',
    footer: '**Baran Avisat** — Professional Programmer\n📧 baranavisat@gmail.com · 📞 +90 531 326 37 22 · WhatsApp: wa.me/905313263722\nGitHub: github.com/aoodiakdiro0001-ops\nSupport BTC: bc1q8dhtdrndxsl70e97t8grydfe6pjue37zrhzf6c · USDT-TRC20: TLWdTjqqogkXNEXGiPWsGdjFP6ioycxeWW',
  },
  en: {
    gateHint: 'Passcode protected — enter your code to continue', unlock: 'Unlock',
    tabDash: 'Dashboard', tabInv: 'Invoices', tabCli: 'Clients', tabSet: 'Settings',
    stMtd: 'Month sales', stVat: 'VAT outstanding (uncollected)', stOverdue: 'Overdue invoices', stOpen: 'Open amounts',
    monthly: 'Monthly sales', last6: 'last 6 months', topClients: 'Top clients', recent: 'Recent invoices',
    newInvoice: '+ New invoice', allInvoices: 'All invoices', searchPh: 'search number/client…', allStatus: 'All',
    stDraft: 'Draft', stSent: 'Sent', stPartial: 'Partial', stPaid: 'Paid', stVoid: 'Void',
    clients: 'Clients', newClient: '+ Client', business: 'Business details',
    bName: 'Trade name', bLegal: 'Legal name (shown in QR)', bVat: 'VAT number (15 digits)', bCr: 'CR number',
    bPhone: 'Phone', bEmail: 'Email', bAddr: 'Address', tax: 'Tax & currency',
    vatPreset: 'VAT preset', custom: 'Custom', vatRate: 'VAT rate %', currency: 'Currency', prefix: 'Numbering prefix',
    terms: 'Terms shown at invoice bottom', lang: 'UI language', lockSec: 'Security & data',
    setLock: '🔒 Set passcode', backup: '⬇️ JSON backup', csv: '⬇️ Export CSV',
    reset: '⚠️ Full reset (delete all)',
    lockNote: 'The code is stored hashed (SHA-256) inside data/db.json only — no cloud, no tracking. Engine: zero-dep single server with Vision-verified ZATCA TLV.',
    newInvTitle: 'New invoice', editInvTitle: 'Edit invoice', client: 'Client', cliQuick: 'or quick name (cash)',
    issueDate: 'Issue date', dueDate: 'Due date', cur: 'Currency',
    iDesc: 'Description', iQty: 'Qty', iPrice: 'Price', iVat: 'VAT%', iDisc: 'Disc.', iLine: 'Line', addRow: '+ line',
    subtotal: 'Subtotal before VAT', vatT: 'VAT', total: 'Total',
    serverAuth: 'The server is the final authority on totals', notes: 'Notes', save: 'Save', cancel: 'Cancel',
    invoiceNo: 'Invoice', print: '🖨️ Print / PDF', close: 'Close',
    num: 'No', date: 'Date', due: 'Due', status: 'Status', amount: 'Amount', actions: 'Actions',
    name: 'Name', vatNo: 'VAT number', email: 'Email', phone: 'Phone', edit: 'Edit', del: 'Delete',
    clientName: 'Client', qty: 'Qty', price: 'Price', desc: 'Desc',
    conf: 'Confirm deletion?', payFull: 'Settle full', addPay: 'Partial payment…', addPayT: 'New payment',
    pAmount: 'Amount', pDate: 'Date', pMethod: 'Method', methodCash: 'Cash', methodBank: 'Transfer',
    methodCard: 'Card', methodUsdt: 'USDT', pNote: 'Note', remaining: 'Remaining',
    toSent: 'Mark sent', toPaid: 'Mark paid', toVoid: 'Void invoice',
    saved: 'Saved ✓', deleted: 'Deleted', error: 'Error', refunded: 'Done',
    qrMissing: 'No QR (VAT number missing in settings or client)',
    tlvTitle: 'TLV field (ZATCA Phase-1):', paidOn: 'Payments:',
    resetWarn: 'Everything will be permanently deleted — type RESET to confirm:', resetGo: 'Reset',
    noData: 'No data yet — create your first invoice 👇',
    locked: 'Passcode-protected', setLockT: 'Set passcode', lockCode: 'Code (4+ chars)', lockHint: 'Cannot be changed later from UI — edit data/db.json manually',
    alreadyLocked: 'Passcode already set (edit data/db.json manually)',
    footer: '**Baran Avisat** — Professional Programmer\n📧 baranavisat@gmail.com · 📞 +90 531 326 37 22 · WhatsApp: wa.me/905313263722\nGitHub: github.com/aoodiakdiro0001-ops\nSupport BTC: bc1q8dhtdrndxsl70e97t8grydfe6pjue37zrhzf6c · USDT-TRC20: TLWdTjqqogkXNEXGiPWsGdjFP6ioycxeWW',
  },
};
const t = k => (I18N[S.lang] && I18N[S.lang][k]) || I18N.ar[k] || k;
function applyI18n() {
  document.documentElement.lang = S.lang;
  document.documentElement.dir = S.lang === 'ar' ? 'rtl' : 'ltr';
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of document.querySelectorAll('[data-i18n-ph]')) el.placeholder = t(el.dataset.i18nPh);
}

/* ── api ── */
async function api(path, opts = {}) {
  const headers = opts.headers || {};
  if (S.code) headers['X-Fatora-Code'] = S.code;
  if (opts.body != null) headers['Content-Type'] = 'application/json';
  const res = await fetch(path, { ...opts, headers });
  let j = null;
  try { j = await res.json(); } catch (e) { /* csv/backup */ }
  if (!res.ok) { const err = new Error((j && j.error) || ('HTTP ' + res.status)); err.payload = j; throw err; }
  return j != null ? j : true;
}
const toast = (msg, err) => {
  const el = $('toast');
  el.textContent = msg; el.className = 'toast' + (err ? ' err' : '');
  clearTimeout(el._t); el._t = setTimeout(() => el.classList.add('hidden'), 2600);
};

/* ── theme ── */
function setTheme(th) {
  document.documentElement.dataset.theme = th;
  localStorage.setItem('fbtheme', th);
  $('themeBtn').textContent = th === 'light' ? '☀️' : '🌙';
}

/* ── boot ── */
async function boot() {
  setTheme(localStorage.getItem('fbtheme') || 'dark');
  $('themeBtn').addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'));
  let health;
  try { health = await api('/api/health'); }
  catch (e) { document.body.innerHTML = '<p style="margin:40vh 20px;text-align:center;font-size:18px">Server unreachable — is <b>node server.js</b> running?</p>'; return; }
  S.authActive = !!health.auth;
  try { const ss = await api('/api/settings'); S.settings = ss.settings; S.lang = ss.settings.lang || 'ar'; } catch (e) { }
  applyI18n();
  $('footerCredit').textContent = t('footer').replace(/\*\*/g, '');
  $('gateBtn').addEventListener('click', tryUnlock);
  $('gateCode').addEventListener('keydown', e => { if (e.key === 'Enter') tryUnlock(); });
  if (S.authActive) {
    $('gate').classList.remove('hidden');
    S.code = sessionStorage.getItem('fbcode');
    if (S.code) await tryUnlock(true);
    return; // gate drives the rest
  }
  await enterApp();
}
async function tryUnlock(silent) {
  const code = $('gateCode').value || S.code;
  if (!code) return;
  try {
    // any write ping verifies the code (cheap & atomic)
    S.code = code;
    await api('/api/settings', { method: 'PUT', body: JSON.stringify({}) });
    sessionStorage.setItem('fbcode', code);
    $('gate').classList.add('hidden'); $('gateErr').textContent = '';
    await enterApp();
  } catch (e) {
    S.code = null; sessionStorage.removeItem('fbcode');
    if (!silent) $('gateErr').textContent = t('error') + ': ' + e.message;
  }
}

async function enterApp() {
  $('app').classList.remove('hidden');
  const ss = await api('/api/settings'); S.settings = ss.settings; S.lang = ss.settings.lang || 'ar';
  applyI18n(); $('footerCredit').textContent = t('footer').replace(/\*\*/g, '');
  wireTabs(); wireGlobal(); wireEditor(); wireClients(); wireSettings();
  $('lockBtn').addEventListener('click', openLock); $('resetBtn').addEventListener('click', doReset);
  await refreshAll();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/service-worker.js').catch(() => { });
}
async function refreshAll() {
  S.settings = (await api('/api/settings')).settings;
  const cl = await api('/api/clients'); S.clients = cl.clients || [];
  const iv = await api('/api/invoices' + (S.view === 'inv' ? invQS() : '')); S.invoices = iv.invoices || [];
  await renderStats(); renderRecent(); if (S.view === 'inv') renderInv(); if (S.view === 'cli') renderCli(); fillSettings();
}

/* ── tabs ── */
function wireTabs() {
  for (const btn of document.querySelectorAll('.tab')) btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active'); S.view = btn.dataset.view;
    for (const v of document.querySelectorAll('.view')) v.classList.add('hidden');
    $('view-' + S.view).classList.remove('hidden');
    if (S.view === 'inv') api('/api/invoices' + invQS()).then(j => { S.invoices = j.invoices || []; renderInv(); });
    if (S.view === 'cli') renderCli();
    if (S.view === 'dash') renderStats().then(() => renderRecent());
  });
}
const invQS = () => '?q=' + encodeURIComponent($('invSearch').value || '') + ($('invStatus').value ? '&status=' + $('invStatus').value : '');

/* ── dashboard ── */
async function renderStats() {
  const st = await api('/api/stats');
  const cur = ' ' + (st.currency || S.settings.currency || '');
  $('stMtd').textContent = money(st.mtdTotal) + cur;
  $('stVat').textContent = money(st.vatOutstanding) + cur;
  $('stOverdue').textContent = st.overdueCount;
  $('stOpen').textContent = money(st.openTotal) + cur;
  const ms = Object.entries(st.months || {}).sort((a, b) => a[0].localeCompare(b[0])).slice(-6);
  const max = Math.max(1, ...ms.map(m => m[1]));
  $('chart').replaceChildren(...ms.map(k => {
    const col = document.createElement('div'); col.className = 'bar-col';
    const bar = document.createElement('div'); bar.className = 'bar'; const h = Math.max(2, Math.round((k[1] / max) * 100));
    bar.style.height = h + '%'; bar.title = money(k[1]);
    const cap = document.createElement('span'); cap.className = 'bar-cap'; cap.textContent = k[0].slice(2) + ' · ' + shortMoney(k[1]);
    col.appendChild(bar); col.appendChild(cap); return col;
  }));
  $('topClients').replaceChildren(...(st.topClients.length ? st.topClients.map(c => {
    const row = document.createElement('div'); row.className = 'top-row';
    row.innerHTML = '<span class="top-name" title="' + esc(c.name) + '">' + esc(c.name) + '</span>';
    const amt = document.createElement('span'); amt.className = 'top-amt'; amt.textContent = money(c.total);
    row.appendChild(amt); return row;
  }) : [emptyDiv(t('noData'))]));
}
const shortMoney = n => (n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : '');
const emptyDiv = msg => { const d = document.createElement('div'); d.className = 'muted sm'; d.textContent = msg; return d; };

function statusChip(inv) {
  const overdue = inv.dueDate && inv.dueDate < todayISO() && ['sent', 'partial'].includes(inv.status) && inv.total - paidSum(inv) > 0.009;
  const cls = overdue ? 'overdue' : inv.status;
  const label = overdue ? { ar: 'متأخرة', tr: 'Gecikmiş', en: 'Overdue' }[S.lang] : t('st' + inv.status[0].toUpperCase() + inv.status.slice(1));
  return '<span class="chip ' + cls + '">' + label + '</span>';
}
const paidSum = inv => (inv.payments || []).reduce((s, p) => s + Number(p.amount), 0);

function renderRecent() {
  const list = S.invoices.slice(0, 6);
  $('recentHead').innerHTML = '<tr>' + [t('num'), t('clientName'), t('date'), t('status'), t('amount')].map(h => '<th>' + h + '</th>').join('') + '</tr>';
  $('recentBody').replaceChildren(...(list.length ? list.map(inv => {
    const tr = document.createElement('tr'); tr.className = 'clickable';
    tr.innerHTML = '<td class="mono">' + esc(inv.number) + '</td><td>' + esc(inv.clientSnapshot.name) + '</td>' +
      '<td class="num">' + esc(inv.issueDate) + '</td><td>' + statusChip(inv) + '</td>' +
      '<td class="num">' + money(inv.total) + ' ' + esc(inv.currency) + '</td>';
    tr.addEventListener('click', () => viewInvoice(inv.id));
    return tr;
  }) : [emptyTr(5, t('noData'))]));
}
function emptyTr(cols, msg) { const tr = document.createElement('tr'); tr.innerHTML = '<td colspan="' + cols + '" class="muted sm">' + esc(msg) + '</td>'; return tr; }

/* ── invoices list ── */
function renderInv() {
  $('invHead').innerHTML = '<tr>' + [t('num'), t('clientName'), t('date'), t('due'), t('status'), t('amount'), t('actions')].map(h => '<th>' + h + '</th>').join('') + '</tr>';
  $('invBody').replaceChildren(...(S.invoices.length ? S.invoices.map(inv => {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td class="mono clickable rlink">' + esc(inv.number) + '</td><td>' + esc(inv.clientSnapshot.name) + '</td>' +
      '<td class="num">' + esc(inv.issueDate) + '</td><td class="num">' + esc(inv.dueDate || '—') + '</td>' +
      '<td>' + statusChip(inv) + '</td><td class="num"><b>' + money(inv.total) + '</b> ' + esc(inv.currency) + '</td>';
    tr.querySelector('.rlink').addEventListener('click', () => viewInvoice(inv.id));
    const acts = document.createElement('td');
    for (const [label, fn] of [
      ['✏️', () => openEditor(inv)], ['🖨️', () => viewInvoice(inv.id)], ['🗑️', () => deleteInvoice(inv)],
    ]) {
      const b = document.createElement('button'); b.className = 'icon-act'; b.title = b.textContent = label;
      b.addEventListener('click', fn); acts.appendChild(b);
    }
    tr.appendChild(acts); return tr;
  }) : [emptyTr(7, t('noData'))]));
}
async function deleteInvoice(inv) {
  if (!confirm(t('conf') + ' (' + inv.number + ')')) return;
  const r = await api('/api/invoices/' + inv.id, { method: 'DELETE' });
  toast(r.deleted ? t('deleted') : t('refunded')); await refreshAll();
}

/* ── invoice editor ── */
function wireEditor() {
  $('newInvoice').addEventListener('click', () => openEditor(null));
  $('quickNew').addEventListener('click', () => { switchTab('inv'); openEditor(null); });
  $('edClose').addEventListener('click', closeEditor);
  $('edCancel').addEventListener('click', closeEditor);
  $('edAddRow').addEventListener('click', () => { S.rows.push({ desc: '', qty: 1, price: 0, vatRate: Number(S.settings.vat.rate) || 0, discountType: null, discountValue: 0 }); renderRows(); });
  $('edSave').addEventListener('click', saveInvoice);
  $('invSearch').addEventListener('input', debounce(() => api('/api/invoices' + invQS()).then(j => { S.invoices = j.invoices || []; renderInv(); }), 300));
  $('invStatus').addEventListener('change', () => api('/api/invoices' + invQS()).then(j => { S.invoices = j.invoices || []; renderInv(); }));
}
const debounce = (fn, ms) => { let h; return (...a) => { clearTimeout(h); h = setTimeout(() => fn(...a), ms); }; };
function switchTab(v) {
  const btn = document.querySelector('.tab[data-view="' + v + '"]'); if (btn) btn.click();
}
function openEditor(inv) {
  S.editing = inv || null;
  $('edTitle').textContent = inv ? (t('editInvTitle') + ' ' + inv.number) : t('newInvTitle');
  S.rows = inv ? JSON.parse(JSON.stringify(inv.items)) : [{ desc: '', qty: 1, price: 0, vatRate: Number(S.settings.vat.rate) || 0, discountType: null, discountValue: 0 }];
  // client select
  const sel = $('edClient'); sel.innerHTML = '<option value="">— ' + t('client') + ' —</option>' +
    S.clients.map(c => '<option value="' + esc(c.id) + '"' + (inv && inv.clientId === c.id ? ' selected' : '') + '>' + esc(c.name) + (c.vatNumber ? ' · ' + esc(c.vatNumber) : '') + '</option>').join('');
  $('edQuickName').value = ''; $('edIssue').value = inv ? inv.issueDate : todayISO();
  $('edDue').value = inv ? (inv.dueDate || '') : ''; $('edCur').value = inv ? inv.currency : S.settings.currency;
  $('edNotes').value = inv ? (inv.notes || '') : ''; $('edCur').value = inv ? inv.currency : S.settings.currency;
  renderRows();
  $('editor').classList.remove('hidden');
}
function closeEditor() { $('editor').classList.add('hidden'); S.editing = null; }
function renderRows() {
  const tb = $('edRows'); tb.replaceChildren();
  S.rows.forEach((r, i) => {
    const tr = document.createElement('tr');
    const cell = (name, val, type, extra) => {
      const td = document.createElement('td');
      const inp = document.createElement(type || 'input');
      inp.className = 'cell-input'; inp.value = val == null ? '' : val;
      if (inp instanceof HTMLInputElement) { inp.type = type ? 'text' : 'text'; if (extra) Object.assign(inp, extra); }
      inp.addEventListener('input', ev => { r[name] = inp.value; estimate(); });
      td.appendChild(inp); return td;
    };
    tr.appendChild(cell('desc', r.desc, 'input', { maxlength: 120 }));
    const num = (name, val, attrs) => {
      const td = document.createElement('td'); const inp = document.createElement('input');
      Object.assign(inp, { type: 'number', min: attrs.min || 0, step: attrs.step || 'any', className: 'cell-input', value: val });
      if (attrs.max) inp.max = attrs.max;
      inp.addEventListener('input', () => { r[name] = Number(inp.value); estimate(); });
      td.appendChild(inp); return td;
    };
    tr.appendChild(num('qty', r.qty, { step: '0.01' }));
    tr.appendChild(num('price', r.price, { step: '0.01' }));
    tr.appendChild(num('vatRate', r.vatRate, { step: '0.01', max: 100 }));
    // discount
    const dtd = document.createElement('td');
    const wrap = document.createElement('div');
    const sel = document.createElement('select'); sel.className = 'cell-input';
    sel.innerHTML = '<option value="">—</option><option value="percent">%</option><option value="amount">Σ</option>';
    sel.value = r.discountType || '';
    const dv = document.createElement('input'); dv.type = 'number'; dv.className = 'cell-input'; dv.step = '0.01';
    dv.value = r.discountValue || 0; dv.disabled = !sel.value;
    const sync = () => { r.discountType = sel.value || null; r.discountValue = Number(dv.value) || 0; dv.disabled = !sel.value; estimate(); };
    sel.addEventListener('change', sync); dv.addEventListener('input', sync);
    wrap.style.display = 'flex'; wrap.style.gap = '4px'; wrap.appendChild(sel); wrap.appendChild(dv);
    dtd.appendChild(wrap); tr.appendChild(dtd);
    // line total (readonly reflect)
    const ltd = document.createElement('td'); const span = document.createElement('b'); span.className = 'num'; span.id = 'lt_' + i; ltd.appendChild(span); tr.appendChild(ltd);
    const del = document.createElement('button'); del.className = 'icon-act'; del.textContent = '✕';
    del.addEventListener('click', () => { S.rows.splice(i, 1); renderRows(); estimate(); });
    const actd = document.createElement('td'); actd.appendChild(del); tr.appendChild(actd);
    tb.appendChild(tr);
  });
  estimate();
}
function estimate() {
  const disc = r => r.discountType === 'percent' ? (Number(r.qty) * Number(r.price) * (Number(r.discountValue) || 0)) / 100
    : r.discountType === 'amount' ? Number(r.discountValue) : 0;
  let sub = 0, vat = 0;
  S.rows.forEach((r, i) => {
    const net = Math.max(0, Number(r.qty) * Number(r.price) - disc(r));
    sub += net; vat += net * (Math.max(0, Math.min(100, Number(r.vatRate))) / 100);
    const el = document.getElementById('lt_' + i);
    if (el) el.textContent = money(net);
  });
  $('edSub').textContent = money(sub); $('edVat').textContent = money(vat);
  $('edTot').textContent = money(sub + vat);
}
async function saveInvoice() {
  const body = {
    clientId: $('edClient').value || null,
    clientNameOverride: $('edQuickName').value || null,
    items: S.rows.map(r => ({
      desc: r.desc || '', qty: Number(r.qty) || 0, price: Number(r.price) || 0,
      vatRate: Number(r.vatRate) || 0, discountType: r.discountType, discountValue: Number(r.discountValue) || 0,
    })),
    issueDate: $('edIssue').value, dueDate: $('edDue').value || '',
    currency: $('edCur').value || S.settings.currency, notes: $('edNotes').value,
  };
  try {
    if (S.editing) await api('/api/invoices/' + S.editing.id, { method: 'PUT', body: JSON.stringify(body) });
    else await api('/api/invoices', { method: 'POST', body: JSON.stringify(body) });
    toast(t('saved')); closeEditor(); await refreshAll();
  } catch (e) { toast(t('error') + ': ' + e.message, true); }
}

/* ── invoice view / print ── */
async function viewInvoice(id) {
  const { invoice: inv } = await api('/api/invoices/' + id);
  $('vwTitle').textContent = inv.number;
  const b = S.settings.business;
  const paid = paidSum(inv), remaining = Math.max(0, inv.total - paid);
  let q = null;
  try { q = await api('/api/qr/' + inv.id); } catch (e) { }
  const qrHtml = q ? ('<div class="qr">' + q.svg + '</div>') : ('<div class="muted sm">' + esc(t('qrMissing')) + '</div>');
  const dir = S.lang === 'ar' ? 'rtl' : 'ltr';
  const L = {
    ar: { title: 'فاتورة ضريبية', items: ['البند', 'الكمية', 'السعر', 'الخصم', 'الصافي'], sub: 'المجموع قبل الضريبة', vat: 'ضريبة القيمة المضافة', total: 'الإجمالي', terms: 'الشروط:', gte: 'شكراً لتعاملكم معنا' },
    tr: { title: 'Fatura', items: ['Açıklama', 'Miktar', 'Fiyat', 'İndirim', 'Net'], sub: 'Vergi öncesi toplam', vat: 'KDV', total: 'Genel toplam', terms: 'Şartlar:', gte: 'Çalıştığınız için teşekkürler' },
    en: { title: 'TAX INVOICE', items: ['Description', 'Qty', 'Price', 'Disc.', 'Net'], sub: 'Subtotal', vat: 'VAT', total: 'Total', terms: 'Terms:', gte: 'Thank you for your business' },
  }[S.lang];
  const r2 = x => Math.round((x + Number.EPSILON) * 100) / 100;
  const lineRows = inv.items.map(it => {
    const d = (it.discountType === 'percent' ? (it.qty * it.price * it.discountValue) / 100 : (it.discountType === 'amount' ? it.discountValue : 0)) || 0;
    const net = Math.max(0, it.qty * it.price - d);
    return '<tr><td>' + esc(it.desc) + (it.vatRate ? ' <span class="muted sm">+' + it.vatRate + '%</span>' : '') + '</td>' +
      '<td class="num">' + money(it.qty) + '</td><td class="num">' + money(it.price) + '</td>' +
      '<td class="num">' + (d ? money(d) : '—') + '</td><td class="num"><b>' + money(net) + '</b></td></tr>';
  }).join('');
  const pays = (inv.payments || []).map(p => '<div class="trow"><span>' + esc(p.date) + ' · ' + esc(p.method) + '</span><span class="num">' + money(p.amount) + '</span></div>').join('');
  $('sheet').innerHTML =
    '<div class="inv-head">' +
      '<div><h3 class="inv-brand">' + esc(b.name || b.legalName || 'Baran FatoraBox') + '</h3>' +
      '<div class="inv-meta">' + [b.vatNumber && ('VAT ' + esc(b.vatNumber)), b.crNumber && ('CR ' + esc(b.crNumber)), esc(b.address)] .filter(Boolean).map(esc).join(' · ') + '</div>' +
      '<div class="inv-meta">' + esc(b.phone) + (b.phone && b.email ? ' · ' : '') + esc(b.email) + '</div></div>' +
      '<div class="qrwrap">' + qrHtml + '<div class="tlv">' + esc(inv.tlv || '') + '</div></div>' +
      '<div><h2 class="inv-title">' + L.title + '</h2><div class="inv-num mono">' + esc(inv.number) + '</div>' +
      '<div class="inv-num">' + esc(inv.issueDate) + (inv.dueDate ? ' → ' + esc(inv.dueDate) : '') + '</div>' +
      '<div class="inv-meta status-line"><span class="status-chip ' + inv.status + '">' + esc(t('st' + inv.status[0].toUpperCase() + inv.status.slice(1))) + '</span></div></div>' +
    '</div>' +
    '<p class="client-line"><b>' + esc(t('clientName')) + ':</b> ' + esc(inv.clientSnapshot.name) +
      (inv.clientSnapshot.vatNumber ? ' · VAT ' + esc(inv.clientSnapshot.vatNumber) : '') +
      (inv.clientSnapshot.address ? '<br><span class="muted sm">' + esc(inv.clientSnapshot.address) + '</span>' : '') + '</p>' +
    '<table class="sheet-items"><thead><tr>' + L.items.map(h => '<th>' + h + '</th>').join('') + '</tr></thead><tbody>' + lineRows + '</tbody></table>' +
    '<div class="sheet-totals">' +
      '<div class="trow"><span>' + L.sub + '</span><span class="num">' + money(inv.subtotal) + '</span></div>' +
      '<div class="trow"><span>' + L.vat + '</span><span class="num">' + money(inv.vatTotal) + '</span></div>' +
      '<div class="trow tgrand"><span>' + L.total + ' (' + esc(inv.currency) + ')</span><span class="num">' + money(inv.total) + '</span></div>' +
      (pays ? '<div class="sheet-pays"><b>' + t('paidOn') + '</b>' + pays +
        '<div class="trow"><b>' + t('remaining') + '</b><b class="num">' + money(remaining) + '</b></div></div>' : '') +
    '</div>' +
    (inv.notes ? '<p class="muted sm sheet-note">' + esc(inv.notes) + '</p>' : '') +
    (S.settings.terms ? '<p class="muted sm sheet-terms"><b>' + L.terms + '</b> ' + esc(S.settings.terms) + '</p>' : '') +
    '<div class="sheet-foot"><span>' + L.gte + '</span><span>Baran FatoraBox v1.0.0 · baranavisat@gmail.com · +90 531 326 37 22</span></div>';
  $('viewer').classList.remove('hidden');
  // actions
  const vwPrint = $('vwPrint'); vwPrint.onclick = () => window.print();
  $('vwClose').onclick = () => $('viewer').classList.add('hidden');
  if (!$('vwActions')) {
    const bar = document.createElement('div'); bar.className = 'row-tools noprint'; bar.id = 'vwActions';
    document.querySelector('#viewer .modal-head').appendChild(bar);
  }
  const bar = $('vwActions'); bar.innerHTML = '';
  const mkBtn = (label, fn, cls) => { const btn = document.createElement('button'); btn.className = 'btn sm ' + (cls || ''); btn.textContent = label; btn.addEventListener('click', fn); bar.appendChild(btn); };
  if (inv.status !== 'paid' && inv.status !== 'void') {
    mkBtn('💰 ' + t('addPay'), () => openPayment(inv));
    mkBtn('✅ ' + t('payFull'), async () => { await api('/api/invoices/' + inv.id, { method: 'PATCH', body: JSON.stringify({ status: 'paid' }) }); toast(t('saved')); $('viewer').classList.add('hidden'); await refreshAll(); }, 'primary');
    mkBtn('📤 ' + t('toSent'), async () => { await api('/api/invoices/' + inv.id, { method: 'PATCH', body: JSON.stringify({ status: 'sent' }) }); toast(t('saved')); await viewInvoice(inv.id); await refreshAll(); });
  }
  if (inv.status !== 'void') mkBtn('🗑️ ' + t('toVoid'), async () => { if (!confirm(t('conf'))) return; await api('/api/invoices/' + inv.id, { method: 'DELETE' }); toast(t('refunded')); $('viewer').classList.add('hidden'); await refreshAll(); });
}
function openPayment(inv) {
  const remaining = Math.max(0, inv.total - paidSum(inv));
  $('miniCard').innerHTML =
    '<div class="modal-head"><h2>' + t('addPayT') + ' — ' + esc(inv.number) + '</h2><button class="iconbtn" id="mpClose">✕</button></div>' +
    '<div class="modal-body"><div class="muted sm">' + t('remaining') + ': <b>' + money(remaining) + ' ' + esc(inv.currency) + '</b></div>' +
    '<label class="fld"><span>' + t('pAmount') + '</span><input id="mpAmt" class="field" type="number" min="0.01" step="0.01" value="' + remaining.toFixed(2) + '"></label>' +
    '<div class="form-grid">' +
    '<label class="fld"><span>' + t('pDate') + '</span><input id="mpDate" class="field" type="date" value="' + todayISO() + '"></label>' +
    '<label class="fld"><span>' + t('pMethod') + '</span><select id="mpMethod" class="field"><option value="cash">' + t('methodCash') + '</option><option value="bank">' + t('methodBank') + '</option><option value="card">' + t('methodCard') + '</option><option value="usdt">' + t('methodUsdt') + '</option></select></label>' +
    '</div><label class="fld wide"><span>' + t('pNote') + '</span><input id="mpNote" class="field" maxlength="120"></label></div>' +
    '<div class="modal-foot"><button class="btn primary" id="mpSave">' + t('save') + '</button></div>';
  $('mini').classList.remove('hidden');
  $('mpClose').onclick = () => $('mini').classList.add('hidden');
  $('mpSave').onclick = async () => {
    try {
      await api('/api/payments', { method: 'POST', body: JSON.stringify({ invoiceId: inv.id, amount: Number($('mpAmt').value), date: $('mpDate').value, method: $('mpMethod').value, note: $('mpNote').value }) });
      $('mini').classList.add('hidden'); toast(t('saved'));
      $('viewer').classList.add('hidden'); await refreshAll();
    } catch (e) { toast(t('error') + ': ' + e.message, true); }
  };
}

/* ── clients ── */
function wireClients() {
  $('newClient').addEventListener('click', () => openClient(null));
}
function renderCli() {
  $('cliHead').innerHTML = '<tr>' + [t('name'), t('vatNo'), t('phone'), t('email'), t('actions')].map(h => '<th>' + h + '</th>').join('') + '</tr>';
  $('cliBody').replaceChildren(...(S.clients.length ? S.clients.map(c => {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td><b>' + esc(c.name) + '</b>' + (c.address ? '<div class="muted sm">' + esc(c.address) + '</div>' : '') + '</td>' +
      '<td class="mono num">' + esc(c.vatNumber || '—') + '</td><td class="num">' + esc(c.phone || '—') + '</td><td>' + esc(c.email || '—') + '</td>';
    const acts = document.createElement('td');
    const b1 = document.createElement('button'); b1.className = 'icon-act'; b1.textContent = '✏️'; b1.addEventListener('click', () => openClient(c));
    const b2 = document.createElement('button'); b2.className = 'icon-act'; b2.textContent = '🗑️'; b2.addEventListener('click', async () => { if (!confirm(t('conf'))) return; await api('/api/clients/' + c.id, { method: 'DELETE' }); toast(t('deleted')); await refreshAll(); });
    acts.appendChild(b1); acts.appendChild(b2); tr.appendChild(acts); return tr;
  }) : [emptyTr(5, t('noData'))]));
}
function openClient(c) {
  $('miniCard').innerHTML =
    '<div class="modal-head"><h2>' + (c ? t('edit') + ' — ' + esc(c.name) : t('newClient')) + '</h2><button class="iconbtn" id="mcClose">✕</button></div>' +
    '<div class="modal-body"><div class="form-grid">' +
    '<label class="fld"><span>' + t('name') + '</span><input id="mcName" class="field" maxlength="120" value="' + esc(c ? c.name : '') + '"></label>' +
    '<label class="fld"><span>' + t('vatNo') + ' (15)</span><input id="mcVat" class="field" inputmode="numeric" maxlength="15" value="' + esc(c ? c.vatNumber : '') + '"></label>' +
    '<label class="fld"><span>' + t('phone') + '</span><input id="mcPhone" class="field" maxlength="40" value="' + esc(c ? c.phone : '') + '"></label>' +
    '<label class="fld"><span>' + t('email') + '</span><input id="mcEmail" class="field" maxlength="120" value="' + esc(c ? c.email : '') + '"></label>' +
    '<label class="fld wide"><span>' + t('bAddr') + '</span><input id="mcAddr" class="field" maxlength="200" value="' + esc(c ? c.address : '') + '"></label>' +
    '</div></div><div class="modal-foot"><button class="btn primary" id="mcSave">' + t('save') + '</button></div>';
  $('mini').classList.remove('hidden');
  $('mcClose').onclick = () => $('mini').classList.add('hidden');
  $('mcSave').onclick = async () => {
    const body = { name: $('mcName').value, vatNumber: $('mcVat').value, phone: $('mcPhone').value, email: $('mcEmail').value, address: $('mcAddr').value };
    try {
      if (c) await api('/api/clients/' + c.id, { method: 'PUT', body: JSON.stringify(body) });
      else await api('/api/clients', { method: 'POST', body: JSON.stringify(body) });
      $('mini').classList.add('hidden'); toast(t('saved')); await refreshAll();
    } catch (e) { toast(t('error') + ': ' + e.message, true); }
  };
}

/* ── settings ── */
const PRESETS = { KSA: [15, 'SAR'], TR: [20, 'TRY'], EG: [14, 'EGP'], AE: [5, 'AED'], BH: [10, 'BHD'], OM: [5, 'OMR'], QA: [5, 'QAR'], KW: [0, 'KWD'], JO: [16, 'JOD'] };
function fillSettings() {
  const s = S.settings, b = s.business;
  for (const [id, v] of [['bName', b.name], ['bLegal', b.legalName], ['bVat', b.vatNumber], ['bCr', b.crNumber], ['bPhone', b.phone], ['bEmail', b.email], ['bAddr', b.address], ['vatRate', s.vat.rate], ['currency', s.currency], ['prefix', s.invoicePrefix], ['terms', s.terms]])
    $(id).value = v == null ? '' : v;
  $('vatPreset').value = PRESETS[s.vat.preset] ? s.vat.preset : (s.vat.preset || 'KSA');
  $('langSel').value = s.lang || 'ar';
}
function wireSettings() {
  let saveTimer = null;
  const put = debounce(() => {
    const body = {
      business: {}, vat: { preset: $('vatPreset').value, rate: Number($('vatRate').value) },
      currency: $('currency').value, invoicePrefix: $('prefix').value, terms: $('terms').value,
    };
    for (const id of ['bName', 'bLegal', 'bVat', 'bCr', 'bPhone', 'bEmail', 'bAddr']) body.business[id.replace(/^b/, '').toLowerCase()] = $(id).value;
    // keys: name, legalName, vatNumber, crNumber, phone, email, address
    body.business = {
      name: $('bName').value, legalName: $('bLegal').value, vatNumber: $('bVat').value,
      crNumber: $('bCr').value, phone: $('bPhone').value, email: $('bEmail').value, address: $('bAddr').value,
    };
    api('/api/settings', { method: 'PUT', body: JSON.stringify(body) }).then(async r => {
      S.settings = r.settings; toast(t('saved'));
    }).catch(e => toast(t('error') + ': ' + e.message, true));
  }, 600);
  for (const id of ['bName', 'bLegal', 'bVat', 'bCr', 'bPhone', 'bEmail', 'bAddr', 'vatRate', 'currency', 'prefix', 'terms'])
    $(id).addEventListener('input', put);
  $('vatPreset').addEventListener('change', () => {
    const p = PRESETS[$('vatPreset').value];
    if (p) { $('vatRate').value = p[0]; $('currency').value = p[1]; }
    put();
  });
  $('langSel').addEventListener('change', async e => {
    S.lang = e.target.value; applyI18n(); $('footerCredit').textContent = t('footer').replace(/\*\*/g, '');
    await api('/api/settings', { method: 'PUT', body: JSON.stringify({ lang: S.lang }) });
    S.settings.lang = S.lang; toast(t('saved')); await refreshAll();
  });
}
function openLock() {
  if (S.authActive) { $('miniCard').innerHTML = '<div class="modal-head"><h2>' + t('locked') + '</h2><button class="iconbtn" id="mlClose">✕</button></div><div class="modal-body"><p class="muted sm">' + t('alreadyLocked') + '</p></div>'; $('mini').classList.remove('hidden'); $('mlClose').onclick = () => $('mini').classList.add('hidden'); return; }
  $('miniCard').innerHTML =
    '<div class="modal-head"><h2>' + t('setLockT') + '</h2><button class="iconbtn" id="mlClose">✕</button></div>' +
    '<div class="modal-body"><label class="fld"><span>' + t('lockCode') + '</span><input id="mlCode" class="field" type="password" maxlength="64"></label>' +
    '<label class="fld"><span>' + t('lockCode') + ' (×2)</span><input id="mlCode2" class="field" type="password" maxlength="64"></label>' +
    '<p class="muted sm">' + t('lockHint') + '</p></div>' +
    '<div class="modal-foot"><button class="btn primary" id="mlSave">' + t('save') + '</button></div>';
  $('mini').classList.remove('hidden');
  $('mlClose').onclick = () => $('mini').classList.add('hidden');
  $('mlSave').onclick = async () => {
    const a = $('mlCode').value, b = $('mlCode2').value;
    if (a.length < 4) return toast(t('error') + ': ≥4', true);
    if (a !== b) return toast(t('error') + ': ×2', true);
    try { await api('/api/auth/lock', { method: 'POST', body: JSON.stringify({ code: a }) }); S.authActive = true; sessionStorage.setItem('fbcode', a); S.code = a; $('mini').classList.add('hidden'); toast(t('saved')); }
    catch (e) { toast(t('error') + ': ' + e.message, true); }
  };
}
async function doReset() {
  const inp = prompt(t('resetWarn'));
  if (inp !== 'RESET') return;
  try { await api('/api/admin/reset', { method: 'DELETE' }); toast(t('refunded')); await refreshAll(); }
  catch (e) { toast(t('error') + ': ' + e.message, true); }
}

/* ── global ── */
function wireGlobal() {
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeEditor(); $('viewer').classList.add('hidden'); $('mini').classList.add('hidden'); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'n' && !S.authActive) { e.preventDefault(); openEditor(null); }
  });
  for (const m of document.querySelectorAll('.modal')) m.addEventListener('click', e => {
    if (e.target === m && m.id !== 'editor') m.classList.add('hidden');
  });
}
window.addEventListener('DOMContentLoaded', boot);
