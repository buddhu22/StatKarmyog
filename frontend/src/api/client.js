/**
 * API client for the Skill Intelligence Platform.
 *
 * Each function tries the real FastAPI backend, then falls back
 * to mock data so the dashboard always renders something.
 */

import axios from 'axios';

const LOCAL_API_URL = 'http://localhost:8000';
const DEPLOYED_API_URL = 'https://statkarmyog-1.onrender.com';
const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? LOCAL_API_URL
    : DEPLOYED_API_URL);

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

/**
 * Extract a human-readable error message from an axios error.
 */
function extractErrorMessage(err) {
  if (err.response?.data?.error) return err.response.data.error;
  if (err.response?.data?.detail) return err.response.data.detail;
  if (err.code === 'ECONNABORTED') return 'Request timed out. The server may be busy.';
  if (err.message) return err.message;
  return 'An unknown error occurred.';
}

export function buildAssetUrl(url) {
  if (!url) return '';
  if (/^https?:\/\//i.test(url) || url.startsWith('data:') || url.startsWith('blob:')) {
    return url;
  }
  return `${API_BASE_URL}${url.startsWith('/') ? '' : '/'}${url}`;
}

/**
 * Wait for FastAPI startup before entering authenticated routes.
 * This prevents the first dashboard request from racing database/index setup.
 */
export async function waitForBackendReady({ attempts = 8, delayMs = 500 } = {}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const res = await api.get('/api/health', { timeout: 3000 });
      if (res.data?.status === 'ok') return true;
    } catch {
      if (attempt === attempts - 1) return false;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return false;
}

// ═══════════════════════════════════════════════════════════════════════════
// MOCK DATA — matches Pydantic schemas from app/schemas/schemas.py
// Modeled after OFF001 (Rakesh Kumar) from officer_profiles.json
// ═══════════════════════════════════════════════════════════════════════════

const MOCK_PROFILE = {
  officer_id: 'OFF001',
  name: 'Rakesh Kumar',
  designation: 'Junior Statistical Officer (JSO) - Industrial Statistics',
  role_id: 'R01',
  department: 'Industrial Statistics Division',
  experience_years: 3,
  qualification: 'M.Sc. Statistics',
  past_trainings: ['SSS Induction Training 2023'],
  current_skills: {
    'Survey Design': 2,
    Sampling: 2,
    'Industrial Statistics': 3,
    'Data Quality Frameworks': 1,
    Python: 1,
    SQL: 2,
    'Data Visualization': 1,
    'Data Privacy': 1,
    Communication: 3,
    Ethics: 3,
  },
};

const MOCK_GAPS = {
  officer_id: 'OFF001',
  role_id: 'R01',
  gaps: [
    { skill: 'Survey Design',           current_level: 2, expected_level: 3, gap_size: 1, score_source: 'profile-fallback', confidence_level: 'profile-only' },
    { skill: 'Data Quality Frameworks',  current_level: 1, expected_level: 2, gap_size: 1, score_source: 'profile-fallback', confidence_level: 'profile-only' },
    { skill: 'Industrial Statistics',    current_level: 3, expected_level: 4, gap_size: 1, score_source: 'profile-fallback', confidence_level: 'profile-only' },
    { skill: 'Data Visualization',       current_level: 1, expected_level: 3, gap_size: 2, score_source: 'profile-fallback', confidence_level: 'profile-only' },
    { skill: 'Python',                   current_level: 1, expected_level: 2, gap_size: 1, score_source: 'profile-fallback', confidence_level: 'profile-only' },
    { skill: 'Data Privacy',             current_level: 1, expected_level: 2, gap_size: 1, score_source: 'profile-fallback', confidence_level: 'profile-only' },
    { skill: 'Sampling',                 current_level: 2, expected_level: 2, gap_size: 0, score_source: 'profile-fallback', confidence_level: 'profile-only' },
    { skill: 'SQL',                      current_level: 2, expected_level: 2, gap_size: 0, score_source: 'profile-fallback', confidence_level: 'profile-only' },
    { skill: 'Communication',            current_level: 3, expected_level: 3, gap_size: 0, score_source: 'profile-fallback', confidence_level: 'profile-only' },
    { skill: 'Ethics',                   current_level: 3, expected_level: 3, gap_size: 0, score_source: 'profile-fallback', confidence_level: 'profile-only' },
  ],
};

