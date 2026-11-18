import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Dedicated account directory only. Reuse existing state without permission changes.
export function privateBrowserProfile(home = os.homedir()) {
  const uid = process.getuid?.();
  if (!Number.isInteger(uid)) throw Error('Private browser profile requires POSIX ownership');
  const check = directory => {
    const stat = fs.lstatSync(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== uid || (stat.mode & 0o077))
      throw Error('Browser profile directory must be private and owned by the browser account');
  };
  check(home);
  let current = home;
  for (const component of ['.local', 'share', 'vortex-commander', 'chrome-profile']) {
    current = path.join(current, component);
    try {
      fs.mkdirSync(current, { mode: 0o700 });
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
    check(current);
  }
  return current;
}
