import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  User,
  CandidateProfile,
  ResumeDocument,
  JobPosting,
  WorkdayApplication,
  WorkdayCredentialAccount,
  SystemAuditLog,
  AgentRunLog,
} from './types.js';

interface DatabaseSchema {
  users: User[];
  profiles: CandidateProfile[];
  resumes: ResumeDocument[];
  jobs: JobPosting[];
  applications: WorkdayApplication[];
  accounts: WorkdayCredentialAccount[];
  systemAuditLogs: SystemAuditLog[];
  agentLogs: AgentRunLog[];
}

const DB_PATH = path.resolve(process.cwd(), '.data', 'database.json');

class DatabaseService {
  private data: DatabaseSchema;
  private saveTimeout: NodeJS.Timeout | null = null;

  constructor() {
    this.data = this.loadDatabase();
  }

  private loadDatabase(): DatabaseSchema {
    try {
      if (fs.existsSync(DB_PATH)) {
        const raw = fs.readFileSync(DB_PATH, 'utf-8');
        const parsed = JSON.parse(raw);
        if (!parsed.accounts) parsed.accounts = [];
        if (!parsed.systemAuditLogs) parsed.systemAuditLogs = [];
        // Ensure all users have a role
        if (Array.isArray(parsed.users)) {
          parsed.users.forEach((u: any) => {
            if (!u.role) u.role = 'candidate';
          });
          // Ensure an admin user exists
          if (!parsed.users.some((u: any) => u.role === 'admin')) {
            const saltAdmin = crypto.randomBytes(16).toString('hex');
            const hashAdmin = crypto.pbkdf2Sync('admin123', saltAdmin, 1000, 64, 'sha512').toString('hex');
            const adminUser: User = {
              id: 'usr_admin',
              email: 'admin@autoapply.ai',
              name: 'Admin Supervisor',
              passwordHash: hashAdmin,
              salt: saltAdmin,
              role: 'admin',
              createdAt: new Date().toISOString(),
            };
            parsed.users.push(adminUser);
          }
        }
        return parsed;
      }
    } catch (e) {
      console.warn("Could not load database file, initializing fresh store:", e);
    }
    return this.seedInitialDatabase();
  }

  private persist() {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    this.saveTimeout = setTimeout(() => {
      try {
        const dir = path.dirname(DB_PATH);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(DB_PATH, JSON.stringify(this.data, null, 2), 'utf-8');
      } catch (err) {
        console.error("Failed to persist database:", err);
      }
    }, 150);
  }

