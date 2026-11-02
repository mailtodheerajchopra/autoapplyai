import {
  User,
  CandidateProfile,
  JobPosting,
  WorkdayApplication,
  ResumeDocument,
  AgentRunLog,
  AdminTenantSummary,
  AdminPlatformStats,
} from './types';

const TOKEN_KEY = 'autoapply_auth_token';

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

  async register(name: string, email: string, password: string, role?: 'candidate' | 'admin'): Promise<{ user: User; token: string; profile: CandidateProfile }> {
    const res = await fetchWithAuth<{ user: User; token: string; profile: CandidateProfile }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password, role }),
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
};
