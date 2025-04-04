/* MMM-InternetMonitor.js
 * 
 * Magic Mirror Module to monitor real internet connectivity
 * Uses ping and HTTP requests to verify actual internet access
 */

Module.register("MMM-InternetMonitor", {
    // Default module configuration
    defaults: {
        updateInterval: 60 * 1000, // Update every minute
        pingAddress: "8.8.8.8", // Google DNS server
        httpTestUrl: "https://www.google.com", // URL to test HTTP connectivity
        showDetails: true, // Whether to show ping and response time
        alertOnDisconnect: false, // Whether to show alert when internet is down
        considerDownAfterFails: 3, // How many consecutive fails before considering internet down
        maxHistory: 5, // How many connectivity checks to keep in history
        animationSpeed: 1000, // Speed of update animations
    },

    // Initialize variables
    status: {
        isConnected: false,
        lastChecked: null,
        lastConnected: null,
        failCount: 0,
        history: [],
        pingTime: null,
        httpTime: null
    },
    
    // Required styles
    getStyles: function() {
        return ["MMM-InternetMonitor.css"];
    },

    // Helper for socket notification types
    notificationTypes: {
        TEST_INTERNET: "TEST_INTERNET",
        INTERNET_STATUS: "INTERNET_STATUS"
    },

    // Start the module
    start: function() {
        Log.info("Starting module: " + this.name);
        
        // Initialize status
        this.status.lastChecked = new Date();
        
        // Run immediate check instead of waiting for first interval
        this.checkInternetConnectivity();
        
        // Schedule subsequent updates
        this.scheduleUpdate();
    },

    // Schedule next update
    scheduleUpdate: function() {
        const self = this;
        
        // Cancel existing timer if there is one
        if (this.updateTimer) {
            clearTimeout(this.updateTimer);
        }
        
        this.updateTimer = setTimeout(function() {
            self.checkInternetConnectivity();
            self.scheduleUpdate();
        }, this.config.updateInterval);
    },

    // Send request to node_helper to check internet connectivity
    checkInternetConnectivity: function() {
        this.sendSocketNotification(
            this.notificationTypes.TEST_INTERNET, 
            {
                pingAddress: this.config.pingAddress,
                httpTestUrl: this.config.httpTestUrl
            }
        );
    },

    // Socket notification received from node_helper
    socketNotificationReceived: function(notification, payload) {
        if (notification === this.notificationTypes.INTERNET_STATUS) {
            this.processInternetStatus(payload);
            this.updateDom(this.config.animationSpeed);
        }
    },

    // Process internet status update from node_helper
    processInternetStatus: function(status) {
        this.status.lastChecked = new Date();
        
        // Update connection status
        const wasConnected = this.status.isConnected;
        
        // If both tests passed, we're connected
        if (status.pingSuccess && status.httpSuccess) {
            this.status.isConnected = true;
            this.status.lastConnected = new Date();
            this.status.failCount = 0;
            this.status.pingTime = status.pingTime;
            this.status.httpTime = status.httpTime;
        } else {
            // Increment fail count
            this.status.failCount++;
            
            // Only consider internet down after consecutive failures
            if (this.status.failCount >= this.config.considerDownAfterFails) {
                this.status.isConnected = false;
            }
        }
        
        // Add to history
        this.status.history.unshift(this.status.isConnected);
        
        // Keep history at configured size
        if (this.status.history.length > this.config.maxHistory) {
            this.status.history = this.status.history.slice(0, this.config.maxHistory);
        }
        
        // Send notification if status changed
        if (wasConnected !== this.status.isConnected) {
            this.sendNotification(
                this.status.isConnected ? "INTERNET_CONNECTED" : "INTERNET_DISCONNECTED"
            );
            
            // Show alert if configured and internet is down
            if (!this.status.isConnected && this.config.alertOnDisconnect) {
                this.sendNotification("SHOW_ALERT", {
                    title: "Internet Connection Lost",
                    message: "Your internet connection appears to be down",
                    timer: 10000
                });
            }
        }
    },

    // Override dom generator
    getDom: function() {
        const wrapper = document.createElement("div");
        wrapper.className = "mmm-internet-monitor";
        
        // Status icon and text
        const statusDiv = document.createElement("div");
        statusDiv.className = "status " + (this.status.isConnected ? "connected" : "disconnected");
        
        const icon = document.createElement("i");
        icon.className = "fa " + (this.status.isConnected ? "fa-wifi" : "fa-link-slash");
        statusDiv.appendChild(icon);
        
        const statusText = document.createElement("span");
        statusText.innerHTML = this.status.isConnected ? "Online" : "Offline";
        statusDiv.appendChild(statusText);
        
        wrapper.appendChild(statusDiv);
        
        // Details section if enabled
        if (this.config.showDetails && this.status.lastChecked) {
            const detailsDiv = document.createElement("div");
            detailsDiv.className = "details";
            
            // Last checked
            const lastCheckedDiv = document.createElement("div");
            lastCheckedDiv.className = "detail-item";
            lastCheckedDiv.innerHTML = "Last checked: " + this.formatTime(this.status.lastChecked);
            detailsDiv.appendChild(lastCheckedDiv);
            
            // Response times if connected
            if (this.status.isConnected) {
                // Ping time
                if (this.status.pingTime !== null) {
                    const pingDiv = document.createElement("div");
                    pingDiv.className = "detail-item";
                    pingDiv.innerHTML = "Ping: " + this.status.pingTime + "ms";
                    detailsDiv.appendChild(pingDiv);
                }
                
                // HTTP response time
                if (this.status.httpTime !== null) {
                    const httpDiv = document.createElement("div");
                    httpDiv.className = "detail-item";
                    httpDiv.innerHTML = "HTTP: " + this.status.httpTime + "ms";
                    detailsDiv.appendChild(httpDiv);
                }
            }
            
            // History visualization
            const historyDiv = document.createElement("div");
            historyDiv.className = "history";
            
            this.status.history.forEach(function(connected) {
                const historyDot = document.createElement("div");
                historyDot.className = "history-dot " + (connected ? "connected" : "disconnected");
                historyDiv.appendChild(historyDot);
            });
            
            detailsDiv.appendChild(historyDiv);
            wrapper.appendChild(detailsDiv);
        }
        
        return wrapper;
    },

    // Format time helper
    formatTime: function(date) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
});