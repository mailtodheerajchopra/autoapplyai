import React, { useState, useEffect, useCallback } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { TopNav } from './components/TopNav';
import { JobDiscoveryView } from './components/JobDiscoveryView';
import { WorkdayHubView } from './components/WorkdayHubView';
import { ApplicationTrackerView } from './components/ApplicationTrackerView';
import { ResumeProfileView } from './components/ResumeProfileView';
import { DocsDeploymentView } from './components/DocsDeploymentView';
import { RelevanceAuditHub } from './components/RelevanceAuditHub';
import { AdminConsoleView } from './components/AdminConsoleView';
import { WorkdayReviewModal } from './components/WorkdayReviewModal';
import { AuthModal } from './components/AuthModal';
import { JobPosting, WorkdayApplication, ResumeDocument, AgentRunLog } from './types';
import { api } from './api';

function MainDashboard() {
  const { user, activePortal, switchUser } = useAuth();
  const [activeTab, setActiveTab] = useState<string>('jobs');
  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [applications, setApplications] = useState<WorkdayApplication[]>([]);
  const [resumes, setResumes] = useState<ResumeDocument[]>([]);
  const [agentLogs, setAgentLogs] = useState<AgentRunLog[]>([]);
  
  const [activeReviewApp, setActiveReviewApp] = useState<WorkdayApplication | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState<boolean>(false);
  const [isLoadingData, setIsLoadingData] = useState<boolean>(false);

  const loadUserData = useCallback(async () => {
    if (!user) return;
    setIsLoadingData(true);
    try {
      const [fetchedJobs, fetchedApps, fetchedResumes, fetchedLogs] = await Promise.all([
        api.getJobs().catch(() => []),
        api.getApplications().catch(() => []),
        api.getResumes().catch(() => []),
        api.getAgentLogs().catch(() => []),
      ]);
      setJobs(fetchedJobs);
      setApplications(fetchedApps);
      setResumes(fetchedResumes);
      setAgentLogs(fetchedLogs);
    } catch (err) {
      console.error("Failed to load user data:", err);
    } finally {
      setIsLoadingData(false);
    }
  }, [user]);

  useEffect(() => {
    loadUserData();
  }, [loadUserData]);

  const handleOpenReview = (app: WorkdayApplication) => {
    setActiveReviewApp(app);
  };

  const handleApplicationUpdated = (updated: WorkdayApplication) => {
    setApplications((prev) =>
      prev.map((a) => (a.id === updated.id ? updated : a))
    );
    setJobs((prev) =>
      prev.map((j) => {
        if (j.id !== updated.jobId) return j;
        const mappedStatus =
          updated.status === 'submitted' || updated.status === 'approved_by_user'
            ? 'submitted'
            : updated.status === 'pending_review'
            ? 'pending_review'
            : 'autofilled';
        return {
          ...j,
          status: mappedStatus,
          applicationId: updated.id,
        };
      })
    );
  };

  const pendingReviewsCount = applications.filter((a) => a.status === 'pending_review').length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500/20 selection:text-indigo-200">
      {/* Top Bar Navigation (3-Zone Contract) */}
      <TopNav
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenAuth={() => setAuthModalOpen(true)}
        pendingReviewsCount={pendingReviewsCount}
      />

      {/* Main Workspace Viewport */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {isLoadingData && (
          <div className="flex items-center justify-center py-4 text-xs text-indigo-400">
            <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin mr-2" />
            <span>Synchronizing user session...</span>
          </div>
        )}

        {activePortal === 'admin' && user?.role === 'admin' ? (
          <AdminConsoleView onSwitchToTenant={(tenantId) => switchUser(tenantId)} />
        ) : (
          <>
            {activeTab === 'jobs' && (
              <JobDiscoveryView
                jobs={jobs}
                agentLogs={agentLogs}
                onRefreshJobs={loadUserData}
                onOpenReview={handleOpenReview}
                onOpenWorkdayTab={() => setActiveTab('workday')}
              />
            )}

            {activeTab === 'workday' && (
              <WorkdayHubView
                applications={applications}
                onOpenReview={handleOpenReview}
                onNavigateToJobs={() => setActiveTab('jobs')}
              />
            )}

            {activeTab === 'tracker' && (
              <ApplicationTrackerView
                jobs={jobs}
                applications={applications}
                onRefreshJobs={loadUserData}
                onOpenReview={handleOpenReview}
              />
            )}

            {activeTab === 'profile' && (
              <ResumeProfileView
                resumes={resumes}
                onRefreshResumes={loadUserData}
              />
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-900 bg-slate-950/80 py-4 text-xs text-slate-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-200">AutoApply AI</span>
            <span>·</span>
            <span>Autonomous Job Search & Workday Review-to-Submit Platform</span>
          </div>
          <div className="flex items-center gap-4 text-slate-300">
            <button onClick={() => setActiveTab('docs')} className="hover:text-slate-100 transition-colors">
              Free Hosting Guide (Vercel & Render)
            </button>
            <span>·</span>
            <span>Zero-Cost Serverless Ready</span>
          </div>
        </div>
      </footer>

      {/* Workday Review & Final Submit Modal */}
      {activeReviewApp && (
        <WorkdayReviewModal
          application={activeReviewApp}
          onClose={() => setActiveReviewApp(null)}
          onApplicationUpdated={handleApplicationUpdated}
        />
      )}

      {/* Auth Modal */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
      />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainDashboard />
    </AuthProvider>
  );
}
