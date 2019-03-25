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
.then(common.printOldConfig)
.then(common.loadServiceTemplates)
.then(common.renderTemplates)
.then(common.updateStackToNew)
.then(common.checkHealth)
.then((healthy) => {
  if (!healthy) {
    // unhealthy: failed
    return Promise.reject(new Error('New Service did not become healthy'));
  }
  // healthy: remove old service
  return Promise.resolve();
})
.then(common.wait(10))
.then(common.removeOldService)
.then(common.success)
.catch(common.fail);
