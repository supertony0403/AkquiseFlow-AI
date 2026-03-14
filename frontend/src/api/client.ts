import axios from 'axios';

const client = axios.create({
  baseURL: 'http://localhost:3001/api',
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
});

client.interceptors.response.use(
  (r) => r,
  (err) => {
    const msg = err.response?.data?.error || err.message || 'Unbekannter Fehler';
    return Promise.reject(new Error(msg));
  }
);

export default client;
