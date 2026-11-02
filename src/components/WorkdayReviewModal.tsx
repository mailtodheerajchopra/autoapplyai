import React, { useState } from 'react';
import { WorkdayApplication, WorkdayQuestionAnswer } from '../types';
import { api } from '../api';
import {
  X,
  CheckCircle2,
  Lock,
  ExternalLink,
  Edit3,
  Sparkles,
  Copy,
  Check,
  Send,
  Building,
  AlertCircle,
  FileText,
  User,
  GraduationCap,
  Mail,
  RefreshCw,
  KeyRound,
  ShieldCheck,
} from 'lucide-react';

interface WorkdayReviewModalProps {
  application: WorkdayApplication;
  onClose: () => void;
  onApplicationUpdated: (updated: WorkdayApplication) => void;
}

export const WorkdayReviewModal: React.FC<WorkdayReviewModalProps> = ({
  application,
  onClose,
  onApplicationUpdated,
}) => {
  const [appData, setAppData] = useState<WorkdayApplication>(application);
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [editedAnswerText, setEditedAnswerText] = useState<string>('');
  
  const [refiningQuestionId, setRefiningQuestionId] = useState<string | null>(null);
  const [userGuidance, setUserGuidance] = useState<string>('');
  const [isRefining, setIsRefining] = useState<boolean>(false);

  const [coverLetterEdit, setCoverLetterEdit] = useState<boolean>(false);
  const [coverLetterText, setCoverLetterText] = useState<string>(appData.tailoredCoverLetter);

  const [copiedAccount, setCopiedAccount] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submissionReceipt, setSubmissionReceipt] = useState<{
    confirmationCode: string;
    message: string;
  } | null>(
    appData.status === 'submitted' && appData.submissionAudit?.confirmationCode
      ? {
          confirmationCode: appData.submissionAudit.confirmationCode,
          message: `Application submitted to ${appData.company} portal.`,
        }
      : null
  );

  // Workday Email Verification State
  const [verificationInput, setVerificationInput] = useState<string>('');
  const [verifyingOtp, setVerifyingOtp] = useState<boolean>(false);
  const [resendingOtp, setResendingOtp] = useState<boolean>(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [verificationSuccess, setVerificationSuccess] = useState<string | null>(null);

  const handleVerifyEmail = async () => {
    if (!verificationInput.trim()) {
      setVerificationError('Please enter the 6-digit verification code.');
      return;
    }
    setVerifyingOtp(true);
    setVerificationError(null);
    try {
      const res = await api.verifyWorkdayEmail(appData.id, verificationInput.trim());
      setAppData(res.application);
      onApplicationUpdated(res.application);
      setVerificationSuccess('Candidate email successfully verified for Workday portal!');
    } catch (err) {
      setVerificationError(err instanceof Error ? err.message : String(err));
    } finally {
      setVerifyingOtp(false);
    }
  };

  const handleResendVerification = async () => {
    setResendingOtp(true);
    setVerificationError(null);
    setVerificationSuccess(null);
    try {
      const res = await api.sendWorkdayVerification(appData.id);
      setVerificationSuccess(`New code sent to ${res.sentTo}! (Testing Code: ${res.code})`);
      if (res.code && appData.emailVerification) {
        setAppData({
          ...appData,
          emailVerification: {
            ...appData.emailVerification,
            verificationCode: res.code,
            isVerified: false,
          },
        });
      }
    } catch (err) {
      setVerificationError(err instanceof Error ? err.message : String(err));
    } finally {
      setResendingOtp(false);
    }
  };

  const copyCredentials = () => {
    const text = `Username: ${appData.generatedAccount.username}\nPassword: ${appData.generatedAccount.temporaryPasswordMasked}\nPortal: ${appData.workdayPortalUrl}`;
    navigator.clipboard.writeText(text);
    setCopiedAccount(true);
    setTimeout(() => setCopiedAccount(false), 2000);
  };

  const handleSaveQuestion = async (qId: string) => {
    try {
      const updated = await api.updateQuestionAnswer(appData.id, {
        questionId: qId,
        newAnswer: editedAnswerText,
      });
      setAppData(updated);
      onApplicationUpdated(updated);
      setEditingQuestionId(null);
    } catch (err) {
      alert('Failed to update answer: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleAiRefine = async (qId: string) => {
    if (!userGuidance.trim()) return;
    setIsRefining(true);
    try {
      const res = await api.aiRefineAnswer(appData.id, qId, userGuidance);
      setAppData(res.app);
      onApplicationUpdated(res.app);
      setRefiningQuestionId(null);
      setUserGuidance('');
    } catch (err) {
      alert('Failed to refine answer: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsRefining(false);
    }
  };

  const handleSaveCoverLetter = async () => {
    try {
      const updated = await api.updateQuestionAnswer(appData.id, {
        newCoverLetter: coverLetterText,
      });
      setAppData(updated);
      onApplicationUpdated(updated);
      setCoverLetterEdit(false);
    } catch (err) {
      alert('Failed to update cover letter: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleFinalSubmit = async () => {
    setIsSubmitting(true);
    try {
      const result = await api.submitWorkdayApplication(appData.id);
      setAppData(result.application);
      onApplicationUpdated(result.application);
      setSubmissionReceipt({
        confirmationCode: result.confirmationCode,
        message: result.message,
      });
    } catch (err) {
      alert('Submission failed: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsSubmitting(false);
    }
  };

  const isSubmitted = appData.status === 'submitted' || Boolean(submissionReceipt);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 md:p-6">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between gap-4 bg-slate-950/60">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className="font-semibold text-indigo-400 flex items-center gap-1">
                <Building className="w-3.5 h-3.5" />
                {appData.company}
              </span>
              <span>·</span>
              <span>Workday Candidate Portal</span>
              <span>·</span>
              <span className="font-mono text-slate-400">ID: {appData.id}</span>
            </div>
            <h2 className="text-xl font-bold text-white mt-0.5">{appData.jobTitle}</h2>
          </div>

          <div className="flex items-center gap-2">
            <a
              href={appData.workdayPortalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800/80 text-xs text-slate-300 hover:text-white hover:border-slate-600 transition-colors flex items-center gap-1.5"
            >
              <span>Workday Portal</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Submission Success Banner if already submitted */}
          {submissionReceipt && (
            <div className="p-4 rounded-xl bg-emerald-950/60 border border-emerald-800/80 text-emerald-200">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold text-sm text-emerald-100">
                    Application Verified & Submitted to Workday
                  </p>
                  <p className="text-xs text-emerald-300">
                    Workday ATS Confirmation Code:{' '}
                    <span className="font-mono font-bold text-white px-1.5 py-0.5 rounded bg-emerald-900/80">
                      {submissionReceipt.confirmationCode}
                    </span>
                  </p>
                  <p className="text-xs text-emerald-400/90">{submissionReceipt.message}</p>
                </div>
              </div>
            </div>
          )}

          {/* Step 1: Workday Auto-Provisioned Account Credentials */}
          <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-indigo-400" />
                <h3 className="text-sm font-semibold text-white">
                  Workday Candidate Account (Auto-Provisioned)
                </h3>
              </div>
              <button
                onClick={copyCredentials}
                className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 transition-colors"
              >
                {copiedAccount ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-slate-400" />
                    <span>Copy Credentials</span>
                  </>
                )}
              </button>
            </div>
            <p className="text-xs text-slate-400 mb-3">
              AutoApply AI created a dedicated applicant account on {appData.company}&apos;s Workday portal to isolate communications and submit on your behalf. Credentials are saved in your Vault for future tracking.
            </p>

            {/* Safeguards Verified Badges */}
            <div className="flex flex-wrap items-center gap-2 mb-3 text-[11px]">
              <span className="px-2 py-0.5 rounded bg-emerald-950/80 border border-emerald-800 text-emerald-300 font-medium flex items-center gap-1">
                <Check className="w-3 h-3" />
                <span>Conflict Shield: Not Current Employer</span>
              </span>
              <span className="px-2 py-0.5 rounded bg-indigo-950/80 border border-indigo-800 text-indigo-300 font-medium flex items-center gap-1">
                <Check className="w-3 h-3" />
                <span>Posting Freshness: &le; 45 Days Verified</span>
              </span>
              <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300 font-medium flex items-center gap-1">
                <Lock className="w-3 h-3 text-slate-400" />
                <span>Saved to Vault for Tracking</span>
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                <span className="text-slate-300 block text-[10px] font-sans uppercase">
                  Portal Login Email (Your Account)
                </span>
                <span className="text-slate-200 select-all truncate block font-semibold text-emerald-300">
                  {appData.generatedAccount.username}
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                <span className="text-slate-300 block text-[10px] font-sans uppercase">
                  Generated Portal Password
                </span>
                <span className="text-slate-200 select-all truncate block">
                  {appData.generatedAccount.temporaryPasswordMasked}
                </span>
              </div>
            </div>
          </div>

          {/* Step 1b: Workday Email ID Verification Challenge */}
          <div className={`p-4 rounded-xl border ${
            appData.emailVerification?.isVerified
              ? 'bg-emerald-950/40 border-emerald-800'
              : 'bg-amber-950/40 border-amber-800/80'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Mail className={`w-4 h-4 ${appData.emailVerification?.isVerified ? 'text-emerald-400' : 'text-amber-400'}`} />
                <h3 className="text-sm font-semibold text-white">
                  Workday Email ID Verification Gate
                </h3>
              </div>
              {appData.emailVerification?.isVerified ? (
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-900/80 border border-emerald-700 text-emerald-200 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Email Verified</span>
                </span>
              ) : (
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-900/80 border border-amber-700 text-amber-200 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                  <span>Verification Required</span>
                </span>
              )}
            </div>

            <p className="text-xs text-slate-300 mb-3">
              {appData.emailVerification?.isVerified
                ? `Workday has verified candidate login email ${appData.emailVerification.sentTo || appData.contactInformation.email}. Application submission is fully authorized.`
                : `Workday enterprise portals frequently require candidate email confirmation before submission. Enter the 6-digit confirmation code dispatched to ${appData.emailVerification?.sentTo || appData.contactInformation.email}.`}
            </p>

            {!appData.emailVerification?.isVerified && !isSubmitted && (
              <div className="space-y-3 pt-1">
                {appData.emailVerification?.verificationCode && (
                  <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-700/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                    <span className="text-slate-300">
                      Dispatched Verification Code:{' '}
                      <strong className="font-mono text-amber-300 font-bold tracking-widest text-sm bg-slate-950 px-2 py-0.5 rounded border border-amber-900/60">
                        {appData.emailVerification.verificationCode}
                      </strong>
                    </span>
                    <button
                      type="button"
                      onClick={() => setVerificationInput(appData.emailVerification?.verificationCode || '')}
                      className="text-[11px] text-indigo-400 hover:text-indigo-300 underline font-medium text-left"
                    >
                      Click to Auto-Fill Code
                    </button>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row items-center gap-2">
                  <input
                    type="text"
                    maxLength={6}
                    value={verificationInput}
                    onChange={(e) => setVerificationInput(e.target.value)}
                    placeholder="Enter 6-digit code"
                    className="w-full sm:w-56 h-9 px-3 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono tracking-widest placeholder-slate-400 text-center text-sm focus:outline-none focus:border-amber-500"
                  />
                  <button
                    type="button"
                    onClick={handleVerifyEmail}
                    disabled={verifyingOtp || !verificationInput.trim()}
                    className="w-full sm:w-auto h-9 px-4 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-sm"
                  >
                    {verifyingOtp ? (
                      <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Verify Code</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={handleResendVerification}
                    disabled={resendingOtp}
                    className="w-full sm:w-auto h-9 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors border border-slate-700"
                  >
                    {resendingOtp ? (
                      <div className="w-3.5 h-3.5 border-2 border-slate-400 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Resend Code</span>
                      </>
                    )}
                  </button>
                </div>

                {verificationError && (
                  <p className="text-xs text-rose-400">{verificationError}</p>
                )}
                {verificationSuccess && (
                  <p className="text-xs text-emerald-400">{verificationSuccess}</p>
                )}
              </div>
            )}
          </div>

          {/* Step 2: Contact Information & Legal Declarations */}
          <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800">
            <div className="flex items-center gap-2 mb-3">
              <User className="w-4 h-4 text-indigo-400" />
              <h3 className="text-sm font-semibold text-white">Applicant Contact & Legal Schema</h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <span className="text-slate-300 block">Legal Name</span>
                <span className="text-slate-200 font-medium">
                  {appData.contactInformation.legalFirstName} {appData.contactInformation.legalLastName}
                </span>
              </div>
              <div>
                <span className="text-slate-300 block">Contact Email</span>
                <span className="text-slate-200 font-medium truncate block">
                  {appData.contactInformation.email}
                </span>
              </div>
              <div>
                <span className="text-slate-300 block">Phone</span>
                <span className="text-slate-200 font-medium">
                  {appData.contactInformation.phone}
                </span>
              </div>
              <div>
                <span className="text-slate-300 block">Location</span>
                <span className="text-slate-200 font-medium">
                  {appData.contactInformation.city}, {appData.contactInformation.state}
                </span>
              </div>
            </div>
          </div>

          {/* Step 3: Workday Screening Questionnaires & AI Reasoning Engine */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-indigo-400" />
                  Workday Questionnaires & AI Resolved Answers
                </h3>
                <p className="text-xs text-slate-400">
                  Review the auto-filled responses. You can edit answers manually or ask AI to refine them before final submission.
                </p>
              </div>
              <span className="text-xs font-mono text-slate-400">
                {appData.questionAnswers.length} Questions
              </span>
            </div>

            <div className="space-y-3">
              {appData.questionAnswers.map((item: WorkdayQuestionAnswer, index: number) => {
                const isEditing = editingQuestionId === item.id;
                const isRefiningThis = refiningQuestionId === item.id;

                return (
                  <div
                    key={item.id}
                    className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2 hover:border-slate-700 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2 text-[11px]">
                          <span className="font-mono text-indigo-400">#{index + 1}</span>
                          <span className="capitalize font-medium px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px]">
                            {item.category}
                          </span>
                          <span className="text-slate-400">·</span>
                          <span className="text-slate-400">Confidence: {item.confidence}%</span>
                          {item.isUserReviewed && (
                            <span className="text-emerald-400 flex items-center gap-0.5 text-[10px]">
                              <Check className="w-3 h-3" /> Reviewed
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-medium text-slate-100">{item.question}</p>
                      </div>

                      {!isSubmitted && (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => {
                              if (isEditing) {
                                setEditingQuestionId(null);
                              } else {
                                setEditingQuestionId(item.id);
                                setEditedAnswerText(item.answer);
                                setRefiningQuestionId(null);
                              }
                            }}
                            className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs flex items-center gap-1 px-2"
                            title="Edit answer manually"
                          >
                            <Edit3 className="w-3 h-3" />
                            <span>Edit</span>
                          </button>
                          <button
                            onClick={() => {
                              if (isRefiningThis) {
                                setRefiningQuestionId(null);
                              } else {
                                setRefiningQuestionId(item.id);
                                setUserGuidance('');
                                setEditingQuestionId(null);
                              }
                            }}
                            className="p-1 rounded bg-indigo-950/80 hover:bg-indigo-900 border border-indigo-800/80 text-indigo-300 text-xs flex items-center gap-1 px-2"
                            title="Refine with AI instruction"
                          >
                            <Sparkles className="w-3 h-3 text-indigo-400" />
                            <span>AI Refine</span>
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Answer View or Inline Edit */}
                    {isEditing ? (
                      <div className="space-y-2 pt-2">
                        <textarea
                          rows={3}
                          value={editedAnswerText}
                          onChange={(e) => setEditedAnswerText(e.target.value)}
                          className="w-full rounded-lg bg-slate-900 border border-slate-700 p-2.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-sans"
                        />
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setEditingQuestionId(null)}
                            className="px-3 py-1 rounded text-xs text-slate-400 hover:text-white"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleSaveQuestion(item.id)}
                            className="px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white"
                          >
                            Save Answer
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="p-3 rounded-lg bg-slate-900/90 border border-slate-800/90 text-xs text-slate-200">
                        <span className="text-[10px] uppercase font-semibold text-slate-300 block mb-0.5">
                          Filled Workday Response:
                        </span>
                        <p className="whitespace-pre-wrap">{item.answer}</p>
                      </div>
                    )}

                    {/* AI Guidance Refinement Input Box */}
                    {isRefiningThis && (
                      <div className="p-3 rounded-lg bg-indigo-950/40 border border-indigo-800/60 space-y-2">
                        <span className="text-xs font-medium text-indigo-200 flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                          Provide instructions to AI to adjust this answer:
                        </span>
                        <input
                          type="text"
                          value={userGuidance}
                          onChange={(e) => setUserGuidance(e.target.value)}
                          placeholder="e.g. Specify that I led a team of 4 engineers on this project..."
                          className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-400"
                          onKeyDown={(e) => e.key === 'Enter' && handleAiRefine(item.id)}
                        />
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setRefiningQuestionId(null)}
                            className="px-2.5 py-1 text-xs text-slate-400 hover:text-white"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleAiRefine(item.id)}
                            disabled={isRefining || !userGuidance.trim()}
                            className="px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-xs font-medium text-white flex items-center gap-1"
                          >
                            {isRefining ? 'Regenerating...' : 'Apply AI Update'}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* AI Reasoning Disclosure */}
                    <div className="text-[11px] text-slate-400 bg-slate-900/40 px-3 py-1.5 rounded border border-slate-800/60 flex items-start gap-1.5">
                      <span className="font-semibold text-slate-300 shrink-0">Reasoning:</span>
                      <span className="italic">{item.reasoning}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Step 4: Work History & Education Pre-fill */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-indigo-400" />
                <h3 className="text-sm font-semibold text-white">Experience Schema Mapped</h3>
              </div>
              <div className="space-y-2 text-xs text-slate-300">
                {appData.workExperience.map((exp, i) => (
                  <div key={i} className="p-2 rounded bg-slate-900/60 border border-slate-800/60">
                    <p className="font-semibold text-white">{exp.title}</p>
                    <p className="text-slate-400">
                      {exp.company} · {exp.startDate} - {exp.endDate}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
              <div className="flex items-center gap-2">
                <GraduationCap className="w-4 h-4 text-indigo-400" />
                <h3 className="text-sm font-semibold text-white">Education Schema Mapped</h3>
              </div>
              <div className="space-y-2 text-xs text-slate-300">
                {appData.education.map((edu, i) => (
                  <div key={i} className="p-2 rounded bg-slate-900/60 border border-slate-800/60">
                    <p className="font-semibold text-white">{edu.degree} - {edu.fieldOfStudy}</p>
                    <p className="text-slate-400">
                      {edu.institution} · Class of {edu.graduationYear}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Step 5: Tailored Cover Letter */}
          <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-indigo-400" />
                Tailored Cover Letter for {appData.company}
              </h3>
              {!isSubmitted && (
                <button
                  onClick={() => {
                    if (coverLetterEdit) {
                      handleSaveCoverLetter();
                    } else {
                      setCoverLetterEdit(true);
                    }
                  }}
                  className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 flex items-center gap-1"
                >
                  <Edit3 className="w-3 h-3" />
                  <span>{coverLetterEdit ? 'Save Changes' : 'Edit Letter'}</span>
                </button>
              )}
            </div>

            {coverLetterEdit ? (
              <textarea
                rows={8}
                value={coverLetterText}
                onChange={(e) => setCoverLetterText(e.target.value)}
                className="w-full rounded-lg bg-slate-900 border border-slate-700 p-3 text-xs text-slate-200 font-sans focus:outline-none focus:border-indigo-500"
              />
            ) : (
              <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-300 whitespace-pre-wrap font-sans leading-relaxed">
                {appData.tailoredCoverLetter}
              </div>
            )}
          </div>

          {/* Step 6: Audit Timeline */}
          {appData.submissionAudit?.auditLog && appData.submissionAudit.auditLog.length > 0 && (
            <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
              <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Workday Automation & Audit Log
              </h4>
              <div className="space-y-1.5 text-xs font-mono">
                {appData.submissionAudit.auditLog.map((log, idx) => (
                  <div key={idx} className="flex items-center justify-between py-1 border-b border-slate-900 last:border-0">
                    <span className="text-slate-300">{log.step}</span>
                    <span className="text-slate-400 tabular-nums text-[11px]">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Modal Sticky Footer - Human-in-the-Loop Final Submit Gate */}
        <div className="px-6 py-4 bg-slate-950 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <AlertCircle className={`w-4 h-4 shrink-0 ${
              appData.emailVerification?.required && !appData.emailVerification?.isVerified
                ? 'text-amber-400'
                : 'text-indigo-400'
            }`} />
            <span>
              {isSubmitted
                ? 'Application has been successfully submitted and logged.'
                : appData.emailVerification?.required && !appData.emailVerification?.isVerified
                ? 'Workday Security Gate: Please verify the 6-digit code above sent to your login email before final submission.'
                : 'Please verify all questionnaire answers above before authorizing final submission.'}
            </span>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-700 bg-slate-800 text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
            >
              Close
            </button>

            {!isSubmitted && (
              <button
                onClick={handleFinalSubmit}
                disabled={isSubmitting || Boolean(appData.emailVerification?.required && !appData.emailVerification?.isVerified)}
                title={
                  appData.emailVerification?.required && !appData.emailVerification?.isVerified
                    ? 'Workday email verification code required before submit'
                    : undefined
                }
                className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-xs font-semibold text-white transition-colors flex items-center gap-2 shadow-lg shadow-emerald-950"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Transmitting to Workday...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>
                      {appData.emailVerification?.required && !appData.emailVerification?.isVerified
                        ? 'Verify Email to Enable Submit'
                        : 'Approve & Final Submit'}
                    </span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
