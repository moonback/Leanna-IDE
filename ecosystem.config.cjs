module.exports = {
  apps : [{
    name: "leanna",
    script: "./dist/server.cjs",
    instances: "max", // Ou un nombre fixe de processeurs
    exec_mode: "cluster",
    watch: false,
    autorestart: true,
    exp_backoff_restart_delay: 100,
    max_memory_restart: '1G', // Ajuste selon tes besoins
    shutdown_with_message: true, // Pour un arrêt gracieux
    kill_timeout: 3000, // Temps laissé pour fermer proprement (ms)
    env: {
      NODE_ENV: "production",
    }
  }]
};
