import geoip from 'geoip-lite'

export interface GeoLocation {
  country: string | null
  city: string | null
  latitude: number | null
  longitude: number | null
}

export function lookupIp(ip: string | undefined | null): GeoLocation {
  if (!ip) return { country: null, city: null, latitude: null, longitude: null }

  // Strip IPv6-mapped IPv4 prefix
  const cleanIp = ip.replace(/^::ffff:/, '')

  // Skip private/local IPs
  if (isPrivateIp(cleanIp)) {
    return { country: null, city: null, latitude: null, longitude: null }
  }

  const geo = geoip.lookup(cleanIp)
  if (!geo) return { country: null, city: null, latitude: null, longitude: null }

  return {
    country: geo.country || null,
    city: geo.city || null,
    latitude: geo.ll?.[0] ?? null,
    longitude: geo.ll?.[1] ?? null,
  }
}

function isPrivateIp(ip: string): boolean {
  return (
    ip === '127.0.0.1' ||
    ip === '::1' ||
    ip === 'localhost' ||
    ip.startsWith('10.') ||
    ip.startsWith('192.168.') ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip)
  )
}
