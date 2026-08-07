const dns = require('node:dns');
const net = require('node:net');

if (process.env.HARPA_ADMIN_CLI_NETWORK_ASSERT === '1') {
  const originalConnect = net.Socket.prototype.connect;
  net.Socket.prototype.connect = function assertAdminCliNetworkBeforeConnect(...args) {
    if (dns.getDefaultResultOrder() !== 'ipv4first' || net.getDefaultAutoSelectFamily() !== false) {
      throw new Error('[admin-cli-network-test] database socket opened before IPv4-first policy');
    }
    return Reflect.apply(originalConnect, this, args);
  };
}