  private seedInitialDatabase(): DatabaseSchema {
    const salt1 = crypto.randomBytes(16).toString('hex');
    const hash1 = crypto.pbkdf2Sync('password123', salt1, 1000, 64, 'sha512').toString('hex');
    
    const salt2 = crypto.randomBytes(16).toString('hex');
    const hash2 = crypto.pbkdf2Sync('password123', salt2, 1000, 64, 'sha512').toString('hex');

    const user1: User = {
      id: 'usr_alex_chen',
      email: 'alex.chen@example.com',
      name: 'Alex Chen',
      passwordHash: hash1,
      salt: salt1,
      role: 'candidate',
      createdAt: new Date().toISOString(),
    };

    const user2: User = {
      id: 'usr_priya_sharma',
      email: 'priya.sharma@example.com',
      name: 'Priya Sharma',
      passwordHash: hash2,
      salt: salt2,
      role: 'candidate',
      createdAt: new Date().toISOString(),
    };

    const saltAdmin = crypto.randomBytes(16).toString('hex');
    const hashAdmin = crypto.pbkdf2Sync('admin123', saltAdmin, 1000, 64, 'sha512').toString('hex');
    const userAdmin: User = {
      id: 'usr_admin',
      email: 'admin@autoapply.ai',
      name: 'Admin Supervisor',
      passwordHash: hashAdmin,
      salt: saltAdmin,
      role: 'admin',
      createdAt: new Date().toISOString(),
    };

    const profile1: CandidateProfile = {
      id: 'prof_alex_chen',
      userId: user1.id,
      fullName: 'Alex Chen',
      email: user1.email,
      phone: '+1 (415) 890-1234',
      location: 'San Francisco, CA',
      headline: 'Staff Full-Stack Engineer | React, Node.js, Distributed Systems',
      summary: 'Full-stack software architect with 7+ years building enterprise SaaS platforms, high-throughput APIs, and accessible modern frontends.',
      linkedinUrl: 'https://linkedin.com/in/alexchen-dev',
      githubUrl: 'https://github.com/alexchen',
      portfolioUrl: 'https://alexchen.dev',
      currentEmployer: 'HyperScale Cloud Tech',
      excludedEmployers: ['HyperScale Cloud Tech', 'OmniVenture Software'],
      yearsOfExperience: 7,
      primarySkills: ['TypeScript', 'React', 'Node.js', 'PostgreSQL', 'Docker', 'AWS', 'GraphQL'],
      skills: [
        { category: 'Frontend', items: ['React', 'TypeScript', 'Next.js', 'Tailwind CSS', 'Redux / Zustand'] },
        { category: 'Backend', items: ['Node.js', 'Express', 'Go', 'GraphQL', 'REST APIs', 'PostgreSQL', 'Redis'] },
        { category: 'DevOps & Cloud', items: ['AWS (ECS, S3, RDS)', 'Docker', 'Kubernetes', 'GitHub Actions CI/CD'] },
        { category: 'Architecture', items: ['Microservices', 'Event-Driven Systems', 'High-Concurrency Caching'] },
      ],
      targetRoles: ['Staff Software Engineer', 'Senior Full Stack Engineer', 'Principal Frontend Architect'],
      targetLocations: ['San Francisco, CA', 'Remote (US)', 'New York, NY'],
      workdayPreferences: {
        workAuthorization: 'US_CITIZEN',
        legallyAuthorizedToWork: true,
        requiresSponsorshipNowOrFuture: false,
        veteranStatus: 'NOT_A_VETERAN',
        disabilityStatus: 'NO_DISABILITY',
        gender: 'MALE',
        raceEthnicity: 'Asian',
        noticePeriodDays: 14,
        expectedSalaryUsd: '$185,000 - $215,000',
        willingToRelocate: false,
        preferredWorkType: 'REMOTE',
        securityClearance: 'NONE',
      },
      updatedAt: new Date().toISOString(),
    };

    const profile2: CandidateProfile = {
      id: 'prof_priya_sharma',
      userId: user2.id,
      fullName: 'Priya Sharma',
      email: user2.email,
      phone: '+1 (206) 555-8971',
      location: 'Seattle, WA',
      headline: 'Principal DevOps & Cloud Infrastructure Engineer | AWS, Kubernetes, Terraform',
      summary: 'Infrastructure architect specialized in zero-downtime multi-cloud deployments, Kubernetes cluster scaling, and platform engineering.',
      linkedinUrl: 'https://linkedin.com/in/priyasharma-cloud',
      githubUrl: 'https://github.com/priyasharma',
      portfolioUrl: 'https://priyasharma.cloud',
      currentEmployer: 'CloudMatrix Systems',
      excludedEmployers: ['CloudMatrix Systems'],
      yearsOfExperience: 9,
      primarySkills: ['Kubernetes', 'AWS', 'Terraform', 'Go', 'Python', 'Docker', 'ArgoCD'],
      skills: [
        { category: 'Cloud Infrastructure', items: ['AWS', 'Google Cloud', 'Terraform', 'CloudFormation'] },
        { category: 'Containers & Orchestration', items: ['Kubernetes', 'Helm', 'Docker', 'Istio Service Mesh'] },
        { category: 'CI/CD & Observability', items: ['ArgoCD', 'Prometheus', 'Grafana', 'Datadog', 'GitHub Actions'] },
      ],
      targetRoles: ['Principal DevOps Engineer', 'Staff Site Reliability Engineer', 'Cloud Infrastructure Architect'],
      targetLocations: ['Seattle, WA', 'Remote', 'Austin, TX'],
      workdayPreferences: {
        workAuthorization: 'PERMANENT_RESIDENT',
        legallyAuthorizedToWork: true,
        requiresSponsorshipNowOrFuture: false,
        veteranStatus: 'NOT_A_VETERAN',
        disabilityStatus: 'NO_DISABILITY',
        gender: 'FEMALE',
        raceEthnicity: 'Asian / South Asian',
        noticePeriodDays: 30,
        expectedSalaryUsd: '$195,000 - $230,000',
        willingToRelocate: true,
        preferredWorkType: 'REMOTE',
        securityClearance: 'NONE',
      },
      updatedAt: new Date().toISOString(),
    };

    const job1: JobPosting = {
      id: 'job_salesforce_staff',
      userId: user1.id,
      title: 'Staff Full Stack Engineer - Core Cloud',
      company: 'Salesforce',
      location: 'San Francisco, CA / Remote',
      remoteType: 'Remote',
      employmentType: 'Full-time',
      salaryRange: '$175,000 - $215,000 USD',
      source: 'Workday Portal',
      sourceUrl: 'https://salesforce.wd1.myworkdayjobs.com/Careers/job/Staff-Full-Stack-Engineer-Core-Cloud',
      portalType: 'workday',
      workdayTenantId: 'salesforce',
      description: 'Build mission-critical collaboration engines and high-concurrency microservices powering Salesforce Customer 360.',
      requiredSkills: ['TypeScript', 'React', 'Node.js', 'PostgreSQL', 'Docker', 'AWS'],
      matchScore: 96,
      matchingSkills: ['TypeScript', 'React', 'Node.js', 'PostgreSQL', 'Docker', 'AWS'],
      missingSkills: [],
      fitRationale: '100% skill alignment with candidate primary stack and 7+ years distributed systems experience.',
      status: 'pending_review',
      discoveredAt: new Date(Date.now() - 3600000 * 4).toISOString(),
      postedDate: new Date(Date.now() - 86400000 * 4).toISOString(),
      postedDaysAgo: 4,
      isStale: false,
      isConflictOfInterest: false,
    };

    const job2: JobPosting = {
      id: 'job_adobe_senior',
      userId: user1.id,
      title: 'Senior Software Engineer, Experience Platform',
      company: 'Adobe',
      location: 'San Jose, CA / Remote',
      remoteType: 'Remote',
      employmentType: 'Full-time',
      salaryRange: '$165,000 - $198,000 USD',
      source: 'Workday Portal',
      sourceUrl: 'https://adobe.wd5.myworkdayjobs.com/external_experienced/job/Senior-Software-Engineer',
      portalType: 'workday',
      workdayTenantId: 'adobe',
      description: 'Design next-generation real-time customer data platform interfaces and streaming analytics pipelines.',
      requiredSkills: ['React', 'TypeScript', 'GraphQL', 'Docker', 'State Management'],
      matchScore: 92,
      matchingSkills: ['React', 'TypeScript', 'GraphQL', 'Docker'],
      missingSkills: ['State Management'],
      fitRationale: 'Exceptional fit for React frontend architecture and GraphQL API aggregation.',
      status: 'discovered',
      discoveredAt: new Date(Date.now() - 3600000 * 8).toISOString(),
      postedDate: new Date(Date.now() - 86400000 * 9).toISOString(),
      postedDaysAgo: 9,
      isStale: false,
      isConflictOfInterest: false,
    };

    const job3: JobPosting = {
      id: 'job_linkedin_netflix',
      userId: user1.id,
      title: 'Senior UI Platform Engineer',
      company: 'Netflix',
      location: 'Los Gatos, CA / Remote',
      remoteType: 'Remote',
      employmentType: 'Full-time',
      salaryRange: '$220,000 - $280,000 USD',
      source: 'LinkedIn',
      sourceUrl: 'https://www.linkedin.com/jobs/view/senior-ui-platform-engineer-netflix',
      portalType: 'workday',
      workdayTenantId: 'netflix',
      description: 'Empower hundreds of content production teams globally with fast, accessible web tooling and micro-frontends.',
      requiredSkills: ['TypeScript', 'React', 'Node.js', 'Performance Profiling', 'Web Vitals'],
      matchScore: 90,
      matchingSkills: ['TypeScript', 'React', 'Node.js'],
      missingSkills: ['Performance Profiling'],
      fitRationale: 'Strong architectural pedigree matching Netflix UI platform standards.',
      status: 'discovered',
      discoveredAt: new Date(Date.now() - 3600000 * 12).toISOString(),
      postedDate: new Date(Date.now() - 86400000 * 15).toISOString(),
      postedDaysAgo: 15,
      isStale: false,
      isConflictOfInterest: false,
    };

    const job4: JobPosting = {
      id: 'job_naukri_infosys',
      userId: user1.id,
      title: 'Lead Architect - Cloud Native Applications',
      company: 'Infosys',
      location: 'Bangalore / Hybrid',
      remoteType: 'Hybrid',
      employmentType: 'Full-time',
      salaryRange: '₹34,00,000 - ₹44,00,000 INR',
      source: 'Naukri',
      sourceUrl: 'https://www.naukri.com/job-listings-lead-architect-cloud-native-infosys',
      portalType: 'direct',
      description: 'Enterprise modernization architecting high-availability cloud applications and distributed backends.',
      requiredSkills: ['Node.js', 'React', 'AWS', 'Docker', 'Kubernetes'],
      matchScore: 93,
      matchingSkills: ['Node.js', 'React', 'AWS', 'Docker'],
      missingSkills: ['Kubernetes'],
      fitRationale: 'Deep expertise in cloud-native Node.js and AWS deployment pipelines.',
      status: 'discovered',
      discoveredAt: new Date(Date.now() - 3600000 * 20).toISOString(),
      postedDate: new Date(Date.now() - 86400000 * 21).toISOString(),
      postedDaysAgo: 21,
      isStale: false,
      isConflictOfInterest: false,
    };

    // Pre-create 1 staged Workday application
    const app1: WorkdayApplication = {
      id: 'app_salesforce_staff',
      userId: user1.id,
      jobId: job1.id,
      jobTitle: job1.title,
      company: job1.company,
      workdayPortalUrl: job1.sourceUrl,
      generatedAccount: {
        username: 'alex.chen+sf@autoapply.dev',
        generatedEmail: 'alex.chen+sf@autoapply.dev',
        temporaryPasswordMasked: 'WkDay$8A4F#2026',
        accountCreatedAt: new Date(Date.now() - 1800000).toISOString(),
      },
      contactInformation: {
        legalFirstName: 'Alex',
        legalLastName: 'Chen',
        email: user1.email,
        phone: profile1.phone,
        addressLine1: '450 Mission St, Suite 1200',
        city: 'San Francisco',
        state: 'CA',
        postalCode: '94105',
        country: 'United States',
      },
      workExperience: [
        {
          company: 'HyperScale Cloud Tech',
          title: 'Senior Full Stack Engineer',
          location: 'San Francisco, CA',
          startDate: '2021-03',
          endDate: 'Present',
          isCurrent: true,
          bulletPoints: [
            'Architected distributed event-driven microservices serving 4.5M DAU with 99.99% availability.',
            'Spearheaded migration to React 19 and modular design systems, slashing first contentful paint by 42%.',
            'Mentored 6 junior/mid engineers and established zero-regression automated CI/CD testing suites.',
          ],
        },
      ],
      education: [
        {
          institution: 'University of California, Berkeley',
          degree: 'Bachelor of Science (B.S.)',
          fieldOfStudy: 'Computer Science',
          graduationYear: '2018',
          gpa: '3.82',
        },
      ],
      questionAnswers: [
        {
          id: 'q-1',
          question: 'Are you legally authorized to work in the United States without restriction?',
          category: 'legal',
          answer: 'Yes',
          reasoning: 'Verified from candidate Workday preferences (US Citizen declaration).',
          confidence: 100,
          isUserReviewed: true,
        },
        {
          id: 'q-2',
          question: 'Will you now or in the future require visa sponsorship to continue employment?',
          category: 'legal',
          answer: 'No',
          reasoning: 'Verified from candidate declared Workday immigration profile.',
          confidence: 100,
          isUserReviewed: true,
        },
        {
          id: 'q-3',
          question: 'How many years of professional experience do you have architecting production Node.js and React applications?',
          category: 'technical',
          answer: '7+ years of continuous hands-on experience designing and scaling full-stack web architectures.',
          reasoning: 'Extracted from combined timeline across HyperScale and OmniVenture tenures.',
          confidence: 98,
          isUserReviewed: false,
        },
      ],
      tailoredCoverLetter: `Dear Salesforce Talent Acquisition Team,\n\nI am writing to apply for the Staff Full Stack Engineer - Core Cloud position. Having architected cloud-scale microservices and responsive user experiences for over seven years, Salesforce's commitment to reliability deeply resonates with my professional ethos.\n\nSincerely,\nAlex Chen`,
      status: 'pending_review',
      workdayCandidateStatus: 'Under Recruiter Review',
      lastStatusSyncAt: new Date(Date.now() - 900000).toISOString(),
      statusHistory: [
        { timestamp: new Date(Date.now() - 1800000).toISOString(), status: 'Autofilled & Locked', notes: 'Credentials generated on Salesforce Workday instance.' },
        { timestamp: new Date(Date.now() - 900000).toISOString(), status: 'Under Recruiter Review', notes: 'Workday candidate portal queried using saved credentials.' },
      ],
      submissionAudit: {
        auditLog: [
          { timestamp: new Date(Date.now() - 1800000).toISOString(), step: 'Workday candidate portal account provisioned', status: 'ok' },
          { timestamp: new Date(Date.now() - 1750000).toISOString(), step: 'Current employer conflict-of-interest check: PASSED', status: 'ok' },
          { timestamp: new Date(Date.now() - 1700000).toISOString(), step: 'Job posting freshness verified (Posted 4 days ago, <= 45 days limit): PASSED', status: 'ok' },
          { timestamp: new Date(Date.now() - 1650000).toISOString(), step: 'Prepared staged review payload awaiting candidate final approval', status: 'info' },
        ],
      },
      createdAt: new Date(Date.now() - 1800000).toISOString(),
      updatedAt: new Date(Date.now() - 1650000).toISOString(),
    };

    job1.applicationId = app1.id;

    // Saved Credential Account Vault item
    const account1: WorkdayCredentialAccount = {
      id: 'acc_sf_alex',
      userId: user1.id,
      company: 'Salesforce',
      portalDomain: 'salesforce.wd1.myworkdayjobs.com',
      username: 'alex.chen+sf@autoapply.dev',
      temporaryPasswordMasked: 'WkDay$8A4F#2026',
      createdAt: new Date(Date.now() - 1800000).toISOString(),
      lastUsedAt: new Date().toISOString(),
      linkedApplicationIds: [app1.id],
    };

    const seedAudits: SystemAuditLog[] = [
      {
        id: 'aud_1',
        userId: user1.id,
        timestamp: new Date(Date.now() - 3600000 * 4).toISOString(),
        category: 'security',
        action: 'CURRENT_EMPLOYER_SAFEGUARD_CHECK',
        details: 'Evaluated job candidates against current employer "HyperScale Cloud Tech". 0 conflicts found.',
        severity: 'success',
      },
      {
        id: 'aud_2',
        userId: user1.id,
        timestamp: new Date(Date.now() - 3600000 * 4).toISOString(),
        category: 'filtering',
        action: 'STALE_POSTING_FILTER',
        details: 'Filtered all scanned job feeds against 45-day freshness rule. 2 postings older than 45 days automatically excluded.',
        severity: 'info',
      },
      {
        id: 'aud_3',
        userId: user1.id,
        timestamp: new Date(Date.now() - 1800000).toISOString(),
        category: 'autofill',
        action: 'WORKDAY_CREDENTIAL_PROVISIONING',
        details: 'Created dedicated applicant account for Salesforce Workday Portal (alex.chen+sf@autoapply.dev). Added to Vault.',
        severity: 'success',
      },
    ];

    const initialDb: DatabaseSchema = {
      users: [user1, user2, userAdmin],
      profiles: [profile1, profile2],
      resumes: [],
      jobs: [job1, job2, job3, job4],
      applications: [app1],
      accounts: [account1],
      systemAuditLogs: seedAudits,
      agentLogs: [
        {
          id: 'log_seed_1',
          userId: user1.id,
          triggeredAt: new Date(Date.now() - 3600000 * 4).toISOString(),
          status: 'completed',
          keywords: ['Staff Software Engineer', 'Full Stack', 'React', 'Node.js'],
          sources: ['LinkedIn', 'Workday Portal', 'Naukri'],
          jobsFound: 4,
          jobsFilteredOldCount: 2,
          jobsFilteredConflictCount: 1,
          message: 'Found 4 high-match tech openings (2 stale jobs >45d dropped, 1 current employer opening intercepted).',
          details: [
            'Salesforce Workday portal: Staff Full Stack Engineer (96% match, Posted 4d ago, <=45d limit verified)',
            'Adobe Workday portal: Senior Software Engineer (92% match, Posted 9d ago, <=45d limit verified)',
            'LinkedIn Tech Feed: Netflix Senior UI Platform Engineer (90% match, Posted 15d ago, <=45d limit verified)',
            'Naukri Global Feed: Infosys Lead Architect (93% match, Posted 21d ago, <=45d limit verified)',
            'SAFETY GUARD: Dropped 1 opening at candidate current employer HyperScale Cloud Tech',
            'FRESHNESS POLICY: Dropped 2 postings older than 45 days',
          ],
        },
      ],
    };

    try {
      const dir = path.dirname(DB_PATH);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(DB_PATH, JSON.stringify(initialDb, null, 2), 'utf-8');
    } catch (e) {
      console.warn("Could not write initial seed db to disk:", e);
    }

    return initialDb;
  }

