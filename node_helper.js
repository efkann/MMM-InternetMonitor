/* node_helper.js
 * 
 * Node helper for MMM-InternetMonitor
 */

const NodeHelper = require("node_helper");
const { exec } = require("child_process");
const https = require("https");
const http = require("http");
const url = require("url");

module.exports = NodeHelper.create({
    // Initialize the helper
    start: function() {
        console.log("Starting node helper for: " + this.name);
        this.started = false;
    },

    // Helper for socket notification types
    notificationTypes: {
        TEST_INTERNET: "TEST_INTERNET",
        INTERNET_STATUS: "INTERNET_STATUS"
    },

    // Socket notification received from module
    socketNotificationReceived: function(notification, payload) {
        if (notification === this.notificationTypes.TEST_INTERNET) {
            this.testInternetConnectivity(payload);
        }
    },

    // Test internet connectivity using both ping and HTTP
// In the testInternetConnectivity function:
testInternetConnectivity: function(config) {
    console.log("[InternetMonitor] Starting connectivity test...");
    const self = this;
    
    this.pingTest(config.pingAddress)
        .then(pingResult => {
            console.log("[InternetMonitor] Ping result:", pingResult);
            return this.httpTest(config.httpTestUrl)
                .then(httpResult => {
                    console.log("[InternetMonitor] HTTP result:", httpResult);
                    self.sendSocketNotification(
                        this.notificationTypes.INTERNET_STATUS, 
                        {
                            pingSuccess: pingResult.success,
                            pingTime: pingResult.time,
                            httpSuccess: httpResult.success,
                            httpTime: httpResult.time
                        }
                    );
                });
        })
        .catch(error => {
            console.error("[InternetMonitor] Test error:", error);
            self.sendSocketNotification(
                this.notificationTypes.INTERNET_STATUS, 
                {
                    pingSuccess: false,
                    pingTime: null,
                    httpSuccess: false,
                    httpTime: null
                }
            );
        });
},

    // Perform ping test
    pingTest: function(address) {
        return new Promise((resolve) => {
            const startTime = Date.now();
            
            // Platform-specific ping command
            let pingCmd = "ping -c 1 -W 2 " + address;
            if (process.platform === "win32") {
                pingCmd = "ping -n 1 -w 2000 " + address;
            }
            
            exec(pingCmd, (error, stdout, stderr) => {
                const endTime = Date.now();
                const pingTime = endTime - startTime;
                
                if (error) {
                    // Ping failed
                    resolve({
                        success: false,
                        time: null
                    });
                    return;
                }
                
                // Parse ping time from output if possible
                let measuredTime = pingTime;
                try {
                    if (process.platform === "win32") {
                        const match = stdout.match(/Average\s*=\s*(\d+)ms/);
                        if (match && match[1]) {
                            measuredTime = parseInt(match[1]);
                        }
                    } else {
                        const match = stdout.match(/time=(\d+\.?\d*) ms/);
                        if (match && match[1]) {
                            measuredTime = parseFloat(match[1]);
                        }
                    }
                } catch (e) {
                    console.log("Could not parse ping time, using measured time");
                }
                
                resolve({
                    success: true,
                    time: Math.round(measuredTime)
                });
            });
        });
    },

    // Perform HTTP test
    httpTest: function(testUrl) {
        return new Promise((resolve) => {
            const startTime = Date.now();
            
            try {
                // Parse URL
                const parsedUrl = url.parse(testUrl);
                
                // Choose http or https module
                const httpModule = parsedUrl.protocol === "https:" ? https : http;
                
                // Create request with timeout
                const req = httpModule.get(testUrl, {
                    timeout: 5000,  // 5 second timeout
                    headers: {
                        // Set user agent to avoid being blocked
                        "User-Agent": "MagicMirror InternetMonitor"
                    }
                }, (res) => {
                    const endTime = Date.now();
                    const responseTime = endTime - startTime;
                    
                    // Check if response code indicates success (2xx or 3xx)
                    const success = res.statusCode >= 200 && res.statusCode < 400;
                    
                    // We don't need the body data, just drain it
                    res.on("data", () => {});
                    
                    res.on("end", () => {
                        resolve({
                            success,
                            time: Math.round(responseTime)
                        });
                    });
                });
                
                // Handle errors
                req.on("error", () => {
                    resolve({
                        success: false,
                        time: null
                    });
                });
                
                // Handle timeout
                req.on("timeout", () => {
                    req.destroy();
                    resolve({
                        success: false,
                        time: null
                    });
                });
            } catch (error) {
                resolve({
                    success: false,
                    time: null
                });
            }
        });
    }
});