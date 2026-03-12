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

// In-memory cache for update check results
let cachedUpdateResult: UpdateCheckResult | null = null

/**
 * Get the cached update check result (lightweight, no external calls).
 */
export function getCachedUpdateStatus(): UpdateCheckResult | null {
  return cachedUpdateResult
}

/**
 * Run update check and cache the result. Used by the cron job.
 */
export async function runScheduledUpdateCheck(): Promise<void> {
  try {
    cachedUpdateResult = await checkForUpdates()
    if (cachedUpdateResult.updateAvailable) {
      const latest = cachedUpdateResult.backend.latestTag || cachedUpdateResult.frontend.latestTag
      logger.info(`Update available: ${CURRENT_VERSION} → ${latest}`)
    }
  } catch (err) {
    logger.error('Scheduled update check failed', { error: (err as Error).message })
  }
}

/**
 * Get a GHCR anonymous token with pull scope for a single repository.
 */
async function getGhcrToken(image: string): Promise<string | null> {
  try {
    const scope = `repository:${image.replace('ghcr.io/', '')}:pull`
    const tokenRes = await axios.get(
      `https://ghcr.io/token?scope=${encodeURIComponent(scope)}`,
      { timeout: 15000 }
    )
    return tokenRes.data.token
  } catch (err: any) {
    logger.warn(`Failed to get GHCR token for ${image}`, { error: err.message, status: err.response?.status })
    return null
  }
}

/**
 * Fetch tags from GHCR using a pre-fetched token.
 */
async function fetchGhcrTags(image: string, token: string): Promise<string[]> {
  try {
    const imagePath = image.replace('ghcr.io/', '')
    const res = await axios.get(
      `https://ghcr.io/v2/${imagePath}/tags/list`,
      {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 15000,
      }
    )
    return res.data.tags || []
  } catch (err: any) {
    logger.warn(`Failed to fetch GHCR tags for ${image}`, { error: err.message })
    return []
  }
}

/**
 * Get the digest of a specific tag from GHCR using a pre-fetched token.
 */
