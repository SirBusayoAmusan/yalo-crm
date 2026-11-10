---
name: sales-cold-email-playbook
description: "[SALES] Cold email and lead generation for B2B and higher-ticket offers: validate the offer, choose an ICP, build and clean a lead list, set up domains/inboxes/deliverability, write a short cold sequence with follow-ups, handle replies, measure and scale. Use when the user wants outreach emails, a lead list plan, warm outreach scripts, follow-up cadences, deliverability help, or to diagnose low opens/replies/meetings. Built from public cold-email training videos, with compliance guardrails added."
---

# Cold Email & Lead Generation Playbook

Method summarised in original words from public videos (see `references/sources.md`). Several claims are the speakers' own and some were selling tools; treat numbers as starting hypotheses to test, never promises. The user is usually a beginner: one step at a time, plain language.

## Ground rules
- **The email's job is a reply** (a raised hand), not a sale. Aim to start a conversation or book a meeting.
- **Fix the bottom first**: 1) infrastructure that reaches the inbox, 2) the right list, 3) offer + copy. Bad infrastructure or lists make good copy irrelevant.
- **Hand-write and test before automating or adding AI.** Plain control campaign first; fancy personalisation only after a control works.
- Cold email suits B2B and higher-ticket offers. Weak for low-ticket consumer products.
- Expect trial and error; test one variable at a time, judge on positive replies/meetings, not raw reply rate or tiny samples.

## COMPLIANCE AND SAFETY (always apply; overrides tips below)
The source videos include tips to omit opt-out wording and the sender address. **Do not follow those.** Default to:
- Real sender identity, no deceptive subject lines or fake "Re:" threads or invented familiarity/observations.
- A clear way to opt out and a physical/business address as required where you send (CAN-SPAM in the US). **GDPR/UK PECR/CASL and Nigeria's NDPA** can be stricter, and rules differ by country and by whether you email companies or individuals. Tell the user to check the rules for the recipients' countries (or ask a lawyer) before sending at scale.
- Honour any removal request immediately; keep a blocklist (opt-outs, customers, competitors, hostile replies).
- Only emails obtained lawfully; never buy shady lists. Scraping must respect the source's terms.
- Never claim results, clients, press or guarantees you can't prove.
If the user wants to skip these, explain the risk and decline to help with that part.

## The workflow
1. **Offer check.** One clear promise: result, timeframe, proof, who does the work. If boring or crowded, use a foot-in-the-door: a front-end offer (one desirable slice), a loss-leader, a niche reposition, or a lead magnet / "I'll build X for you, okay?" Fix the offer before sending.
2. **Warm first.** Friends, past clients, followers: honest message, small free/discounted trial for a few people, ask for intros, track in a simple sheet/CRM. Ask happy customers for reviews and referrals.
3. **ICP slice.** One industry, one size band, one title group. Decision makers/owners at small-mid companies in less email-saturated industries (trades, manufacturing, construction...) tend to reply more; mid-level staff and giant companies less. If no customers yet: describe the offer and pick 5-10 segments as separate tests.
4. **List.** See `references/lists-and-targeting.md`: build, verify, remove poor fits, spot-check ~9 in 10 look right.
5. **Infrastructure.** See `references/deliverability-setup.md`: separate sending domains (never your main one), authentication (SPF, DKIM, DMARC), warm-up, low daily volume.
6. **Write the email.** See `references/copy-and-sequences.md`. Short (about 3-6 sentences), plain text, one easy ask.
7. **Test small.** 10-20 hand-checked emails per segment, read the replies, fix, then scale.
8. **Follow up.** Most meetings come from follow-ups, not email 1. Reply in the same thread, short, no new pitch.
9. **Handle replies fast** from the sending tool's inbox: yes -> send a booking invite; objection -> acknowledge and give a reason to talk (reuse `sales-closing-playbook`); no -> remove. Move to your CRM only after a booking.
10. **Measure weekly** and diagnose: low opens -> subject/first line/deliverability; low replies -> weak ask, passive wording, wrong audience; low meetings from replies -> relevance paragraph or offer.
11. **Scale carefully**: more domains/mailboxes (not more per mailbox), clear owner for replies. Maths in `references/deliverability-setup.md`.

## What to produce for the user
Ask for: what they sell, to whom, price, country. Then deliver, as needed: an offer line, 3-5 ICP segments, a list-building plan, a 3-email sequence (with 2 subject options), a follow-up cadence, warm-outreach messages, a setup checklist, or a diagnosis. Always include a short compliance line for the target country and an opt-out line.
