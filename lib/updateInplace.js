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
// No need to check for new service because the service will not change
// Instead we check service exists
.then(common.checkServiceForUpdate)
.then(common.printOldConfig)
.then(common.loadServiceTemplates)
.then(common.renderTemplates)
.then(common.updateStackToNew)
.then(common.checkHealth)
.then((healthy) => {
  if (!healthy) {
    // unhealthy: failed
    return Promise.reject(new Error('New service did not become healthy'));
  }
  console.info('Service is healthy: continue with health ensure');
  return Promise.resolve();
})
// Some times service dies after update for example because of wrong config etc.
// So here we wait to ensure it will suvive at least defined timespan
.then(common.ensureHealth)
.then((healthy) => {
  if (!healthy) {
    // unhealthy: failed
    return Promise.reject(new Error('New service did not become healthy'));
  }
  console.info('Service is healthy: Commit Update, this will remove old containers');
  return common.commitStackUpdate();
})
.then(common.success)
.catch((err) => {
  if (err.message !== 'New service did not become healthy') {
    throw err;
  }
  // Service is not healthy, rollback Update
  return common.rollbackStackUpdate()
  .then(common.checkHealth)
  .then((healthy) => {
    if (!healthy) {
      throw new Error('Could not rollback update. PANIC!');
    }

    throw new Error(`Could not upgrade to version ${argv.version}. Please review rancher server.`);
  });
})
.catch(common.fail);
