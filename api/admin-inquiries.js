const h = require('./_lib/inquiries');
module.exports = async (req,res) => {
  if (req.method !== 'POST') return h.json(res,405,{error:'Method not allowed'});
  try {
    const body=h.bodyOf(req);
    if (!h.adminAllowed(body.password)) return h.json(res,401,{error:'كلمة مرور المشرف غير صحيحة.'});
    const action=String(body.action||'list');
    if (action==='list') {
      const rows=await h.db('inquiry_conversations?select=id,student_id,student_name,student_avatar,subject,status,updated_at,created_at,admin_unread&order=updated_at.desc');
      return h.json(res,200,{conversations:rows||[]});
    }
    const id=String(body.conversationId||'');
    const c=await h.conversation(id);
    if (!c) return h.json(res,404,{error:'الاستفسار غير موجود.'});
    if (action==='messages') {
      const rows=await h.db(`inquiry_messages?conversation_id=eq.${encodeURIComponent(id)}&select=id,conversation_id,sender_role,body,attachment_path,attachment_name,attachment_mime,created_at&order=created_at.asc`);
      await h.db(`inquiry_conversations?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({admin_unread:false})});
      return h.json(res,200,{messages:rows||[]});
    }
    if (action==='upload-url') {
      const fileName=h.validFile(body);
      const path=`${id}/admin/${Date.now()}-${Math.random().toString(36).slice(2)}-${fileName}`;
      const data=await h.storage(`object/upload/sign/${h.BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({upsert:false})});
      const signed=data.url || data.signedURL || data.signedUrl;
      if (!signed) throw new Error('تعذر إنشاء رابط الرفع.');
      const url=signed.startsWith('http')?signed:`${h.SUPABASE_URL}/storage/v1${signed}`;
      return h.json(res,200,{url,path});
    }
    if (action==='reply') {
      const attachment=body.attachment||null;
      if (attachment) {
        const parts=h.safeStoragePath(attachment.path);
        if (parts[0] !== id || parts[1] !== 'admin') return h.json(res,400,{error:'مسار المرفق غير صالح.'});
        h.validFile({fileName:attachment.name,contentType:attachment.mime,size:attachment.size});
      }
      const row=await h.addMessage({conversationId:id,senderId:null,senderRole:'admin',message:body.message,attachment});
      return h.json(res,201,{message:row});
    }
    if (action==='download-url') {
      const path=String(body.path||'');
      const parts=h.safeStoragePath(path);
      const pathConversation=parts[0];
      if (!await h.conversation(pathConversation)) return h.json(res,404,{error:'الاستفسار غير موجود.'});
      const exists=await h.db(`inquiry_messages?conversation_id=eq.${encodeURIComponent(pathConversation)}&attachment_path=eq.${encodeURIComponent(path)}&select=id`);
      if (!exists?.length) return h.json(res,404,{error:'المرفق غير موجود.'});
      return h.json(res,200,{url:await h.signedDownload(path)});
    }
    return h.json(res,400,{error:'إجراء غير معروف.'});
  } catch(e) { return h.json(res,500,{error:e.message || 'حدث خطأ في الخادم.'}); }
};
