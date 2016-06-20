#!/usr/bin/env node
'use strict';

const fs = require('fs');
const api = require('./lib/rancher-api-v1');
const composeBindings = require('./lib/rancher-compose-bindings');
const argv = require('./lib/argv');
const Bluebird = require('bluebird');
argv.version_ = argv.v_ = argv.v.split('.').join('-');

argv.accessKey = argv.accessKey || process.env.RANCHER_ACCESS_KEY;
argv.secretKey = argv.secretKey || process.env.RANCHER_SECRET_KEY;

if (!argv.accessKey || !argv.secretKey) {
  throw new Error('Please provide access key and secret key\n');
} else {
  console.info(`Using access key ${argv.accessKey}\n`);
}

api.init(argv.accessKey, argv.secretKey);

const tpls = {
  dockerService: fs.readFileSync(argv.dockerService, 'utf-8'),
  rancherService: fs.readFileSync(argv.rancherService, 'utf-8'),
  dockerBalancer: fs.readFileSync(argv.dockerBalancer, 'utf-8'),
  rancherBalancer: fs.readFileSync(argv.rancherBalancer, 'utf-8'),
};
const yamls = {};

function promiseWhile(condition, action) {
  const resolver = Bluebird.defer();

  const loop = () => {
    if (!condition()) {
      return resolver.resolve();
    }
    return Bluebird.cast(action())
    .then(loop)
    .catch(resolver.reject);
  };

  process.nextTick(loop);

  return resolver.promise;
}

let stack;
let services;
let oldService;
let newService;
let oldVersion_;
let oldVersion;

// get stack in environment
console.info('Reading initial stack info');
api.getStack(argv.e, argv.s)
.then((s) => {
  stack = s;
  return api.getServices(stack);
})
.then((s) => {
  services = s;

  console.info('Looking for services');
  oldService = services.data.find((service) => service.name.startsWith(`${argv.s}-`));
  oldVersion_ = oldService.name.split('-').slice(1).join('-');
  oldVersion = oldService.launchConfig.imageUuid.split(':')[2];

  newService = services.data.find((service) => service.name === `${argv.s}-${argv.v_}`);
  if (newService) {
    throw new Error(`New service name ${argv.s}-${argv.v_} already taken. Abort.`);
  }

  console.info('Services and service names seem ok');

  console.info('Creating templates');
  yamls.dockerService = tpls.dockerService
  .split('{{serviceName}}').join(argv.s)
  .split('{{version}}').join(argv.v_)
  .split('{{versionDots}}').join(argv.v);
  yamls.rancherService = tpls.rancherService
  .split('{{serviceName}}').join(argv.s)
  .split('{{port}}').join(argv.p)
  .split('{{version}}').join(argv.v_);

  yamls.dockerServiceOld = tpls.dockerService
  .split('{{serviceName}}').join(argv.s)
  .split('{{version}}').join(oldVersion_)
  .split('{{versionDots}}').join(oldVersion);
  yamls.rancherServiceOld = tpls.rancherService
  .split('{{serviceName}}').join(argv.s)
  .split('{{port}}').join(argv.p)
  .split('{{version}}').join(oldVersion_);

  yamls.dockerBalancerNew = yamls.dockerService.concat(yamls.dockerServiceOld,
    tpls.dockerBalancer
    .split('{{balancerName}}').join(argv.b)
    .split('{{serviceName}}').join(argv.s)
    .split('{{port}}').join(argv.p)
    .split('{{version}}').join(argv.v_)
  );
  yamls.rancherBalancerNew = yamls.rancherService.concat(yamls.rancherServiceOld,
    tpls.rancherBalancer
    .split('{{balancerName}}').join(argv.b)
  );

  yamls.dockerBalancerOld = yamls.dockerService.concat(yamls.dockerServiceOld,
    tpls.dockerBalancer
    .split('{{balancerName}}').join(argv.b)
    .split('{{serviceName}}').join(argv.s)
    .split('{{port}}').join(argv.p)
    .split('{{version}}').join(oldVersion_)
  );
  yamls.rancherBalancerOld = yamls.rancherService.concat(yamls.rancherServiceOld,
    tpls.rancherBalancer
    .split('{{balancerName}}').join(argv.b)
  );

  console.info('New docker compose:\n', yamls.dockerService);
  console.info('new rancher compose:\n', yamls.rancherService);

  console.info('Creating service with new version');
  return Promise.resolve();
})
.then(() => composeBindings.updateStack(yamls.dockerService, yamls.rancherService))
.then((updatedStack) => {
  console.info('Stack updated with new version. Waiting to become healthy');
  stack = updatedStack;
  let timeout = 60000;
  return promiseWhile(
    () => stack.healthState !== 'healthy' && timeout > 0,
    () => Bluebird.delay(2000)
    .then(() =>api.getStack(argv.e, argv.s))
    .then((s) => {
      stack = s;
      timeout -= 2000;
    })
  );
})
.then(() => {
  if (stack.healthState !== 'healthy') {
    throw new Error('Service did not become healthy during the requested timeout.');
  }

  console.info('Stack is reporting healthy state');
  console.info('Switching load balancer');
  return composeBindings.updateStack(yamls.dockerBalancerNew, yamls.rancherBalancerNew);
})
.then((updatedStack) => {
  stack = updatedStack;
  let timeout = 30000;
  return promiseWhile(
    () => stack.healthState !== 'healthy' && timeout > 0,
    () => Bluebird.delay(1000)
    .then(() =>api.getStack(argv.e, argv.s))
    .then((s) => {
      stack = s;
      timeout -= 1000;
    })
  );
})
.then(() => {
  if (stack.healthState !== 'healthy') {
    throw new Error('Load balancer did not become healthy during the requested timeout.');
  }

  console.info('Stack is reporting healty state');
  // TODO we need healthchecks for new service here.

  console.info('Removing old service');
  return Bluebird.delay(1000);
})
.then(() => api.removeService(oldService))
.then(() => {
  console.log(`Successfully upgraded to ${argv.v}.`);
  composeBindings.cleanup();
})
.catch(err => {
  composeBindings.cleanup();
  if (err.message !== 'Load balancer did not become healthy during the requested timeout.') {
    throw err;
  }

  console.error(err.message);
  console.info('Reverting load balancer back to old service');
  composeBindings.updateStack(yaml.dockerBalancerOld, yaml.rancherBalancerOld)
  .then((updatedStack) => {
    stack = updatedStack;
    let timeout = 30000;
    return promiseWhile(
      () => stack.healthState !== 'healthy' && timeout > 0,
      () => Bluebird.delay(1000)
      .then(() => api.getStack(argv.e, argv.s))
      .then((s) => {
        stack = s;
        timeout -= 1000;
      })
    );
  })
  .then(() => {
    if (stack.healthState !== 'healthy') {
      throw new Error('Could not revert to old load balancer. PANIC!');
    }

    throw new Error(`Could not upgrade to ${argv.s}-${argv.v}.`);
  })
  .catch((error) => {
    throw error;
  });
})
.catch((err) => {
  console.error(err);
  process.exit(1);
});
