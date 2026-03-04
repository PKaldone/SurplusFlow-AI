// ============================================================
// SurplusFlow AI — Claimant Portal - Case Status Tracker
// /apps/portal-web/src/app/cases/[id]/page.tsx
// ============================================================

'use client';
import React from 'react';

const STEPS = [
  { key: 'ENROLLED', label: 'Agreement Signed', description: 'Your recovery agreement has been signed.' },
  { key: 'PACKET_ASSEMBLY', label: 'Preparing Claim', description: 'We are assembling your claim documents.' },
  { key: 'SUBMITTED', label: 'Claim Filed', description: 'Your claim has been submitted to the appropriate authority.' },
  { key: 'AWAITING_PAYOUT', label: 'Approved — Awaiting Payment', description: 'Your claim has been approved. Waiting for funds to be released.' },
  { key: 'INVOICED', label: 'Payment Received', description: 'Funds have been sent to you. Our invoice has been issued.' },
  { key: 'CLOSED', label: 'Complete', description: 'Your case is complete. Thank you!' },
];

// Sample case for UI scaffolding
const SAMPLE_CASE = {
  caseNumber: 'SF-2024-00001',
  status: 'SUBMITTED',
  claimantName: 'John Doe',
  propertyDescription: 'Unclaimed bank account funds',
  reportedAmount: '$4,500.00',
  jurisdictionState: 'CA',
  feePercent: '10%',
  contractSignedAt: '2024-08-15',
  rescissionDeadline: '2024-08-18',
  documents: [
    { name: 'Government ID (Front)', status: 'uploaded' },
    { name: 'Government ID (Back)', status: 'uploaded' },
    { name: 'Signed Agreement', status: 'uploaded' },
    { name: 'State Claim Form', status: 'missing' },
  ],
};

export default function CaseStatusPage() {
  const currentStepIndex = STEPS.findIndex(s => s.key === SAMPLE_CASE.status);

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <div className="bg-white rounded-xl border shadow-sm p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold">Case {SAMPLE_CASE.caseNumber}</h1>
            <p className="text-sm text-gray-500">{SAMPLE_CASE.propertyDescription}</p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-green-600">{SAMPLE_CASE.reportedAmount}</div>
            <div className="text-xs text-gray-500">Estimated amount</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm mb-6">
          <div><span className="text-gray-500">State:</span> {SAMPLE_CASE.jurisdictionState}</div>
          <div><span className="text-gray-500">Fee:</span> {SAMPLE_CASE.feePercent} (success-based)</div>
          <div><span className="text-gray-500">Agreement Date:</span> {SAMPLE_CASE.contractSignedAt}</div>
          <div><span className="text-gray-500">Cancellation Deadline:</span> {SAMPLE_CASE.rescissionDeadline}</div>
        </div>
      </div>

      {/* Status Tracker */}
      <div className="bg-white rounded-xl border shadow-sm p-6 mb-6">
        <h2 className="text-lg font-bold mb-6">Claim Progress</h2>
        <div className="space-y-0">
          {STEPS.map((step, i) => {
            const isComplete = i < currentStepIndex;
            const isCurrent = i === currentStepIndex;
            const isFuture = i > currentStepIndex;

            return (
              <div key={step.key} className="flex gap-4">
                {/* Timeline dot and line */}
                <div className="flex flex-col items-center">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 ${
                    isComplete ? 'bg-green-500 border-green-500 text-white' :
                    isCurrent ? 'bg-blue-500 border-blue-500 text-white animate-pulse' :
                    'bg-gray-100 border-gray-300 text-gray-400'
                  }`}>
                    {isComplete ? '✓' : i + 1}
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className={`w-0.5 h-16 ${isComplete ? 'bg-green-400' : 'bg-gray-200'}`} />
                  )}
                </div>

                {/* Content */}
                <div className="pb-8">
                  <div className={`font-medium ${isFuture ? 'text-gray-400' : 'text-gray-900'}`}>
                    {step.label}
                    {isCurrent && <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Current</span>}
                  </div>
                  <div className={`text-sm mt-1 ${isFuture ? 'text-gray-300' : 'text-gray-500'}`}>
                    {step.description}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Document Checklist */}
      <div className="bg-white rounded-xl border shadow-sm p-6">
        <h2 className="text-lg font-bold mb-4">Document Checklist</h2>
        <div className="space-y-3">
          {SAMPLE_CASE.documents.map((doc, i) => (
            <div key={i} className="flex items-center justify-between py-2 border-b last:border-0">
              <span className="text-sm">{doc.name}</span>
              <div className="flex items-center gap-2">
                {doc.status === 'uploaded' ? (
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">✓ Uploaded</span>
                ) : (
                  <>
                    <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full">Missing</span>
                    <button className="text-xs bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700">Upload</button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Help Text */}
      <div className="mt-6 text-center text-sm text-gray-500">
        <p>Questions? Contact us at <a href="mailto:claims@surplusflow.com" className="text-blue-600">claims@surplusflow.com</a> or call (555) 123-4567</p>
        <p className="mt-1">Reference your case number: <strong>{SAMPLE_CASE.caseNumber}</strong></p>
      </div>
    </div>
  );
}
