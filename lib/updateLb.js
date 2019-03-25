const argv = require('./argv');
const common = require('./common');

module.exports = () => Promise.resolve()
.then(common.getStack)
.then(common.checkHealth)
.then((healthy) => {
  if (!healthy) {
    return Promise.reject(new Error('Initial Service is not healthy'));
  }
  return Promise.resolve();
})
.then(common.checkNewService)
.then(common.checkOldService)
.then(common.checkBalancer)
.then(common.printOldConfig)
.then(common.loadServiceTemplates)
.then(common.loadBalancerTemplates)
.then(common.renderTemplates)
.then(common.updateStackToNew)
.then(common.checkHealth)
.then((healthy) => {
  if (!healthy) {
    // unhealthy: failed
    return Promise.reject(new Error('New service did not become healthy'));
  }
  // healthy: switch balancer (true = new)
  return common.switchBalancer(true);
})
.then(common.checkHealth)
.then((healthy) => {
  if (!healthy) {
    // unhealthy: switch balancer (false = old)
    return Promise.reject(new Error('New balancer did not become healthy'));
  }
  return Promise.resolve();
})
.then(common.wait(30))
.then(common.removeOldService)
.then(common.success)
.catch((err) => {
  if (err.message !== 'New balancer did not become healthy') {
    throw err;
  }
  return common.switchBalancer(false)
  .then(common.checkHealth)
  .then((healthy) => {
    if (!healthy) {
      throw new Error('Could not revert to old load balancer. PANIC!');
    }

    throw new Error(`Could not upgrade to version ${argv.version}. Please review rancher server.`);
  });
})
.catch(common.fail);
