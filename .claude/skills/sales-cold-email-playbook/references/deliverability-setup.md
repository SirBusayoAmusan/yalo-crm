# Infrastructure and deliverability (paraphrased from one long course; vendor opinions flagged)

Why: reputation sits on the sending IP, domain and mailbox. A burned mailbox is replaceable; a blacklisted domain isn't. **Never cold-send from your main business domain.**

## Setup steps
1. **Secondary domains**: .com lookalikes of your brand (e.g. "get/try/my" + name). Redirect them to your main site. Let them age at least ~30 days (60-90 better); you can create mailboxes and warm up meanwhile.
2. **DNS**: domain verification record, MX, **SPF**, **DKIM**, **DMARC**, and a custom tracking/redirect domain if your tool needs it. Verify with a free scanner (EasyDMARC, MXToolbox) before activating.
3. **Mailboxes**: Google Workspace is the usual first choice (reported best inbox placement). Use a real-person sender name. Roughly 4-5 mailboxes per domain; never forward replies to another mailbox: reply from the sending tool's unified inbox so the thread stays a conversation.
4. **Sending tool**: Instantly, Smartlead or similar (the course favours Instantly; he also sells tools/coaching, so compare). Avoid lifetime deals and cheap unmanaged SMTP at first.
5. **Warm-up**: on from day one, ramp gently, keep running. Start ~10 cold emails/mailbox/day, rise slowly to ~20-25; never above ~50. Slow-ramp on, gap of several minutes between sends.
6. **Campaign settings**: plain text, open/click tracking off, stop on reply, risky emails off, auto-pause on high bounces, blocklist (customers, competitors, opt-outs).
7. **Placement tests**: use real seed-inbox tests, not just "health scores". If placement falls (around 80% or lower), pause that mailbox from campaigns for weeks, warm-only, retest.
8. **Primary domain**: set up Google Postmaster Tools; keep spam-complaint rate very low.

## If mail goes to spam (check in order)
DNS authentication -> blacklists -> domain age -> copy (real placement test) -> reputation (cut volume, raise warm-up). Promotions-tab and "dangerous" banners count as failures. If a domain stays bad ~60 days, replace it.

## Scaling maths
J = emails needed to book one call (measure it). Emails/day = calls wanted/day x J. Mailboxes = emails/day / ~25. Domains = mailboxes / 4-5. Grow horizontally; diversify mail providers; name an owner for replies; stop scaling when the reply backlog grows.

## Pre-launch checklist
DNS tests pass - domains 30+ days - warm-up healthy - slow ramp on - spintax previewed - spam check done - placement test run - reply owner set - blocklist loaded - opt-out and address line in place.
