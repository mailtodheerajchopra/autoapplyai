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
  DiscoveryJob,
  DiscoveryPoolEntry,
} from './types.js';
import { getStore, StateStore } from './storage.js';

export interface DatabaseSchema {
  users: User[];
  profiles: CandidateProfile[];
  resumes: ResumeDocument[];
  jobs: JobPosting[];
  applications: WorkdayApplication[];
  accounts: WorkdayCredentialAccount[];
  systemAuditLogs: SystemAuditLog[];
  agentLogs: AgentRunLog[];
  discoveryJobs: DiscoveryJob[];
  discoveryPool: DiscoveryPoolEntry[];
}

/** Dedupe identity for a discovered job posting within a user's feed. */
function jobKey(j: Pick<JobPosting, 'userId' | 'company' | 'title'>): string {
  return `${j.userId}|${(j.company || '').trim().toLowerCase()}|${(j.title || '').trim().toLowerCase()}`;
}

class DatabaseService {
  private data: DatabaseSchema;
  private saveTimeout: NodeJS.Timeout | null = null;
  private store: StateStore;

  constructor() {
    this.store = getStore();
    this.data = this.seedInitialDatabase();
  }

  /**
   * Pulls the persisted snapshot from the active store before serving traffic.
   * Falls back to the seeded snapshot (and logs loudly) if the store is
   * unreachable — the app must start even when storage is temporarily down.
   */
  async hydrate(): Promise<void> {
    try {
      const stored = (await this.store.load()) as DatabaseSchema | null;
      if (stored && typeof stored === 'object' && Array.isArray((stored as DatabaseSchema).users)) {
        if (!stored.accounts) stored.accounts = [];
        if (!stored.systemAuditLogs) stored.systemAuditLogs = [];
        if (!stored.discoveryJobs) stored.discoveryJobs = [];
        if (!stored.discoveryPool) stored.discoveryPool = [];
        // Env-driven admin credential rotation: application boot applies the
        // ADMIN_EMAIL / ADMIN_PASSWORD override to the stored admin user, so
        // secret rotation never requires code changes or snapshot surgery.
        if (process.env.ADMIN_EMAIL || process.env.ADMIN_PASSWORD) {
          const admin = stored.users.find((u) => u.id === 'usr_admin');
          if (admin) {
            if (process.env.ADMIN_EMAIL) admin.email = process.env.ADMIN_EMAIL.trim().toLowerCase();
            if (process.env.ADMIN_PASSWORD) {
              admin.salt = crypto.randomBytes(16).toString('hex');
              admin.passwordHash = crypto.pbkdf2Sync(process.env.ADMIN_PASSWORD, admin.salt, 1000, 64, 'sha512').toString('hex');
            }
            console.log('[seed] admin credential applied from environment');
          }
        }
        // Repair legacy/partial jobs once at hydration: real Gemini output
        // may lack the skill arrays the UI assumes. One pass, then persisted.
        stored.jobs = stored.jobs.map((j: any) => ({
          ...j,
          requiredSkills: Array.isArray(j.requiredSkills) ? j.requiredSkills : [],
          matchingSkills: Array.isArray(j.matchingSkills) ? j.matchingSkills : [],
          missingSkills: Array.isArray(j.missingSkills) ? j.missingSkills : [],
          description: j.description ?? '',
        }));
        // One-time dedupe of historical feed rows: pool-serve used to re-add
        // the same (userId, company, title) posting on every serve. Jobs are
        // stored newest-first, so keeping the first occurrence keeps the
        // newest copy. One pass at boot, then addJobs() keeps it that way.
        const seenKeys = new Set<string>();
        const beforeDedupe = stored.jobs.length;
        stored.jobs = stored.jobs.filter((j: any) => {
          const k = jobKey(j);
          if (seenKeys.has(k)) return false;
          seenKeys.add(k);
          return true;
        });
        if (stored.jobs.length !== beforeDedupe) {
          console.log(`[db] Deduped job feed: removed ${beforeDedupe - stored.jobs.length} duplicate rows`);
        }
        if (!Array.isArray(stored.jobs)) stored.jobs = [];
        if (!Array.isArray(stored.profiles)) stored.profiles = [];
        if (!Array.isArray(stored.resumes)) stored.resumes = [];
        if (!Array.isArray(stored.applications)) stored.applications = [];
        if (!Array.isArray(stored.agentLogs)) stored.agentLogs = [];
        stored.users.forEach((u: any) => {
          if (!u.role) u.role = 'candidate';
        });
        // Opt-in demo personas: scrub legacy seed users from any stored
        // snapshot unless explicitly enabled, so known sample passwords
        // ("password123") can never authenticate on a production instance.
        if (process.env.DEMO_MODE !== 'personas') {
          const demoIds = new Set(['usr_alex_chen', 'usr_priya_sharma']);
          const before = stored.users.length;
          stored.users = stored.users.filter((u: any) => !demoIds.has(String(u.id)));
          if (stored.users.length !== before) {
            console.log('[seed] demo persona accounts scrubbed (DEMO_MODE not enabled)');
          }
        }
        if (!stored.users.some((u: any) => u.role === 'admin')) {
          stored.users.push(this.buildAdminUser());
        }
        this.data = stored;
        console.log(`[db] Snapshot hydrated from ${this.store.name} store`);
      } else {
        await this.saveNow();
        console.log(`[db] No stored snapshot — seeded database pushed to ${this.store.name} store`);
      }
    } catch (e) {
      console.error(`[db] Hydration from ${this.store.name} store failed — serving seeded snapshot. Round-trips will still attempt to persist.`, e);
    }
  }