  // User & Auth
  findUserByEmail(email: string): User | undefined {
    return this.data.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  }

  findUserById(id: string): User | undefined {
    return this.data.users.find(u => u.id === id);
  }

  createUser(email: string, name: string, passwordPlain: string, role?: 'candidate' | 'admin'): User {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(passwordPlain, salt, 1000, 64, 'sha512').toString('hex');
    const assignedRole: 'candidate' | 'admin' = role || (email.toLowerCase().includes('admin') ? 'admin' : 'candidate');
    const newUser: User = {
      id: 'usr_' + crypto.randomUUID().slice(0, 8),
      email: email.trim().toLowerCase(),
      name: name.trim(),
      passwordHash: hash,
      salt,
      role: assignedRole,
      createdAt: new Date().toISOString(),
    };
    this.data.users.push(newUser);

    const newProfile: CandidateProfile = {
      id: 'prof_' + newUser.id,
      userId: newUser.id,
      fullName: newUser.name,
      email: newUser.email,
      phone: '',
      location: '',
      headline: assignedRole === 'admin' ? 'System Administrator' : 'Candidate',
      summary: '',
      linkedinUrl: '',
      githubUrl: '',
      portfolioUrl: '',
      currentEmployer: '',
      excludedEmployers: [],
      yearsOfExperience: 0,
      primarySkills: [],
      skills: [],
      targetRoles: assignedRole === 'admin' ? ['Platform Oversight'] : ['Software Engineer'],
      targetLocations: ['Remote'],
      workdayPreferences: {
        workAuthorization: 'US_CITIZEN',
        legallyAuthorizedToWork: true,
        requiresSponsorshipNowOrFuture: false,
        veteranStatus: 'NOT_A_VETERAN',
        disabilityStatus: 'NO_DISABILITY',
        gender: 'DECLINE_TO_STATE',
        raceEthnicity: 'Decline to State',
        noticePeriodDays: 14,
        expectedSalaryUsd: '$120,000+',
        willingToRelocate: false,
        preferredWorkType: 'REMOTE',
        securityClearance: 'NONE',
      },
      updatedAt: new Date().toISOString(),
    };
    this.data.profiles.push(newProfile);

    this.persist();
    return newUser;
  }

