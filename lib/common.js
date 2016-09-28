'use strict';

const argv = require('./argv');
const api = require('./rancher-api-v1');
const fs = require('fs');
const handlebars = require('handlebars');
const compose = require('./rancher-compose-bindings');
const Bluebird = require('bluebird');

Bluebird.promisifyAll(fs);

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

const tpls = {};
const yamls = {};

let stack;
let services;
let newService;
let balancer;
let oldService;

api.init(argv.accessKey, argv.secretKey);

const common = {
  fail: (err) => {
    compose.cleanup();
    if (err) {
      console.error(err.stack);
    }
    console.error(`Could not update stack ${argv.stackName} to version ${argv.version}.`);
    process.exit(1);
  },
  
  success: () => {
    compose.cleanup();
    console.info(`Sucessfully updated stack ${argv.stackName} to version ${argv.version}.`);
    process.exit(0);
  },
  
  getStack: () => api.getStack(argv.environment, argv.stackName)
  .then((s) => {
    stack = s;
    return Promise.resolve(stack);
  }),
  
  stackAvailable: () => api.getStacks(argv.environment)
  .then((stacks) => {
    const found = stacks.find(s => s.name === argv.stackName);
    if (found) {
      return Promise.reject(new Error(`Stack name ${argv.stackName} already taken.`));
    }
    return Promise.resolve();
  }),
  
  checkOldService: () => Promise.resolve()
  .then(() => {
    if (services) {
      return Promise.resolve(services);
    }
    return api.getServices(stack);
  })
  .then((s) => {
    services = s;
    oldService = services.data.filter(service => service.name.startsWith(`${argv.service}-`));
    if (!oldService || oldService.length < 1) {
      return Promise.reject(new Error(`Old service name ${argv.service}* not found. Abort.`));
    }
    if (oldService.length > 1) {
      return Promise.reject(new Error(`Found two old service names for ${argv.service}*. Abort.`));
    }
    
    oldService = oldService[0];
    
    return api.exportConfig(stack, [oldService.id]);
  })
  .then((res) => {
    yamls.dockerServiceOld = res.dockerComposeConfig;
    yamls.rancherServiceOld = res.rancherComposeConfig;
    console.info('Old service config loaded');
    return Promise.resolve(oldService);
  }),
  
  checkBalancer: () => Promise.resolve()
  .then(() => {
    if (services) {
      return Promise.resolve(services);
    }
    return api.getServices(stack);
  })
  .then((s) => {
    services = s;
    balancer = services.data.find((service) => service.name === argv.balancer);
    if (!balancer) {
      return Promise.reject(new Error(`Balancer ${argv.balancer} not found. Abort.`));
    }
    return api.exportConfig(stack, [oldService.id, balancer.id])
    .then((res) => {
      yamls.dockerBalancerOld = res.dockerComposeConfig;
      yamls.rancherBalancerOld = res.rancherComposeConfig;
      console.info('Old balancer config loaded');
      return Promise.resolve();
    });
  }).then(() => {
    return Promise.resolve(balancer);
  }),
  
  printOldConfig: () => Promise.resolve()
  .then(() => {
    if (yamls.dockerBalancerOld && yamls.rancherBalancerOld) {
      console.info('Old docker config:');
      console.info(yamls.dockerBalancerOld);
      console.info('Old rancher config:');
      console.info(yamls.rancherBalancerOld);
    } else {
      console.info('Old docker config:');
      console.info(yamls.dockerServiceOld);
      console.info('Old rancher config:');
      console.info(yamls.rancherServiceOld);
    }
    return Promise.resolve();
  }),
  
  checkNewService: () => Promise.resolve()
  .then(() => {
    if (services) {
      return Promise.resolve(services);
    }
    return api.getServices(stack);
  })
  .then((s) => {
    services = s;
    newService = services.data.find(service => service.name === argv.serviceName);
    if (newService) {
      return Promise.reject(
        new Error(`New service name ${argv.serviceName} already taken. Abort.`)
      );
    }
    
    return Promise.resolve();
  }),
  
  loadServiceTemplates: () => Promise.all([
    fs.readFileAsync(argv.dockerService, 'utf-8'),
    fs.readFileAsync(argv.rancherService, 'utf-8'),
  ])
  .then((tplsRes) => {
    tpls.dockerService = tplsRes[0];
    tpls.rancherService = tplsRes[1];
    return Promise.resolve();
  }),
  
  loadBalancerTemplates: () => Promise.all([
    fs.readFileAsync(argv.dockerBalancer, 'utf-8'),
    fs.readFileAsync(argv.rancherBalancer, 'utf-8'),
  ])
  .then((tplsRes) => {
    tpls.dockerBalancer = tplsRes[0];
    tpls.rancherBalancer = tplsRes[1];
    return Promise.resolve();
  }),
  
  renderTemplates: () => Promise.resolve()
  .then(() => {
    // new
    for (let file in tpls) {
      if (tpls.hasOwnProperty(file)) {
        const template = handlebars.compile(tpls[file], { strict: true });
        yamls[`${file}New`] = template(argv);
      }
    }
    
    switch (argv.mode) {
    case 'initBalanced':
      yamls.dockerBalancerNew = yamls.dockerBalancerNew.concat(
        yamls.dockerServiceNew
      );
      yamls.rancherBalancerNew = yamls.rancherBalancerNew.concat(
        yamls.rancherServiceNew
      );
      
      break;
    case 'balanced':
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
      
      break;
    }
    
    console.info('New docker compose:\n', yamls.dockerServiceNew);
    console.info('New rancher compose:\n', yamls.rancherServiceNew);
    
    return Promise.resolve();
  }),
  
  updateStackToNew: () => compose.updateStack(yamls.dockerServiceNew, yamls.rancherServiceNew),
  
  switchBalancer: (toNew) => Promise.resolve()
  .then(() => {
    if (toNew) {
      return compose.updateStack(yamls.dockerBalancerNew, yamls.rancherBalancerNew);
    }
    return compose.updateStack(yamls.dockerBalancerOld, yamls.rancherBalancerOld);
  }),
  
  checkHealth: () => api.getStack(argv.environment, argv.stackName)
  .then((s) => {
    stack = s;
    let timeout = 0 + argv.timeout;
    return promiseWhile(
      () => stack.healthState !== 'healthy' && timeout > 0,
      () => Bluebird.delay(2000)
      .then(() => api.getStack(argv.environment, argv.stackName))
      .then((s) => {
        stack = s;
        timeout -= 2000;
      })
    );
  })
  .then(() => Promise.resolve(stack.healthState === 'healthy')),
  
  removeOldService: () => {
    if (!oldService) {
      throw new Error('Cannot remove old service: \'oldService\' not defined');
    }
    return Bluebird.delay(1000).then(() => api.removeService(oldService));
  },
};

module.exports = common;
