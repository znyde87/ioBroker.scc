/**
 * Syncs version from package.json to io-package.json (common.version).
 * Runs automatically on `npm version patch|minor|major`.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const pkgPath = path.join(root, 'package.json');
const ioPkgPath = path.join(root, 'io-package.json');

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const version = pkg.version;
if (!version) {
  console.error('sync-version: no version in package.json');
  process.exit(1);
}

const ioPkg = JSON.parse(fs.readFileSync(ioPkgPath, 'utf8'));
if (ioPkg.common && ioPkg.common.version === version) {
  console.log('sync-version: io-package.json already has version', version);
  process.exit(0);
}

ioPkg.common = ioPkg.common || {};
ioPkg.common.version = version;
fs.writeFileSync(ioPkgPath, JSON.stringify(ioPkg, null, 2) + '\n', 'utf8');
console.log('sync-version: set io-package.json common.version to', version);
