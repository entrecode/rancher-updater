const Bluebird = require('bluebird');
const exec = Bluebird.promisify(require('child_process').exec, { multiArgs: true });
const tmp = require('tmp');
const fs = require('fs');
const path = require('path');
const argv = require('./argv');
const yaml = require('js-yaml');

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

  composeCommand: (docker, rancher, params) => Promise.resolve()
    .then(() => {
      console.info('Executing Rancher Compose Command');

      if (p) {
        return Promise.resolve([p, cleanupCallback]);
      }
      return tmp.dirAsync({ unsafeCleanup: true });
    })
    .then((dir) => {
      p = dir[0];
      cleanupCallback = dir[1];

      // TODO: Need to check for existing files so they not need to
      // Write multiple times

      const d = yaml.safeDump({ version: '2', services: yaml.safeLoad(docker) });
      const r = yaml.safeDump({ version: '2', services: yaml.safeLoad(rancher) });
      return Promise.all([
        fs.writeFileAsync(path.resolve(p, 'docker-compose.yml'), d),
        fs.writeFileAsync(path.resolve(p, 'rancher-compose.yml'), r),
      ]);
    })
    .then(() => {
      const cmd = `rancher-compose -p ${argv.stackName} ${params} --batch-size 1 --interval 5000`;
      console.info('exec:', cmd);
      return exec(cmd, {
        cwd: p,
        env: {
          RANCHER_URL: argv.url,
          RANCHER_ACCESS_KEY: argv.accessKey,
          RANCHER_SECRET_KEY: argv.secretKey,
        },
      });
    })
    .then((execRes) => {
      console.info('Command execution finished');
      console.info(execRes[0]);
      console.error(execRes[1]);
      return Promise.resolve();
    }),

  updateStack: (docker, rancher) => Promise.resolve()
    .then(() => {
      console.info(`Updating stack: ${argv.stackName}`);
      return composeBindings.composeCommand(docker, rancher, 'up -d -u');
    }),

  updateCommit: (docker, rancher) => Promise.resolve()
    .then(() => {
      console.info(`Commiting Update for stack: ${argv.stackName}`);
      return composeBindings.composeCommand(docker, rancher, 'up -c -d -u');
    }),

  updateRollback: (docker, rancher) => Promise.resolve()
    .then(() => {
      console.info(`Rollback Update for stack: ${argv.stackName}`);
      return composeBindings.composeCommand(docker, rancher, 'up -r -d -u');
    }),
};

module.exports = composeBindings;
