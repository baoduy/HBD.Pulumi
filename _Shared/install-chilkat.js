const { spawn } = require('child_process');
const { platform, arch } = require('os');
const fs = require('fs');

const npmCmd = platform().startsWith('win') ? 'npm.cmd' : 'npm';

const run = (cmd) =>
  new Promise((solve) => {
    console.log(npmCmd, cmd);
    const ls = spawn(npmCmd, cmd, {
      env: process.env,
      cwd: './',
      stdio: 'inherit',
    });
    ls.on('close', solve);
  });

const getChilkatTool = () => {
  const v = process.version.split('.')[0].replace('v', '');
  const node = v ? `node${v}` : 'node14';

  console.log('installing chilkat for', node);

  if (platform() == 'win32') {
    if (arch() == 'ia32') {
      return `@chilkat/ck-${node}-win-ia32`;
    } else {
      return `@chilkat/ck-${node}-win64`;
    }
  } else if (platform() == 'linux') {
    if (arch() == 'arm') {
      return `@chilkat/ck-${node}-arm`;
    } else if (arch() == 'x86') {
      return `@chilkat/ck-${node}-linux32`;
    } else {
      return `@chilkat/ck-${node}-linux64`;
    }
  } else if (platform() == 'darwin') {
    return `@chilkat/ck-${node}-macosx`;
  }
};

const unstallTool = () => {
  //Uninstall all existing tool from package.json
  const p = JSON.parse(fs.readFileSync('./package.json', 'utf8'));

  Object.keys(p.dependencies)
    .filter((k) => k.startsWith('@chilkat'))
    .forEach((k) => {
      delete p.dependencies[k];
    });

  Object.keys(p.devDependencies)
    .filter((k) => k.startsWith('@chilkat'))
    .forEach((k) => {
      delete p.dependencies[k];
    });

  fs.writeFileSync('./package.json', JSON.stringify(p, null, 2), {
    encoding: 'utf8',
  });
};

(async () => {
  //Uninstall Tool
  unstallTool();

  //Install new package with current os
  await run(['install', getChilkatTool(), '--save']);

  // Delete package-lock.json
  fs.unlink('./package-lock.json',console.error);
})();
