const BASE = '/api';

export const getToken = () => localStorage.getItem('dlpms_token');
export const setToken = (t) => {
  if (t) localStorage.setItem('dlpms_token', t);
  else localStorage.removeItem('dlpms_token');
};

async function request(method, path, body, asBlob) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (asBlob && res.ok) return res.blob();

  const type = res.headers.get('content-type') || '';
  const data = type.includes('application/json') ? await res.json() : null;

  if (!res.ok) {
    // An expired session sends the user back to the login page
    if (res.status === 401 && token) {
      setToken(null);
      window.location.href = '/login';
    }
    const err = new Error((data && data.message) || res.statusText || 'Request failed');
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  get: (p) => request('GET', p),
  post: (p, b) => request('POST', p, b ?? {}),
  put: (p, b) => request('PUT', p, b ?? {}),
  patch: (p, b) => request('PATCH', p, b ?? {}),
  del: (p) => request('DELETE', p),
  blob: (p) => request('GET', p, undefined, true),
};

// Opens a protected PDF (certificate, receipt) in a new tab
export async function openPdf(path) {
  const blob = await api.blob(path);
  window.open(URL.createObjectURL(blob), '_blank');
}

// Saves a protected file (CSV reports) to the computer
export async function downloadFile(path, filename) {
  const blob = await api.blob(path);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
