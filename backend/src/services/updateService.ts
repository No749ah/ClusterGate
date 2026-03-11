import axios from 'axios'
import { readFileSync } from 'fs'
import { logger } from '../lib/logger'
import { getVersion } from '../lib/version'

const GHCR_OWNER = 'no749ah'
const BACKEND_IMAGE = `ghcr.io/${GHCR_OWNER}/clustergate-backend`
const FRONTEND_IMAGE = `ghcr.io/${GHCR_OWNER}/clustergate-frontend`

const CURRENT_VERSION = getVersion()

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
  releaseUrl: string | null
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

  const latestTag = latestBackendTag || latestFrontendTag
  const releaseUrl = latestTag
    ? `https://github.com/${GHCR_OWNER}/ClusterGate/releases/tag/v${latestTag.replace(/^v/, '')}`
    : null

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
    releaseUrl,
    checkedAt: now,
  }
}

/**
 * Detect runtime environment.
 */
function detectEnvironment(): 'kubernetes' | 'docker' | 'standalone' {
  if (process.env.KUBERNETES_SERVICE_HOST) return 'kubernetes'
  try {
    const fs = require('fs')
    if (fs.existsSync('/.dockerenv') || fs.existsSync('/run/.containerenv')) return 'docker'
  } catch {}
  return 'standalone'
}

/**
 * Read the in-cluster Kubernetes service account token.
 */
function getK8sToken(): string | null {
  try {
    return readFileSync('/var/run/secrets/kubernetes.io/serviceaccount/token', 'utf-8').trim()
  } catch {
    return null
  }
}

/**
 * Get the in-cluster Kubernetes CA cert path.
 */
const K8S_CA_PATH = '/var/run/secrets/kubernetes.io/serviceaccount/ca.crt'

/**
 * Build Kubernetes API base URL from in-cluster env vars.
 */
function getK8sApiBase(): string {
  const host = process.env.KUBERNETES_SERVICE_HOST
  const port = process.env.KUBERNETES_SERVICE_PORT || '443'
  return `https://${host}:${port}`
}

/**
 * Trigger a rolling restart of a Kubernetes deployment by patching
 * the pod template annotation with the current timestamp.
 */
async function restartK8sDeployment(namespace: string, deploymentName: string, newTag?: string): Promise<void> {
  const token = getK8sToken()
  if (!token) throw new Error('Kubernetes service account token not found')

  const https = require('https')
  const ca = readFileSync(K8S_CA_PATH)
  const httpsAgent = new https.Agent({ ca })

  const base = getK8sApiBase()
  const url = `${base}/apis/apps/v1/namespaces/${namespace}/deployments/${deploymentName}`

  // Strategic merge patch to update the restart annotation and optionally the image tag
  const patch: any = {
    spec: {
      template: {
        metadata: {
          annotations: {
            'kubectl.kubernetes.io/restartedAt': new Date().toISOString(),
          },
        },
      },
    },
  }

  await axios.patch(url, patch, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/strategic-merge-patch+json',
    },
    httpsAgent,
    timeout: 15000,
  })
}

/**
 * Apply update based on deployment environment.
 */
export async function pullAndRestart(): Promise<{
  success: boolean
  message: string
  environment: string
  instructions: string[]
}> {
  const env = detectEnvironment()

  if (env === 'kubernetes') {
    const namespace = process.env.K8S_NAMESPACE || 'clustergate'
    const backendDeployment = process.env.K8S_BACKEND_DEPLOYMENT || 'clustergate-backend'
    const frontendDeployment = process.env.K8S_FRONTEND_DEPLOYMENT || 'clustergate-frontend'

    try {
      logger.info('Triggering Kubernetes rolling restart...', { namespace, backendDeployment, frontendDeployment })

      await restartK8sDeployment(namespace, backendDeployment)
      await restartK8sDeployment(namespace, frontendDeployment)

      logger.info('Rolling restart triggered successfully')

      return {
        success: true,
        environment: 'kubernetes',
        message: `Rolling restart triggered for ${backendDeployment} and ${frontendDeployment}. Pods will be recreated with the latest image (pullPolicy: Always).`,
        instructions: [
          `kubectl -n ${namespace} rollout status deployment/${backendDeployment}`,
          `kubectl -n ${namespace} rollout status deployment/${frontendDeployment}`,
        ],
      }
    } catch (err: any) {
      const status = err.response?.status
      const msg = status === 403
        ? 'RBAC permission denied. Ensure the backend ServiceAccount has patch access to deployments.'
        : `Rolling restart failed: ${err.message}`
      logger.error('Kubernetes rolling restart failed', { error: err.message, status })
      return {
        success: false,
        environment: 'kubernetes',
        message: msg,
        instructions: [
          `# Manual alternative:`,
          `kubectl -n ${namespace} rollout restart deployment/${backendDeployment} deployment/${frontendDeployment}`,
        ],
      }
    }
  }

  if (env === 'docker') {
    try {
      const dockerBase = `http://localhost/v1.43`
      const client = axios.create({
        socketPath: DOCKER_SOCKET,
        baseURL: dockerBase,
        timeout: 120000,
      })

      await client.get('/info')

      logger.info('Pulling latest backend image...')
      await client.post(`/images/create`, null, {
        params: { fromImage: BACKEND_IMAGE, tag: 'latest' },
      })

      logger.info('Pulling latest frontend image...')
      await client.post(`/images/create`, null, {
        params: { fromImage: FRONTEND_IMAGE, tag: 'latest' },
      })

      logger.info('Images pulled successfully.')

      return {
        success: true,
        environment: 'docker',
        message: 'Images pulled successfully. Recreate containers to apply the update.',
        instructions: [
          `docker compose pull`,
          `docker compose up -d`,
        ],
      }
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        return {
          success: true,
          environment: 'docker',
          message: 'Docker socket not mounted. Pull images manually.',
          instructions: [
            `docker compose pull`,
            `docker compose up -d`,
          ],
        }
      }
      logger.error('Pull and restart failed', { error: err.message })
      return {
        success: false,
        environment: 'docker',
        message: `Update failed: ${err.message}`,
        instructions: [
          `docker compose pull`,
          `docker compose up -d`,
        ],
      }
    }
  }

  // Standalone / unknown
  return {
    success: true,
    environment: 'standalone',
    message: 'Pull the latest images and restart the services.',
    instructions: [
      `docker pull ${BACKEND_IMAGE}:latest`,
      `docker pull ${FRONTEND_IMAGE}:latest`,
    ],
  }
}