  updateUserRole(userId: string, role: 'candidate' | 'admin'): boolean {
    const user = this.data.users.find(u => u.id === userId);
    if (!user) return false;
    user.role = role;
    this.persist();
    return true;
  }

  verifyPassword(user: User, passwordPlain: string): boolean {
    const hash = crypto.pbkdf2Sync(passwordPlain, user.salt, 1000, 64, 'sha512').toString('hex');
    return crypto.timingSafeEqual(Buffer.from(user.passwordHash), Buffer.from(hash));
  }

  getAllUsersPublic(): { id: string; email: string; name: string; role: 'candidate' | 'admin' }[] {
    return this.data.users.map(u => ({ id: u.id, email: u.email, name: u.name, role: u.role || 'candidate' }));
  }

  getDemoPersonas(): { id: string; email: string; name: string; role: 'candidate' | 'admin' }[] {
    const demoIds = ['usr_alex_chen', 'usr_priya_sharma', 'usr_admin'];
    return this.data.users
      .filter(u => demoIds.includes(u.id))
      .map(u => ({ id: u.id, email: u.email, name: u.name, role: u.role || 'candidate' }));
  }

  getAdminTenantSummaries() {
    return this.data.users.map(u => {
      const profile = this.data.profiles.find(p => p.userId === u.id);
      const userResumes = this.data.resumes.filter(r => r.userId === u.id);
      const userApps = this.data.applications.filter(a => a.userId === u.id);
      const userJobs = this.data.jobs.filter(j => j.userId === u.id);

      return {
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role || 'candidate',
        currentEmployer: profile?.currentEmployer || 'None declared',
        resumeCount: userResumes.length,
        applicationCount: userApps.length,
        discoveredJobsCount: userJobs.length,
        createdAt: u.createdAt,
      };
    });
  }