async function fetchGhcrDigest(image: string, tag: string, token: string): Promise<string | null> {
  try {
    const imagePath = image.replace('ghcr.io/', '')
    const res = await axios.head(
      `https://ghcr.io/v2/${imagePath}/manifests/${tag}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.docker.distribution.manifest.v2+json, application/vnd.oci.image.index.v1+json',
        },
        timeout: 15000,
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
  // Separate tokens per repo — multi-scope anonymous tokens can fail on GHCR
  const [backendToken, frontendToken] = await Promise.all([
    getGhcrToken(BACKEND_IMAGE),
    getGhcrToken(FRONTEND_IMAGE),
  ])

  const now = new Date().toISOString()

  if (!backendToken && !frontendToken) {
    logger.warn('Failed to get any GHCR tokens — cannot check for updates')
    return {
      currentVersion: CURRENT_VERSION,
      backend: { image: BACKEND_IMAGE, currentTag: CURRENT_VERSION, latestTag: null, latestDigest: null, updateAvailable: false, checkedAt: now },
      frontend: { image: FRONTEND_IMAGE, currentTag: CURRENT_VERSION, latestTag: null, latestDigest: null, updateAvailable: false, checkedAt: now },
      updateAvailable: false,
      releaseUrl: null,
      checkedAt: now,
    }
  }

  const [backendTags, frontendTags] = await Promise.all([
    backendToken ? fetchGhcrTags(BACKEND_IMAGE, backendToken) : [],
    frontendToken ? fetchGhcrTags(FRONTEND_IMAGE, frontendToken) : [],
  ])

  logger.info('GHCR tags fetched', {
    backendTags: backendTags.length,
    frontendTags: frontendTags.length,
    backendSample: backendTags.slice(0, 5),
    frontendSample: frontendTags.slice(0, 5),
  })

  const latestBackendTag = findLatestSemverTag(backendTags)
  const latestFrontendTag = findLatestSemverTag(frontendTags)

  const [backendDigest, frontendDigest] = await Promise.all([
    latestBackendTag && backendToken ? fetchGhcrDigest(BACKEND_IMAGE, latestBackendTag, backendToken) : null,
    latestFrontendTag && frontendToken ? fetchGhcrDigest(FRONTEND_IMAGE, latestFrontendTag, frontendToken) : null,
  ])

  const backendUpdateAvailable = latestBackendTag
    ? isNewerVersion(CURRENT_VERSION, latestBackendTag)
    : false

  const frontendUpdateAvailable = latestFrontendTag
    ? isNewerVersion(CURRENT_VERSION, latestFrontendTag)
    : false

  const latestTag = latestBackendTag || latestFrontendTag
  const releaseUrl = latestTag
    ? `https://github.com/${GHCR_OWNER}/ClusterGate/releases/tag/v${latestTag.replace(/^v/, '')}`
    : null

  const result: UpdateCheckResult = {
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

  // Update cache whenever a check completes
  cachedUpdateResult = result
  return result
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
 * Update a Kubernetes deployment by setting the new image tag on all containers
 * and adding a restart annotation. This forces K8s to pull the new image.
 * Returns the new metadata.generation so we can track when the rollout starts.
 */
async function updateK8sDeployment(namespace: string, deploymentName: string, newImage: string, newTag: string): Promise<number> {
  const token = getK8sToken()
  if (!token) throw new Error('Kubernetes service account token not found')

  const https = require('https')
  const ca = readFileSync(K8S_CA_PATH)
  const httpsAgent = new https.Agent({ ca })

  const base = getK8sApiBase()
  const url = `${base}/apis/apps/v1/namespaces/${namespace}/deployments/${deploymentName}`

  // First, get the current deployment to find container names
  const current = await axios.get(url, {
    headers: { Authorization: `Bearer ${token}` },
    httpsAgent,
    timeout: 15000,
  })
  const containers = current.data.spec.template.spec.containers || []

  // Build container image patches — update all containers to the new tag
  const containerPatches = containers.map((c: any) => ({
    name: c.name,
    image: `${newImage}:${newTag}`,
  }))

  // Strategic merge patch: update image tags + restart annotation
  const patch: any = {
    spec: {
      template: {
        metadata: {
          annotations: {
            'kubectl.kubernetes.io/restartedAt': new Date().toISOString(),
          },
        },
        spec: {
          containers: containerPatches,
        },
      },
    },
  }

  const patchRes = await axios.patch(url, patch, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/strategic-merge-patch+json',
    },
    httpsAgent,
    timeout: 15000,
  })

  // Return the new generation — K8s increments this on every spec change
  return patchRes.data.metadata.generation
}

/**
 * Wait for a K8s deployment rollout to complete by polling its status.
 * Uses the deployment generation to ensure we're tracking the NEW rollout,
 * not the old pods that are still running.
 *
 * The logic mirrors `kubectl rollout status`:
 *  1. Wait for observedGeneration >= targetGeneration (controller acknowledged change)
 *  2. Wait for updatedReplicas == desired (all pods running new image)
 *  3. Wait for availableReplicas == desired (new pods passed readiness)
 *  4. Wait for status.replicas == desired (old pods fully terminated)
 */
async function waitForRollout(
  namespace: string,
  deploymentName: string,
  targetGeneration: number,
  timeoutMs = 180000,
  onStatus?: (msg: string) => void
): Promise<{ ready: boolean; message: string }> {
  const token = getK8sToken()
  if (!token) return { ready: false, message: 'No service account token' }

  const https = require('https')
  const ca = readFileSync(K8S_CA_PATH)
  const httpsAgent = new https.Agent({ ca })
  const base = getK8sApiBase()
  const url = `${base}/apis/apps/v1/namespaces/${namespace}/deployments/${deploymentName}`

  const start = Date.now()
  const pollInterval = 3000

  while (Date.now() - start < timeoutMs) {
    try {
      const res = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
        httpsAgent,
        timeout: 10000,
      })
      const dep = res.data
      const status = dep.status
      const spec = dep.spec
      const desired = spec.replicas || 1
      const observedGeneration = status.observedGeneration || 0
      const updated = status.updatedReplicas || 0
      const available = status.availableReplicas || 0
      const ready = status.readyReplicas || 0
      const totalReplicas = status.replicas || 0
      const unavailable = status.unavailableReplicas || 0

      // Check if the controller has seen our change yet
      if (observedGeneration < targetGeneration) {
        const msg = `${deploymentName}: waiting for controller to pick up changes...`
        logger.info(msg)
        if (onStatus) onStatus(msg)
        await new Promise(r => setTimeout(r, pollInterval))
        continue
      }

      // All conditions met: new pods updated, available, ready, and old pods gone
      if (
        updated >= desired &&
        available >= desired &&
        ready >= desired &&
        totalReplicas <= desired &&
        unavailable === 0
      ) {
        return { ready: true, message: `${deploymentName}: ${ready}/${desired} new pods ready` }
      }

      // Report detailed progress
      let msg: string
      if (updated < desired) {
        msg = `${deploymentName}: ${updated}/${desired} new pods created`
      } else if (totalReplicas > desired) {
        msg = `${deploymentName}: ${totalReplicas - desired} old pod(s) terminating`
      } else if (available < desired) {
        msg = `${deploymentName}: ${available}/${desired} new pods available (waiting for readiness)`
      } else {
        msg = `${deploymentName}: ${ready}/${desired} ready, ${unavailable} unavailable`
      }
      logger.info(msg)
      if (onStatus) onStatus(msg)
    } catch (err: any) {
      logger.warn(`Rollout status check failed for ${deploymentName}`, { error: err.message })
      if (onStatus) onStatus(`${deploymentName}: checking status...`)
    }
    await new Promise(r => setTimeout(r, pollInterval))
  }

  return { ready: false, message: `${deploymentName}: rollout timed out after ${timeoutMs / 1000}s` }
}

