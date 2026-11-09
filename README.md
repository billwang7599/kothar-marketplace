# Kothar marketplace

The catalog behind **Settings → Marketplace** in [Kothar](https://github.com/billwang7599/kothar). It holds pointers
only: each entry names a GitHub repo, and everything Kothar installs comes from that repo's latest release. Authors own
their work in their own repos; nothing is ever copied here.

This works like Obsidian's community catalog: a person reviews an entry once, when it's submitted. After that, each new
release the author publishes reaches users as an **Update** on the Marketplace page, without another review.

## The catalog

`catalog.json`:

```json
{
  "version": 2,
  "entries": [
    {
      "id": "nord",
      "kind": "theme",
      "name": "Nord",
      "author": "Kothar",
      "description": "The Nord palette by Arctic Ice Studio.",
      "repo": "billwang7599/kothar-themes"
    }
  ]
}
```

| Field | Rule |
|---|---|
| `id` | Lowercase letters, digits and dashes, unique in the catalog. Must match the id in the release. |
| `kind` | `theme` or `mod`. |
| `name` | Up to 40 characters. |
| `author` | Up to 60 characters. |
| `description` | One line, up to 200 characters. |
| `repo` | `owner/name` of a public GitHub repo with at least one published (not draft, not pre-) release. |

## What a release must carry

**A theme:** an asset named `<id>.json`, the theme file itself. One release may carry many themes, as
[kothar-themes](https://github.com/billwang7599/kothar-themes) does. Its README is the theme template and lists the
format. A theme can only change colours: Kothar refuses any file with fields it doesn't know or a colour that isn't
hex.

**A mod:** two assets, `manifest.json` and `main.mjs`. One mod per repo. Start from the template
[kothar-sample-mod](https://github.com/billwang7599/kothar-sample-mod), which builds and releases both for you.

`manifest.json`:

```json
{
  "id": "word-count",
  "name": "Word count",
  "version": "1.0.0",
  "author": "Your Name",
  "description": "Counts the words in each reply.",
  "api": 1,
  "uses": ["events", "panels"]
}
```

- `api`: the version of Kothar's mod API the mod is written for. Today that's `1`.
- `uses`: everything the mod does through the mod API. Kothar shows this list before anyone installs the mod, and
  refuses to start a mod that does something it didn't list. The values:

  | Value | Shown to the user as | What it covers in the mod API |
  |---|---|---|
  | `tools` | Gives agents tools | `tools` |
  | `mcpServers` | Starts MCP servers for agents | `mcpServers` |
  | `instructions` | Adds to every agent's instructions | `instructions` |
  | `permissions` | Approves or denies agents' requests for you | `onPermissionRequested` |
  | `transforms` | Rewrites your messages or agents' replies | `transformMessage`, `transformOutput` |
  | `events` | Watches chats as they run | `onEvent`, `onTurnStarted`, `onTurnCompleted`, `onStatusChanged`, `onSessionEnded`, `onChatCreated`, `onChatRemoved`, `onChatArchived`, `onLimitReached` |
  | `panels` | Adds panels | `panels` |
  | `commands` | Adds commands | `commands` |
  | `settings` | Has settings | `settings` |
  | `chats` | Adds chats of its own | `chats` |
  | `setup` | Installs software it needs | `setup` |
  | `readChats` | Reads your chats | `host.chats`, `host.chat`, `host.read`, `host.space` |
  | `sendMessages` | Sends messages and starts chats as you | `host.send`, `host.createChat`, `host.retry`, `host.continue`, `host.interrupt` |
  | `accounts` | Sees and switches your engine accounts | `host.accounts`, `host.useAccount` |
  | `run` | Runs programs on your computer | `host.run`, `host.spawn` |

  `host.note`, `host.storage` and `host.refresh` need nothing listed.

## Submit a theme or mod

1. Publish a release in your own repo that carries the assets above. Check it installs: in Kothar, **Settings →
   Marketplace → Install from folder…** installs a folder on your computer as "local", without publishing anything.
2. Open a PR here that adds one entry to `catalog.json`. Keep entries sorted by `name`.
3. The **Check** workflow validates the entry, that the repo exists, and that its latest release carries valid assets.
4. A maintainer reviews it. For a mod that means reading its source and checking that `uses` is honest.

To ship an update, publish a new release with a higher `version`. You don't need a PR here. To rename or remove an
entry, open a PR.

## What review does and doesn't promise

- **Themes** are data. Kothar checks every theme file itself, so a theme can never do more than change colours,
  however many updates it ships.
- **Mods are code** and run with your permissions, like Obsidian's plugins. Kothar enforces `uses` for everything a mod
  does through the mod API, but it can't sandbox the mod: a mod could still read files or reach the network with
  Node's own APIs. Review covers the first release only. Kothar never updates a mod by itself: you press **Update**,
  and an update that lists more in `uses` than the version you have is turned off until you turn it on again.
- Community mods are off when installed. Turn each one on yourself in **Settings → Community mods**.

Report a harmful theme or mod by opening an issue here. Removing its entry stops new installs; tell users to uninstall
it.

## Checking locally

```sh
node scripts/check.mjs            # everything, including each repo's latest release
node scripts/check.mjs --offline  # the catalog's shape only
```

`GITHUB_TOKEN` lifts GitHub's limit of 60 requests an hour.
