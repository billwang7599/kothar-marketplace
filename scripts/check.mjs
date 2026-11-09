// Checks catalog.json: its shape, unique ids, and that every entry's repo exists and its latest release carries what
// Kothar installs, checked as Kothar checks it. node scripts/check.mjs [--offline]
// GITHUB_TOKEN, when set, lifts GitHub's limit of 60 requests an hour.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const offline = process.argv.includes('--offline')
const token = process.env.GITHUB_TOKEN
const ID = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/
const REPO = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}$/
const VERSION = /^\d{1,6}\.\d{1,6}\.\d{1,6}$/
const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/
const TOKENS = ['bg', 'panel', 'raised', 'hover', 'border', 'text', 'muted', 'faint', 'accent', 'on-accent', 'green', 'amber', 'red']
// What a mod may say it uses. Kept in step with MOD_USES in Kothar's packages/core/src/shared.ts.
const USES = ['tools', 'mcpServers', 'instructions', 'permissions', 'transforms', 'events', 'panels', 'commands', 'settings', 'chats', 'setup', 'readChats', 'sendMessages', 'accounts', 'run']
const MOD_API = 1
const MAX_THEME_BYTES = 64 * 1024
const MAX_MANIFEST_BYTES = 64 * 1024
const MAX_MOD_BYTES = 5 * 1024 * 1024

const isRecord = (v) => typeof v === 'object' && v !== null && !Array.isArray(v)

function onlyKeys(value, what, required, optional = []) {
  if (!isRecord(value)) throw new Error(`${what} must be an object`)
  const extra = Object.keys(value).find((k) => !required.includes(k) && !optional.includes(k))
  if (extra !== undefined) throw new Error(`${what} has an unknown field "${extra}"`)
  const missing = required.find((k) => !Object.hasOwn(value, k))
  if (missing !== undefined) throw new Error(`${what} is missing "${missing}"`)
}

function text(value, what, max) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f]/.test(value)) {
    throw new Error(`${what} must be text of 1 to ${max} characters`)
  }
}

function itemFields(value, what) {
  if (!ID.test(value.id ?? '')) throw new Error(`${what} id must be lowercase letters, digits and dashes`)
  if (!VERSION.test(value.version ?? '')) throw new Error(`${what} version must look like 1.2.3`)
  text(value.name, `${what} name`, 40)
  text(value.author, `${what} author`, 60)
  text(value.description, `${what} description`, 200)
}

export function checkEntry(entry, i) {
  const what = `Entry ${i + 1}`
  onlyKeys(entry, what, ['id', 'kind', 'name', 'author', 'description', 'repo'])
  if (!ID.test(entry.id ?? '')) throw new Error(`${what} id must be lowercase letters, digits and dashes`)
  if (entry.kind !== 'theme' && entry.kind !== 'mod') throw new Error(`"${entry.id}" kind must be "theme" or "mod"`)
  text(entry.name, `"${entry.id}" name`, 40)
  text(entry.author, `"${entry.id}" author`, 60)
  text(entry.description, `"${entry.id}" description`, 200)
  if (typeof entry.repo !== 'string' || !REPO.test(entry.repo)) throw new Error(`"${entry.id}" repo must be owner/name`)
}

function checkTheme(theme, id) {
  onlyKeys(theme, 'The theme', ['id', 'name', 'version', 'author', 'description', 'dark', 'light'], ['variants'])
  itemFields(theme, 'The theme')
  if (theme.id !== id) throw new Error(`the theme calls itself "${theme.id}"`)
  if (theme.variants !== undefined) {
    onlyKeys(theme.variants, 'variants', ['dark', 'light'])
    text(theme.variants.dark, 'variants.dark', 30)
    text(theme.variants.light, 'variants.light', 30)
  }
  for (const scheme of ['dark', 'light']) {
    onlyKeys(theme[scheme], `The ${scheme} palette`, TOKENS)
    for (const t of TOKENS) if (!HEX.test(theme[scheme][t] ?? '')) throw new Error(`${scheme} ${t} must be a hex colour`)
  }
}

