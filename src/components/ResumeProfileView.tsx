import React, { useState } from 'react';
import { CandidateProfile, ResumeDocument } from '../types';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import {
  Upload,
  FileText,
  Sparkles,
  Save,
  CheckCircle2,
  Trash2,
  Plus,
  Briefcase,
  GraduationCap,
  Shield,
  HelpCircle,
  AlertTriangle,
  MapPin,
} from 'lucide-react';

interface ResumeProfileViewProps {
  resumes: ResumeDocument[];
  onRefreshResumes: () => Promise<void>;
}

export const ResumeProfileView: React.FC<ResumeProfileViewProps> = ({
  resumes,
  onRefreshResumes,
}) => {
  const { profile, refreshProfile } = useAuth();
  const [isParsing, setIsParsing] = useState<boolean>(false);
  const [parsingStage, setParsingStage] = useState<string>('');
  const [parseProgress, setParseProgress] = useState<number>(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);

  // Form state
  const [formData, setFormData] = useState<CandidateProfile | null>(profile);
  const [newSkillInput, setNewSkillInput] = useState<string>('');

  React.useEffect(() => {
    if (profile) {
      setFormData(profile);
      setLocationDraft(profile.location || '');
    }
  }, [profile]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsParsing(true);
    setUploadError(null);
    setParsingStage('Reading document into memory...');
    setParseProgress(20);

    try {
      const extension = file.name.split('.').pop()?.toLowerCase();
      const fileType = (['pdf', 'docx', 'md', 'txt'].includes(extension || '')
        ? extension
        : 'txt') as 'pdf' | 'docx' | 'md' | 'txt';

      const reader = new FileReader();

      reader.onload = async () => {
        try {
          setParsingStage(`Decoding ${fileType.toUpperCase()} file and extracting text structure...`);
          setParseProgress(45);

          const uploadPromise = (async () => {
            if (fileType === 'pdf' || fileType === 'docx') {
              const base64Data = (reader.result as string).split(',')[1];
              return api.uploadResume({
                fileName: file.name,
                fileType,
                contentBase64: base64Data,
              });
            } else {
              const textContent = reader.result as string;
              return api.uploadResume({
                fileName: file.name,
                fileType,
                rawText: textContent,
              });
            }
          })();

          setParsingStage('AI parsing skills, experience, and employer conflict shield...');
          setParseProgress(70);

          // Client safeguard timeout of 12 seconds
          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Document processing took longer than expected")), 12000)
          );

          await Promise.race([uploadPromise, timeoutPromise]);

          setParsingStage('Synchronizing master candidate profile...');
          setParseProgress(95);

          await onRefreshResumes();
          await refreshProfile();
          setParseProgress(100);
          setParsingStage('Resume parsed successfully!');
          setSaveSuccess(true);
          setTimeout(() => {
            setSaveSuccess(false);
            setParsingStage('');
          }, 3500);
        } catch (uploadErr) {
          console.error("Resume parse error:", uploadErr);
          setUploadError(uploadErr instanceof Error ? uploadErr.message : String(uploadErr));
        } finally {
          setIsParsing(false);
        }
      };

      if (fileType === 'pdf' || fileType === 'docx') {
        reader.readAsDataURL(file);
      } else {
        reader.readAsText(file);
      }
    } catch (err) {
      setUploadError('File read error: ' + (err instanceof Error ? err.message : String(err)));
      setIsParsing(false);
    }
  };

  const handleLoadSampleResume = async (type: 'senior_fullstack' | 'devops_cloud') => {
    setIsParsing(true);
    try {
      let sampleText = '';
      let sampleName = '';

      if (type === 'senior_fullstack') {
        sampleName = 'Alex_Chen_Senior_FullStack_Resume.md';
        sampleText = `# Alex Chen
Email: alex.chen@example.com | Phone: +1 (415) 890-1234 | Location: San Francisco, CA
LinkedIn: linkedin.com/in/alexchen-dev | GitHub: github.com/alexchen

## Professional Summary
Staff Full-Stack Software Engineer with 7+ years of experience designing and scaling fault-tolerant web applications, microservices, and design systems. Proficient in TypeScript, React 19, Node.js, PostgreSQL, Docker, and AWS.

## Technical Skills
- Frontend: React, TypeScript, Next.js, Tailwind CSS, Redux, Zustand, Webpack, Vite
- Backend: Node.js, Express, Go, GraphQL, REST APIs, PostgreSQL, Redis, Kafka
- Cloud & DevOps: AWS (ECS, S3, RDS), Docker, Kubernetes, CI/CD, Terraform
- Architecture: Microservices, Event-Driven Systems, High-Concurrency APIs

## Work Experience
### HyperScale Cloud Tech - Senior Full Stack Engineer (2021 - Present)
- Designed and maintained high-throughput API gateway handling 4.5M daily active users.
- Led the migration of legacy monolith to modern React micro-frontends with 42% faster load times.
- Implemented automated end-to-end testing pipeline improving deploy confidence and reducing rollbacks by 60%.

### OmniVenture Software - Full Stack Developer (2019 - 2021)
- Developed real-time telemetry dashboards using React, Node.js, and Redis streams.
- Optimized database queries and index schemas, decreasing p95 latency from 800ms to 45ms.

## Education
- B.S. in Computer Science, University of California, Berkeley (2018)
`;
      } else {
        sampleName = 'Priya_Sharma_Cloud_DevOps_Resume.md';
        sampleText = `# Priya Sharma
Email: priya.sharma@example.com | Phone: +1 (206) 555-8971 | Location: Seattle, WA
LinkedIn: linkedin.com/in/priyasharma-cloud | GitHub: github.com/priyasharma

## Professional Summary
Principal DevOps & Cloud Infrastructure Engineer with 9+ years experience architecting multi-region Kubernetes clusters, automated zero-downtime CI/CD pipelines, and infrastructure-as-code across AWS and Google Cloud.

## Technical Skills
- Cloud: AWS, Google Cloud Platform, Terraform, CloudFormation
- Orchestration: Kubernetes, Helm, Docker, Istio, Envoy
- CI/CD & Monitoring: ArgoCD, GitHub Actions, Prometheus, Grafana, Datadog
- Languages: Go, Python, Bash, Node.js

## Work Experience
### CloudMatrix Systems - Principal DevOps Engineer (2020 - Present)
- Architected enterprise Kubernetes platform hosting 120+ microservices across 3 cloud regions.
- Cut AWS infrastructure spend by 35% through spot instance orchestration and autoscaling policies.

## Education
- B.Tech in Information Technology, IIT Bombay (2015)
`;
      }

      await api.uploadResume({
        fileName: sampleName,
        fileType: 'md',
        rawText: sampleText,
      });

      await onRefreshResumes();
      await refreshProfile();
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      alert('Sample loading error: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsParsing(false);
    }
  };

  const handleDeleteResume = async (id: string) => {
    try {
      await api.deleteResume(id);
      await onRefreshResumes();
    } catch (err) {
      alert('Failed to delete resume: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleSaveProfile = async (override?: CandidateProfile) => {
    const source = override || formData;
    if (!source) return;
    try {
      const updated = await api.updateProfile(source);
      setFormData(updated);
      await refreshProfile();
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err) {
      alert('Failed to save profile: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  // Inline "set your location" card (top of page): the discovery agent's
  // geographic targeting depends on this field, and it sits deep in the form
  // below — surface a shortcut while it's still empty.
  const [locationDraft, setLocationDraft] = useState<string>(profile?.location || '');
  const handleSaveLocation = async () => {
    if (!formData) return;
    await handleSaveProfile({ ...formData, location: locationDraft.trim() });
  };

  const addSkill = () => {
    if (!newSkillInput.trim() || !formData) return;
    if (!formData.primarySkills.includes(newSkillInput.trim())) {
      setFormData({
        ...formData,
        primarySkills: [...formData.primarySkills, newSkillInput.trim()],
      });
    }
    setNewSkillInput('');
  };

  const removeSkill = (skill: string) => {
    if (!formData) return;
    setFormData({
      ...formData,
      primarySkills: formData.primarySkills.filter((s) => s !== skill),
    });
  };

  if (!formData) {
    return <div className="p-8 text-center text-slate-400">Loading profile...</div>;
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Resume & Master Candidate Profile
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Upload your resume in PDF, DOCX, MD, or TXT format. AI extracts skills, work history, and maps them to standard Workday questionnaires.
          </p>
        </div>

        <button
          onClick={() => handleSaveProfile()}
          className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white flex items-center gap-2 self-start sm:self-auto shadow-md shadow-indigo-950 transition-colors"
        >
          <Save className="w-3.5 h-3.5" />
          <span>Save Master Profile</span>
        </button>
      </div>

      {saveSuccess && (
        <div className="p-3 rounded-xl bg-emerald-950/70 border border-emerald-800 text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>Profile & skills successfully saved to your isolated session.</span>
        </div>
      )}

      {uploadError && (
        <div className="p-3 rounded-xl bg-rose-950/80 border border-rose-800 text-rose-300 text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{uploadError}</span>
          </div>
          <button
            onClick={() => setUploadError(null)}
            className="text-xs text-rose-400 hover:text-rose-200 underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Location-first action card: the discovery agent's geographic
          targeting depends on profile.location, which sits deep in the form
          below — surface it prominently while it's still empty. */}
      {!formData.location && (
        <div className="p-4 rounded-xl bg-amber-950/40 border border-amber-700/60 flex flex-col sm:flex-row sm:items-end gap-3">
          <div className="flex-1 space-y-1">
            <label className="text-xs font-semibold text-amber-200 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-amber-400" />
              Set your location — the agent needs it to target your job market
            </label>
            <input
              type="text"
              value={locationDraft}
              onChange={(e) => setLocationDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSaveLocation(); }}
              placeholder="e.g. Bengaluru, India"
              className="w-full h-10 rounded-lg bg-slate-950 border border-amber-600/60 px-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
            <p className="text-[11px] text-amber-200/70">
              Without it, discovery can&apos;t tell which country&apos;s openings you can actually work — results skew
              randomly. You can change it anytime under &quot;Personal Details&quot; below.
            </p>
          </div>
          <button
            onClick={handleSaveLocation}
            disabled={!locationDraft.trim() || isParsing}
            className="h-10 px-5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-xs font-semibold text-slate-950 flex items-center gap-2 shrink-0 transition-colors"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Save Location</span>
          </button>
        </div>
      )}

      {/* Upload Zone & Quick Sample Loaders */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <Upload className="w-4 h-4 text-indigo-400" />
              Upload Resume (PDF, DOCX, Markdown, Text)
            </h2>
            <span className="text-xs text-slate-400">Multi-format ATS Parser</span>
          </div>

          <label
            className={`border-2 border-dashed border-slate-700 hover:border-indigo-500 rounded-xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-colors bg-slate-950/50 ${
              isParsing ? 'opacity-90 pointer-events-none' : ''
            }`}
          >
            <input
              type="file"
              accept=".pdf,.docx,.md,.txt,text/markdown,text/plain"
              onChange={handleFileUpload}
              className="hidden"
            />
            {isParsing ? (
              <div className="space-y-3 w-full max-w-sm mx-auto">
                <div className="w-8 h-8 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin mx-auto" />
                <div>
                  <p className="text-xs font-semibold text-indigo-300">
                    {parsingStage || 'Parsing Resume...'}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Extracting skills, current employer, and experience
                  </p>
                </div>
                {/* Visual Progress Bar */}
                <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-indigo-500 h-1.5 transition-all duration-300 rounded-full"
                    style={{ width: `${parseProgress}%` }}
                  />
                </div>
                <span className="text-[10px] font-mono text-slate-400">{parseProgress}%</span>
              </div>
            ) : (
              <div className="space-y-2">
                <FileText className="w-8 h-8 text-indigo-400 mx-auto" />
                <p className="text-sm font-semibold text-white">
                  Click to browse or drop resume file here
                </p>
                <p className="text-xs text-slate-400">
                  Supported formats: PDF, DOCX (Word), Markdown (.md), Plain Text (.txt)
                </p>
              </div>
            )}
          </label>

          {/* Quick Pre-load sample buttons */}
          <div className="pt-2 border-t border-slate-800 flex items-center justify-between flex-wrap gap-2 text-xs">
            <span className="text-slate-400">Or test with ready sample resume:</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleLoadSampleResume('senior_fullstack')}
                disabled={isParsing}
                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition-colors"
              >
                Full-Stack Senior Engineer (.md)
              </button>
              <button
                onClick={() => handleLoadSampleResume('devops_cloud')}
                disabled={isParsing}
                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition-colors"
              >
                Cloud & DevOps Architect (.md)
              </button>
            </div>
          </div>
        </div>

        {/* Uploaded Documents List */}
        <div className="lg:col-span-4 p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
          <h2 className="text-sm font-semibold text-white">Parsed Resumes on File</h2>
          {resumes.length === 0 ? (
            <p className="text-xs text-slate-400">
              No resumes uploaded yet. Upload a PDF/DOCX/MD file to auto-populate your skills and experience.
            </p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {resumes.map((res) => (
                <div
                  key={res.id}
                  className="p-3 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between text-xs"
                >
                  <div className="space-y-0.5 max-w-[200px]">
                    <p className="font-medium text-slate-200 truncate">{res.fileName}</p>
                    <p className="text-[10px] text-slate-400 uppercase font-mono">
                      {res.fileType} · {(res.fileSize / 1024).toFixed(1)} KB
                    </p>
                  </div>
                  <button
                    onClick={() => handleDeleteResume(res.id)}
                    className="p-1 rounded text-slate-400 hover:text-rose-400 transition-colors"
                    title="Delete resume"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Extracted Skills & Category Breakdown */}
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-400" />
              Extracted Skill Taxonomy
            </h2>
            <p className="text-xs text-slate-400">
              These skills are matched against incoming job postings on LinkedIn, Naukri, and Workday portals.
            </p>
          </div>
          <span className="text-xs font-mono tabular-nums text-slate-400">
            {formData.primarySkills.length} Primary Skills
          </span>
        </div>

        {/* Skill tags */}
        <div className="flex flex-wrap gap-1.5">
          {formData.primarySkills.map((skill) => (
            <span
              key={skill}
              className="px-2.5 py-1 rounded bg-slate-950 border border-slate-800 text-xs text-slate-200 flex items-center gap-1.5"
            >
              <span>{skill}</span>
              <button
                onClick={() => removeSkill(skill)}
                className="text-slate-400 hover:text-rose-400 text-xs"
              >
                ×
              </button>
            </span>
          ))}
        </div>

        {/* Add custom skill */}
        <div className="flex items-center gap-2 max-w-sm pt-1">
          <input
            type="text"
            value={newSkillInput}
            onChange={(e) => setNewSkillInput(e.target.value)}
            placeholder="Add new skill (e.g. GraphQL, Kubernetes)..."
            className="flex-1 h-8 px-3 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500"
            onKeyDown={(e) => e.key === 'Enter' && addSkill()}
          />
          <button
            onClick={addSkill}
            className="h-8 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add</span>
          </button>
        </div>
      </div>

      {/* Employer Conflict-of-Interest Shield */}
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <Shield className="w-4 h-4 text-rose-400" />
            Current Employer &amp; Conflict-of-Interest Protection
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            AutoApply AI strictly blocks and intercepts any applications to your current employer or any past companies you specify below.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="space-y-1.5">
            <label className="text-slate-300 font-medium">Current / Last Employer (Never Apply To)</label>
            <input
              type="text"
              value={formData.currentEmployer || ''}
              onChange={(e) => setFormData({ ...formData, currentEmployer: e.target.value })}
              placeholder="e.g. HyperScale Cloud Tech"
              className="w-full h-9 rounded-lg bg-slate-950 border border-slate-800 px-3 text-slate-200 focus:outline-none focus:border-rose-400"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-slate-300 font-medium">Excluded Companies List</label>
            <div className="flex flex-wrap gap-1.5 min-h-[36px] p-1.5 rounded-lg bg-slate-950 border border-slate-800">
              {(formData.excludedEmployers || []).map((comp) => (
                <span
                  key={comp}
                  className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-[11px] text-slate-200 flex items-center gap-1"
                >
                  <span>{comp}</span>
                  <button
                    onClick={() =>
                      setFormData({
                        ...formData,
                        excludedEmployers: (formData.excludedEmployers || []).filter((c) => c !== comp),
                      })
                    }
                    className="text-slate-400 hover:text-rose-400"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Workday Candidate Questionnaire Master Settings */}
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-6">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Shield className="w-4 h-4 text-indigo-400" />
            Workday Questionnaire Defaults & Declarations
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            AutoApply AI uses these master answers to automatically resolve standard Workday legal questions, notice periods, and immigration declarations.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          {/* Work Authorization */}
          <div className="space-y-1.5">
            <label className="text-slate-300 font-medium">Work Authorization Status</label>
            <select
              value={formData.workdayPreferences.workAuthorization}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  workdayPreferences: {
                    ...formData.workdayPreferences,
                    workAuthorization: e.target.value as any,
                  },
                })
              }
              className="w-full h-9 rounded-lg bg-slate-950 border border-slate-800 px-3 text-slate-200 focus:outline-none focus:border-indigo-500"
            >
              <option value="US_CITIZEN">US Citizen</option>
              <option value="PERMANENT_RESIDENT">Permanent Resident (Green Card)</option>
              <option value="H1B_VISA">H-1B Visa Holder</option>
              <option value="OPT_CPT">F-1 OPT / CPT</option>
              <option value="REQUIRES_SPONSORSHIP">Requires Visa Sponsorship</option>
              <option value="OTHER">Other Authorization</option>
            </select>
          </div>

          {/* Visa Sponsorship question */}
          <div className="space-y-1.5">
            <label className="text-slate-300 font-medium">Require Employer Visa Sponsorship?</label>
            <select
              value={formData.workdayPreferences.requiresSponsorshipNowOrFuture ? 'yes' : 'no'}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  workdayPreferences: {
                    ...formData.workdayPreferences,
                    requiresSponsorshipNowOrFuture: e.target.value === 'yes',
                  },
                })
              }
              className="w-full h-9 rounded-lg bg-slate-950 border border-slate-800 px-3 text-slate-200 focus:outline-none focus:border-indigo-500"
            >
              <option value="no">No - Will not require sponsorship</option>
              <option value="yes">Yes - Require sponsorship now or future</option>
            </select>
          </div>

          {/* Notice Period */}
          <div className="space-y-1.5">
            <label className="text-slate-300 font-medium">Notice Period (Days)</label>
            <input
              type="number"
              value={formData.workdayPreferences.noticePeriodDays}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  workdayPreferences: {
                    ...formData.workdayPreferences,
                    noticePeriodDays: Number(e.target.value),
                  },
                })
              }
              className="w-full h-9 rounded-lg bg-slate-950 border border-slate-800 px-3 text-slate-200 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Expected Salary */}
          <div className="space-y-1.5">
            <label className="text-slate-300 font-medium">Expected Salary Range (USD)</label>
            <input
              type="text"
              value={formData.workdayPreferences.expectedSalaryUsd}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  workdayPreferences: {
                    ...formData.workdayPreferences,
                    expectedSalaryUsd: e.target.value,
                  },
                })
              }
              placeholder="e.g. $165,000 - $190,000"
              className="w-full h-9 rounded-lg bg-slate-950 border border-slate-800 px-3 text-slate-200 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Preferred Work Type */}
          <div className="space-y-1.5">
            <label className="text-slate-300 font-medium">Work Environment Preference</label>
            <select
              value={formData.workdayPreferences.preferredWorkType}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  workdayPreferences: {
                    ...formData.workdayPreferences,
                    preferredWorkType: e.target.value as any,
                  },
                })
              }
              className="w-full h-9 rounded-lg bg-slate-950 border border-slate-800 px-3 text-slate-200 focus:outline-none focus:border-indigo-500"
            >
              <option value="REMOTE">Strictly Remote</option>
              <option value="HYBRID">Hybrid</option>
              <option value="ONSITE">On-site</option>
              <option value="ANY">Any / Open</option>
            </select>
          </div>

          {/* Willing to Relocate */}
          <div className="space-y-1.5">
            <label className="text-slate-300 font-medium">Willing to Relocate?</label>
            <select
              value={formData.workdayPreferences.willingToRelocate ? 'yes' : 'no'}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  workdayPreferences: {
                    ...formData.workdayPreferences,
                    willingToRelocate: e.target.value === 'yes',
                  },
                })
              }
              className="w-full h-9 rounded-lg bg-slate-950 border border-slate-800 px-3 text-slate-200 focus:outline-none focus:border-indigo-500"
            >
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </div>
        </div>

        {/* Personal Details */}
        <div className="pt-4 border-t border-slate-800 space-y-4">
          <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
            Applicant Contact Information
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="space-y-1">
              <label className="text-slate-400">Full Legal Name</label>
              <input
                type="text"
                value={formData.fullName}
                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                className="w-full h-9 rounded-lg bg-slate-950 border border-slate-800 px-3 text-slate-200 focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-slate-400">Phone</label>
              <input
                type="text"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full h-9 rounded-lg bg-slate-950 border border-slate-800 px-3 text-slate-200 focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-slate-300 font-medium">
                Current Location <span className="text-amber-400">*</span>
              </label>
              <input
                type="text"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                placeholder="e.g. Bengaluru, India"
                className={`w-full h-9 rounded-lg bg-slate-950 border px-3 text-slate-200 focus:outline-none ${!formData.location ? 'border-amber-600/60' : 'border-slate-800'}`}
              />
              <p className="text-[11px] text-slate-500">
                Powers job targeting — the agent finds openings in your market and hides cross-country on-site roles.
              </p>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-slate-400 text-xs">Professional Headline</label>
            <input
              type="text"
              value={formData.headline}
              onChange={(e) => setFormData({ ...formData, headline: e.target.value })}
              className="w-full h-9 rounded-lg bg-slate-950 border border-slate-800 px-3 text-xs text-slate-200 focus:outline-none"
            />
          </div>

          <div className="space-y-1">
            <label className="text-slate-400 text-xs">Executive Summary</label>
            <textarea
              rows={3}
              value={formData.summary}
              onChange={(e) => setFormData({ ...formData, summary: e.target.value })}
              className="w-full rounded-lg bg-slate-950 border border-slate-800 p-3 text-xs text-slate-200 focus:outline-none"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
