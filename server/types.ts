export interface User {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  salt: string;
  role: 'candidate' | 'employee' | 'recruiter' | 'admin' | 'verifier';
  capabilities: string[];
  createdAt: string;
  updatedAt: string;
}

export interface AdminTenantSummary {
  id: string;
  email: string;
  name: string;
  role: 'candidate' | 'admin';
  currentEmployer: string;
  resumeCount: number;
  applicationCount: number;
  discoveredJobsCount: number;
  createdAt: string;
}

export interface AdminPlatformStats {
  totalUsers: number;
  totalResumes: number;
  totalApplications: number;
  totalJobsDiscovered: number;
  totalStaleJobsFiltered: number;
  totalEmployerConflictsBlocked: number;
  totalCredentialsProvisioned: number;
  activeSessions: number;
}

export interface WorkdayPreferences {
  workAuthorization: 'US_CITIZEN' | 'PERMANENT_RESIDENT' | 'H1B_VISA' | 'OPT_CPT' | 'OTHER' | 'REQUIRES_SPONSORSHIP';
  requiresSponsorshipNowOrFuture: boolean;
  legallyAuthorizedToWork: boolean;
  veteranStatus: 'NOT_A_VETERAN' | 'VETERAN' | 'DECLINE_TO_STATE';
  disabilityStatus: 'NO_DISABILITY' | 'YES_DISABILITY' | 'DECLINE_TO_STATE';
  gender: 'MALE' | 'FEMALE' | 'NON_BINARY' | 'DECLINE_TO_STATE';
  raceEthnicity: string;
  noticePeriodDays: number;
  expectedSalaryUsd: string;
  willingToRelocate: boolean;
  preferredWorkType: 'REMOTE' | 'HYBRID' | 'ONSITE' | 'ANY';
  securityClearance: 'NONE' | 'SECRET' | 'TOP_SECRET';
}

export interface CandidateProfile {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  phone: string;
  location: string;
  headline: string;
  summary: string;
  linkedinUrl: string;
  githubUrl: string;
  portfolioUrl: string;
  currentEmployer: string;
  excludedEmployers: string[]; // Strict blacklisted employers (e.g. current/last employer)
  skills: {
    category: string;
    items: string[];
  }[];
  primarySkills: string[];
  workdayPreferences: WorkdayPreferences;
  targetRoles: string[];
  targetLocations: string[];
  yearsOfExperience: number;
  updatedAt: string;
}

export interface WorkExperience {
  company: string;
  title: string;
  location: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  bulletPoints: string[];
}

export interface Education {
  institution: string;
  degree: string;
  fieldOfStudy: string;
  graduationYear: string;
  gpa?: string;
}

export interface ResumeDocument {
  id: string;
  userId: string;
  fileName: string;
  fileType: 'pdf' | 'docx' | 'md' | 'txt';
  fileSize: number;
  rawText?: string;
  parsedProfile: {
    fullName: string;
    email: string;
    phone: string;
    headline: string;
    summary: string;
    currentEmployer?: string;
    skills: string[];
    skillCategories: { category: string; items: string[] }[];
    workExperience: WorkExperience[];
    education: Education[];
    certifications: string[];
  };
  uploadedAt: string;
}

export interface JobPosting {
  id: string;
  userId: string;
  title: string;
  company: string;
  location: string;
  remoteType: 'Remote' | 'Hybrid' | 'On-site';
  employmentType: 'Full-time' | 'Contract' | 'Part-time';
  salaryRange: string;
  source: 'LinkedIn' | 'Naukri' | 'Workday Portal' | 'Indeed' | 'Company Direct';
  sourceUrl: string;
  portalType: 'workday' | 'greenhouse' | 'lever' | 'taleo' | 'direct' | 'ashby' | 'smartrecruiters' | 'workable' | 'recruitee';
  workdayTenantId?: string;
  description: string;
  requiredSkills: string[];
  matchScore: number; // 0-100
  matchingSkills: string[];
  missingSkills: string[];
  fitRationale: string;
  status: 'discovered' | 'autofilled' | 'pending_review' | 'submitted' | 'interviewing' | 'rejected';
  discoveredAt: string;
  postedDate: string; // ISO date of original posting
  postedDaysAgo: number; // e.g. 3, 14, 42
  isStale: boolean; // true if > 45 days old
  isConflictOfInterest: boolean; // true if matches current/last employer
  conflictReason?: string;
  applicationId?: string;
}

