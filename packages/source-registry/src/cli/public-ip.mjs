import { BlockList, isIP } from "node:net";

const blockedAddresses = new BlockList();

for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
]) {
  blockedAddresses.addSubnet(network, prefix, "ipv4");
}

for (const [network, prefix] of [
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
]) {
  blockedAddresses.addSubnet(network, prefix, "ipv6");
}

blockedAddresses.addAddress("::", "ipv6");
blockedAddresses.addAddress("::1", "ipv6");

export function isPublicIpAddress(address) {
  const version = isIP(address);
  if (version === 0) return false;
  return !blockedAddresses.check(address, version === 4 ? "ipv4" : "ipv6");
}
