import Link from "next/link";

/**
 * What happens to what people type. Written to be read by someone anxious
 * about entering personal details into a form they found on the internet.
 */
export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-10">
      <Link
        href="/"
        className="inline-block py-2.5 text-sm font-bold text-afca-blue underline underline-offset-2 hover:text-afca-navy"
      >
        ← Back to the demo
      </Link>

      <h1 className="mt-6 text-2xl font-extrabold tracking-tight text-afca-navy sm:text-3xl">
        Your data
      </h1>
      {/* This line used to say "everything stays in your browser", which the two
          sections below contradict: messages are posted to this server and, when a
          key is configured, on to Anthropic. A privacy summary that overstates the
          protection is worse than none, because it is the part people actually read. */}
      <p className="mt-2 text-sm text-afca-navy/70">
        The short version: nothing is sent to AFCA or any financial firm, but your messages
        <em> are</em> sent to this site&rsquo;s server — and on to Anthropic when the AI
        assistant is switched on — so please use made-up details, not your real ones.
      </p>

      <section className="mt-6 rounded-2xl border-2 border-afca-blue bg-white p-5">
        <h2 className="text-sm font-extrabold uppercase tracking-[0.08em] text-afca-navy">
          Please use made-up details
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-afca-navy">
          This is a demonstration, so there is no reason to enter a real name, date of birth,
          email address, phone number or account number — and good reason not to. Invented
          details exercise every part of the demo exactly as real ones would.
        </p>
      </section>

      <section className="mt-8 rounded-2xl border-2 border-afca-yellow bg-afca-cream p-5">
        <h2 className="text-sm font-extrabold uppercase tracking-[0.08em] text-afca-navy">
          This is a demonstration
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-afca-navy">
          Complaint Concierge is not affiliated with, endorsed by, or connected to the Australian
          Financial Complaints Authority. It does not lodge complaints. Nothing you type here
          reaches AFCA or any financial firm. To make a real complaint, go to{" "}
          <a
            href="https://www.afca.org.au"
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold underline underline-offset-2"
          >
            afca.org.au
          </a>
          .
        </p>
      </section>

      <Section title="What is stored">
        <p>
          Your answers live in the memory of this browser tab and nowhere else. There is no account,
          no database, and no cookie holding your complaint. Close or refresh the tab and everything
          you entered is gone — which also means there is no &ldquo;resume later&rdquo;. Use{" "}
          <strong>Download JSON</strong> on the review screen if you want to keep a copy.
        </p>
      </Section>

      <Section title="What is sent, and where">
        <p>
          Each time you send a message, the conversation and the form state so far are posted to
          this site&rsquo;s own server so it can work out a reply. That request is processed and the
          answer returned; it is not written to disk.
        </p>
        <p className="mt-3">
          If the deployment has an Anthropic API key configured, that same content is sent on to
          Anthropic&rsquo;s API to generate the reply, and is handled under Anthropic&rsquo;s terms.
          If no key is set, the app runs on a rule-based extractor that never leaves the server, and
          nothing is sent to any third party. The badge in the header tells you which one is
          running: <em>Claude</em> or <em>Offline demo brain</em>.
        </p>
      </Section>

      <Section title="Files you attach">
        <p>
          Nothing is uploaded. Choosing a file records only its name so the form can list it; the
          file itself never leaves your device.
        </p>
      </Section>

      <Section title="The firm details are invented">
        <p>
          The directory of financial firms in this demo is fabricated — the names are real
          companies, but the member numbers, phone numbers and email addresses are not. Do not use
          any contact detail shown here to contact a real firm.
        </p>
      </Section>

      <Section title="Please do not enter real personal information">
        <p>
          This is a demonstration, not a service with the safeguards a real complaints system needs.
          Use made-up names, dates of birth and addresses. Do not paste bank account numbers, tax
          file numbers, medical details, or anything about another person.
        </p>
      </Section>

      <Section title="Analytics">
        <p>
          There are none. No tracking scripts, no advertising pixels, no third-party embeds.
        </p>
      </Section>

      <p className="mt-10 text-xs text-afca-navy/50">
        This page describes a demonstration app and is not a legal privacy policy.
      </p>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-7">
      <h2 className="text-sm font-extrabold uppercase tracking-[0.08em] text-afca-blue">{title}</h2>
      <div className="mt-2 text-sm leading-relaxed text-afca-navy">{children}</div>
    </section>
  );
}
