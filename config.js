const config = {
    port: process.env.PORT || 8080,

    host: 'cs2-crosshair-production.up.railway.app',
    domain: 'cs2-crosshair-production.up.railway.app',

    nodeEnv: 'production',
    
    cache: {
        duration: 3 * 60 * 60 * 1000, // 3 hours
        directory: './cache'
    },
    
    rateLimit: {
        windowMs: 15 * 60 * 1000,
        max: 100
    },
    
    crosshair: {
        canvasSize: 64,
        maxCodeLength: 45
    },

    patterns: {
        steamID64Pattern: /^7656119\d{10}$/,
        xcodePattern: /^CSGO(-[ABCDEFGHJKLMNOPQRSTUVWXYZabcdefhijkmnopqrstuvwxyz23456789]{5}){5}$/
    }
};

module.exports = config;
