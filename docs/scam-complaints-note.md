# Scam complaints and the SPF — why they are out of scope, and what would change

Researched 11 September 2026. Dates and instrument names below are sourced from
the Federal Register and Treasury; the "open questions" section marks what is
still draft or single-sourced.

## Why scams are not a service type in this demo

The **Scams Prevention Framework Act 2025** (No. 15, 2025) inserts Part IVF into
the Competition and Consumer Act 2010. It is enabling legislation: obligations
bite only once a sector is designated *and* a code is made for it.

As at today:

- Banking, telecommunications and digital platforms are **designated** — in
  force since 28 May 2026.
- No sector **code** has been made. Drafts closed for consultation 25 June 2026.
- The only live obligation on regulated entities is **AFCA membership**, from
  1 September 2026.
- **AFCA cannot consider an SPF scam complaint until 31 March 2027**
  (Competition and Consumer (Scams Prevention Framework—External Dispute
  Resolution) Authorisation 2026, s50(2)).

So a scam pathway modelled today would describe a jurisdiction that does not yet
accept complaints. It is deliberately omitted rather than overlooked.

## What would have to change to add it

The current schema assumes **one complainant against one firm**. The SPF is
explicitly multi-party: a single scam can involve the sending bank, the
receiving bank, a telco and a digital platform, and AFCA is authorised as the
single EDR scheme across all three sectors — a consumer can raise it with any
regulated entity connected to the scam ("no wrong door").

Concretely, adding scams would need:

1. `firm` to become a list of respondents, each with its own sector and role
   (sending bank, receiving bank, carrier, platform).
2. A `scam` service type with its own subtypes and issue list.
3. New narrative shaping — a scam story is a timeline across parties, not one
   firm's failure.
4. `lib/next.ts` branch rules per respondent, since obligations differ by sector.

That is a real extension of the data model, not a new enum value — which is
itself a useful thing for the demo to be able to say.

## Open questions

- Penalty tiering: the widely-cited $50m / 3× benefit / 30% turnover maximum is
  secondary-sourced and may be the upper tier only.
- Equal liability apportionment between breaching entities, and automatic
  reimbursement of verified losses under $3,000, are Treasury proposals in draft
  Rules — not law.
- AFCA's own rules consultation for SPF complaint-handling is open until
  28 September 2026, so the complaint process itself is not yet settled.

## Not to be confused with

ACMA's SMS Sender ID Register (in force 1 July 2026) is made under the
Telecommunications Act and administered by ACMA alone. It is a parallel
anti-scam measure, not part of the SPF.
