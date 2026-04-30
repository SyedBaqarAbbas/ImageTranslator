const { auditPage } = require("../core.cjs");

auditPage({ pageName: "batch-ocr", path: "/batch-ocr" }).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
