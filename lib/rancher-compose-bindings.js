'use strict';

const Bluebird = require('bluebird');
const exec = Bluebird.promisify(require('child_process').exec, { multiArgs: true });
const tmp = require('tmp');
const fs = require('fs');
const path = require('path');
const argv = require('./argv');
const api = require('./rancher-api-v1');

Bluebird.promisifyAll(tmp, { multiArgs: true });
Bluebird.promisifyAll(fs);

let p;
let cleanupCallback;

const composeBindings = {
  cleanup: () => {
    if (cleanupCallback) {
      cleanupCallback();
    }
  },
  updateStack: (docker, rancher) => Promise.resolve()
  .then(() => {
    console.info('Updating stack');

    if (p) {
      return Promise.resolve([p, cleanupCallback]);
    }
    return tmp.dirAsync({ unsafeCleanup: true });
  })
  .then((dir) => {
    p = dir[0];
    cleanupCallback = dir[1];
    return Promise.all([
      fs.writeFileAsync(path.resolve(p, 'docker-compose.yml'), docker),
      fs.writeFileAsync(path.resolve(p, 'rancher-compose.yml'), rancher),
    ]);
  })
  .then(() => {
    const cmd = `rancher-compose -p ${argv.service} --url https://rancher.entrecode.de up -d -u --batch-size 1 --interval 5000`;
    console.info('exec:', cmd);
    return exec(cmd, {
      cwd: p,
      env: {
        RANCHER_ACCESS_KEY: argv.accessKey,
        RANCHER_SECRET_KEY: argv.secretKey,
      },
    });
  })
  .then(execRes => {
    console.info('Command execution finished');
    console.info(execRes[0]);
    console.error(execRes[1]);
    return api.getStack(argv.environment, argv.service);
  }),
};

module.exports = composeBindings;
