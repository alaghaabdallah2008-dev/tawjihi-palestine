module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const password = req.body?.password;

  if (!process.env.ADMIN_PASSWORD ||
      password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'كلمة المرور غير صحيحة' });
  }

  const supabaseUrl = 'https://pxxdvjpfhhayecpouojz.supabase.co';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceKey) {
    return res.status(500).json({ error: 'إعدادات الخادم ناقصة' });
  }

  try {
    const response = await fetch(
      `${supabaseUrl}/auth/v1/admin/users?page=1&per_page=1000`,
      {
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`
        }
      }
    );

    if (!response.ok) {
      return res.status(500).json({ error: 'تعذر جلب بيانات الطلاب' });
    }

    const data = await response.json();

    const users = (data.users || []).map(user => ({
      id: user.id,
      email: user.email,
      created_at: user.created_at,
      last_sign_in_at: user.last_sign_in_at
    }));

    return res.status(200).json({
      count: users.length,
      users
    });

  } catch (error) {
    return res.status(500).json({ error: 'حدث خطأ في الخادم' });
  }
};
