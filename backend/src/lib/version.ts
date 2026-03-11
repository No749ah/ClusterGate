import { readFileSync } from 'fs'
import { join } from 'path'

let cachedVersion = ''

export function getVersion(): string {
  if (cachedVersion) return cachedVersion
  try {
    const pkg = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf-8'))
    cachedVersion = pkg.version || '0.0.0'
  } catch {
    cachedVersion = process.env.npm_package_version || '0.0.0'
  }
  return cachedVersion
}
