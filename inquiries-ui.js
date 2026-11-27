/* Student inquiries UI — loaded after the main index scripts. */
(function () {
  'use strict';

  const supabase = window.tawjihiSupabase;
  if (!supabase) {
    console.error('[Tawjihi] Supabase client unavailable for inquiries.');
    return;
  }

  const style = document.createElement('style');
  style.textContent = `
    .inq-panel{background:linear-gradient(160deg,#16233d,#101a2e);border:1px solid rgba(201,162,75,.28);border-radius:16px;padding:16px;margin:14px 0;color:#eae3d2}
    .inq-btn{font-family:inherit;border:1px solid #8a7233;background:#172943;color:#e8c977;border-radius:10px;padding:10px 14px;cursor:pointer;font-weight:700}
    .inq-btn:disabled{opacity:.55;cursor:wait}
    .inq-field{width:100%;box-sizing:border-box;padding:12px;border-radius:10px;border:1px solid #8a7233;background:#0b1220;color:#fff;font:inherit;margin:6px 0}
    .inq-row{display:flex;align-items:center;gap:10px;padding:12px;border:1px solid rgba(201,162,75,.2);border-radius:12px;margin:8px 0;cursor:pointer;background:rgba(255,255,255,.025)}
    .inq-row:hover{border-color:#c9a24b}
    .inq-avatar{width:42px;height:42px;border-radius:50%;object-fit:cover;background:#263c60}
    .inq-muted{color:#a7a695;font-size:13px}
    .inq-bubble{max-width:88%;padding:10px 13px;border-radius:13px;margin:8px 0;line-height:1.7;overflow-wrap:anywhere}
    .inq-student{background:#243957;margin-right:auto}
    .inq-admin{background:#594a27;margin-left:auto}
    .inq-chat{max-height:52vh;overflow:auto;padding:8px;background:rgba(0,0,0,.12);border-radius:12px}
    .inq-toolbar{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}
    .inq-error{color:#ffc1c1;margin:8px 0;font-size:14px}
  `;
  document.head.appendChild(style);

  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const fmt = value => value ? new Date(value).toLocaleString('ar') : '';
  const currentUser = async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw new Error('سجّل الدخول أولاً.');
    return data.user;
  };
  const userName = user => user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'طالب';
  const userAvatar = user => user.user_metadata?.avatar_url || user.user_metadata?.picture || '';

  async function studentInquiries(main) {
    const title = el('div','page-title','الأسئلة والاستفسارات');
    main.appendChild(title);
    const intro = el('div','info-note','أرسل استفسارك وسيتواصل معك فريق الإشراف من خلال نفس المحادثة.');
    main.appendChild(intro);
    const createBox = el('div','inq-panel');
    const subject = el('input','inq-field');
    subject.placeholder = 'عنوان الاستفسار (اختياري)';
    const firstMessage = el('textarea','inq-field');
    firstMessage.rows = 3;
    firstMessage.placeholder = 'اكتب استفسارك هنا...';
    const createBtn = el('button','inq-btn','إرسال استفسار جديد');
    const status = el('div','inq-muted','');
    createBox.append(subject, firstMessage, createBtn, status);
    main.appendChild(createBox);
    const listTitle = el('div','page-title','محادثاتي');
    main.appendChild(listTitle);
    const list = el('div','inq-panel');
    list.textContent = 'جارٍ تحميل المحادثات...';
    main.appendChild(list);

    let user;
    try { user = await currentUser(); }
    catch (e) { list.textContent = e.message; return; }

    async function loadList() {
      list.textContent = 'جارٍ تحميل المحادثات...';
      const { data, error } = await supabase.from('inquiry_conversations')
        .select('*').eq('student_id', user.id).order('last_message_at',{ascending:false});
      if (error) { list.textContent = 'تعذر تحميل المحادثات: ' + error.message; return; }
      list.innerHTML = '';
      if (!data?.length) { list.textContent = 'لا توجد محادثات حتى الآن.'; return; }
      data.forEach(conversation => {
        const row = el('div','inq-row');
        const avatar = el('img','inq-avatar');
        avatar.src = userAvatar(user) || 'https://ui-avatars.com/api/?name=Student&background=172943&color=e8c977';
        avatar.alt = 'صورتك';
        const details = el('div','');
        details.style.flex = '1';
        details.append(el('strong','',conversation.subject || 'استفسار'));
        details.append(el('div','inq-muted',conversation.last_message || 'ابدأ المحادثة'));
        details.append(el('div','inq-muted',fmt(conversation.last_message_at)));
        row.append(avatar,details);
        row.onclick = () => openStudentChat(main, conversation, user, loadList);
        list.appendChild(row);
      });
    }

    createBtn.onclick = async () => {
      const body = firstMessage.value.trim();
      if (!body) { status.textContent = 'اكتب الاستفسار أولاً.'; return; }
      createBtn.disabled = true;
      status.textContent = 'جارٍ الإرسال...';
      try {
        const name = userName(user);
        const { data: conversation, error: createError } = await supabase
          .from('inquiry_conversations')
          .insert({
            student_id:user.id,
            student_name:name,
            student_avatar:userAvatar(user),
            subject:subject.value.trim() || body.slice(0,70) || 'استفسار جديد',
            last_message:body,
            last_message_at:new Date().toISOString(),
            unread_by_admin:true,
            unread_by_student:false
          }).select().single();
        if (createError) throw createError;
        const { error: messageError } = await supabase.from('inquiry_messages').insert({
          conversation_id:conversation.id,
          sender_id:user.id,
          sender_role:'student',
          sender_name:name,
          body
        });
        if (messageError) throw messageError;
        subject.value = '';
        firstMessage.value = '';
        status.textContent = 'تم إرسال استفسارك.';
        await loadList();
        openStudentChat(main,conversation,user,loadList);
      } catch (e) {
        status.textContent = 'تعذر إرسال الاستفسار: ' + e.message;
      } finally {
        createBtn.disabled = false;
      }
    };
    await loadList();
  }

  async function openStudentChat(main, conversation, user, refresh) {
    main.innerHTML = '';
    const title = el('div','page-title',conversation.subject || 'المحادثة');
    main.appendChild(title);
    const back = el('button','inq-btn','رجوع إلى المحادثات');
    back.onclick = () => {
      main.innerHTML = '';
      studentInquiries(main);
    };
    main.appendChild(back);
    const chat = el('div','inq-chat');
    chat.textContent = 'جارٍ تحميل الرسائل...';
    main.appendChild(chat);
    const form = el('div','inq-panel');
    const input = el('textarea','inq-field');
    input.rows = 2;
    input.placeholder = 'اكتب رسالتك...';
    const send = el('button','inq-btn','إرسال');
    const note = el('div','inq-muted','');
    form.append(input,send,note);
    main.appendChild(form);

    async function loadMessages() {
      const { data, error } = await supabase.from('inquiry_messages').select('*')
        .eq('conversation_id',conversation.id).order('created_at',{ascending:true});
      if (error) { chat.textContent = 'تعذر تحميل الرسائل: ' + error.message; return; }
      chat.innerHTML = '';
      (data || []).forEach(message => {
        const bubble = el('div','inq-bubble ' + (message.sender_role === 'admin' ? 'inq-admin' : 'inq-student'));
        bubble.append(el('div','',message.body || (message.attachment_name || 'مرفق')));
        bubble.append(el('div','inq-muted',fmt(message.created_at)));
        chat.appendChild(bubble);
      });
      chat.scrollTop = chat.scrollHeight;
    }
    send.onclick = async () => {
      const body = input.value.trim();
      if (!body) return;
      send.disabled = true;
      try {
        const { error } = await supabase.from('inquiry_messages').insert({
          conversation_id:conversation.id,sender_id:user.id,sender_role:'student',sender_name:userName(user),body
        });
        if (error) throw error;
        await supabase.from('inquiry_conversations').update({
          last_message:body,last_message_at:new Date().toISOString(),unread_by_admin:true,unread_by_student:false
        }).eq('id',conversation.id);
        input.value = '';
        note.textContent = 'تم إرسال الرسالة.';
        await loadMessages();
        if (refresh) await refresh();
      } catch (e) { note.textContent = 'تعذر الإرسال: ' + e.message; }
      finally { send.disabled = false; }
    };
    await loadMessages();
    const channel = supabase.channel('student-inquiry-' + conversation.id)
      .on('postgres_changes',{event:'*',schema:'public',table:'inquiry_messages',filter:'conversation_id=eq.'+conversation.id},loadMessages)
      .subscribe();
    const cleanup = () => supabase.removeChannel(channel);
    back.addEventListener('click',cleanup,{once:true});
  }

  async function adminInquiries(main, password) {
    const box = el('div','inq-panel');
    const heading = el('div','page-title','الأسئلة والاستفسارات');
    const status = el('div','inq-muted','جارٍ تحميل المحادثات...');
    const list = el('div','');
    box.append(heading,status,list);
    main.appendChild(box);
    const api = async (action, extra={}) => {
      const response = await fetch('/api/admin-inquiries',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({password,action,...extra})
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'تعذر تنفيذ الطلب');
      return data;
    };
    try {
      const data = await api('list');
      status.textContent = 'عدد المحادثات: ' + (data.conversations || []).length;
      if (!data.conversations?.length) { list.textContent = 'لا توجد استفسارات حتى الآن.'; return; }
      data.conversations.forEach(conversation => {
        const row = el('div','inq-row');
        const avatar = el('img','inq-avatar');
        avatar.src = conversation.student_avatar || 'https://ui-avatars.com/api/?name=Student&background=172943&color=e8c977';
        avatar.alt = 'صورة الطالب';
        const details = el('div','');
        details.style.flex = '1';
        details.append(el('strong','',conversation.student_name || 'طالب'));
        details.append(el('div','inq-muted',conversation.subject || 'استفسار'));
        details.append(el('div','inq-muted',conversation.last_message || ''));
        details.append(el('div','inq-muted',fmt(conversation.last_message_at)));
        row.append(avatar,details);
        row.onclick = () => openAdminChat(main,conversation,api);
        list.appendChild(row);
      });
    } catch (e) { status.textContent = 'تعذر تحميل الاستفسارات: ' + e.message; }
  }

  async function openAdminChat(main, conversation, api) {
    main.innerHTML = '';
    main.appendChild(el('div','page-title',conversation.student_name || 'محادثة الطالب'));
    const back = el('button','inq-btn','رجوع إلى الاستفسارات');
    back.onclick = () => adminInquiries(main, apiPassword);
    main.appendChild(back);
    const chat = el('div','inq-chat','جارٍ تحميل الرسائل...');
    main.appendChild(chat);
    const form = el('div','inq-panel');
    const input = el('textarea','inq-field');
    input.rows = 2;
    input.placeholder = 'اكتب رد المشرف...';
    const send = el('button','inq-btn','إرسال الرد');
    const note = el('div','inq-muted','');
    form.append(input,send,note);
    main.appendChild(form);
    async function load() {
      try {
        const data = await api('messages',{conversation_id:conversation.id});
        chat.innerHTML = '';
        (data.messages || []).forEach(message => {
          const bubble = el('div','inq-bubble ' + (message.sender_role === 'admin' ? 'inq-admin' : 'inq-student'));
          bubble.append(el('div','',message.body || (message.attachment_name || 'مرفق')));
          bubble.append(el('div','inq-muted',fmt(message.created_at)));
          chat.appendChild(bubble);
        });
        chat.scrollTop = chat.scrollHeight;
      } catch (e) { chat.textContent = e.message; }
    }
    send.onclick = async () => {
      if (!input.value.trim()) return;
      send.disabled = true;
      try {
        await api('reply',{conversation_id:conversation.id,message:input.value.trim()});
        input.value = '';
        note.textContent = 'تم إرسال الرد.';
        await load();
      } catch (e) { note.textContent = e.message; }
      finally { send.disabled = false; }
    };
    await load();
  }

  let apiPassword = '';

  // Extend the existing home menu without changing its current entries.
  if (typeof homePage !== 'undefined' && Array.isArray(homePage.children) &&
      !homePage.children.some(item => item.type === 'student-inquiries-entry')) {
    homePage.children.push({type:'student-inquiries-entry',label:'الأسئلة والاستفسارات'});
  }

  // Wrap the existing renderer to add the student chat page and an admin inbox
  // button inside the existing "تحكم المشرفين" panel.
  if (typeof render === 'function') {
    const originalRender = render;
    render = function () {
      const current = stack[stack.length - 1];
      if (current?.type === 'student-inquiries-entry') {
        originalRender();
        const main = document.getElementById('main');
        main.innerHTML = '';
        studentInquiries(main);
        return;
      }

      originalRender();

      if (current?.type === 'admin-data-entry') {
        const main = document.getElementById('main');
        const box = main.querySelector('.about-text');
        const passwordInput = box?.querySelector('input[type="password"]');
        const existingButton = box?.querySelector('button');
        if (box && existingButton && !box.querySelector('#adminInquiriesBtn')) {
          const inboxButton = el('button','inq-btn','عرض الأسئلة والاستفسارات');
          inboxButton.id = 'adminInquiriesBtn';
          inboxButton.style.width = '100%';
          inboxButton.style.marginTop = '10px';
          inboxButton.onclick = () => {
            const password = passwordInput?.value?.trim();
            if (!password) {
              const message = box.querySelector('div');
              if (message) message.textContent = 'أدخل كلمة مرور المشرف أولاً.';
              return;
            }
            apiPassword = password;
            const results = box.querySelectorAll('div');
            const target = results[results.length - 1];
            if (target) target.innerHTML = '';
            adminInquiries(target || box,password);
          };
          existingButton.insertAdjacentElement('afterend',inboxButton);
        }
      }


    };
  }

  // Re-render the home screen once so the new menu item appears.
  if (typeof render === 'function') render();
})();
