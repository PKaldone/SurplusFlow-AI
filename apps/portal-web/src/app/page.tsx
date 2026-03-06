import Link from "next/link";

const steps = [
  { num: "1", title: "Get Your Link", desc: "You'll receive a secure login link via email — no password needed." },
  { num: "2", title: "Review Your Claim", desc: "See your claim details, review and sign your contract, upload documents." },
  { num: "3", title: "Track Progress", desc: "Follow your case through every step until your funds are recovered." },
];

const badges = [
  { title: "Secure & Encrypted", desc: "All data is protected with bank-level encryption." },
  { title: "Compliance First", desc: "Every step follows state and federal regulations." },
  { title: "No Hidden Fees", desc: "Transparent fee structure — you always know what to expect." },
];

export default function PortalLanding() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-blue-600 flex items-center justify-center">
              <span className="text-white font-bold text-sm">SF</span>
            </div>
            <span className="text-xl font-bold text-slate-900">SurplusFlow</span>
          </div>
          <Link
            href="/login"
            className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Sign In
          </Link>
        </div>
      </header>

      <section className="py-20 sm:py-28 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-4xl sm:text-5xl font-bold text-slate-900 tracking-tight">
            Check Your Claim Status
          </h1>
          <p className="mt-6 text-lg text-slate-600 max-w-xl mx-auto leading-relaxed">
            SurplusFlow makes it easy to track and manage your surplus fund claim.
            Review documents, sign contracts, and monitor progress — all in one place.
          </p>
          <div className="mt-10">
            <Link
              href="/login"
              className="inline-flex items-center px-8 py-3.5 text-base font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
            >
              Sign In to Your Portal
            </Link>
          </div>
        </div>
      </section>

      <section className="py-16 px-4 sm:px-6 bg-white border-y border-slate-200">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 text-center mb-12">
            How it works
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {steps.map((s) => (
              <div key={s.num} className="text-center">
                <div className="mx-auto h-12 w-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xl font-bold mb-4">
                  {s.num}
                </div>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">{s.title}</h3>
                <p className="text-slate-600 text-sm leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {badges.map((b) => (
              <div key={b.title} className="rounded-xl border border-slate-200 bg-white p-6 text-center">
                <h3 className="text-base font-semibold text-slate-900 mb-1">{b.title}</h3>
                <p className="text-slate-500 text-sm">{b.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="flex-1" />

      <footer className="border-t border-slate-200 bg-white py-8 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-slate-500">&copy; 2026 SurplusFlow AI. All rights reserved.</p>
          <div className="flex items-center gap-6">
            <Link href="/terms" className="text-sm text-slate-500 hover:text-slate-900 transition-colors">
              Terms of Service
            </Link>
            <Link href="/privacy" className="text-sm text-slate-500 hover:text-slate-900 transition-colors">
              Privacy Policy
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