const MOCK_RECOMMENDATIONS = [
  { course_id: 'C009', course_title: 'Advanced Python for Data Science',                   semantic_score: 0.95, tag_overlap_score: 1.0, final_score: 0.97, matched_skills: ['Python', 'Data Visualization'] },
  { course_id: 'C022', course_title: 'Industrial Statistics Deep Dive',                    semantic_score: 0.88, tag_overlap_score: 0.80, final_score: 0.85, matched_skills: ['Industrial Statistics'] },
  { course_id: 'C001', course_title: 'Database Management and Data Visualization',         semantic_score: 0.82, tag_overlap_score: 0.90, final_score: 0.85, matched_skills: ['Data Visualization', 'SQL'] },
  { course_id: 'C003', course_title: 'SSS Induction Training - Core Statistics',           semantic_score: 0.78, tag_overlap_score: 0.70, final_score: 0.75, matched_skills: ['Survey Design', 'Sampling'] },
  { course_id: 'C082', course_title: 'Big Data, AI with Python, ML, AI-ready Data',        semantic_score: 0.72, tag_overlap_score: 0.60, final_score: 0.67, matched_skills: ['Python', 'Data Quality Frameworks'] },
];

const MOCK_ENROLLMENTS = [
  { enrollment_id: 'E0001', officer_id: 'OFF001', course_id: 'C009', course_title: 'Advanced Python for Data Science',                           status: 'Completed',   enrolled_date: '2026-04-10', progress_percent: 100, completion_date: '2026-09-01' },
  { enrollment_id: 'E0002', officer_id: 'OFF001', course_id: 'C022', course_title: 'Industrial Statistics Deep Dive',                            status: 'In-Progress', enrolled_date: '2026-05-15', progress_percent: 30,  completion_date: null },
  { enrollment_id: 'E0003', officer_id: 'OFF001', course_id: 'C082', course_title: 'Big Data, AI with Python, ML, AI-ready Data (ISS Probationary)', status: 'Enrolled',    enrolled_date: '2026-06-20', progress_percent: 0,   completion_date: null },
  { enrollment_id: 'E0004', officer_id: 'OFF001', course_id: 'C001', course_title: 'Database Management and Data Visualization',                 status: 'Completed',   enrolled_date: '2026-07-25', progress_percent: 100, completion_date: '2026-09-01' },
  { enrollment_id: 'E0005', officer_id: 'OFF001', course_id: 'C003', course_title: 'SSS Induction Training - Core Statistics',                   status: 'In-Progress', enrolled_date: '2026-08-05', progress_percent: 30,  completion_date: null },
];

const MOCK_PASSPORT = {
  officer_id: 'OFF001',
  competencies: [
    {
      cid: 'CID-F-201',
      skill_label: 'Python',
      history: [
        { recorded_on: '2026-08-20', combined_score: 1.5, confidence_level: 'low (1 source)', source: 'baseline_quiz' },
        { recorded_on: '2026-09-02', combined_score: 3.5, confidence_level: 'low (1 source)', source: 'quiz_after_course_C078' },
      ],
      latest_score: 3.5,
      first_score: 1.5,
      improved: true,
      delta: 2.0,
    },
    {
      cid: 'CID-D-101',
      skill_label: 'Survey Design',
      history: [
        { recorded_on: '2026-08-20', combined_score: 2.0, confidence_level: 'low (1 source)', source: 'baseline_quiz' },
        { recorded_on: '2026-09-05', combined_score: 2.6, confidence_level: 'medium (2 sources)', source: 'quiz_plus_artifact' },
      ],
      latest_score: 2.6,
      first_score: 2.0,
      improved: true,
      delta: 0.6,
    },
    {
      cid: 'CID-D-107',
      skill_label: 'Industrial Statistics',
      history: [
        { recorded_on: '2026-08-22', combined_score: 3.0, confidence_level: 'low (1 source)', source: 'baseline_quiz' },
      ],
      latest_score: 3.0,
      first_score: 3.0,
      improved: null,
      delta: 0.0,
    },
    {
      cid: 'CID-D-110',
      skill_label: 'Data Quality Frameworks',
      history: [
        { recorded_on: '2026-08-15', combined_score: 2.5, confidence_level: 'low (1 source)', source: 'baseline_quiz' },
        { recorded_on: '2026-09-01', combined_score: 1.8, confidence_level: 'low (1 source)', source: 'quiz_reassessment' },
      ],
      latest_score: 1.8,
      first_score: 2.5,
      improved: false,
      delta: -0.7,
    },
  ],
};

