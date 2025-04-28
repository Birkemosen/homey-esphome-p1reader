/**
 * Convert "d4d4da708528" to "d4:d4:da:70:85:28"
 *
 * @param macString
 * @returns
 */
function formatMacString(macString: string): string {
  if (typeof macString !== 'string') {
    throw new TypeError(`Expected \`macString\` to be a string, got ${macString}`);
  }
  const hexStringGroups = macString.match(/.{1,2}/g);
  if (!hexStringGroups) {throw new Error('Could not format MAC address');}
  return hexStringGroups.join(':');
}

/**
 * On Homey Pro (Early 2023) the host property in the discovery result ends with .local, on Homey
 * Pro (Early 2019) it doesn't.
 *
 * @param host
 * @returns
 */
function formatHostname(host: string) {
  if (host.endsWith('.local')) {return host;}
  return `${host}.local`;
}

export { formatHostname, formatMacString };
