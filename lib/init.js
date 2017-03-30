const common = require('./common');

module.exports = () => Promise.resolve()
.then(common.stackAvailable)
.then(common.loadServiceTemplates)
.then(common.renderTemplates)
.then(common.updateStackToNew)
.then(common.checkHealth)
.then((healthy) => {
  if (!healthy) {
    // unhealthy: failed
    return common.fail();
  }
  // healthy: success
  return common.success();
})
.catch(common.fail);