// Mock profiles for the officer selector on Login
export const MOCK_OFFICERS = [
  { officer_id: 'OFF001', name: 'Rakesh Kumar',          designation: 'JSO - Industrial Statistics',     department: 'Industrial Statistics Division',   role: 'officer' },
  { officer_id: 'OFF002', name: 'Sunita Verma',          designation: 'SSO - Price Statistics',           department: 'Price Statistics Division',         role: 'officer' },
  { officer_id: 'OFF003', name: 'Arjun Nair',            designation: 'ISS Officer - Labour Statistics',  department: 'Labour Statistics Division',        role: 'officer' },
  { officer_id: 'OFF004', name: 'Priya Deshmukh',        designation: 'SO - GIS & Spatial Data',          department: 'Agricultural Statistics Division',  role: 'officer' },
  { officer_id: 'OFF005', name: 'Vikram Singh Rathore',  designation: 'Deputy Director - DIID',           department: 'DIID',                             role: 'officer' },
  { officer_id: 'OFF006', name: 'Ananya Iyer',           designation: 'JSO - Industrial Statistics',      department: 'Industrial Statistics Division',    role: 'officer' },
  { officer_id: 'ADM001', name: 'Dr. Meena Agarwal',    designation: 'Director — Training & Analytics',  department: 'MoSPI / NSSTA',                    role: 'admin' },
];

// ═══════════════════════════════════════════════════════════════════════════
// API FUNCTIONS  — each tries the real endpoint, falls back to mock
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fetch full officer profile.
 * @param {string} officerId
 * @returns {Promise<{data: object, isMock: boolean}>}
 */
export async function getOfficerProfile(officerId) {
  try {
    const res = await api.get(`/api/officers/${officerId}`);
    return { data: res.data, isMock: false };
  } catch {
    console.warn(`[API] Officer profile unavailable for ${officerId}`);
    return { data: null, isMock: false, error: true };
  }
}

/**
 * Fetch gap analysis for an officer.
 * @param {string} officerId
 * @returns {Promise<{data: object, isMock: boolean}>}
 */
export async function getGapAnalysis(officerId) {
  try {
    const res = await api.get(`/api/officers/${officerId}/gaps`);
    return { data: res.data, isMock: false };
  } catch {
    console.warn(`[API] Gap analysis unavailable for ${officerId}`);
    return { data: { officer_id: officerId, gaps: [] }, isMock: false, error: true };
  }
}

/**
 * Fetch fast course recommendations for the dashboard.
 * The dashboard should not block first paint on cold sentence-transformer loading;
 * semantic recommendations remain available through the dedicated backend route.
 * @param {string} officerId
 * @returns {Promise<{data: object[], isMock: boolean}>}
 */
export async function getRecommendations(officerId) {
  try {
    const res = await api.get(`/api/officers/${officerId}/recommendations`, {
      params: { top_n: 6 },
    });
    return { data: res.data, isMock: false };
  } catch {
    console.warn(`[API] Recommendations unavailable for ${officerId}`);
    return { data: [], isMock: false, error: true };
  }
}

/**
 * Fetch enrollment records for an officer.
 * @param {string} officerId
 * @returns {Promise<{data: object[], isMock: boolean}>}
 */
export async function getEnrollments(officerId) {
  try {
    const res = await api.get(`/api/officers/${officerId}/enrollments`);
    return { data: res.data, isMock: false };
  } catch {
    console.warn(`[API] Enrollments unavailable for ${officerId}`);
    return { data: [], isMock: false, error: true };
  }
}

/**
 * Fetch Competency Passport history for an officer.
 * @param {string} officerId
 * @returns {Promise<{data: object, isMock: boolean}>}
 */
export async function getPassportSummary(officerId) {
  try {
    const res = await api.get(`/api/passport/${officerId}`);
    return { data: res.data, isMock: false };
  } catch {
    console.warn(`[API] Passport summary unavailable for ${officerId}`);
    return { data: { officer_id: officerId, competencies: [] }, isMock: false, error: true };
  }
}

export async function getCompetencyScores(officerId) {
  try {
    const res = await api.get(`/api/competency-scores/${officerId}`);
    return { data: res.data, isMock: false };
  } catch {
    console.warn(`[API] Competency scores unavailable for ${officerId}`);
    return { data: [], isMock: false, error: true };
  }
}

