var token = localStorage.getItem('access_token');
if (token) browser.runtime.sendMessage({ type: 'setToken', token: token });
