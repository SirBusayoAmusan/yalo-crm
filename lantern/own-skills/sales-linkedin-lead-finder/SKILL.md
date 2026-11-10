---
name: sales-linkedin-lead-finder
description: "[SALES] Turn LinkedIn profile URLs (or names plus companies) into a B2B lead list with verified work emails, using ContactOut's API. Use when the user wants leads from LinkedIn, 'get emails for these LinkedIn profiles', 'enrich this CSV', 'build a prospect list', or has a list of people and needs their contact details. The user supplies the profile URLs; this skill never logs in to, scrapes, messages or connects on LinkedIn."
---

# LinkedIn lead finder (you supply the people, ContactOut supplies the emails)

Output: a CSV with `full_name, title, company, linkedin_url, email, email_type, source, status`.

LinkedIn rarely shows emails, and scraping it risks the user's account, so this skill does NOT touch LinkedIn. The user finds people themselves (searching LinkedIn by hand, a purchased list, or a CSV) and pastes the profile URLs. ContactOut turns them into emails.

## Ground rules
- Never log in to LinkedIn, scrape it, or run any LinkedIn automation or MCP. Never ask for LinkedIn credentials. If the user asks for scraping, explain the account-ban risk (LinkedIn's User Agreement bans automated access) and offer: paste URLs, ContactOut's own People Search (check its docs and pricing first), or a paid prospecting tool with an official API.
- Collect only what a business needs to contact someone about their job: name, title, company, work email. No personal emails or phone numbers unless the user asks and has a lawful basis (GDPR/UK PECR/CASL apply to people in those regions). Keep a `source` column.
- Suppress anyone who asks to be removed. Do not keep lists longer than needed.

## Workflow
1. **Brief (2-3 questions max):** who is the ideal customer (role, industry, company size, country) and roughly how many leads. If the ICP is vague, suggest `founder-consumer` first.
2. **Get the people.** The user pastes LinkedIn profile URLs, or a CSV, or names plus companies. Write `leads.csv` with columns: `full_name, title, company, company_domain, linkedin_url` (blank cells are fine; a row needs either a URL or a name plus company/domain).
3. **Dry run, always first:**
   `node ~/.claude/skills/sales-linkedin-lead-finder/scripts/contactout-enrich.mjs --in leads.csv --out enriched.csv --dry-run`
   Show the number of API calls and the credit worst case. Wait for a go-ahead. Work in the user's working folder, not inside the skill folder.
4. **Enrich** (the key comes from the environment, never from a file or chat):
   `node .../contactout-enrich.mjs --in leads.csv --out enriched.csv --max 25`
   Start with `--max 3` the first time and check the CSV before going bigger. Add `--include-phone` only if asked.
5. **Check the result:** report found / no email / errors. `status=no_email` rows are normal. Prefer `email_type=work`. Flag generic addresses (info@, sales@).
6. **Hand off:** pass `enriched.csv` to `sales-cold-email-playbook` (list cleaning, deliverability, sequence). Verify addresses before sending.

## ContactOut facts (checked against their API docs)
- Base `https://api.contactout.com`, header `token: <key>`. API access is requested from ContactOut; a Chrome-extension plan may not include it. If calls return 401/403, tell the user to ask ContactOut about API access.
- Profile URL to contacts: `GET /v1/people/linkedin?profile=<url>`. 1 email credit when an email is found.
- Name + company: `POST /v1/people/enrich`. 1 search credit when a profile is found, plus email credit when an email is found.
- Rate limit for people lookups is 60/minute; the script paces itself.
- Bulk endpoints exist (100 per call sync, 1000 async); use only for big lists and with the user's go-ahead.
- The response shape has not been verified live: the script reads any email-like field. Check the first output by eye.

## Never
- Guess or pattern-generate emails and present them as verified.
- Print or save the API key. Commit `leads.csv` or `enriched.csv` (they hold personal data).