export async function getAssessmentHistory(officerId) {
  try {
    const res = await api.get(`/api/officers/${officerId}/assessments`);
    return { data: res.data, isMock: false };
  } catch {
    console.warn(`[API] Assessment history unavailable for ${officerId}`);
    return { data: [], isMock: false, error: true };
  }
}

export async function getWorkEvidence(officerId) {
  try {
    const res = await api.get(`/api/officers/${officerId}/work-evidence`);
    return { data: res.data, isMock: false };
  } catch {
    console.warn(`[API] Work evidence unavailable for ${officerId}`);
    return { data: [], isMock: false, error: true };
  }
}

export async function getOfficerArtifacts(officerId) {
  try {
    const res = await api.get(`/api/officers/${officerId}/artifacts`);
    return { data: res.data, isMock: false };
  } catch {
    console.warn(`[API] Work artifacts unavailable for ${officerId}`);
    return { data: [], isMock: false, error: true };
  }
}

export async function getArtifactDetail(artifactId) {
  try {
    const res = await api.get(`/api/artifacts/${artifactId}`);
    return { data: res.data, isMock: false };
  } catch {
    console.warn(`[API] Artifact detail unavailable for ${artifactId}`);
    return { data: null, isMock: false, error: true };
  }
}

export async function uploadProfilePhoto(officerId, file) {
  try {
    const formData = new FormData();
    formData.append('file', file);
    const res = await api.post(`/api/officers/${officerId}/profile-photo`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 30000,
    });
    return { data: res.data, isMock: false };
  } catch (err) {
    console.error(`[API] Profile photo upload failed for ${officerId}:`, err);
    return {
      data: null,
      isMock: false,
      error: true,
      message: extractErrorMessage(err),
    };
  }
}

export async function removeProfilePhoto(officerId) {
  try {
    const res = await api.delete(`/api/officers/${officerId}/profile-photo`);
    return { data: res.data, isMock: false };
  } catch (err) {
    return { data: null, isMock: false, error: true, message: extractErrorMessage(err) };
  }
}

export async function getOfficerArtifactGaps(officerId, artifactId) {
  try {
    const params = artifactId ? { artifact_id: artifactId } : {};
    const res = await api.get(`/api/officers/${officerId}/artifact-gaps`, { params });
    return { data: res.data, isMock: false };
  } catch {
    console.warn(`[API] Artifact gaps unavailable for ${officerId}`);
    return { data: [], isMock: false, error: true };
  }
}

export async function getOfficerArtifactRecommendations(officerId, artifactId) {
  try {
    const params = artifactId ? { artifact_id: artifactId } : {};
    const res = await api.get(`/api/officers/${officerId}/artifact-recommendations`, { params });
    return { data: res.data, isMock: false };
  } catch {
    console.warn(`[API] Artifact recommendations unavailable for ${officerId}`);
    return { data: [], isMock: false, error: true };
  }
}

export async function getCourses(limit = 100) {
  try {
    const res = await api.get('/api/courses', { params: { limit } });
    return { data: res.data, isMock: false };
  } catch {
    console.warn('[API] Course catalogue unavailable');
    return { data: [], isMock: false, error: true };
  }
}

/**
 * Trigger re-assessment for a competency.
 * @param {string} officerId
 * @param {string} cid
 * @returns {Promise<{data: object, isMock: boolean}>}
 */