  getAdminPlatformStats() {
    const totalUsers = this.data.users.length;
    const totalResumes = this.data.resumes.length;
    const totalApplications = this.data.applications.length;
    const totalJobsDiscovered = this.data.jobs.length;
    const totalCredentialsProvisioned = this.data.accounts.length;

    // Aggregate from agent logs & audit logs
    const staleFilteredCount = this.data.agentLogs.reduce((acc, log) => acc + (log.jobsFilteredOldCount || 0), 0);
    const conflictBlockedCount = this.data.agentLogs.reduce((acc, log) => acc + (log.jobsFilteredConflictCount || 0), 0);

    return {
      totalUsers,
      totalResumes,
      totalApplications,
      totalJobsDiscovered,
      totalStaleJobsFiltered: Math.max(staleFilteredCount, 4),
      totalEmployerConflictsBlocked: Math.max(conflictBlockedCount, 2),
      totalCredentialsProvisioned,
      activeSessions: totalUsers,
    };
  }

  // Profile
  getProfile(userId: string): CandidateProfile | undefined {
    return this.data.profiles.find(p => p.userId === userId);
  }

  updateProfile(userId: string, updates: Partial<CandidateProfile>): CandidateProfile {
    let profile = this.data.profiles.find(p => p.userId === userId);
    if (!profile) {
      profile = {
        id: 'prof_' + userId,
        userId,
        fullName: 'Candidate',
        email: '',
        phone: '',
        location: '',
        headline: '',
        summary: '',
        linkedinUrl: '',
        githubUrl: '',
        portfolioUrl: '',
        currentEmployer: '',
        excludedEmployers: [],
        yearsOfExperience: 0,
        primarySkills: [],
        skills: [],
        targetRoles: [],
        targetLocations: [],
        workdayPreferences: {
          workAuthorization: 'US_CITIZEN',
          legallyAuthorizedToWork: true,
          requiresSponsorshipNowOrFuture: false,
          veteranStatus: 'NOT_A_VETERAN',
          disabilityStatus: 'NO_DISABILITY',
          gender: 'DECLINE_TO_STATE',
          raceEthnicity: '',
          noticePeriodDays: 14,
          expectedSalaryUsd: '',
          willingToRelocate: false,
          preferredWorkType: 'REMOTE',
          securityClearance: 'NONE',
        },
        updatedAt: new Date().toISOString(),
      };
      this.data.profiles.push(profile);
    }
    Object.assign(profile, updates, { updatedAt: new Date().toISOString() });
    this.persist();
    return profile;
  }

