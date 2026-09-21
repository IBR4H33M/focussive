// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// 1. Watch only this package and monorepo workspace dependencies.
// Explicitly exclude root node_modules and backend from watchFolders so
// Windows file watcher does not time out traversing 50,000+ folders.
config.watchFolders = [
  projectRoot,
  path.resolve(workspaceRoot, 'packages/shared'),
  path.resolve(workspaceRoot, 'packages/app-blocker'),
  path.resolve(workspaceRoot, 'packages/installed-apps'),
];

// 2. Let Metro know where to resolve packages and in what order
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// 3. Prevent watcher from crawling native build artifacts and temp caches
const customBlockList = [
  /.*[\\\/]android[\\\/]app[\\\/]build[\\\/].*/,
  /.*[\\\/]android[\\\/]\.gradle[\\\/].*/,
  /.*[\\\/]android[\\\/]build[\\\/].*/,
  /.*[\\\/]\.expo[\\\/].*/,
  /.*[\\\/]\.git[\\\/].*/,
];

if (Array.isArray(config.resolver.blockList)) {
  config.resolver.blockList.push(...customBlockList);
} else if (config.resolver.blockList) {
  config.resolver.blockList = [config.resolver.blockList, ...customBlockList];
} else {
  config.resolver.blockList = customBlockList;
}

module.exports = config;
