const SUPABASE_URL = process.env.SUPABASE_URL || 'https://pxxdvjpfhhayecpouojz.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PUBLIC_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || 'sb_publishable_Y-WX1Im6Fg8RT9VZvaadZw_qMcRNmZW';
const BUCKET = 'inquiry-attachments';

function json(res, status, data) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json(data);
}
function bodyOf(req) {
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  return req.body || {};
}
function requireConfig() {
  if (!SERVICE_KEY) throw new Error('إعداد SUPABASE_SERVICE_ROLE_KEY غير موجود في Vercel.');
}
function adminAllowed(password) {
  const saved = String(process.env.ADMIN_PASSWORD || '').trim();
  return !!saved && String(password || '').trim() === saved;
}
async function studentFromRequest(req) {
  const auth = String(req.headers.authorization || '');
  const token = auth.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return null;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: PUBLIC_KEY, Authorization: `Bearer ${token}` }
  });
  if (!r.ok) return null;
  return r.json();
}
async function db(path, options={}) {
  requireConfig();
  const headers = {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {...options, headers});
  const raw = await r.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch (_) { data = raw; }
  if (!r.ok) throw new Error(data?.message || data?.error || 'فشل الاتصال بقاعدة البيانات.');
  return data;
}
async function storage(path, options={}) {
  requireConfig();
  const r = await fetch(`${SUPABASE_URL}/storage/v1/${path}`, {
    ...options,
    headers: { apikey:SERVICE_KEY, Authorization:`Bearer ${SERVICE_KEY}`, ...(options.headers||{}) }
  });
  const raw = await r.text();
  let data={};
  try { data=raw?JSON.parse(raw):{}; } catch (_) { data={message:raw}; }
  if (!r.ok) throw new Error(data.message || 'تعذر التعامل مع المرفق.');
  return data;
}
function validFile(meta) {
  const allowed = new Set([
    'image/jpeg','image/png','image/webp','application/pdf','application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/plain'
  ]);
  if (!meta || !allowed.has(meta.contentType)) throw new Error('نوع الملف غير مسموح.');
  if (!Number.isInteger(meta.size) || meta.size < 1 || meta.size > 5*1024*1024) throw new Error('حجم الملف يجب ألا يتجاوز 5 ميغابايت.');
  const name = String(meta.fileName || 'attachment').replace(/[^\p{L}\p{N}._ -]/gu,'_').slice(0,120);
  return name || 'attachment';
}
function safeStoragePath(value) {
  const path = String(value || '');
  const parts = path.split('/');
  if (path.length > 512 || parts.length < 3 || parts.some(part => !part || part === '.' || part === '..') || /[\\\u0000-\u001f]/.test(path)) {
    throw new Error('مسار مرفق غير صالح.');
  }
  return parts;
}
async function conversation(id) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(id||''))) return null;
  const rows = await db(`inquiry_conversations?id=eq.${encodeURIComponent(id)}&select=*`);
  return rows?.[0] || null;
}
async function studentOwnsConversation(id, userId) {
  const c = await conversation(id);
  return c && c.student_id === userId ? c : null;
}
async function addMessage({conversationId, senderId, senderRole, message, attachment}) {
  const row = {
    conversation_id: conversationId,
    sender_id: senderId || null,
    sender_role: senderRole,
    body: String(message || '').trim().slice(0,10000),
    attachment_path: attachment?.path || null,
    attachment_name: attachment?.name || null,
    attachment_mime: attachment?.mime || null,
    attachment_size: attachment?.size || null
  };
  if (!row.body && !row.attachment_path) throw new Error('الرسالة فارغة.');
  const rows = await db('inquiry_messages?select=*', {method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(row)});
  await db(`inquiry_conversations?id=eq.${encodeURIComponent(conversationId)}`, {
    method:'PATCH',headers:{Prefer:'return=minimal'},
    body:JSON.stringify({updated_at:new Date().toISOString(), ...(senderRole==='student'?{admin_unread:true}:{student_unread:true})})
  });
  return rows?.[0];
}
async function signedDownload(path) {
  const parts = safeStoragePath(path);
  const data = await storage(`object/sign/${BUCKET}/${parts.map(encodeURIComponent).join('/')}`, {
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({expiresIn:300})
  });
  const signed = data.signedURL || data.signedUrl;
  if (!signed) throw new Error('تعذر إنشاء رابط المرفق.');
  return signed.startsWith('http') ? signed : `${SUPABASE_URL}/storage/v1${signed}`;
}
module.exports = {json,bodyOf,adminAllowed,studentFromRequest,db,storage,validFile,safeStoragePath,conversation,studentOwnsConversation,addMessage,signedDownload,requireConfig,SUPABASE_URL,SERVICE_KEY,PUBLIC_KEY,BUCKET};