/**
 * Progress callback for streaming update status to the client.
 */
export type UpdateProgressCallback = (event: {
  step: number
  totalSteps: number
  label: string
  status: 'running' | 'done' | 'error'
  message?: string
}) => void

/**
 * Apply update based on deployment environment.
 * Calls onProgress for each step so the frontend can show real-time progress.
 */
export async function pullAndRestart(onProgress?: UpdateProgressCallback): Promise<{
  success: boolean
  message: string
  environment: string
}> {
  const env = detectEnvironment()
  const emit = onProgress || (() => {})

  if (env === 'kubernetes') {
    const namespace = process.env.K8S_NAMESPACE || 'clustergate'
    const backendDeployment = process.env.K8S_BACKEND_DEPLOYMENT || 'clustergate-backend'
    const frontendDeployment = process.env.K8S_FRONTEND_DEPLOYMENT || 'clustergate-frontend'
    const totalSteps = 6

    try {
      // Step 1: Check for available updates and get target versions
      emit({ step: 1, totalSteps, label: 'Checking for latest versions', status: 'running' })
      const updateInfo = cachedUpdateResult || await checkForUpdates()
      const backendTag = updateInfo.backend.latestTag || CURRENT_VERSION
      const frontendTag = updateInfo.frontend.latestTag || CURRENT_VERSION
      if (!updateInfo.updateAvailable) {
        emit({ step: 1, totalSteps, label: 'Already running the latest version', status: 'done' })
        return { success: true, environment: 'kubernetes', message: 'Already up to date.' }
      }
      emit({ step: 1, totalSteps, label: `Updating to backend:${backendTag} frontend:${frontendTag}`, status: 'done' })

      // Step 2: Update frontend deployment image tag
      emit({ step: 2, totalSteps, label: `Updating frontend image to ${frontendTag}`, status: 'running' })
      const frontendGeneration = await updateK8sDeployment(namespace, frontendDeployment, FRONTEND_IMAGE, frontendTag)
      emit({ step: 2, totalSteps, label: `Frontend image set to ${frontendTag}`, status: 'done' })

      // Step 3: Wait for frontend rollout (track new generation to avoid false-positive from old pods)
      emit({ step: 3, totalSteps, label: 'Waiting for frontend pods to roll out', status: 'running' })
      const frontendResult = await waitForRollout(namespace, frontendDeployment, frontendGeneration, 180000, (msg) => {
        emit({ step: 3, totalSteps, label: msg, status: 'running' })
      })
      if (!frontendResult.ready) {
        emit({ step: 3, totalSteps, label: frontendResult.message, status: 'error' })
        return { success: false, environment: 'kubernetes', message: frontendResult.message }
      }
      emit({ step: 3, totalSteps, label: frontendResult.message, status: 'done' })

      // Step 4: Update backend deployment image tag
      emit({ step: 4, totalSteps, label: `Updating backend image to ${backendTag}`, status: 'running' })
      const backendGeneration = await updateK8sDeployment(namespace, backendDeployment, BACKEND_IMAGE, backendTag)
      emit({ step: 4, totalSteps, label: `Backend image set to ${backendTag}`, status: 'done' })

      // Step 5: Wait for backend rollout (will likely kill this process as the pod gets replaced)
      emit({ step: 5, totalSteps, label: 'Waiting for backend pods — connection may drop', status: 'running' })
      const backendResult = await waitForRollout(namespace, backendDeployment, backendGeneration, 180000, (msg) => {
        emit({ step: 5, totalSteps, label: msg, status: 'running' })
      })
      emit({ step: 5, totalSteps, label: backendResult.ready ? backendResult.message : 'Backend restarting — connection may drop', status: backendResult.ready ? 'done' : 'running' })

      // Step 6: Complete
      emit({ step: 6, totalSteps, label: 'Update complete', status: 'done' })

      return {
        success: true,
        environment: 'kubernetes',
        message: `Update complete. Running backend:${backendTag} frontend:${frontendTag}.`,
      }
    } catch (err: any) {
      const status = err.response?.status
      const msg = status === 403
        ? 'RBAC permission denied. Ensure the backend ServiceAccount has patch/get access to deployments.'
        : `Update failed: ${err.message}`
      logger.error('Kubernetes update failed', { error: err.message, status })
      emit({ step: 0, totalSteps, label: msg, status: 'error', message: msg })
      return { success: false, environment: 'kubernetes', message: msg }
    }
  }

  if (env === 'docker') {
    const totalSteps = 3
    try {
      const dockerBase = `http://localhost/v1.43`
      const client = axios.create({
        socketPath: DOCKER_SOCKET,
        baseURL: dockerBase,
        timeout: 120000,
      })

      emit({ step: 1, totalSteps, label: 'Connecting to Docker', status: 'running' })
      await client.get('/info')
      emit({ step: 1, totalSteps, label: 'Docker connected', status: 'done' })

      emit({ step: 2, totalSteps, label: 'Pulling latest images', status: 'running' })
      await client.post(`/images/create`, null, { params: { fromImage: BACKEND_IMAGE, tag: 'latest' } })
      emit({ step: 2, totalSteps, label: 'Backend image pulled', status: 'running' })
      await client.post(`/images/create`, null, { params: { fromImage: FRONTEND_IMAGE, tag: 'latest' } })
      emit({ step: 2, totalSteps, label: 'All images pulled', status: 'done' })

      emit({ step: 3, totalSteps, label: 'Images ready — run "docker compose up -d"', status: 'done' })

      return { success: true, environment: 'docker', message: 'Images pulled. Run "docker compose up -d" to apply.' }
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        emit({ step: 1, totalSteps, label: 'Docker socket not available', status: 'error' })
        return { success: false, environment: 'docker', message: 'Docker socket not mounted. Run "docker compose pull && docker compose up -d".' }
      }
      emit({ step: 0, totalSteps, label: `Failed: ${err.message}`, status: 'error' })
      return { success: false, environment: 'docker', message: `Update failed: ${err.message}` }
    }
  }

  // Standalone
  emit({ step: 1, totalSteps: 1, label: 'Manual update required', status: 'done' })
  return { success: true, environment: 'standalone', message: 'Pull the latest images and restart the services manually.' }
}
