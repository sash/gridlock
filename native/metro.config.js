const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
// ship the single-file game build as a bundled asset
config.resolver.assetExts.push('html');

module.exports = config;
