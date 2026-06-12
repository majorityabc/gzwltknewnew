import axios from 'axios';
import { supabase } from '../lib/supabase';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  }
});

api.interceptors.request.use(async (config) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) {
    config.headers.Authorization = `Bearer ${session.access_token}`;
  }
  return config;
});

// Questions
export const questionsApi = {
  getAll: (params?: any) => api.get('/questions', { params }),
  getById: (id: number) => api.get(`/questions/${id}`),
  create: (data: any) => api.post('/questions', data),
  update: (id: number, data: any) => api.put(`/questions/${id}`, data),
  delete: (id: number) => api.delete(`/questions/${id}`)
};

// Chapters
export const chaptersApi = {
  getAll: () => api.get('/chapters'),
  create: (data: any) => api.post('/chapters', data),
  update: (id: number, data: any) => api.put(`/chapters/${id}`, data),
  delete: (id: number) => api.delete(`/chapters/${id}`)
};

// Knowledge Points
export const knowledgePointsApi = {
  getAll: (params?: any) => api.get('/knowledge-points', { params }),
  create: (data: any) => api.post('/knowledge-points', data),
  update: (id: number, data: any) => api.put(`/knowledge-points/${id}`, data),
  delete: (id: number) => api.delete(`/knowledge-points/${id}`)
};

// Tags
export const tagsApi = {
  getAll: () => api.get('/tags'),
  create: (data: any) => api.post('/tags', data),
  update: (id: number, data: any) => api.put(`/tags/${id}`, data),
  delete: (id: number) => api.delete(`/tags/${id}`)
};

// Export
export const exportApi = {
  toWord: (questionIds: number[]) =>
    api.post('/export/word', { questionIds }, { responseType: 'blob' })
};

export default api;
