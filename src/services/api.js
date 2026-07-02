import { Preferences } from '@capacitor/preferences';

const FALLBACK_API_URL = import.meta.env.VITE_API_URL || '';

// Universal Image Fixer for rock-solid asset loading across local/ngrok/CDN
export const getAbsoluteImageUrl = (path, baseUrl = '', thumbnailWidth = null) => {
  if (!path) return '';
  const lower = path.toLowerCase();

  if (lower.startsWith('http') || lower.startsWith('data:')) return path;

  let cleanPath = path.startsWith('/') ? path : `/${path}`;

  if (!path.includes('/') && !path.includes('.')) {
    cleanPath = `/api/catalog/image/${path}`;
  }

  const cleanBase = (baseUrl || FALLBACK_API_URL || '').replace(/\/$/, '');
  const wParam = thumbnailWidth ? `?w=${thumbnailWidth}` : '';
  const fullUrl = `${cleanBase}${cleanPath}${wParam}`;

  if (cleanBase.includes('ngrok') && !fullUrl.includes('ngrok-skip-browser-warning')) {
    const separator = fullUrl.includes('?') ? '&' : '?';
    return `${fullUrl}${separator}ngrok-skip-browser-warning=true`;
  }

  return fullUrl;
};

export const getBaseUrl = async () => {
  try {
    const { value } = await Preferences.get({ key: 'srs_hub_url_override' });
    if (value && value.trim()) return value.trim();
  } catch {}
  return FALLBACK_API_URL;
};

export const saveBaseUrl = async (url) => {
  await Preferences.set({ key: 'srs_hub_url_override', value: url });
};

export const getAuthHeaders = async () => {
  const { value: sessionData } = await Preferences.get({ key: 'auth_session' });
  const headers = {
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': 'true'
  };
  if (sessionData) {
    const { token } = JSON.parse(sessionData);
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
};

export const linkBarcodeToProduct = async (barcode, productUid) => {
  try {
    const baseUrl = await getBaseUrl();
    const headers = await getAuthHeaders();
    await fetch(`${baseUrl}/api/products/link-barcode`, {
      method: 'POST', headers,
      body: JSON.stringify({ barcode, productUid }),
    });
  } catch {} // silent — non-critical
};

export const fetchCatalogProductById = async (productCode) => {
  try {
    const baseUrl = await getBaseUrl();
    const headers = await getAuthHeaders();
    const res = await fetch(`${baseUrl}/api/catalog/lookup/${encodeURIComponent(productCode)}`, { headers });
    if (!res.ok) return null;
    const data = await res.json();
    return data.found ? data.product : null;
  } catch { return null; }
};

export const fetchProducts = async (query = '', signal = null) => {
  try {
    const baseUrl = await getBaseUrl();
    const targetUrl = `${baseUrl}/api/products${query ? `?q=${encodeURIComponent(query)}` : ''}`;
    const headers = await getAuthHeaders();
    const response = await fetch(targetUrl, { method: 'GET', signal, headers });
    if (!response.ok) throw new Error(`API Error (${response.status})`);
    return await response.json();
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    console.error('Fetch Error:', error);
    throw error;
  }
};

export const registerProduct = async (productData) => {
  const baseUrl = await getBaseUrl();
  const headers = await getAuthHeaders();
  const response = await fetch(`${baseUrl}/api/products/save-product`, {
    method: 'POST',
    headers,
    body: JSON.stringify(productData)
  });
  if (!response.ok) throw new Error('Failed to register');
  return await response.json();
};

export const updateProduct = async (uid, updates) => {
  const baseUrl = await getBaseUrl();
  const headers = await getAuthHeaders();
  const response = await fetch(`${baseUrl}/api/products/update`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ uid, updates })
  });
  if (!response.ok) throw new Error('Failed to update');
  return await response.json();
};

export const deleteOrder = async (orderId) => {
  const baseUrl = await getBaseUrl();
  const headers = await getAuthHeaders();
  const response = await fetch(`${baseUrl}/api/sales/order/${orderId}`, {
    method: 'DELETE',
    headers
  });
  if (!response.ok) throw new Error('Failed to delete order');
  return await response.json();
};

export const deleteProduct = async (uid) => {
  const baseUrl = await getBaseUrl();
  const headers = await getAuthHeaders();
  const response = await fetch(`${baseUrl}/api/products/${uid}`, {
    method: 'DELETE',
    headers
  });
  if (!response.ok) throw new Error('Failed to delete product');
  return await response.json();
};

export const saveVariants = async (baseId, variants) => {
  const baseUrl = await getBaseUrl();
  const headers = await getAuthHeaders();
  const response = await fetch(`${baseUrl}/api/products/variants/save`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ baseId, variants })
  });
  if (!response.ok) throw new Error('Failed to save variants');
  return await response.json();
};

const blobUrlCache = new Map();

export const fetchImageBlobUrl = async (url) => {
  if (!url) return null;
  if (!url.startsWith('http')) return url;
  if (blobUrlCache.has(url)) return blobUrlCache.get(url);
  try {
    const response = await fetch(url, { headers: { 'ngrok-skip-browser-warning': 'true' } });
    if (!response.ok) return null;
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    blobUrlCache.set(url, objectUrl);
    return objectUrl;
  } catch (e) {
    return null;
  }
};

export const fetchExhibition = async () => {
  const baseUrl = await getBaseUrl();
  const headers = await getAuthHeaders();
  const res = await fetch(`${baseUrl}/api/exhibition`, { headers });
  if (!res.ok) throw new Error('Failed to fetch exhibition');
  return await res.json();
};

export const saveExhibitionItems = async (items) => {
  const baseUrl = await getBaseUrl();
  const headers = await getAuthHeaders();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(`${baseUrl}/api/exhibition`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ items }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Save failed (${res.status})`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
};

export const clearExhibition = async () => {
  const baseUrl = await getBaseUrl();
  const headers = await getAuthHeaders();
  const res = await fetch(`${baseUrl}/api/exhibition`, { method: 'DELETE', headers });
  if (!res.ok) throw new Error('Failed to clear exhibition');
  return await res.json();
};
