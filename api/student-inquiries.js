const h = require('./_lib/inquiries');
module.exports = async (req,res) => {
  if (req.method === 'OPTIONS') { res.setHeader('Allow','GET, POST, OPTIONS'); return h.json(res,204,{}); }
  if (!['GET','POST'].includes(req.method)) return h.json(res,405,{error:'Method not allowed'});
  try {
    const user = await h.studentFromRequest(req);
    if (!user?.id) return h.json(res,401,{error:'سجّل الدخول باستخدام Google أولاً.'});
    const body = h.bodyOf(req);
    const action = String(req.query?.action || body.action || (req.method==='GET'?'list':''));
    if (action === 'list') {
      const rows = await h.db(`inquiry_conversations?student_id=eq.${encodeURIComponent(user.id)}&select=id,subject,status,updated_at,created_at,student_unread&order=updated_at.desc`);
      return h.json(res,200,{conversations:rows||[]});
    }
    if (action === 'create') {
      const subject=String(body.subject||'').trim().slice(0,120);
      const message=String(body.message||'').trim().slice(0,10000);
      if (!subject || !message) return h.json(res,400,{error:'أدخل عنوان الاستفسار ونص الرسالة.'});
      const rows=await h.db('inquiry_conversations?select=*',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({
        student_id:user.id,
        student_name:user.user_metadata?.full_name || user.user_metadata?.name || user.email || 'طالب',
        student_avatar:user.user_metadata?.avatar_url || user.user_metadata?.picture || '',
        subject,status:'open',student_unread:false,admin_unread:true
      })});
      const c=rows?.[0];
      if (!c) throw new Error('تعذر إنشاء الاستفسار.');
      await h.addMessage({conversationId:c.id,senderId:user.id,senderRole:'student',message});
      return h.json(res,201,{conversation:c});
    }
    const downloadParts = action === 'download-url' ? h.safeStoragePath(body.path) : null;
    const id=String(body.conversationId || req.query?.conversationId || downloadParts?.[0] || '');
    const c=await h.studentOwnsConversation(id,user.id);
    if (!c) return h.json(res,404,{error:'الاستفسار غير موجود.'});
    if (action === 'messages') {
      const [rows] = await Promise.all([
        h.db(`inquiry_messages?conversation_id=eq.${encodeURIComponent(id)}&select=id,conversation_id,sender_role,body,attachment_path,attachment_name,attachment_mime,created_at&order=created_at.asc`),
        h.db(`inquiry_conversations?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({student_unread:false})})
      ]);
      return h.json(res,200,{messages:rows||[]});
    }
    if (action === 'send') {
      const attachment=body.attachment || null;
      if (attachment) {
        const parts = h.safeStoragePath(attachment.path);
        if (parts[0] !== id || parts[1] !== user.id) return h.json(res,400,{error:'مسار المرفق غير صالح.'});
        h.validFile({fileName:attachment.name,contentType:attachment.mime,size:attachment.size});
      }
      const row=await h.addMessage({conversationId:id,senderId:user.id,senderRole:'student',message:body.message,attachment});
      return h.json(res,201,{message:row});
    }
    if (action === 'upload-url') {
      const fileName=h.validFile(body);
      const path=`${id}/${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}-${fileName}`;
      const data=await h.storage(`object/upload/sign/${h.BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({upsert:false})});
      const signedPath=data.url || data.signedURL || data.signedUrl;
      if (!signedPath) throw new Error('تعذر إنشاء رابط الرفع من Supabase.');
      const base=signedPath.startsWith('http')?signedPath:`${h.SUPABASE_URL}/storage/v1${signedPath}`;
      const uploadUrl=new URL(base);
      const existingTokens=uploadUrl.searchParams.getAll('token');
      const token=typeof data.token==='string' && data.token ? data.token : existingTokens[0];
      if (!token) throw new Error('لم يُرجع Supabase رمز الرفع.');
      // Supabase may already include token in data.url; normalize to exactly one token.
      uploadUrl.searchParams.delete('token');
      uploadUrl.searchParams.set('token',token);
      const url=uploadUrl.toString();
      return h.json(res,200,{url,path});
    }
    if (action === 'download-url') {
      const path=String(body.path||'');
      const parts=downloadParts || h.safeStoragePath(path);
      if (parts[0] !== id || ![user.id,'admin'].includes(parts[1])) return h.json(res,403,{error:'غير مسموح.'});
      const exists=await h.db(`inquiry_messages?conversation_id=eq.${encodeURIComponent(id)}&attachment_path=eq.${encodeURIComponent(path)}&select=id`);
      if (!exists?.length) return h.json(res,404,{error:'المرفق غير موجود.'});
      return h.json(res,200,{url:await h.signedDownload(path)});
    }
    return h.json(res,400,{error:'إجراء غير معروف.'});
  } catch(e) { return h.json(res,500,{error:e.message || 'حدث خطأ في الخادم.'}); }
};
