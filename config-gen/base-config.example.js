module.exports = {
    "proxyConfig": {
        "ip": "...", // Proxy server IP address (not used for connection, only for IP check)
        // 代理服务器的IP地址（不会用于连接，仅用于IP检查）

        "server": "https://...", // Proxy server address
        // 代理服务器地址

        "username": "...", // Proxy server username (leave empty if none)
        // 代理服务器用户名（没有就留空）

        "password": "..." // Proxy server password (leave empty if none)
        // 代理服务器密码（没有就留空）
    },

    // IP check service address, no need to modify. To deploy your own service, visit https://github.com/KevinWang15/geolocation/
    // IP检查服务地址，不需要修改。自行部署请访问 https://github.com/KevinWang15/geolocation/
    "ipCheckerUrl": "http://8.209.218.171:7520/",

    "cookies": []
}