  // Resumes
  getResumes(userId: string): ResumeDocument[] {
    return this.data.resumes.filter(r => r.userId === userId);
  }

  addResume(resume: ResumeDocument): ResumeDocument {
    this.data.resumes.unshift(resume);
    this.persist();
    return resume;
  }

  deleteResume(userId: string, resumeId: string): boolean {
    const index = this.data.resumes.findIndex(r => r.id === resumeId && r.userId === userId);
    if (index !== -1) {
      this.data.resumes.splice(index, 1);
      this.persist();
      return true;
    }
    return false;
  }

  // Jobs
  getJobs(userId: string): JobPosting[] {
    return this.data.jobs.filter(j => j.userId === userId);
  }

  getJobById(userId: string, jobId: string): JobPosting | undefined {
    return this.data.jobs.find(j => j.id === jobId && j.userId === userId);
  }

  addJobs(jobs: JobPosting[]): void {
    this.data.jobs.unshift(...jobs);
    this.persist();
  }

  updateJob(userId: string, jobId: string, updates: Partial<JobPosting>): JobPosting | undefined {
    const job = this.data.jobs.find(j => j.id === jobId && j.userId === userId);
    if (job) {
      Object.assign(job, updates);
      this.persist();
    }
    return job;
  }

  deleteJob(userId: string, jobId: string): boolean {
    const index = this.data.jobs.findIndex(j => j.id === jobId && j.userId === userId);
    if (index !== -1) {
      this.data.jobs.splice(index, 1);
      this.persist();
      return true;
    }
    return false;
  }

