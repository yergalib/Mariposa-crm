const os = require("node:os");

// Test launcher workaround for intermittent uv_os_get_passwd ENOMEM on Windows.
os.userInfo = () => ({
  uid: -1,
  gid: -1,
  username: process.env.USERNAME || "test-user",
  homedir: process.env.USERPROFILE || process.cwd(),
  shell: null,
});
