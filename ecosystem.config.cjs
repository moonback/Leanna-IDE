module.exports = {
  apps : [{
    name: "leanna",
    script: "./dist/server.cjs",
    cwd: __dirname,
    instances: 1,
    exec_mode: "fork",
    watch: false,
    autorestart: true,
    exp_backoff_restart_delay: 100,
    max_memory_restart: '1G',
    shutdown_with_message: true,
    kill_timeout: 3000,
    env: {
      NODE_ENV: "production",
    }
  }]
};
