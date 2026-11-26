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
  excludedEmployers: string[];
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
  matchScore: number;
  matchingSkills: string[];
  missingSkills: string[];
  fitRationale: string;
  status: 'discovered' | 'autofilled' | 'pending_review' | 'submitted' | 'interviewing' | 'rejected';
  discoveredAt: string;
  postedDate: string;
  postedDaysAgo: number;
  isStale: boolean;
  isConflictOfInterest: boolean;
  conflictReason?: string;
  applicationId?: string;
}

export interface WorkdayQuestionAnswer {
  id: string;
  question: string;
  category: 'legal' | 'technical' | 'behavioral' | 'compensation' | 'diversity';
  answer: string;
  reasoning: string;
  confidence: number;
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
  jobsFilteredOldCount: number;
  jobsFilteredConflictCount: number;
  message: string;
  details: string[];
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'candidate' | 'employee' | 'recruiter' | 'admin' | 'verifier';
  capabilities?: string[];
  publisherStatus?: 'untrusted' | 'approved' | 'suspended' | 'revoked';
  publisherApprovedAt?: string;
  publisherApprovedBy?: string;
  recruiterStatus?: 'none' | 'pending' | 'authorized' | 'revoked';
  recruiterAuthorizedAt?: string;
  recruiterAuthorizedBy?: string;
  createdAt?: string;
  updatedAt?: string;
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

export interface SystemKeyInfo {
  name: string;
  label: string;
  category: 'auth' | 'automation' | 'admin' | 'ai' | 'oauth' | 'database';
  isSet: boolean;
  source: 'Environment (Vercel/Hosting)' | 'Internal Auto-Generated' | 'Runtime Override' | 'Not Configured';
  isRegenerable: boolean;
  maskedPreview: string;
  fullValue?: string;
  description: string;
  usageGuide: string;
}

export interface SystemKeysResponse {
  keys: SystemKeyInfo[];
  envExport: string;
  activeAdminApiKey: string;
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
  availabilityDate: string;
  skills: string[];
  experienceYears: number;
  educationSummary: string;
  employmentHistory: WorkExperience[];
  visibility: CandidateVisibility;
  referralOptIn: boolean;
  submittedForReferral: boolean;
  profileCompleteness: number;
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
  affiliationEvidence: string[];
  headline: string;
  summary: string;
  linkedinUrl: string;
  createdAt: string;
  updatedAt: string;
}
// ---------- ApplyMatica referral marketplace (Milestone 2) ----------

export type ReferralJobStatus = 'draft' | 'published' | 'active' | 'filled' | 'expired' | 'closed';
export type ReferralJobModerationStatus = 'clean' | 'reported' | 'removed';
export type ReferralJobWorkMode = 'Remote' | 'Hybrid' | 'Onsite';
export type ReferralJobEmploymentType = 'Full-time' | 'Contract' | 'Part-time' | 'Internship';

export interface ReferralJob {
  id: string;
  postedByUserId: string;
  opportunityType: 'regular_job' | 'employee_referral' | 'community_shared';
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
  'referral_confirmed' | 'referral_submitted' | 'interview_scheduled' | 'selected' |
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
