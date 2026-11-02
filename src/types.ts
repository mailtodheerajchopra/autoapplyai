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
  portalType: 'workday' | 'greenhouse' | 'lever' | 'taleo' | 'direct';
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
  category: 'discovery' | 'filtering' | 'autofill' | 'review' | 'submission' | 'status_sync' | 'security';
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
  role: 'candidate' | 'admin';
  createdAt?: string;
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
