module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  } catch {
    return res.status(400).json({ error: 'بيانات الطلب غير صالحة' });
  }

  const password = String(body.password || '').trim();
  const savedPassword = String(process.env.ADMIN_PASSWORD || '').trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = 'https://pxxdvjpfhhayecpouojz.supabase.co';

  if (!savedPassword || password !== savedPassword) {
    return res.status(401).json({ error: 'غير مصرح بالدخول' });
  }
  if (!serviceKey) {
    return res.status(500).json({ error: 'إعدادات الخادم ناقصة' });
  }

  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json'
  };

  try {
    const action = String(body.action || 'list');

    if (action === 'list') {
      const response = await fetch(
        `${supabaseUrl}/rest/v1/inquiry_conversations?select=*&order=last_message_at.desc`,
        { headers }
      );
      const data = await response.json();
      if (!response.ok) return res.status(500).json({ error: 'تعذر تحميل الاستفسارات' });
      return res.status(200).json({ conversations: data || [] });
    }

    const conversationId = String(body.conversation_id || '');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(conversationId)) {
      return res.status(400).json({ error: 'رقم المحادثة غير صالح' });
    }

    if (action === 'messages') {
      const response = await fetch(
        `${supabaseUrl}/rest/v1/inquiry_messages?select=*&conversation_id=eq.${conversationId}&order=created_at.asc`,
        { headers }
      );
      const data = await response.json();
      if (!response.ok) return res.status(500).json({ error: 'تعذر تحميل الرسائل' });
      return res.status(200).json({ messages: data || [] });
    }

    if (action === 'reply') {
      const message = String(body.message || '').trim();
      if (!message) return res.status(400).json({ error: 'اكتب نص الرد أولاً' });

      const inserted = await fetch(`${supabaseUrl}/rest/v1/inquiry_messages`, {
        method: 'POST',
        headers: { ...headers, Prefer: 'return=representation' },
        body: JSON.stringify([{
          conversation_id: conversationId,
          sender_id: null,
          sender_role: 'admin',
          sender_name: 'فريق الإشراف',
          body: message
        }])
      });

      const insertedData = await inserted.json();
      if (!inserted.ok) return res.status(500).json({ error: 'تعذر إرسال الرد' });

      const updated = await fetch(
        `${supabaseUrl}/rest/v1/inquiry_conversations?id=eq.${conversationId}`,
        {
          method: 'PATCH',
          headers: { ...headers, Prefer: 'return=minimal' },
          body: JSON.stringify({
            last_message: message,
            last_message_at: new Date().toISOString(),
            unread_by_admin: false,
            unread_by_student: true
          })
        }
      );
      if (!updated.ok) return res.status(500).json({ error: 'تم إرسال الرد لكن تعذر تحديث حالة المحادثة' });
      return res.status(200).json({ message: insertedData?.[0] || null });
    }

    return res.status(400).json({ error: 'إجراء غير معروف' });
  } catch (error) {
    return res.status(500).json({ error: 'حدث خطأ في الخادم' });
  }
};
