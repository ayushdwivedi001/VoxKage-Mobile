const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Exclude problematic WebAssembly/binary paths from being watched to avoid fs watcher ENOENT crashes on Windows
config.resolver.blockList = [
  /[\\/]node_modules[\\/]@img[\\/]/,
  /[\\/]node_modules[\\/]@tybys[\\/]/,
].concat(config.resolver.blockList || []);

module.exports = config;
