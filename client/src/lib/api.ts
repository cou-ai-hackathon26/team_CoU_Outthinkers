import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "/api",
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("maternacare_token");
  if (token && !config.headers.Authorization) config.headers.Authorization = `Bearer ${token}`;
  // Let the browser add the multipart boundary for FormData requests.
  // Keeping the shared JSON default here causes Multer to receive no file.
  if (typeof FormData !== "undefined" && config.data instanceof FormData) {
    config.headers.delete("Content-Type");
  }
  return config;
});

api.interceptors.response.use((response) => response, (error) => {
  if (error.response?.status === 401) {
    localStorage.removeItem("maternacare_token");
    window.dispatchEvent(new Event("maternacare-auth-expired"));
  }
  return Promise.reject(error);
});

export default api;
