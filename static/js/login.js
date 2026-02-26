function switchTab(tab) {
      document.getElementById('login-form').style.display = tab === 'login' ? '' : 'none';
      document.getElementById('signup-form').style.display = tab === 'signup' ? '' : 'none';
      document.getElementById('tab-login').classList.toggle('active', tab === 'login');
      document.getElementById('tab-signup').classList.toggle('active', tab === 'signup');
      showMsg('', '');
    }

    function showMsg(text, type) {
      const el = document.getElementById('msg');
      el.textContent = text;
      el.className = 'msg ' + (type || '');
    }

    async function handleLogin(e) {
      e.preventDefault();
      const btn = document.getElementById('login-btn');
      btn.disabled = true;
      btn.textContent = 'Logging in...';
      showMsg('', '');

      const email = document.getElementById('login-email').value;
      const password = document.getElementById('login-password').value;

      try {
        const res = await fetch('/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        const data = await res.json();

        if (!res.ok) {
          showMsg(data.detail || 'Login failed. Check your credentials.', 'error');
          return;
        }

        // Save the access token to localStorage
        localStorage.setItem('sb_access_token', data.access_token);
        localStorage.setItem('sb_user_email', data.email);

        // Redirect to the main app
        window.location.href = '/';
      } catch (err) {
        showMsg('Network error. Is the server running?', 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Login';
      }
    }

    async function handleSignup(e) {
      e.preventDefault();
      const btn = document.getElementById('signup-btn');
      btn.disabled = true;
      btn.textContent = 'Creating account...';
      showMsg('', '');

      const email = document.getElementById('signup-email').value;
      const password = document.getElementById('signup-password').value;

      try {
        const res = await fetch('/auth/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        const data = await res.json();

        if (!res.ok) {
          showMsg(data.detail || 'Signup failed.', 'error');
          return;
        }

        showMsg('Account created! Please check your email to confirm, then login.', 'success');
        setTimeout(() => switchTab('login'), 3000);
      } catch (err) {
        showMsg('Network error. Is the server running?', 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Create Account';
      }
    }

    // If already logged in, skip the login page
    if (localStorage.getItem('sb_access_token')) {
      window.location.href = '/';
    }