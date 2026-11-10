const { run } = require('../../server/push-runtime');
module.exports = (req, res) => run('unsubscribe', req, res);
