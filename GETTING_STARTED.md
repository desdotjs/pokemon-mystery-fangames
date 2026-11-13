# Getting Started with Sky Maker

A friendly, step-by-step guide. No coding, no command line, nothing to install.

> **Heads up:** Sky Maker is still being built. This guide describes how the finished version will work. Download links will appear on the [Releases page](https://github.com/desdotjs/pokemon-mystery-fangames/releases) when the first version is ready.

---

## What you need

1. **A computer** (Windows, Mac, or Linux). Phones and tablets aren't supported yet.
2. **Google Chrome or Microsoft Edge.** Other browsers may work, but these two are tested.
3. **Your own copy of Pokémon Mystery Dungeon: Explorers of Sky (US version)** as a ROM file. It's one file that ends in `.nds`.
   - It must be a backup of a game cartridge you own.
   - Sky Maker does **not** include the game and can't help you find it online.
   - It must be the **US** version. If it's the wrong version, Sky Maker will tell you.

That's it.

---

## Option 1: Use the website (easiest)

1. Open Chrome or Edge.
2. Go to the Sky Maker website. *(The link will be posted here when it's live.)*
3. When it asks for your ROM, drag your `.nds` file onto the page, or click **Choose file** and find it.
4. Wait for the progress bar to finish. The first time takes a minute or two. After that, it's instant.
5. You're in.

**Is my ROM uploaded anywhere?** No. Everything happens inside your browser on your computer. Your ROM never goes to the internet.

**Can I use it without internet?** Yes. After your first visit, click the **Install** icon in the address bar (a small computer with a down arrow). Sky Maker will then open like a normal app, even offline.

---

## Option 2: Download it and run it from your computer

Use this if you'd rather keep a copy that doesn't depend on any website.

1. Go to the [Releases page](https://github.com/desdotjs/pokemon-mystery-fangames/releases).
2. Under the newest version, click the file named **`SkyMaker-vX.X.zip`** (X.X is the version number).
3. Find the download (usually in your **Downloads** folder) and unzip it:
   - **Windows:** right-click the file → **Extract All…** → **Extract**.
   - **Mac:** double-click the file.
4. Open the new **SkyMaker** folder.
5. Double-click **`Sky Maker.html`**. It opens in your browser.
   - If it opens in a browser other than Chrome or Edge, right-click the file → **Open with** → **Google Chrome** (or **Microsoft Edge**).
6. Drag in your ROM the first time, like in Option 1.

Keep the SkyMaker folder somewhere easy to find, like your Desktop or Documents.

---

## Making a game (the editor)

Inside Sky Maker, the tabs across the top are your tools:

| Tab | What it's for |
|---|---|
| **Map** | Build towns and areas, starting from an original map or from scratch |
| **Events** | Characters, dialogue, and cutscenes |
| **Dungeons** | Floors, enemies, items, and bosses |
| **Starter** | How the player picks their Pokémon (quiz, free choice, or set) |
| **Systems** | Turn shops, missions, ranks, recruitment, and more on or off |
| **Database** | Characters, items, and story switches |
| **Assets** | Browse every sprite, portrait, and song, or add your own art |

Press the green **▶ Playtest** button anytime to play what you've made.

### Saving your work
- Sky Maker **saves automatically** in your browser while you work.
- Browser storage can be wiped (for example, if you clear your browsing data), so make backups: click **⤓ Export** to save your project as a `.zip` file. Do this often.
- To open a backup, click **Import** and choose the `.zip`.

---

## Playing someone else's game

People can share games made with Sky Maker in two ways.

### A) A project file (`.zip`) or a link
1. Open Sky Maker (Option 1 or 2).
2. Load your own ROM if it asks.
3. Click **Import** and choose the project `.zip`, or just open the link you were sent.
4. Click **▶ Play**.

### B) A patch file (`.bps`) to play on an emulator or DS
Some creators also share a **patch**: a small file that turns your copy of the game into their fan game.

1. Go to **Rom Patcher JS** (search "Rom Patcher JS" in your browser).
2. Under **ROM file**, choose your clean, unmodified US Explorers of Sky ROM.
3. Under **Patch file**, choose the `.bps` file you were given.
4. Click **Apply patch**. A new `.nds` file downloads. That's the fan game.
5. Open it in a DS emulator such as **melonDS** (free, for Windows/Mac/Linux).

Patches never contain the original game. That's why you need your own copy.

---

## Troubleshooting

**"This isn't a supported ROM."**
Your file is the wrong version (for example, European or Japanese) or isn't Explorers of Sky. Sky Maker needs the US version.

**The page is blank, or nothing happens when I drop the ROM.**
Make sure you're using Chrome or Edge, and that the browser is up to date. If you're using the downloaded version, check that you unzipped the folder first. Double-clicking inside the zip without extracting won't work.

**My project disappeared.**
Your browser data was probably cleared. Import your most recent **Export** backup. (This is why regular exports matter.)

**It's slow the first time.**
That's normal. Sky Maker unpacks thousands of sprites and sounds from your ROM once, then remembers them.

**The music sounds a bit off.**
The game's music is rebuilt from the original note data, and some instruments may not sound exactly like the DS yet. This will improve over time.

**The patch won't apply.**
The patch needs a *clean* US ROM: one that hasn't been patched or edited before. Try again with an untouched copy.

---

## The fine print

- Sky Maker is a free, non-commercial fan project.
- It does not include, share, or link to any Pokémon game files. You need your own legally obtained copy.
- Don't share ROM files. Share project files or patches instead.
- Pokémon and Pokémon Mystery Dungeon are trademarks of Nintendo, Creatures, Game Freak, The Pokémon Company, and Spike Chunsoft. This project is not affiliated with or endorsed by them.