function checkManifest(manifest, id) {
  onlyKeys(manifest, 'manifest.json', ['id', 'name', 'version', 'author', 'description', 'api', 'uses'])
  itemFields(manifest, 'manifest.json')
  if (manifest.id !== id) throw new Error(`manifest.json calls the mod "${manifest.id}"`)
  if (manifest.api !== MOD_API) throw new Error(`manifest.json api must be ${MOD_API}`)
  if (!Array.isArray(manifest.uses)) throw new Error('manifest.json uses must be a list')
  const unknown = manifest.uses.find((u) => !USES.includes(u))
  if (unknown !== undefined) throw new Error(`manifest.json uses "${unknown}", which isn't one of: ${USES.join(', ')}`)
}

async function github(path) {
  const headers = { accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' }
  if (token) headers.authorization = `Bearer ${token}`
  const response = await fetch(`https://api.github.com${path}`, { headers, signal: AbortSignal.timeout(15_000) })
  if (response.status === 404) return undefined
  if (!response.ok) throw new Error(`GitHub answered ${response.status} for ${path}`)
  return response.json()
}

async function asset(release, name, max) {
  const found = release.assets.find((a) => a.name === name)
  if (!found) throw new Error(`its latest release (${release.tag_name}) has no asset "${name}"`)
  if (found.size > max) throw new Error(`${name} is over ${max} bytes`)
  // Through the API rather than the github.com link, which sometimes answers 504 for minutes at a time.
  const headers = { accept: 'application/octet-stream', 'x-github-api-version': '2022-11-28' }
  if (token) headers.authorization = `Bearer ${token}`
  const response = await fetch(found.url, { headers, signal: AbortSignal.timeout(15_000) })
  if (!response.ok) throw new Error(`downloading ${name} answered ${response.status}`)
  return Buffer.from(await response.arrayBuffer())
}

async function checkRelease(entry) {
  if (!(await github(`/repos/${entry.repo}`))) throw new Error(`the repo ${entry.repo} doesn't exist or isn't public`)
  const release = await github(`/repos/${entry.repo}/releases/latest`)
  if (!release) throw new Error(`${entry.repo} has no published release`)
  if (entry.kind === 'theme') {
    checkTheme(JSON.parse((await asset(release, `${entry.id}.json`, MAX_THEME_BYTES)).toString('utf8')), entry.id)
  } else {
    checkManifest(JSON.parse((await asset(release, 'manifest.json', MAX_MANIFEST_BYTES)).toString('utf8')), entry.id)
    const main = release.assets.find((a) => a.name === 'main.mjs')
    if (!main) throw new Error(`its latest release (${release.tag_name}) has no asset "main.mjs"`)
    if (main.size > MAX_MOD_BYTES) throw new Error(`main.mjs is over ${MAX_MOD_BYTES} bytes`)
  }
  return release.tag_name
}

const file = fileURLToPath(new URL('../catalog.json', import.meta.url))
let failed = 0
const fail = (message) => {
  failed++
  console.error(`FAIL ${message}`)
}
let catalog
try {
  catalog = JSON.parse(readFileSync(file, 'utf8'))
  onlyKeys(catalog, 'catalog.json', ['version', 'entries'])
  if (catalog.version !== 2) throw new Error('catalog.json version must be 2')
  if (!Array.isArray(catalog.entries)) throw new Error('catalog.json entries must be a list')
} catch (error) {
  fail(error.message)
  process.exit(1)
}
const seen = new Set()
for (const [i, entry] of catalog.entries.entries()) {
  try {
    checkEntry(entry, i)
    if (seen.has(entry.id)) throw new Error(`two entries have the id "${entry.id}"`)
    seen.add(entry.id)
    const tag = offline ? 'not fetched' : await checkRelease(entry)
    console.log(`ok   ${entry.kind} ${entry.id} (${entry.repo} ${tag})`)
  } catch (error) {
    fail(`${entry?.id ?? `entry ${i + 1}`}: ${error.message}`)
  }
}
if (failed) process.exit(1)
