---
name: design-dreamy-ebook
description: "[DESIGN] Write and typeset a dreamy, story-led ebook with real photographs and elegant book typography (not the generic AI-document look). Use when the user wants an ebook, guide, workbook or lead magnet that feels like a storybook: a narrative voice, sensory openings, pull quotes, handwritten margin notes, full-page photo spreads, soft palette, and a print-ready PDF. Uses the local ebook kit at C:\\Users\\busay\\yalo-tools\\ebook-kit."
---

# Dreamy Ebook (voice + design + build)

The user dislikes the generic style, fonts and mannerisms Claude defaults to. This skill replaces them. Keep the user's trust: beginner-friendly, show a few pages early, ask only what you need.

## 0. Where things live (Windows)
- Kit: `C:\Users\busay\yalo-tools\ebook-kit` (theme `theme\dreamy.css`, fonts `fonts\`, photos `images\`, builder `build.mjs`, working example `sample\book.html`).
- Make each new book in `C:\Users\busay\yalo-tools\ebook-kit\books\<book-name>\book.html` (never inside any other project folder such as the YALO CRM). Link `../../theme/dreamy.css` and `../../images/<file>.jpg`.
- Build: `node C:\Users\busay\yalo-tools\ebook-kit\build.mjs <book folder>` -> `book.pdf` (uses installed Edge/Chrome; offline).
- Check pages by rendering to PNG (PyMuPDF in `C:\Users\busay\yalo-tools\pyenv`) and look at them before delivering.

## 1. Ask first (short)
Topic, reader (one real person), the one feeling they should have at the end, tone (tender / playful / mystical / quiet-luxury), length (e.g. 20-40 pages), and facts that must be accurate. If they gave real material (their skills, videos, ebook outline), build from it.

## 2. The voice (this is what makes it not generic)
- **Story first, instruction second.** Each chapter opens in a *scene* (a place, a body, a small action), not a definition. Then the idea arrives as if the scene taught it.
- One central **image-metaphor** for the whole book (a lantern, a river, a garden). Return to it, never overextend it.
- Second person, warm, plain words. Short sentences mixed with one long, breathing one. Concrete nouns, senses (light, sound, temperature).
- **Banned habits:** "In today's fast-paced world", "Let's dive in", "unlock", "game-changer", "delve", "It's important to note", "In conclusion", tidy listicles of five bold-faced bullets, triple adjectives, em-dash overuse, emoji, every paragraph ending on a moral. Don't summarise what you just said.
- Each chapter: scene -> turning idea -> a pull quote worth underlining -> one **handwritten margin note** -> a small ritual ("Try this tonight") -> a soft closing line. Vary the rhythm chapter to chapter.
- Specific beats generic: real places, real numbers the user supplied, believable small details. Never invent statistics, testimonials or sources.
- Where the book teaches a system (e.g. the user's skills), keep the commands exact (`/yt-script`) inside the story.

## 3. The design system (use the kit, don't reinvent)
Classes in `dreamy.css`: `.page`, `.page.bleed`, `.cover` (bg image + veil + `.inner`), `.center` + `.epigraph`, `.orn`, `.opener` (`.hero` image, `.head`, `.body`), `h1.ch`, `.chapno`, `.tagline`, `p.first` (drop cap + small-caps first line), `h2`, `h3`, `blockquote.pull`, `.note` (handwritten), `ul.try`, `.card`, `figure.full` (full-page photo with caption), `figure.inline`, `.toc`, `.folio`, `.credits`.
- Page 6x9in. Palette: cream paper, ink plum, dusk blue, rose, gold. Fonts: Cormorant Garamond (display, italic), EB Garamond (body), Playfair (drop caps), Caveat (handwritten), Inter (tiny credits).
- Rhythm: cover -> epigraph -> contents -> (chapter opener with wide photo -> 1-3 text pages -> optional full-bleed photo spread) x N -> closing page + credits. Keep a photo every 2-3 pages; never two similar photos in a row.
- Keep body text 11-12pt, generous margins, no walls of text; at most one `.card` and one `.note` per spread; check nothing overflows the 9in page (split pages by hand).
- Photos: choose from `images\` (misty forests, mountains, sea, star trails, sparklers, blossom, dusk). They are wide banners (2560x1000) from the ServiceStack/images collection (Unsplash). Crop with `object-fit:cover`; view candidates before choosing; match mood to the chapter. Credit them on the last page. Unsplash is free to use; for a product sold commercially, confirm the current Unsplash licence.
- Need other imagery? Prefer the user's own photos or CC0 sources; never scrape or reuse copyrighted images; never imply a real person endorsed the book.

## 4. Workflow
1. Outline (6-9 chapters, each with a scene seed, the idea, the ritual).
2. Write chapter 1 + the cover/epigraph; build and **show the user 3-4 rendered pages** for a style check before writing the rest.
3. Write the rest in the agreed voice, build, render PNGs, look for overflow/orphans/awkward breaks, fix.
4. Deliver `book.pdf` path in `ebook-kit\books\<name>\` and offer an EPUB/Word variant only if asked.
5. Update `C:\Users\busay\yalo-tools\START-HERE.md` only if the user wants.

## 5. Quality bar before saying "done"
Every chapter opens in a scene; no banned phrases; no invented facts; photos credited; PDF opens, fonts embedded, no clipped text; the user has seen at least the first chapter rendered.
