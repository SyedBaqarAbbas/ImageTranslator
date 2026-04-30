const { auditPage } = require("../core.cjs");

auditPage({ pageName: "typefaces", path: "/typefaces" }).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