export interface WorkdayQuestionAnswer {
  id: string;
  question: string;
  category: 'legal' | 'technical' | 'behavioral' | 'compensation' | 'diversity';
  answer: string;
  reasoning: string;
  confidence: number; // 0-100
  isUserReviewed: boolean;
}

export interface WorkdayApplication {
  id: string;
  userId: string;
  jobId: string;
  jobTitle: string;
  company: string;
  workdayPortalUrl: string;
  generatedAccount: {
    username: string;
    generatedEmail: string;
    temporaryPasswordMasked: string;
    accountCreatedAt: string;
  };
  contactInformation: {
    legalFirstName: string;
    legalLastName: string;
    email: string;
    phone: string;
    addressLine1: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  workExperience: WorkExperience[];
  education: Education[];
  questionAnswers: WorkdayQuestionAnswer[];
  tailoredCoverLetter: string;
  status: 'autofilled' | 'pending_review' | 'approved_by_user' | 'submitted';
  workdayCandidateStatus?: 'Application Received' | 'Under Recruiter Review' | 'Screening Scheduled' | 'Assessment Pending' | 'Interview Scheduled' | 'Offer Extended' | 'Archived';
  lastStatusSyncAt?: string;
  statusHistory?: { timestamp: string; status: string; notes: string }[];
  submissionAudit: {
    submittedAt?: string;
    confirmationCode?: string;
    ipAddress?: string;
    workdaySubmissionId?: string;
    auditLog: { timestamp: string; step: string; status: 'ok' | 'info' | 'warn' }[];
  };
  emailVerification?: {
    required: boolean;
    sentTo: string;
    verificationCode?: string;
    isVerified: boolean;
    sentAt: string;
    verifiedAt?: string;
    expiresAt: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface WorkdayEmailVerification {
  required: boolean;
  sentTo: string;
  verificationCode?: string;
  isVerified: boolean;
  sentAt: string;
  verifiedAt?: string;
  expiresAt: string;
}

export interface WorkdayCredentialAccount {
  id: string;
  userId: string;
  company: string;
  portalDomain: string;
  username: string;
  temporaryPasswordMasked: string;
  createdAt: string;
  lastUsedAt: string;
  linkedApplicationIds: string[];
}

export interface SystemAuditLog {
  id: string;
  userId: string;
  timestamp: string;
  category: 'discovery' | 'filtering' | 'autofill' | 'review' | 'submission' | 'status_sync' | 'security' | 'profile' | 'referral' | 'verification' | 'privacy' | 'moderation';
  action: string;
  details: string;
  severity: 'info' | 'warn' | 'success' | 'alert';
  metadata?: Record<string, any>;
}

export interface AgentRunLog {
  id: string;
  userId: string;
  triggeredAt: string;
  status: 'running' | 'completed' | 'failed';
  keywords: string[];
  sources: string[];
  jobsFound: number;
  jobsFilteredOldCount: number; // Stale jobs (> 45 days) dropped
  jobsFilteredConflictCount: number; // Current employer jobs blocked
  message: string;
  details: string[];
}

/**
 * Trackable unit of work for the asynchronous discovery agent.
 * POST /agent/discover creates this record and returns 202 immediately;
 * the client polls GET /agent/discover/:id until a terminal status.
 */
export interface DiscoveryJob {
  id: string;
  userId: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  updatedAt: string;
  options: DiscoveryOptions;
  /** 0-100, coarse milestones the client can render while it polls */
  progress: number;
  stage?: string;
  /** Set only when status = completed */
  result?: DiscoveryJobResult;
  error?: string;
  jobIdsDiscovered?: string[];
}

export interface DiscoveryOptions {
  keywords?: string[];
  sources?: string[];
  location?: string;
  remoteOnly?: boolean;
  minMatchScore?: number;
  /**
   * Explicit target companies for the real-board tier (issue #10). Accepts
   * "greenhouse:stripe", board URLs, or bare slugs ("stripe", "openai").
   * When any target resolves, live Greenhouse/Lever/Ashby postings are used
   * INSTEAD of AI generation (zero quota); the agent chain stays the fallback.
   */
  companies?: string[];
  /**
   * Incremental-scan knob: when set (e.g. 2 for the cron sweeper), the model is
   * asked to return only postings from the last N days. Omitted for full
   * first-time scans, which cover the standard 45-day window.
   */
  recencyWindowDays?: number;
}

export interface DiscoveryJobResult {
  jobsFound: number;
  staleJobsFiltered: number;
  conflictJobsBlocked: number;
  /** Postings hidden because their experience demand fits badly (Enforce 4). */
  experienceFiltered?: number;
}

/**
 * Shared DiscoveryPool: ONE market scan per (skills-fingerprint + search
 * filters), reused across users. The per-user 45d/conflict/brand filters are
 * applied at serve time, never stored. Amortizes the free-tier Gemini quota:
 * N users with the same profile cost ONE agent run.
 */
export interface DiscoveryPoolEntry {
  poolKey: string;
  keywords?: string[];
  sources?: string[];
  location?: string;
  remoteOnly?: boolean;
  /** Skill context captured from the originating profile (drives the Gemini prompt). */
  skillContext: PoolSkillContext;
  /** Template postings as fetched — pre-user-filter (userId set to 'pool'). */
  /** Template postings as fetched — pre-user-filter (userId omitted / 'pool'). */
  jobs: Array<Omit<JobPosting, 'id' | 'userId'> & { id?: string; jobFetchedAt?: string }>;
  /** Last (re-)scan of this market — keeps the pool TTL alive across sweeps. */
  fetchedAt: string;
  /** When the scan first covered this fingerprint (full-history marker). */
  firstScanAt: string;
  /** Recency signal for the cron sweeper (top-N active fingerprints refresh first). */
  lastRequestedAt: string;
  requestCount: number;
}

export interface PoolSkillContext {
  primarySkills: string[];
  skillItems: string[];
  targetRoles: string[];
  yearsOfExperience: number;
  currentEmployer?: string;
  excludedEmployers?: string[];
  location?: string;
  preferredWorkType?: string;
}

export interface DiscoveryRunHandle {
  jobId: string;
  status: DiscoveryJob['status'];
  /** Seconds until the user may start another discovery run (free-tier pacing) */
  cooldownSeconds?: number;
  cached: boolean;
  result?: DiscoveryJobResult;
}
// ---------- ApplyMatica referral marketplace (Milestone 1) ----------

export type CandidateVisibility = 'private' | 'anonymous' | 'verified_employees' | 'recruiters';

export interface CandidateReferralProfile {
  id: string;
  userId: string;
  currentEmployer: string;
  previousEmployers: string[];
  preferredCompanies: string[];
  preferredTitles: string[];
  preferredLocations: string[];
  noticePeriodDays: number;
  availabilityDate: string; // ISO
  skills: string[];
  experienceYears: number;
  educationSummary: string;
  employmentHistory: WorkExperience[];
  visibility: CandidateVisibility;
  referralOptIn: boolean;
  submittedForReferral: boolean;
  profileCompleteness: number; // 0-100
  createdAt: string;
  updatedAt: string;
}

export interface EmployeeProfile {
  id: string;
  userId: string;
  corporateEmail: string;
  company: string;
  title: string;
  department: string;
  emailVerified: boolean;
  emailVerifiedAt?: string;
  affiliationStatus: 'unverified' | 'pending' | 'verified' | 'rejected';
  affiliationEvidence: string[]; // verification document ids
  headline: string;
  summary: string;
  linkedinUrl: string;
  createdAt: string;
  updatedAt: string;
}

export interface CompanyProfile {
  id: string;
  name: string;
  domain: string;
  verified: boolean;
  createdAt: string;
}
// ---------- ApplyMatica referral marketplace (Milestone 2) ----------

export type ReferralJobStatus = 'draft' | 'published' | 'active' | 'filled' | 'expired' | 'closed';
export type ReferralJobModerationStatus = 'clean' | 'reported' | 'removed';
export type ReferralJobWorkMode = 'Remote' | 'Hybrid' | 'Onsite';
export type ReferralJobEmploymentType = 'Full-time' | 'Contract' | 'Part-time' | 'Internship';

export interface ReferralJob {
  id: string;
  postedByUserId: string;
  company: string;
  title: string;
  requisitionId: string;
  description: string;
  skillsRequired: string[];
  minExperience: number;
  maxExperience: number;
  location: string;
  workMode: ReferralJobWorkMode;
  employmentType: ReferralJobEmploymentType;
  jobUrl: string;
  referralProvider: string;
  availableSlots: number;
  filledSlots: number;
  expiresAt: string;
  instructions: string;
  status: ReferralJobStatus;
  moderationStatus: ReferralJobModerationStatus;
  reports: { byUserId: string; reason: string; createdAt: string }[];
  createdAt: string;
  updatedAt: string;
}

export type ReferralRequestStatus =
  'requested' | 'under_review' | 'shortlisted' | 'accepted' |
  'referral_submitted' | 'interview_scheduled' | 'selected' |
  'rejected' | 'withdrawn';

export interface ReferralRequest {
  id: string;
  candidateUserId: string;
  referralJobId: string;
  employeeUserId: string;
  status: ReferralRequestStatus;
  matchScore: number;
  matchingSkills: string[];
  missingSkills: string[];
  resumeId?: string;
  coverNote?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReferralStatusEvent {
  id: string;
  requestId: string;
  fromStatus?: ReferralRequestStatus;
  toStatus: ReferralRequestStatus;
  actorUserId: string;
  note?: string;
  createdAt: string;
}

export interface Notification {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  link?: string;
  read: boolean;
  createdAt: string;
}

export interface CandidateShortlist {
  id: string;
  employeeUserId: string;
  candidateUserId: string;
  note?: string;
  createdAt: string;
}
// ---------- ApplyMatica verification (Milestone 3) ----------

export type EmploymentVerificationStatus = 'not_started' | 'pending_consent' | 'submitted' | 'under_review' | 'verified' | 'rejected' | 'expired';
export type EmploymentVerificationMethod = 'email_otp' | 'document_review' | 'hr_verification' | 'third_party';

export interface EmploymentVerification {
  id: string;
  userId: string;
  employer: string;
  designation: string;
  startDate: string;
  endDate?: string;
  isCurrent: boolean;
  corporateEmail: string;
  status: EmploymentVerificationStatus;
  method: EmploymentVerificationMethod;
  consentGivenAt?: string;
  consentWithdrawnAt?: string;
  documents: string[];
  verifiedAt?: string;
  verifiedBy?: string;
  expiresAt?: string;
  notes?: string;
  provider?: 'sandbox_mock';
  createdAt: string;
  updatedAt: string;
}

export type BgvCheckType = 'identity' | 'employment_history' | 'education' | 'address' | 'reference';
export type BgvCheckStatus = 'not_started' | 'pending' | 'verified' | 'failed' | 'skipped';
export interface BgvCheck {
  type: BgvCheckType;
  status: BgvCheckStatus;
  result?: string;
  updatedAt?: string;
}
export type BgvStatus = 'not_started' | 'pending_consent' | 'submitted' | 'under_review' | 'completed' | 'rejected' | 'withdrawn';

export interface BackgroundVerificationRequest {
  id: string;
  userId: string;
  checks: BgvCheck[];
  status: BgvStatus;
  consentGivenAt?: string;
  consentWithdrawnAt?: string;
  documents: string[];
  provider: 'sandbox_mock';
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type VerificationDocumentKind = 'employment_proof' | 'identity' | 'education' | 'address' | 'reference' | 'other';

export interface VerificationDocument {
  id: string;
  ownerUserId: string;
  kind: VerificationDocumentKind;
  storagePath: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
  expiresAt?: string;
}

export interface ConsentRecord {
  id: string;
  userId: string;
  scope: string;
  grantedAt: string;
  withdrawnAt?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, any>;
}