export async function triggerReassessment(officerId, cid) {
  try {
    const res = await api.post(`/api/passport/${officerId}/reassess`, { cid });
    return { data: res.data, isMock: false };
  } catch {
    console.warn(`[API] Reassessment trigger fallback to mock for ${officerId}`);
    return {
      data: {
        cid,
        recommended_action: 'retake_quiz',
        message: "Re-assessment ready. Route officer to quiz generation for this competency's linked course material.",
      },
      isMock: true,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN API FUNCTIONS — mock data for Phase 6, real fetch in Phase 6B
// ═══════════════════════════════════════════════════════════════════════════

import {
  MOCK_GAP_SUMMARY,
  MOCK_TRAINING_EFFECTIVENESS,
  MOCK_DEPARTMENT_SUMMARY,
} from './adminMockData';

/**
 * Fetch org-wide gap summary for admin analytics.
 * Phase 6B: GET /api/admin/gap-summary
 * @param {string} [department]
 * @returns {Promise<{data: object[], note?: string, isMock: boolean}>}
 */
export async function getGapSummary(department) {
  try {
    const params = department ? { department } : {};
    const res = await api.get('/api/admin/gap-summary', { params });
    const items = Array.isArray(res.data) ? res.data : (res.data.items || []);
    return { data: items, note: res.data.note, isMock: false };
  } catch {
    return { data: MOCK_GAP_SUMMARY, isMock: true };
  }
}

/**
 * Fetch training effectiveness data for admin analytics.
 * Phase 6B: GET /api/admin/training-effectiveness
 * @returns {Promise<{data: object[], message?: string, note?: string, isMock: boolean}>}
 */
export async function getTrainingEffectiveness() {
  try {
    const res = await api.get('/api/admin/training-effectiveness');
    const items = Array.isArray(res.data) ? res.data : (res.data.items || []);
    return { data: items, message: res.data.message, note: res.data.note, isMock: false };
  } catch {
    return { data: MOCK_TRAINING_EFFECTIVENESS, isMock: true };
  }
}

/**
 * Fetch department summary for admin analytics.
 * Phase 6B: GET /api/admin/department-summary
 * @returns {Promise<{data: object[], note?: string, isMock: boolean}>}
 */
export async function getDepartmentSummary() {
  try {
    const res = await api.get('/api/admin/department-summary');
    const items = Array.isArray(res.data) ? res.data : (res.data.items || []);
    return { data: items, note: res.data.note, isMock: false };
  } catch {
    return { data: MOCK_DEPARTMENT_SUMMARY, isMock: true };
  }
}

/**
 * Upload work artifact for evidence analysis.
 * @param {FormData} formData
 * @returns {Promise<{data: object, isMock: boolean}>}
 */
export async function uploadArtifact(formData) {
  try {
    const res = await api.post('/api/artifacts/analyze', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return { data: res.data, isMock: false };
  } catch (err) {
    return { data: null, isMock: false, error: true, message: extractErrorMessage(err) };
  }
}

/**
 * Generate AI quiz from uploaded file or material via backend API.
 * Uses a 120-second timeout since LLM generation can take 15-60 seconds.
 * @param {FormData} formData
 * @returns {Promise<{data: object|null, isMock: boolean, error?: boolean, message?: string}>}
 */
export async function generateQuizApi(formData) {
  const retryDelays = [0, 20000, 40000];
  let lastError;

  for (let attempt = 0; attempt < retryDelays.length; attempt += 1) {
    if (retryDelays[attempt] > 0) {
      await new Promise((resolve) => setTimeout(resolve, retryDelays[attempt]));
    }

    try {
      const res = await api.post('/api/quiz/generate', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120000, // 120s — LLM generation is slow
      });
      return { data: res.data, isMock: false };
    } catch (err) {
      lastError = err;
      if (err.response?.data?.code === 'LLM_NOT_CONFIGURED') break;
      const status = err.response?.status;
      const isTransient = !status || [502, 503, 504].includes(status);
      if (!isTransient || attempt === retryDelays.length - 1) break;
      console.warn(`[API] Quiz service unavailable; retrying (${attempt + 1}/2).`);
    }
  }

  console.error('[API] Quiz generation failed:', lastError);
  const lastStatus = lastError?.response?.status;
  const configurationError = lastError?.response?.data?.code === 'LLM_NOT_CONFIGURED';
  return {
    data: null,
    isMock: false,
    error: true,
    message:
      configurationError
        ? 'Quiz generation is not configured. Add GOOGLE_API_KEY to the backend environment and restart the server.'
        : !lastStatus || [502, 503, 504].includes(lastStatus)
        ? 'The Render quiz service is waking up or temporarily unavailable. Please wait up to a minute and try again.'
        : extractErrorMessage(lastError),
  };
}

/**
 * Submit quiz answers to backend API.
 * @param {object} payload - { attempt_id, officer_id, answers }
 * @returns {Promise<{data: object|null, isMock: boolean, error?: boolean, message?: string}>}
 */
export async function submitQuizApi(payload) {
  try {
    const res = await api.post('/api/quiz/submit', payload);
    return { data: res.data, isMock: false };
  } catch (err) {
    console.error('[API] Quiz submission failed:', err);
    return {
      data: null,
      isMock: false,
      error: true,
      message: extractErrorMessage(err),
    };
  }
}

export default api;

