import axios from 'axios'
import { logger } from '../lib/logger'

const GHCR_OWNER = 'no749ah'
const BACKEND_IMAGE = `ghcr.io/${GHCR_OWNER}/clustergate-backend`
const FRONTEND_IMAGE = `ghcr.io/${GHCR_OWNER}/clustergate-frontend`
const CURRENT_VERSION = process.env.npm_package_version || '1.0.0'

// Docker socket path (mounted from host)
const DOCKER_SOCKET = '/var/run/docker.sock'

interface ImageVersionInfo {
  image: string
  currentTag: string
  latestTag: string | null
  latestDigest: string | null
  updateAvailable: boolean
  checkedAt: string
}

export interface UpdateCheckResult {
  currentVersion: string
  backend: ImageVersionInfo
  frontend: ImageVersionInfo
  updateAvailable: boolean
  checkedAt: string
}

/**
 * Fetch tags from GHCR (GitHub Container Registry) using the OCI distribution API.
 * GHCR supports anonymous pulls for public packages.
 */
async function fetchGhcrTags(image: string): Promise<string[]> {
  try {
    // GHCR uses ghcr.io/v2/<owner>/<name>/tags/list
    const imagePath = image.replace('ghcr.io/', '')
    // First get an anonymous token
    const tokenRes = await axios.get(
      `https://ghcr.io/token?scope=repository:${imagePath}:pull`,
      { timeout: 10000 }
    )
    const token = tokenRes.data.token

    const res = await axios.get(
      `https://ghcr.io/v2/${imagePath}/tags/list`,
      {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 10000,
      }
    )
    return res.data.tags || []
  } catch (err: any) {
    logger.warn(`Failed to fetch GHCR tags for ${image}`, { error: err.message })
    return []
  }
}

/**
 * Get the digest of a specific tag from GHCR.
 */
async function fetchGhcrDigest(image: string, tag: string): Promise<string | null> {
  try {
    const imagePath = image.replace('ghcr.io/', '')
    const tokenRes = await axios.get(
      `https://ghcr.io/token?scope=repository:${imagePath}:pull`,
      { timeout: 10000 }
    )
    const token = tokenRes.data.token

    const res = await axios.head(
      `https://ghcr.io/v2/${imagePath}/manifests/${tag}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.docker.distribution.manifest.v2+json, application/vnd.oci.image.index.v1+json',
        },
        timeout: 10000,
      }
    )
    return res.headers['docker-content-digest'] || null
  } catch (err: any) {
    logger.warn(`Failed to fetch digest for ${image}:${tag}`, { error: err.message })
    return null
  }
}

/**
 * Parse semver tags and find the latest one.
 */
function findLatestSemverTag(tags: string[]): string | null {
  const semverTags = tags
    .filter((t) => /^v?\d+\.\d+\.\d+$/.test(t))
    .map((t) => {
      const clean = t.replace(/^v/, '')
      const [major, minor, patch] = clean.split('.').map(Number)
      return { tag: t, major, minor, patch }
    })
    .sort((a, b) => {
      if (a.major !== b.major) return b.major - a.major
      if (a.minor !== b.minor) return b.minor - a.minor
      return b.patch - a.patch
    })

  return semverTags.length > 0 ? semverTags[0].tag : null
}

/**
 * Compare two semver strings. Returns true if remote > local.
 */
function isNewerVersion(local: string, remote: string): boolean {
  const parse = (v: string) => {
    const clean = v.replace(/^v/, '')
    const [major, minor, patch] = clean.split('.').map(Number)
    return { major, minor, patch }
  }
  const l = parse(local)
  const r = parse(remote)
  if (r.major !== l.major) return r.major > l.major
  if (r.minor !== l.minor) return r.minor > l.minor
  return r.patch > l.patch
}

/**
 * Check GHCR for newer image versions.
 */
export async function checkForUpdates(): Promise<UpdateCheckResult> {
  const [backendTags, frontendTags] = await Promise.all([
    fetchGhcrTags(BACKEND_IMAGE),
    fetchGhcrTags(FRONTEND_IMAGE),
  ])

  const latestBackendTag = findLatestSemverTag(backendTags)
  const latestFrontendTag = findLatestSemverTag(frontendTags)

  const [backendDigest, frontendDigest] = await Promise.all([
    latestBackendTag ? fetchGhcrDigest(BACKEND_IMAGE, latestBackendTag) : null,
    latestFrontendTag ? fetchGhcrDigest(FRONTEND_IMAGE, latestFrontendTag) : null,
  ])

  const backendUpdateAvailable = latestBackendTag
    ? isNewerVersion(CURRENT_VERSION, latestBackendTag)
    : false

  const frontendUpdateAvailable = latestFrontendTag
    ? isNewerVersion(CURRENT_VERSION, latestFrontendTag)
    : false

  const now = new Date().toISOString()

  return {
    currentVersion: CURRENT_VERSION,
    backend: {
      image: BACKEND_IMAGE,
      currentTag: CURRENT_VERSION,
      latestTag: latestBackendTag,
      latestDigest: backendDigest,
      updateAvailable: backendUpdateAvailable,
    checkedAt: now,
    },
    frontend: {
      image: FRONTEND_IMAGE,
      currentTag: CURRENT_VERSION,
      latestTag: latestFrontendTag,
      latestDigest: frontendDigest,
      updateAvailable: frontendUpdateAvailable,
      checkedAt: now,
    },
    updateAvailable: backendUpdateAvailable || frontendUpdateAvailable,
    checkedAt: now,
  }
}

/**
 * Pull the latest images and restart containers via the Docker socket.
 */
export async function pullAndRestart(): Promise<{ success: boolean; message: string }> {
  try {
    // Check if Docker socket is accessible
    const dockerBase = `http://localhost/v1.43`
    const client = axios.create({
      socketPath: DOCKER_SOCKET,
      baseURL: dockerBase,
      timeout: 120000,
    })

    // Test connection
    await client.get('/info')

    // Pull latest images
    logger.info('Pulling latest backend image...')
    await client.post(`/images/create`, null, {
      params: { fromImage: BACKEND_IMAGE, tag: 'latest' },
    })

    logger.info('Pulling latest frontend image...')
    await client.post(`/images/create`, null, {
      params: { fromImage: FRONTEND_IMAGE, tag: 'latest' },
    })

    logger.info('Images pulled successfully. Containers need to be recreated.')

    return {
      success: true,
      message: 'Images pulled successfully. Please run "docker compose up -d" to recreate containers with the new images, or use your orchestrator to rolling-restart the services.',
    }
  } catch (err: any) {
    const msg = err.code === 'ENOENT'
      ? 'Docker socket not available. Mount /var/run/docker.sock to enable updates.'
      : `Update failed: ${err.message}`
    logger.error('Pull and restart failed', { error: err.message })
    return { success: false, message: msg }
  }
}
