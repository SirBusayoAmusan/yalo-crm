# Lists and targeting (paraphrased)

## Choose who
- Existing customers: export them and look for patterns. No customers: describe your offer and let an AI suggest 5-10 segments; run them as separate small tests.
- Replies are higher from: owner/C-suite decision makers, small and young companies, industries that rarely get marketing email (trades, manufacturing, construction, farming), newly hired executives. Lower from: mid-level staff, 500+ employee companies, over-targeted groups (agency owners, doctors, lawyers).
- Money and reply rate often move opposite ways; look for budget + low saturation.

## Where leads come from
B2B database (Apollo is the course's balanced pick); LinkedIn-based scrapers; Google Maps scraping for local businesses with no LinkedIn presence (we have `sales-google-maps-scraper`); lookalike tools for odd criteria. Never buy ready-made lists. Respect source terms and privacy laws.

## Filter recipe (example)
Titles (founder, CEO, owner, etc.) + location + custom size range + **company keywords** (better than industry labels) + exclude keywords that mark bad fits + verified emails. Spot-check by hand until about 9 in 10 look like fits. Be wary of "intent" and revenue filters.

## Clean the list (three layers: valid, deliverable, relevant)
1. Run a bulk verifier and send only to "good"; risky/catch-all addresses get a second check or are skipped.
2. Use recent data; avoid loading old lists.
3. **AI fit check**: for each lead give the AI your offer and the company info and ask for one word, yes or no; drop the nos (expect to lose 30-50%).
Prompt: "You are a sales assistant. My offer: I help [X] with [Y]. Company: [description, industry, title]. Is this a good fit? Reply only yes or no."

## Signals (advanced, only after a plain campaign works)
A recent event that gives a reason to write: hiring for the problem you solve, funding, new executive, award, news, or a trial/download for inbound leads. Needs accurate, timely sources and the same cleaning as any list. May not beat a plain control, so test.

## Warm vs cold
Cold = never opted in. Keep cold contacts in the sending tool; move people to your CRM only once they reply and book.
