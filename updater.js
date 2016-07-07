#!/usr/bin/env node
'use strict';

const api = require('./lib/rancher-api-v1');
const argv = require('./lib/argv');
const Bluebird = require('bluebird');
const composeBindings = require('./lib/rancher-compose-bindings');
const fs = require('fs');
const handlebars = require('handlebars');

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

api.init(argv.accessKey, argv.secretKey);

const tpls = {
  dockerService: fs.readFileSync(argv.dockerService, 'utf-8'),
  rancherService: fs.readFileSync(argv.rancherService, 'utf-8'),
  dockerBalancer: fs.readFileSync(argv.dockerBalancer, 'utf-8'),
  rancherBalancer: fs.readFileSync(argv.rancherBalancer, 'utf-8'),
};
const yamls = {};

let stack;
let services;
let oldService;
let newService;
let balancer;

let oldServiceName;
let oldVersion;

// get stack in environment
console.info('Reading initial stack info');
api.getStack(argv.environment, argv.service)
.then((s) => {
  stack = s;
  return api.getServices(stack);
})
.then((s) => {
  services = s;

  console.info('Looking for services');
  oldService = services.data.find((service) => service.name.startsWith(`${argv.service}-`));
  if (!oldService) {
    console.error(`Old service name ${argv.service} not found. Abort.`);
    process.exit(1);
  }

  balancer = services.data.find((service) => service.name === argv.balancer);
  if (!balancer) {
    console.error(`Balancer ${argv.balancer} not found. Abort.`);
    process.exit(1);
  }

  newService = services.data.find((service) => service.name === argv.serviceName);
  if (newService) {
    console.error(`New service name ${argv.serviceName} already taken. Abort.`);
    process.exit(1);
  }

  console.info('Services and service names seem ok');
  return Promise.resolve();
})
.then(() => {
  console.info('Creating base templates');

  oldServiceName = oldService.name;
  oldVersion = oldService.launchConfig.imageUuid.split(':')[2];

  // new
  for (let file in tpls) {
    if (tpls.hasOwnProperty(file)) {
      const template = handlebars.compile(tpls[file], { strict: true });
      yamls[`${file}New`] = template(argv);
    }
  }
  // old
  console.info('Reading old config');
  return api.exportConfig(stack, [oldService.id])
  .then((res) => {
    yamls.dockerServiceOld = res.dockerComposeConfig;
    yamls.rancherServiceOld = res.rancherComposeConfig;
    console.info('Old service config loaded');
    return Promise.resolve();
  });
})
.then(() => api.exportConfig(stack, [oldService.id, balancer.id])
.then((res) => {
  yamls.dockerBalancerOld = res.dockerComposeConfig;
  yamls.rancherBalancerOld = res.rancherComposeConfig;
  console.info('Old balancer config loaded');
  return Promise.resolve();
}))
.then(() => {
  yamls.dockerBalancerNew = yamls.dockerBalancerNew.concat(
    yamls.dockerServiceOld,
    yamls.dockerServiceNew
  );
  yamls.rancherBalancerNew = yamls.rancherBalancerNew.concat(
    yamls.rancherServiceOld,
    yamls.rancherServiceNew
  );

  yamls.dockerBalancerOld = yamls.dockerBalancerOld.concat(
    yamls.dockerServiceNew
  );
  yamls.rancherBalancerOld = yamls.rancherBalancerOld.concat(
    yamls.rancherServiceNew
  );

  delete yamls.dockerServiceOld;

  console.info('New docker compose:\n', yamls.dockerServiceNew);
  console.info('New rancher compose:\n', yamls.rancherServiceNew);

  console.info('Creating service with new version');
  return Promise.resolve();
})
.then(() => composeBindings.updateStack(yamls.dockerServiceNew, yamls.rancherServiceNew))
.then((updatedStack) => {
  console.info('Stack updated with new version. Waiting to become healthy');
  stack = updatedStack;
  let timeout = 600000;
  return promiseWhile(
    () => stack.healthState !== 'healthy' && timeout > 0,
    () => Bluebird.delay(5000)
    .then(() => api.getStack(argv.environment, argv.service))
    .then((s) => {
      stack = s;
      timeout -= 5000;
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
  let timeout = 60000;
  return promiseWhile(
    () => stack.healthState !== 'healthy' && timeout > 0,
    () => Bluebird.delay(2000)
    .then(() => api.getStack(argv.environment, argv.service))
    .then((s) => {
      stack = s;
      timeout -= 2000;
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
  console.log(`Successfully upgraded to ${argv.version}.`);
  composeBindings.cleanup();
})
.catch(err => {
  composeBindings.cleanup();
  if (err.message !== 'Load balancer did not become healthy during the requested timeout.') {
    throw err;
  }

  console.error(err.message);
  console.info('Reverting load balancer back to old service');
  composeBindings.updateStack(yamls.dockerBalancerOld, yamls.rancherBalancerOld)
  .then((updatedStack) => {
    stack = updatedStack;
    let timeout = 60000;
    return promiseWhile(
      () => stack.healthState !== 'healthy' && timeout > 0,
      () => Bluebird.delay(2000)
      .then(() => api.getStack(argv.environment, argv.service))
      .then((s) => {
        stack = s;
        timeout -= 2000;
      })
    );
  })
  .then(() => {
    if (stack.healthState !== 'healthy') {
      throw new Error('Could not revert to old load balancer. PANIC!');
    }

    throw new Error(`Could not upgrade to version ${argv.version}. Please review rancher server.`);
  })
  .catch((error) => {
    throw error;
  });
})
.catch((err) => {
  console.error(err);
  process.exit(1);
});