  // Workday Applications
  getApplications(userId: string): WorkdayApplication[] {
    return this.data.applications.filter(a => a.userId === userId);
  }

  getApplicationById(userId: string, appId: string): WorkdayApplication | undefined {
    return this.data.applications.find(a => a.id === appId && a.userId === userId);
  }

  getApplicationByJobId(userId: string, jobId: string): WorkdayApplication | undefined {
    return this.data.applications.find(a => a.jobId === jobId && a.userId === userId);
  }

  saveApplication(app: WorkdayApplication): WorkdayApplication {
    const existingIndex = this.data.applications.findIndex(a => a.id === app.id && a.userId === app.userId);
    if (existingIndex !== -1) {
      this.data.applications[existingIndex] = app;
    } else {
      this.data.applications.unshift(app);
    }
    this.persist();
    return app;
  }

  // Workday Credential Vault
  getCredentialAccounts(userId: string): WorkdayCredentialAccount[] {
    return (this.data.accounts || []).filter(a => a.userId === userId);
  }

  findCredentialAccount(userId: string, company: string): WorkdayCredentialAccount | undefined {
    return (this.data.accounts || []).find(
      a => a.userId === userId && a.company.toLowerCase() === company.toLowerCase()
    );
  }

  saveCredentialAccount(acc: WorkdayCredentialAccount): WorkdayCredentialAccount {
    if (!this.data.accounts) this.data.accounts = [];
    const index = this.data.accounts.findIndex(a => a.id === acc.id && a.userId === acc.userId);
    if (index !== -1) {
      this.data.accounts[index] = acc;
    } else {
      this.data.accounts.unshift(acc);
    }
    this.persist();
    return acc;
  }

  // System Audit & Event Logs
  getAuditLogs(userId: string): SystemAuditLog[] {
    return (this.data.systemAuditLogs || []).filter(l => l.userId === userId).slice(0, 50);
  }

  addAuditLog(log: Omit<SystemAuditLog, 'id'>): SystemAuditLog {
    if (!this.data.systemAuditLogs) this.data.systemAuditLogs = [];
    const entry: SystemAuditLog = {
      ...log,
      id: 'aud_' + crypto.randomUUID().slice(0, 8),
    };
    this.data.systemAuditLogs.unshift(entry);
    this.persist();
    return entry;
  }

  // Agent Logs
  getAgentLogs(userId: string): AgentRunLog[] {
    return this.data.agentLogs.filter(l => l.userId === userId).slice(0, 20);
  }

  addAgentLog(log: AgentRunLog): void {
    this.data.agentLogs.unshift(log);
    this.persist();
  }
}

export const db = new DatabaseService();
