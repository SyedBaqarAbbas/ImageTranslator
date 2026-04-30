const { auditPage } = require("../core.cjs");

auditPage({ pageName: "account", path: "/account" }).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
