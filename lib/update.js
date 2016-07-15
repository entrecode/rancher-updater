'use strict';

const common = require('./common');

module.exports = () => Promise.resolve()
.then(common.getStack)
.then(common.checkNewService)
.then(common.checkOldService)
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
  return common.removeOldService();
})
.then(common.success)
.catch(common.fail);
