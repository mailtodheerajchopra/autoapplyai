import {
  User,
  CandidateProfile,
  JobPosting,
  WorkdayApplication,
  ResumeDocument,
  AgentRunLog,
  AdminTenantSummary,
  AdminPlatformStats,
  SystemKeysResponse,
  SystemKeyInfo,
} from './types';

const TOKEN_KEY = 'autoapply_auth_token';

// OAuth handoff: the provider callback redirects back with ?oauthToken=...
// (success) or ?oauthError=... (failure); consume both immediately, scrub the
// URL clean, and stash the error where the sign-in modal can surface it.
const OAUTH_ERROR_KEY = 'autoapply_oauth_error';
(function pickupOAuthParams() {
  try {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('oauthToken');
    const e = params.get('oauthError');
    if (t) localStorage.setItem(TOKEN_KEY, t);
    if (e) sessionStorage.setItem(OAUTH_ERROR_KEY, e);
    if (t || e) {
      params.delete('oauthToken');
      params.delete('oauthError');
      const qs = params.toString();
      window.history.replaceState({}, '', window.location.pathname + (qs ? '?' + qs : ''));
    }
  } catch { /* non-browser contexts — ignore */ }
})();

/** One-shot read of an OAuth failure stashed by the URL scrubber above. */
export function consumeStoredOAuthError(): string | null {
  try {
    const v = sessionStorage.getItem(OAUTH_ERROR_KEY);
    if (v) sessionStorage.removeItem(OAUTH_ERROR_KEY);
    return v;
  } catch {
    return null;
  }
}

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string | null): void {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

async function fetchWithAuth<T>(url: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(options.headers || {});

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(url, { ...options, headers });

  if (response.status === 401) {
    // If unauthorized, token is bad or expired
    setStoredToken(null);
  }

  if (!response.ok) {
    let errorMsg = `HTTP Error ${response.status}`;
    try {
      const errJson = await response.json();
      errorMsg = errJson.error || errorMsg;
    } catch {
      // ignore JSON parse error
    }
    throw new Error(errorMsg);
  }

  return response.json();
}

export const api = {
  // Auth
  async login(email: string, password: string):Promise<{ user: User; token: string; profile: CandidateProfile }> {
    const res = await fetchWithAuth<{ user: User; token: string; profile: CandidateProfile }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setStoredToken(res.token);
    return res;
  },

  async getAuthProviders(): Promise<{ google: boolean; linkedin: boolean }> {
    try {
      const res = await fetch('/api/auth/oauth/config');
      if (!res.ok) return { google: false, linkedin: false };
      const cfg = await res.json() as { google?: boolean; linkedin?: boolean };
      return { google: !!cfg.google, linkedin: !!cfg.linkedin };
    } catch {
      return { google: false, linkedin: false };
    }
  },

  async register(name: string, email: string, password: string): Promise<{ user: User; token: string; profile: CandidateProfile }> {
    const res = await fetchWithAuth<{ user: User; token: string; profile: CandidateProfile }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    });
    setStoredToken(res.token);
    return res;
  },

  async demoSwitch(userId: string): Promise<{ user: User; token: string; profile: CandidateProfile }> {
    const res = await fetchWithAuth<{ user: User; token: string; profile: CandidateProfile }>('/api/auth/demo-switch', {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
    setStoredToken(res.token);
    return res;
  },

  async listUsers(): Promise<{ id: string; email: string; name: string; role: 'candidate' | 'admin' }[]> {
    return fetchWithAuth('/api/auth/users');
  },

  async getDemoPersonas(): Promise<{ id: string; email: string; name: string; role: 'candidate' | 'admin' }[]> {
    return fetchWithAuth('/api/auth/demo-personas');
  },

  async updateRole(role: 'candidate' | 'admin'): Promise<{ success: boolean; role: 'candidate' | 'admin' }> {
    return fetchWithAuth('/api/auth/update-role', {
      method: 'POST',
      body: JSON.stringify({ role }),
    });
  },

  async getMe(): Promise<{ user: User; profile: CandidateProfile }> {
    return fetchWithAuth('/api/auth/me');
  },

  async changePassword(currentPassword: string, newPassword: string): Promise<{ success: boolean; persisted?: boolean }> {
    return fetchWithAuth('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  },

  logout(): void {
    setStoredToken(null);
  },

  // Admin
  async getAdminTenants(): Promise<AdminTenantSummary[]> {
    return fetchWithAuth('/api/admin/tenants');
  },

  async getAdminStats(): Promise<AdminPlatformStats> {
    return fetchWithAuth('/api/admin/stats');
  },

  async deleteAdminUser(userId: string): Promise<{ deleted: boolean }> {
    return fetchWithAuth(`/api/admin/users/${userId}/delete`, { method: 'POST' });
  },

  // Profile
  async getProfile(): Promise<CandidateProfile> {
    return fetchWithAuth('/api/profile');
  },

  async updateProfile(updates: Partial<CandidateProfile>): Promise<CandidateProfile> {
    return fetchWithAuth('/api/profile', {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  // Resumes
  async getResumes(): Promise<ResumeDocument[]> {
    return fetchWithAuth('/api/resumes');
  },

  async uploadResume(payload: {
    fileName: string;
    fileType: 'pdf' | 'docx' | 'md' | 'txt';
    contentBase64?: string;
    rawText?: string;
  }): Promise<{ resume: ResumeDocument; updatedProfile: CandidateProfile }> {
    return fetchWithAuth('/api/resumes/upload', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async deleteResume(id: string): Promise<{ success: boolean }> {
    return fetchWithAuth(`/api/resumes/${id}`, {
      method: 'DELETE',
    });
  },

  // Jobs
  async getJobs(): Promise<JobPosting[]> {
    return fetchWithAuth('/api/jobs');
  },

  async addJob(job: Partial<JobPosting>): Promise<JobPosting> {
    return fetchWithAuth('/api/jobs', {
      method: 'POST',
      body: JSON.stringify(job),
    });
  },

  async updateJob(id: string, updates: Partial<JobPosting>): Promise<JobPosting> {
    return fetchWithAuth(`/api/jobs/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  },

  async deleteJob(id: string): Promise<{ success: boolean }> {
    return fetchWithAuth(`/api/jobs/${id}`, {
      method: 'DELETE',
    });
  },

  // Agent — async pipeline (202 + poll)
  async kickoffAgentDiscovery(options: {
    keywords?: string[];
    sources?: string[];
    location?: string;
    remoteOnly?: boolean;
    minMatchScore?: number;
  }): Promise<{ jobId: string; status: 'queued' | 'running' | 'completed' | 'failed'; cached: boolean; result?: { jobsFound: number; staleJobsFiltered: number; conflictJobsBlocked: number }; pollUrl: string }> {
    return fetchWithAuth('/api/agent/discover', {
      method: 'POST',
      body: JSON.stringify(options),
    });
  },

  async getDiscoveryJob(jobId: string): Promise<{
    jobId: string;
    status: 'queued' | 'running' | 'completed' | 'failed';
    progress: number;
    stage?: string;
    result?: { jobsFound: number; staleJobsFiltered: number; conflictJobsBlocked: number };
    error?: string;
  }> {
    return fetchWithAuth(`/api/agent/discover/${jobId}`);
  },

  async getAgentLogs(): Promise<AgentRunLog[]> {
    return fetchWithAuth('/api/agent/logs');
  },

  // Workday Applications
  async triggerWorkdayAutofill(jobId: string): Promise<WorkdayApplication> {
    return fetchWithAuth(`/api/workday/autofill/${jobId}`, {
      method: 'POST',
    });
  },

  async getWorkdayReview(applicationId: string): Promise<WorkdayApplication> {
    return fetchWithAuth(`/api/workday/review/${applicationId}`);
  },

  async updateQuestionAnswer(
    applicationId: string,
    payload: {
      questionId?: string;
      newAnswer?: string;
      newCoverLetter?: string;
      contactInformation?: any;
    }
  ): Promise<WorkdayApplication> {
    return fetchWithAuth(`/api/workday/update-answer/${applicationId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  async aiRefineAnswer(
    applicationId: string,
    questionId: string,
    userGuidance: string
  ): Promise<{ app: WorkdayApplication; refinedAnswer: any }> {
    return fetchWithAuth(`/api/workday/ai-refine-answer/${applicationId}`, {
      method: 'POST',
      body: JSON.stringify({ questionId, userGuidance }),
    });
  },

  async sendWorkdayVerification(applicationId: string): Promise<{
    success: boolean;
    sentTo: string;
    code?: string;
    message: string;
  }> {
    return fetchWithAuth(`/api/workday/send-verification/${applicationId}`, {
      method: 'POST',
    });
  },

  async verifyWorkdayEmail(applicationId: string, code: string): Promise<{
    success: boolean;
    application: WorkdayApplication;
    message: string;
  }> {
    return fetchWithAuth(`/api/workday/verify-email/${applicationId}`, {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
  },

  async submitWorkdayApplication(applicationId: string): Promise<{
    success: boolean;
    application: WorkdayApplication;
    confirmationCode: string;
    message: string;
  }> {
    return fetchWithAuth(`/api/workday/submit/${applicationId}`, {
      method: 'POST',
    });
  },

  async syncWorkdayStatus(applicationId: string): Promise<{
    success: boolean;
    application: WorkdayApplication;
    status: string;
    lastSyncAt: string;
  }> {
    return fetchWithAuth(`/api/workday/sync-status/${applicationId}`, {
      method: 'POST',
    });
  },

  async getWorkdayVault(): Promise<any[]> {
    return fetchWithAuth('/api/workday/vault');
  },

  async getAuditLogs(): Promise<any[]> {
    return fetchWithAuth('/api/audit-logs');
  },

  async getRelevanceDiagnostics(): Promise<any> {
    return fetchWithAuth('/api/diagnostics/relevance');
  },

  async getApplications(): Promise<WorkdayApplication[]> {
    return fetchWithAuth('/api/applications');
  },

  // Key Management & Regeneration
  async getAdminKeys(): Promise<SystemKeysResponse> {
    return fetchWithAuth('/api/admin/keys');
  },

  async regenerateAdminKey(keyName: 'AUTH_SECRET' | 'CRON_SECRET' | 'ADMIN_API_KEY' | 'WORKDAY_ENCRYPTION_KEY' | 'ALL'): Promise<{
    success: boolean;
    regenerated: Record<string, string>;
    keys: SystemKeyInfo[];
    envExport: string;
    message: string;
  }> {
    return fetchWithAuth('/api/admin/keys/regenerate', {
      method: 'POST',
      body: JSON.stringify({ keyName }),
    });
  },

  async overrideAdminKey(keyName: string, value: string): Promise<{
    success: boolean;
    keys: SystemKeyInfo[];
    envExport: string;
    message: string;
  }> {
    return fetchWithAuth('/api/admin/keys/override', {
      method: 'POST',
      body: JSON.stringify({ keyName, value }),
    });
  },

  async getEnvExport(): Promise<{ envFileContent: string }> {
    return fetchWithAuth('/api/admin/keys/export-env');
  },

  async triggerManualSweep(): Promise<{
    success: boolean;
    summary: { swept: number; results: { poolKey: string; jobsFound: number; error?: string }[] };
    totalFound: number;
  }> {
    return fetchWithAuth('/api/admin/cron/trigger-now', {
      method: 'POST',
    });
  },

  async getCandidateApiKey(): Promise<{ apiKey: string; userId: string }> {
    return fetchWithAuth('/api/profile/api-key');
  },

  async regenerateCandidateApiKey(): Promise<{ success: boolean; apiKey: string }> {
    return fetchWithAuth('/api/profile/api-key/regenerate', {
      method: 'POST',
    });
  },
};
