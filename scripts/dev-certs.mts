/**
 * A locally-trusted certificate for the dev server, covering this machine's
 * LAN addresses as well as localhost.
 *
 * `next dev --experimental-https` issues one for localhost, 127.0.0.1 and ::1
 * only — so opening the "Network" URL it prints still shows a warning, since
 * the certificate does not name that address. This asks mkcert for the same
 * hostnames plus whatever IPv4 addresses the machine actually has, which is
 * the set of URLs the dev server answers on.
 *
 * mkcert installs its own root CA into the system trust store the first time,
 * which is what makes the certificate trusted rather than merely present. That
 * step asks for a password.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { devHosts } from '../next.config'

const CERT_DIR = join(process.cwd(), 'certificates')

/** Next caches a downloaded mkcert; use that before asking for an install. */
function findMkcert(): string {
  const cache = join(homedir(), 'Library', 'Caches', 'mkcert')
  if (existsSync(cache)) {
    const binary = readdirSync(cache).find((f) => f.startsWith('mkcert-'))
    if (binary) return join(cache, binary)
  }
  try {
    return execFileSync('which', ['mkcert'], { encoding: 'utf8' }).trim()
  } catch {
    throw new Error(
      'mkcert not found. Run `npm run dev:https` once to have Next download it, ' +
        'or install it with `brew install mkcert`.',
    )
  }
}

const mkcert = findMkcert()
mkdirSync(CERT_DIR, { recursive: true })

// Every address the dev server answers on, so the certificate matches whichever
// one is typed into the browser.
const hosts = ['localhost', '::1', ...devHosts]

console.log('Installing the local root CA (this may ask for your password)…')
execFileSync(mkcert, ['-install'], { stdio: 'inherit' })

console.log('Issuing a certificate for: ' + hosts.join(', '))
execFileSync(
  mkcert,
  [
    '-key-file',
    join(CERT_DIR, 'localhost-key.pem'),
    '-cert-file',
    join(CERT_DIR, 'localhost.pem'),
    ...hosts,
  ],
  { stdio: 'inherit' },
)

console.log('\nDone. `npm run dev:https` will now use it.')
