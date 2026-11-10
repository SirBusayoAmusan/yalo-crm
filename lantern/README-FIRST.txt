THE LANTERN HOURS: INSTALLER (READ ME FIRST)
Clearpath Creators

What is in this folder
  install-lantern-skills.ps1   Windows script that installs five free tools, then runs the installer below.
  lantern-install.mjs          Downloads each skill from its creator and installs it (Windows, Mac, Linux).
  skills-manifest.json         Where each skill comes from.
  images-map.json              Which photos the ebook kit uses.
  own-skills\                  The four skills written for the book.
  ebook-kit\                   The storybook design kit from Chapter 15.
  prompt-pack.md               Every prompt in the book as plain text.

Windows, in short
  1. Unzip this folder somewhere you can find it.
  2. Read install-lantern-skills.ps1 in Notepad. It is plain text.
  3. Right-click it and choose Run with PowerShell. If Windows blocks it, open a terminal in this folder and run:
       powershell -ExecutionPolicy Bypass -File .\install-lantern-skills.ps1
  4. Type Y when asked. Wait 15 to 30 minutes.
  5. Quit the Claude app completely, open it again, open the Code tab, type /

Mac or Linux, in short
  Install Git and Node.js, then in this folder run:  node lantern-install.mjs
  Quit and reopen the Claude app.

What it never does: create accounts, take payments, read your files or send anything about you anywhere.
Other people's skills are downloaded from their creators; they are not inside this zip. See Appendix F of the book for credits and licences.

You need a Claude Pro plan to use the skills. Everything else here is free.