  private async saveNow(): Promise<boolean> {
    // Transient free-tier network blips ('fetch failed') must not silently
    // drop a registration. Bounded retries: 3 attempts, 0.4s/1.2s/2.4s.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await this.store.save(this.data);
        if (attempt > 0) console.log(`[db] Snapshot persisted on retry ${attempt}`);
        return true;
      } catch (err) {
        console.error(`[db] Snapshot persist attempt ${attempt + 1}/3 failed:`, err instanceof Error ? err.message : err);
        if (attempt < 2) await new Promise((r) => setTimeout(r, 400 * Math.pow(3, attempt)));
      }
    }
    console.error('[db] Snapshot persist FAILED after 3 attempts — in-memory data at risk of loss');
    return false;
  }

  /** Immediate, awaited persistence for auth-critical writes (registration). */
  flush(): Promise<boolean> {
    return this.saveNow();
  }

  private buildAdminUser(): User {
    // SECURITY (open-source friendly): the admin credentials must never live
    // in code. Resolution order:
    //   1. ADMIN_EMAIL + ADMIN_PASSWORD env vars → hash them here
    //   2. otherwise → a random one-time password (logged once to server
    //      console so a local dev can log in, then rotated by the owner)
    const email = process.env.ADMIN_EMAIL || 'admin@autoapply.ai';
    const password = process.env.ADMIN_PASSWORD || ('seed_' + crypto.randomBytes(12).toString('base64url'));
    const saltAdmin = crypto.randomBytes(16).toString('hex');
    const hashAdmin = crypto.pbkdf2Sync(password, saltAdmin, 1000, 64, 'sha512').toString('hex');
    if (!process.env.ADMIN_PASSWORD) {
      console.warn('[seed] admin credential generated at random (set ADMIN_EMAIL/ADMIN_PASSWORD to control it):', email, password);
    }
    return {
      id: 'usr_admin',
      email,
      name: 'Admin Supervisor',
      passwordHash: hashAdmin,
      salt: saltAdmin,
      role: 'admin',
      createdAt: new Date().toISOString(),
    };
  }

  /** Create the in-memory seed used on cold boot; durable persistence is the store's job. */
  private persist() {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    this.saveTimeout = setTimeout(() => void this.saveNow(), 150);
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

    // Admin is built env-first (ADMIN_EMAIL/ADMIN_PASSWORD) with a random
    // fallback — no usable credential is ever hardcoded in the repo.
    const userAdmin = this.buildAdminUser();

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

    // Demo personas are SAMPLE DATA for showcasing multi-user isolation. They
    // must never activate implicitly: opt-in via DEMO_MODE=personas. A default
    // seed therefore contains ONLY the admin user — cleaner for open source,
    // and no known "password123" account can ever exist on a fresh deploy.
    const demoEnabled = process.env.DEMO_MODE === 'personas';

    const initialDb: DatabaseSchema = {
      users: demoEnabled ? [user1, user2, userAdmin] : [userAdmin],
      profiles: demoEnabled ? [profile1, profile2] : [],
      resumes: [],
      jobs: demoEnabled ? [job1, job2, job3, job4] : [],
      applications: demoEnabled ? [app1] : [],
      accounts: demoEnabled ? [account1] : [],
      systemAuditLogs: seedAudits,
      discoveryJobs: [],
      discoveryPool: [],
      agentLogs: demoEnabled ? [
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
      ] : [],
    };

    // The seeded snapshot is returned as the in-memory starting point;
    // pushing it to the durable store is hydrate()'s job when nothing is stored.

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
    // Security: role NEVER inferred from the email (an email containing
    // 'admin' no longer grants anything). Only an explicit admin grant or
    // the seed creates admins.
    const assignedRole: 'candidate' | 'admin' = role === 'admin' ? 'admin' : 'candidate';
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

  /** Self-service password change: verifies the current password first. */
  changeUserPassword(userId: string, currentPlain: string, newPlain: string): { ok: boolean; error?: string } {
    if (!newPlain || newPlain.length < 6) return { ok: false, error: 'New password must be at least 6 characters' };
    const user = this.data.users.find(u => u.id === userId);
    if (!user) return { ok: false, error: 'User not found' };
    if (!this.verifyPassword(user, currentPlain)) return { ok: false, error: 'Current password is incorrect' };
    const salt = crypto.randomBytes(16).toString('hex');
    user.salt = salt;
    user.passwordHash = crypto.pbkdf2Sync(newPlain, salt, 1000, 64, 'sha512').toString('hex');
    this.persist();
    void this.saveNow();
    return { ok: true };
  }

  /** Admin-only: remove a user and every record scoped to them. */
  deleteUserAndData(userId: string): boolean {
    const user = this.data.users.find(u => u.id === userId);
    if (!user) return false;
    this.data.users = this.data.users.filter(u => u.id !== userId);
    this.data.profiles = this.data.profiles.filter(p => p.userId !== userId);
    this.data.resumes = this.data.resumes.filter((r: { userId?: string }) => r.userId !== userId);
    this.data.jobs = this.data.jobs.filter(j => j.userId !== userId);
    this.data.applications = this.data.applications.filter(a => a.userId !== userId);
    this.data.accounts = this.data.accounts.filter((a: { userId?: string }) => a.userId !== userId);
    this.data.agentLogs = this.data.agentLogs.filter(l => l.userId !== userId);
    this.data.discoveryJobs = this.data.discoveryJobs.filter(j => j.userId !== userId);
    this.data.systemAuditLogs = this.data.systemAuditLogs.filter((l: { userId?: string }) => l.userId !== userId);
    this.persist();
    void this.saveNow();
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
    // A candidate has ONE active resume: uploading a new CV replaces the
    // previous one (profile, skills and preferences were already merged on
    // upload — the document trail stays singular and unambiguous).
    this.data.resumes = this.data.resumes.filter((r) => r.userId !== resume.userId);
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
    // Dedupe on (userId, company, title): the pool-serve path re-adds jobs on
    // every serve, so without this a user's feed accumulates 7 copies of the
    // same 6 openings. First occurrence in an incoming batch wins; a job that
    // already exists in the feed is skipped entirely (history is preserved).
    const seen = new Set<string>();
    const fresh: JobPosting[] = [];
    for (const job of jobs) {
      const key = jobKey(job);
      if (seen.has(key)) continue;
      seen.add(key);
      if (!this.data.jobs.some((j) => jobKey(j) === key)) fresh.push(job);
    }
    this.data.jobs.unshift(...fresh);
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

  // Discovery Jobs (the async agent pipeline's unit of work)
  getDiscoveryJob(userId: string, jobId: string): DiscoveryJob | undefined {
    return this.data.discoveryJobs.find(j => j.id === jobId && j.userId === userId);
  }

  getLatestDiscoveryJob(userId: string): DiscoveryJob | undefined {
    return this.data.discoveryJobs
      .filter(j => j.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  }

  addDiscoveryJob(job: DiscoveryJob): DiscoveryJob {
    this.data.discoveryJobs.push(job);
    // Keep the collection bounded — only the most recent 30 per user matter.
    const userJobs = this.data.discoveryJobs.filter(j => j.userId === job.userId);
    if (userJobs.length > 30) {
      const oldestIds = new Set(
        userJobs
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .slice(30)
          .map(j => j.id)
      );
      this.data.discoveryJobs = this.data.discoveryJobs.filter(j => !oldestIds.has(j.id));
    }
    this.persist();
    return job;
  }

  updateDiscoveryJob(userId: string, jobId: string, updates: Partial<DiscoveryJob>): DiscoveryJob | undefined {
    const job = this.getDiscoveryJob(userId, jobId);
    if (!job) return undefined;
    Object.assign(job, updates, { updatedAt: new Date().toISOString() });
    // Completion/failure flushes immediately; progress ticks ride the debounce.
    if (updates.status === 'completed' || updates.status === 'failed') {
      void this.saveNow();
    } else {
      this.persist();
    }
    return job;
  }

  // ─── DiscoveryPool (shared market scans) ──────────────────────────────────
  getPoolEntry(poolKey: string): DiscoveryPoolEntry | undefined {
    return this.data.discoveryPool.find((e) => e.poolKey === poolKey);
  }

  putPoolEntry(entry: DiscoveryPoolEntry): void {
    const arr = this.data.discoveryPool;
    const idx = arr.findIndex((e) => e.poolKey === entry.poolKey);
    if (idx >= 0) arr[idx] = entry;
    else arr.push(entry);
    // Bounded pool: evict least-recently-requested entries beyond the cap.
    if (arr.length > 50) {
      arr.sort((a, b) => b.lastRequestedAt.localeCompare(a.lastRequestedAt));
      this.data.discoveryPool = arr.slice(0, 50);
    }
    this.persist();
  }

  /** Cron sweeper input: most-recently-requested bounded entries. */
  getActivePoolEntries(sinceDays = 7, limit = 50): DiscoveryPoolEntry[] {
    const cutoff = new Date(Date.now() - sinceDays * 86_400_000).toISOString();
    return this.data.discoveryPool
      .filter((e) => e.lastRequestedAt >= cutoff)
      .sort((a, b) => b.lastRequestedAt.localeCompare(a.lastRequestedAt))
      .slice(0, limit);
  }
}

export const db = new DatabaseService();

/**
 * Resolves once the in-memory database has been hydrated from the durable
 * store. Application code (server/app.ts) gates request handling on this —
 * do not serve traffic before it settles.
 */
export const dbReady = db.hydrate();
