import dns from 'dns';
import { ZeroconfManager } from './zeroconf.mts';
import { ResolveAPIError, ResolveTimeoutAPIError } from '../core/errors.mts';
const SERVICE_TYPE = '_esphome._tcp.local.';
const RESOLVE_TIMEOUT = 30.0;

// Socket constants that are not exposed in the Node.js types
const AF_INET = 2;
const AF_INET6 = 10;
const SOCK_STREAM = 1;
const IPPROTO_TCP = 6;

export interface Sockaddr {
  address: string;
  port: number;
}

export interface IPv4Sockaddr extends Sockaddr {}

export interface IPv6Sockaddr extends Sockaddr {
  flowinfo: number;
  scope_id: number;
}

export interface AddrInfo {
  family: number;
  type: number;
  proto: number;
  sockaddr: IPv4Sockaddr | IPv6Sockaddr;
}

export function scopeIdToInt(value: string | null): number {
  if (value === null) {
    return 0;
  }
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? 0 : parsed;
}

export function makeServiceInfoForShortHost(host: string): any {
  const serviceName = `${host}.${SERVICE_TYPE}`;
  const server = `${host}.local.`;
  return { type: SERVICE_TYPE, name: serviceName, server };
}

export function serviceInfoToAddrInfo(info: any, port: number): AddrInfo[] {
  const addrs: AddrInfo[] = [];
  for (const ip of info.addresses || []) {
    const isIPv6 = ip.includes(':');
    if (isIPv6) {
      const [address] = ip.split('%');
      if (address) {
        addrs.push({
          family: AF_INET6,
          type: SOCK_STREAM,
          proto: IPPROTO_TCP,
          sockaddr: {
            address,
            port,
            flowinfo: 0,
            scope_id: scopeIdToInt(ip.split('%')[1] || null)
          }
        });
      }
    } else {
      addrs.push({
        family: AF_INET,
        type: SOCK_STREAM,
        proto: IPPROTO_TCP,
        sockaddr: {
          address: ip,
          port
        }
      });
    }
  }
  return addrs;
}

export async function resolveHost(
  hosts: string[],
  port: number,
  zeroconfManager: ZeroconfManager | null = null,
  timeout: number = RESOLVE_TIMEOUT
): Promise<AddrInfo[]> {
  const resolveResults = new Map<string, AddrInfo[]>();
  const exceptions: Error[] = [];
  let manager: ZeroconfManager | null = null;
  let hadZeroconfInstance = false;

  // First try to handle IP addresses directly
  for (const host of hosts) {
    try {
      // Check if host is an IP address
      const parts = host.split('.');
      if (parts.length === 4 && parts.every(part => {
        const num = parseInt(part, 10);
        return !isNaN(num) && num >= 0 && num <= 255;
      })) {
        resolveResults.set(host, [{
          family: AF_INET,
          type: SOCK_STREAM,
          proto: IPPROTO_TCP,
          sockaddr: {
            address: host,
            port
          }
        }]);
        continue;
      }
    } catch (err) {
      // Not an IP address, continue with resolution
    }

    // If it's a local name, try to resolve via mDNS
    if (host.includes('.local') || host.endsWith('.local.')) {
      if (!manager) {
        manager = zeroconfManager || new ZeroconfManager();
        hadZeroconfInstance = manager.hasInstance;
      }

      try {
        const shortHost = host.split('.')[0];
        if (shortHost) {
          const serviceInfo = makeServiceInfoForShortHost(shortHost);
          const addrs = serviceInfoToAddrInfo(serviceInfo, port);
          if (addrs.length > 0) {
            resolveResults.set(host, addrs);
          }
        }
      } catch (err) {
        if (err instanceof Error) {
          exceptions.push(new ResolveAPIError(`Error resolving ${host}: ${err.message}`));
        } else {
          exceptions.push(new ResolveAPIError(`Error resolving ${host}: Unknown error`));
        }
      }
    }
  }

  try {
    // If we haven't resolved all hosts, try DNS resolution
    if (resolveResults.size !== hosts.length) {
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new ResolveTimeoutAPIError(
          `Timeout while resolving IP address for ${hosts}`
        )), timeout * 1000);
      });

      const resolutionPromises = hosts
        .filter(host => !resolveResults.has(host))
        .map(async (host) => {
          try {
            const addresses = await new Promise<dns.LookupAddress[]>((resolve, reject) => {
              dns.lookup(host, { all: true }, (err, addresses) => {
                if (err) reject(err);
                else resolve(addresses);
              });
            });

            const addrs = addresses.map(addr => {
              const isIPv6 = addr.family === 6;
              const address = addr.address;
              if (isIPv6) {
                const [ipv6Address] = address.split('%');
                if (!ipv6Address) return null;
                return {
                  family: AF_INET6,
                  type: SOCK_STREAM,
                  proto: IPPROTO_TCP,
                  sockaddr: {
                    address: ipv6Address,
                    port,
                    flowinfo: 0,
                    scope_id: scopeIdToInt(address.split('%')[1] || null)
                  }
                } as AddrInfo;
              }
              return {
                family: AF_INET,
                type: SOCK_STREAM,
                proto: IPPROTO_TCP,
                sockaddr: {
                  address,
                  port
                }
              } as AddrInfo;
            }).filter((addr): addr is AddrInfo => addr !== null);

            if (addrs.length > 0) {
              resolveResults.set(host, addrs);
            }
          } catch (err) {
            if (err instanceof Error) {
              exceptions.push(new ResolveAPIError(`Error resolving ${host}: ${err.message}`));
            } else {
              exceptions.push(new ResolveAPIError(`Error resolving ${host}: Unknown error`));
            }
          }
        });

      await Promise.race([
        Promise.all(resolutionPromises),
        timeoutPromise
      ]);
    }
  } finally {
    if (manager && !hadZeroconfInstance) {
      await manager.asyncClose();
    }
  }

  const allAddrs = Array.from(resolveResults.values()).flat();
  if (allAddrs.length > 0) {
    return allAddrs;
  }

  if (exceptions.length > 0) {
    throw new ResolveAPIError(exceptions.map(e => e.message).join(', '));
  }

  throw new ResolveAPIError(`Could not resolve hosts ${hosts} - got no results`);
} 